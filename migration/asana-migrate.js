/**
 * asana-migrate.js
 *
 * Migrates The A Team (Team Rachel) board from Asana to a JSON file.
 * READ from Asana, WRITE to a local JSON file. Does not touch any database yet.
 *
 * Output: asana-export-rachel.json
 *
 * Usage:
 *   ASANA_PAT=your_token_here node asana-migrate.js
 *
 * Safe to re-run — output file is overwritten each time.
 */
require('dotenv').config();

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const fs = require('fs');

const ASANA_PAT = process.env.ASANA_PAT || 'PASTE_YOUR_TOKEN_HERE';
const BASE_URL = 'https://app.asana.com/api/1.0';
const OUTPUT_FILE = 'asana-export-rachel.json';

// The A Team (Team Rachel) — confirmed GID from exploration
const PROJECT_GID = '1156457376337923';
const PROJECT_NAME = 'The A Team (Team Rachel)';

// Delay between API calls to avoid rate limiting (ms)
const RATE_LIMIT_DELAY = 150;

const headers = {
  'Authorization': `Bearer ${ASANA_PAT}`,
  'Accept': 'application/json',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function get(path) {
  await sleep(RATE_LIMIT_DELAY);
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
  console.log(`✓ ${project.name} | archived: ${project.archived}`);

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
    '&opt_fields=gid,name,assignee.gid,assignee.name,assignee.email,due_on,completed,completed_at,created_at,modified_at,notes,tags.name,memberships.section.gid,num_subtasks,custom_fields.gid,custom_fields.name,custom_fields.display_value,custom_fields.enum_value,custom_fields.text_value,custom_fields.number_value'
  );
  console.log(`\n✓ ${tasks.length} cards loaded (${tasks.filter(t => !t.completed).length} active, ${tasks.filter(t => t.completed).length} completed)`);

  // 6. For each card: fetch comments and subtasks
  console.log(`\n[6] Fetching comments and subtasks for each card...`);
  console.log(`    (${tasks.length} cards × ~150ms = est. ${Math.round(tasks.length * 0.15 * 2 / 60)} min)`);

  const report = {
    totalCards: tasks.length,
    cardsWithComments: 0,
    totalComments: 0,
    cardsWithSubtasks: 0,
    totalSubtasks: 0,
    errors: [],
  };

  const migratedCards = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    progress(i + 1, tasks.length, task.name.substring(0, 30));

    // Determine which column this card is in
    const sectionGid = task.memberships?.[0]?.section?.gid;
    const columnName = sectionGid ? sectionMap[sectionGid] : null;

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
    };

    // Fetch comments (stories of type 'comment')
    try {
      const stories = await getAll(
        `/tasks/${task.gid}/stories`,
        '&opt_fields=gid,type,text,created_at,created_by.gid,created_by.name,created_by.email'
      );
      const comments = stories
        .filter(s => s.type === 'comment' && s.text)
        .map(s => ({
          asana_gid: s.gid,
          body: s.text,
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
          '&opt_fields=gid,name,assignee.gid,assignee.name,due_on,completed,notes,created_at'
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

    migratedCards.push(card);
  }

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
    cards: migratedCards,
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