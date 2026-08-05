/**
 * asana-migrate.js
 *
 * Migrates ONE Asana project (board) to a JSON file.
 * READ from Asana, WRITE to a local JSON file. Does not touch any database yet.
 *
 * Usage:
 *   node migration/asana-migrate.js --project=<gid> [--out=<file>]
 *
 *   --project  Asana project GID (required). Find it with asana-explore.js, or in
 *              the project URL: app.asana.com/0/<gid>/list
 *   --out      Output filename. Defaults to asana-export-<project-name>.json,
 *              derived from the project's real name once we've fetched it.
 *
 * Needs ASANA_PAT (and the S3 vars, since it uploads every Asana attachment).
 * Safe to re-run — the output file is overwritten, and S3 uploads skip objects
 * that already exist (HeadObject), so a re-run is cheap and resumable.
 */
require('dotenv').config();

// Optional DNS override for flaky local resolvers (set DNS_SERVERS in .env).
if (process.env.DNS_SERVERS) {
  require('dns').setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()).filter(Boolean));
}

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const ASANA_PAT = process.env.ASANA_PAT || 'PASTE_YOUR_TOKEN_HERE';
const BASE_URL = 'https://app.asana.com/api/1.0';
function arg(name) {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
}

// Which project to export. Required — there is no default, deliberately: a default
// meant an accidental run silently re-exported Rachel's board over the file you
// wanted, and each board is thousands of API calls plus S3 uploads.
const PROJECT_GID = arg('project');
if (!PROJECT_GID || !/^\d+$/.test(PROJECT_GID)) {
  console.error('Usage: node migration/asana-migrate.js --project=<gid> [--out=<file>]');
  console.error('  --project must be an Asana project GID (digits only).');
  process.exit(1);
}

// Filled in from --out, or derived from the project name at step [2]. Always lands
// in migration/ (where the seeder reads it), regardless of CWD.
const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board';
const outPath = f => path.join(__dirname, f.endsWith('.json') ? f : `${f}.json`);
let OUTPUT_FILE = arg('out') ? outPath(arg('out')) : null;
let PROJECT_NAME = `project ${PROJECT_GID}`;

// Delay between API calls to avoid rate limiting (ms)
const RATE_LIMIT_DELAY = Number(process.env.RATE_LIMIT_MS) || 150;

// S3 for migrated image attachments. Public bucket for now (see memory:
// s3-image-storage-plan — move to a private bucket later).
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.AWS_REGION;
const S3_PREFIX = process.env.S3_PREFIX || 'buyer-board/';
const S3_ENABLED = Boolean(S3_BUCKET && S3_REGION);
const s3 = S3_ENABLED ? new S3Client({ region: S3_REGION }) : null;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const CONTENT_TYPE = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain', zip: 'application/zip',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const headers = {
  'Authorization': `Bearer ${ASANA_PAT}`,
  'Accept': 'application/json',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Global rate limiter: spaces ALL Asana calls >= RATE_LIMIT_DELAY ms apart, even
// when many tasks run concurrently — keeps us under Asana's limit without 429s.
let nextCallAt = 0;
async function rateLimit() {
  const now = Date.now();
  const wait = Math.max(0, nextCallAt - now);
  nextCallAt = Math.max(now, nextCallAt) + RATE_LIMIT_DELAY;
  if (wait) await sleep(wait);
}

// Download an Asana image attachment (temporary signed download_url) and
// upload it to S3, returning { url, skipped }. Keys are deterministic, so if the
// object already exists we skip the download + upload (idempotent, resumable,
// saves time/bandwidth on re-runs).
async function uploadAttachmentToS3(att, taskGid) {
  const ext = (att.name.split('.').pop() || '').toLowerCase();
  const safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const key = `${S3_PREFIX}${taskGid}/${att.gid}-${safeName}`;
  const url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;

  // Already in the bucket? Skip the expensive download + upload.
  // HeadObject succeeds (200) only when the object exists. Any error — 404, or a
  // 403 when the IAM user lacks s3:ListBucket (surfaces as "UnknownError" since
  // HEAD has no body to parse) — means "not confirmed present", so fall through
  // and upload. PutObject is idempotent, so re-uploading an existing key is safe.
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return { url, skipped: true };
  } catch {
    // not present (or not headable) — proceed to upload
  }

  const resp = await fetch(att.download_url); // presigned URL — no auth header
  if (!resp.ok) throw new Error(`download HTTP ${resp.status}`);
  const body = Buffer.from(await resp.arrayBuffer());
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: CONTENT_TYPE[ext] || 'application/octet-stream',
  }));
  return { url, skipped: false };
}

// Asana embeds inline images as <img data-asana-gid="ATT_GID" src="...temporary..."> in
// comment html_text and task html_notes. Rewrite each known image's src to its S3 URL
// (the Asana src expires), and record which attachment gids were used inline.
function rewriteHtmlImages(html, gidToUrl, referenced) {
  if (!html) return null;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const gid = tag.match(/data-asana-gid="(\d+)"/)?.[1];
    const url = gid && gidToUrl[gid];
    if (!url) return tag;
    if (referenced) referenced.add(gid);
    return /\bsrc="[^"]*"/.test(tag)
      ? tag.replace(/\bsrc="[^"]*"/, `src="${url}"`)
      : tag.replace(/<img\b/i, `<img src="${url}"`);
  });
}

async function get(path) {
  await rateLimit();
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (res.status === 429) {
    // Rate limited — wait and retry
    console.log('   ⚠️  Rate limited, waiting 30s...');
    await sleep(30000);
    return get(path);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} on ${path}: ${text}`);
  }
  return res.json();
}

async function getAll(path, params = '') {
  let results = [];
  let offset = null;
  do {
    const sep = path.includes('?') ? '&' : '?';
    const cursor = offset ? `&offset=${offset}` : '';
    const data = await get(`${path}${sep}limit=100${params}${cursor}`);
    results = results.concat(data.data || []);
    offset = data.next_page?.offset || null;
  } while (offset);
  return results;
}

function progress(current, total, label) {
  const pct = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r   [${bar}] ${pct}% (${current}/${total}) ${label}`.padEnd(80));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log('='.repeat(60));
  console.log('ASANA MIGRATION SCRIPT');
  console.log(`Board: ${PROJECT_NAME}`);
  console.log('='.repeat(60));

  // 1. Auth
  console.log('\n[1] Authenticating...');
  const me = await get('/users/me');
  console.log(`✓ ${me.data.name} (${me.data.email})`);

  // 2. Project info
  console.log('\n[2] Loading project info...');
  const projectData = await get(
    `/projects/${PROJECT_GID}?opt_fields=gid,name,created_at,modified_at,archived,color,notes`
  );
  const project = projectData.data;
  PROJECT_NAME = project.name;
  if (!OUTPUT_FILE) OUTPUT_FILE = outPath(`asana-export-${slug(project.name)}`);
  console.log(`✓ ${project.name} | archived: ${project.archived}`);
  console.log(`  → ${OUTPUT_FILE}`);

  // 3. Columns (sections)
  console.log('\n[3] Loading columns...');
  const sections = await getAll(`/projects/${PROJECT_GID}/sections`);
  console.log(`✓ ${sections.length} columns found:`);
  sections.forEach(s => console.log(`   - "${s.name}" [${s.gid}]`));

  // Build section lookup map
  const sectionMap = {};
  sections.forEach(s => { sectionMap[s.gid] = s.name; });

  // 4. Custom fields
  console.log('\n[4] Loading custom fields...');
  const customFieldsData = await get(
    `/projects/${PROJECT_GID}?opt_fields=custom_field_settings.custom_field.gid,custom_field_settings.custom_field.name,custom_field_settings.custom_field.type,custom_field_settings.custom_field.enum_options`
  );
  const customFields = (customFieldsData.data?.custom_field_settings || [])
    .map(cfs => cfs.custom_field);
  console.log(`✓ ${customFields.length} custom fields:`);
  customFields.forEach(cf => console.log(`   - "${cf.name}" (${cf.type})`));

  // 5. All tasks (cards)
  console.log('\n[5] Loading all cards (this may take a minute)...');
  const tasks = await getAll(
    `/projects/${PROJECT_GID}/tasks`,
    '&opt_fields=gid,name,assignee.gid,assignee.name,assignee.email,due_on,completed,completed_at,created_at,modified_at,notes,html_notes,tags.name,memberships.section.gid,num_subtasks,custom_fields.gid,custom_fields.name,custom_fields.display_value,custom_fields.enum_value,custom_fields.text_value,custom_fields.number_value'
  );
  console.log(`\n✓ ${tasks.length} cards loaded (${tasks.filter(t => !t.completed).length} active, ${tasks.filter(t => t.completed).length} completed)`);

  // 6. For each card: fetch comments, subtasks, and image attachments
  console.log(`\n[6] Fetching comments, subtasks, and attachments for each card...`);
  console.log(`    (${tasks.length} cards — attachments add download+upload time, allow extra minutes)`);

  const report = {
    totalCards: tasks.length,
    cardsWithComments: 0,
    totalComments: 0,
    cardsWithSubtasks: 0,
    totalSubtasks: 0,
    cardsWithAttachments: 0,
    totalAttachments: 0,
    attachmentsSkipped: 0,
    errors: [],
  };

  if (!S3_ENABLED) {
    console.log('  ⚠️  S3 not configured (set S3_BUCKET + AWS_REGION) — file attachments will be SKIPPED.');
  }

  const migratedCards = new Array(tasks.length);
  const CONCURRENCY = Number(process.env.MIGRATE_CONCURRENCY) || 6;

  async function processOne(i) {
    const task = tasks[i];

    // Determine which column this card is in
    const sectionGid = task.memberships?.[0]?.section?.gid;
    const columnName = sectionGid ? sectionMap[sectionGid] : null;

    // attachment gid → S3 URL (built during upload), and gids used inline in HTML.
    const gidToUrl = {};
    const referenced = new Set();

    // Build the card object
    const card = {
      // Identity
      asana_gid: task.gid,
      asana_project_gid: PROJECT_GID,

      // Core fields
      title: task.name,
      description: task.notes || null,
      column: columnName,
      column_gid: sectionGid || null,
      is_completed: task.completed || false,
      is_archived: task.completed || false, // completed = archived in our system

      // Assignee
      assignee: task.assignee ? {
        asana_gid: task.assignee.gid,
        name: task.assignee.name,
        email: task.assignee.email || null,
      } : null,

      // Dates
      due_date: task.due_on || null,
      created_at: task.created_at,
      modified_at: task.modified_at,
      completed_at: task.completed_at || null,

      // Tags
      tags: (task.tags || []).map(t => t.name),

      // Custom fields (health label, etc.)
      custom_fields: (task.custom_fields || [])
        .filter(cf => cf.display_value)
        .map(cf => ({
          gid: cf.gid,
          name: cf.name,
          value: cf.display_value,
        })),

      // These will be populated below
      comments: [],
      subtasks: [],
      attachments: [],
    };

    // Fetch comments (stories of type 'comment')
    try {
      const stories = await getAll(
        `/tasks/${task.gid}/stories`,
        '&opt_fields=gid,type,text,html_text,created_at,created_by.gid,created_by.name,created_by.email'
      );
      const comments = stories
        .filter(s => s.type === 'comment' && (s.text || s.html_text))
        .map(s => ({
          asana_gid: s.gid,
          body: s.text || '',
          body_html_raw: s.html_text || null,
          created_at: s.created_at,
          author: s.created_by ? {
            asana_gid: s.created_by.gid,
            name: s.created_by.name,
            email: s.created_by.email || null,
          } : null,
        }));

      card.comments = comments;
      if (comments.length > 0) {
        report.cardsWithComments++;
        report.totalComments += comments.length;
      }
    } catch (e) {
      report.errors.push({ type: 'comments', card_gid: task.gid, card_name: task.name, error: e.message });
    }

    // Fetch subtasks
    if (task.num_subtasks > 0) {
      try {
        const subtasks = await getAll(
          `/tasks/${task.gid}/subtasks`,
          '&opt_fields=gid,name,assignee.gid,assignee.name,assignee.email,due_on,completed,notes,created_at'
        );
        card.subtasks = subtasks.map(s => ({
          asana_gid: s.gid,
          title: s.name,
          is_complete: s.completed || false,
          notes: s.notes || null,
          due_date: s.due_on || null,
          created_at: s.created_at,
          assignee: s.assignee ? {
            asana_gid: s.assignee.gid,
            name: s.assignee.name,
          } : null,
        }));

        if (subtasks.length > 0) {
          report.cardsWithSubtasks++;
          report.totalSubtasks += subtasks.length;
        }
      } catch (e) {
        report.errors.push({ type: 'subtasks', card_gid: task.gid, card_name: task.name, error: e.message });
      }
    }

    // Fetch image attachments and upload them to S3 (skipped if S3 not configured)
    if (S3_ENABLED) {
      try {
        const attachments = await getAll(
          `/tasks/${task.gid}/attachments`,
          '&opt_fields=gid,name,download_url,created_at,host,resource_subtype'
        );
        const files = [];
        for (const att of attachments) {
          if (!att.name || !att.download_url) continue; // need a downloadable Asana-hosted file
          try {
            const { url, skipped } = await uploadAttachmentToS3(att, task.gid);
            gidToUrl[att.gid] = url; // images may also be referenced inline by gid
            files.push({ asana_gid: att.gid, name: att.name, url, is_image: IMAGE_RE.test(att.name), created_at: att.created_at || null });
            if (skipped) report.attachmentsSkipped++;
          } catch (e) {
            report.errors.push({ type: 'attachment', card_gid: task.gid, name: att.name, error: e.message });
          }
        }
        card.attachments = files;
        if (files.length) { report.cardsWithAttachments++; report.totalAttachments += files.length; }
      } catch (e) {
        report.errors.push({ type: 'attachments', card_gid: task.gid, card_name: task.name, error: e.message });
      }
    }

    // Rewrite inline images (description + comments) to permanent S3 URLs, and flag
    // which attachments are shown inline (so the flat Attachments list can skip them).
    card.description_html = rewriteHtmlImages(task.html_notes, gidToUrl, referenced);
    for (const c of card.comments) {
      c.body_html = rewriteHtmlImages(c.body_html_raw, gidToUrl, referenced);
      delete c.body_html_raw;
    }
    for (const img of card.attachments) img.inline = referenced.has(img.asana_gid);

    migratedCards[i] = card;
  }

  // Run tasks through a bounded concurrency pool (rateLimit() keeps Asana calls
  // spaced; downloads/uploads overlap, so this is much faster than sequential).
  let nextIndex = 0;
  let completed = 0;
  async function worker() {
    let i;
    while ((i = nextIndex++) < tasks.length) {
      try {
        await processOne(i);
      } catch (e) {
        report.errors.push({ type: 'task', card_gid: tasks[i].gid, card_name: tasks[i].name, error: e.message });
      }
      progress(++completed, tasks.length, tasks[i].name.substring(0, 30));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log('\n');

  // 7. Build final output
  const output = {
    meta: {
      exported_at: new Date().toISOString(),
      exported_by: me.data.name,
      asana_workspace: 'townsquareignite.com',
      asana_workspace_gid: '461175262246056',
      script_version: '1.0',
    },
    project: {
      asana_gid: project.gid,
      name: project.name,
      created_at: project.created_at,
      modified_at: project.modified_at,
      archived: project.archived,
    },
    columns: sections.map((s, i) => ({
      asana_gid: s.gid,
      name: s.name,
      position: i,
    })),
    custom_fields: customFields.map(cf => ({
      asana_gid: cf.gid,
      name: cf.name,
      type: cf.type,
      options: cf.enum_options?.map(o => ({ gid: o.gid, name: o.name })) || [],
    })),
    cards: migratedCards.filter(Boolean),
    report: {
      ...report,
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
    },
  };

  // 8. Write to file
  console.log(`[7] Writing to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  const fileSizeKB = Math.round(fs.statSync(OUTPUT_FILE).size / 1024);
  console.log(`✓ Done — ${fileSizeKB} KB written`);

  // 9. Print report
  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION REPORT');
  console.log('='.repeat(60));
  console.log(`Board:              ${PROJECT_NAME}`);
  console.log(`Total cards:        ${report.totalCards}`);
  console.log(`Cards w/ comments:  ${report.cardsWithComments}`);
  console.log(`Total comments:     ${report.totalComments}`);
  console.log(`Cards w/ subtasks:  ${report.cardsWithSubtasks}`);
  console.log(`Total subtasks:     ${report.totalSubtasks}`);
  console.log(`Cards w/ files:     ${report.cardsWithAttachments}`);
  console.log(`Total files→S3:     ${report.totalAttachments} (${report.attachmentsSkipped} already in S3, skipped)`);
  console.log(`Errors:             ${report.errors.length}`);
  console.log(`Duration:           ${Math.floor(duration / 60)}m ${duration % 60}s`);
  console.log(`Output file:        ${OUTPUT_FILE} (${fileSizeKB} KB)`);

  if (report.errors.length > 0) {
    console.log('\nErrors:');
    report.errors.forEach(e => console.log(`  - [${e.type}] ${e.card_name}: ${e.error}`));
  }

  console.log('\n✓ Migration export complete.');
  console.log('  Next step: review asana-export-rachel.json, then load it into the new app database.');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});