'use strict';

/**
 * asana-seed.js
 *
 * Loads asana-export-rachel.json into MongoDB.
 * Idempotent — safe to re-run. Uses asanaGid as upsert key.
 *
 * Usage:
 *   node migration/asana-seed.js
 *
 * Prompts interactively to mark archive columns and skip columns before loading cards.
 */

require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const EXPORT_FILE = path.join(__dirname, 'asana-export-rachel.json');

// ─── Helpers ────────────────────────────────────────────────────────────────

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function progress(current, total, label) {
  const pct = Math.round((current / total) * 100);
  const filled = Math.floor(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  process.stdout.write(`\r  [${bar}] ${pct}% (${current}/${total}) ${label}`.padEnd(90));
}

// Map Asana custom field type to our type
function mapFieldType(asanaType) {
  const map = { text: 'text', number: 'number', date: 'date', enum: 'enum', url: 'url' };
  return map[asanaType] || 'text';
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('IGNITE BUYER BOARD — ASANA SEEDER');
  console.log('='.repeat(60));

  // 1. Load export file
  console.log(`\n[1] Loading ${EXPORT_FILE}...`);
  if (!fs.existsSync(EXPORT_FILE)) {
    console.error(`Export file not found: ${EXPORT_FILE}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf8'));
  console.log(`  Project: ${data.project.name}`);
  console.log(`  Columns: ${data.columns.length}`);
  console.log(`  Custom fields: ${data.custom_fields.length}`);
  console.log(`  Cards: ${data.cards.length}`);

  // 2. Connect to MongoDB
  console.log('\n[2] Connecting to MongoDB...');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  console.log('  Connected.');

  // 3. Upsert board
  console.log('\n[3] Upserting board...');
  const boardResult = await db.collection('boards').findOneAndUpdate(
    { 'asanaProjectGid': data.project.asana_gid },
    {
      $set: {
        name: data.project.name,
        description: '',
        asanaProjectGid: data.project.asana_gid,
      },
      $setOnInsert: { createdBy: new ObjectId('000000000000000000000001'), createdAt: new Date() },
    },
    { upsert: true, returnDocument: 'after' }
  );
  const board = boardResult;
  const boardId = board._id;
  console.log(`  Board id: ${boardId}`);

  // 4. Column flags
  // Pass --auto to use defaults without prompts.
  // Defaults: columns whose names match archivePatterns are archived,
  // skipPatterns are skipped, all others are kept.
  const AUTO = process.argv.includes('--auto');

  const archivePatterns = ['cancelled', 'completed campaign'];
  const skipPatterns = ['duplicate'];

  console.log(`\n[4] Column configuration${AUTO ? ' (--auto mode)' : ''}`);
  console.log(`  Board: ${data.project.name}`);
  console.log(`  Columns found:`);
  data.columns.forEach((col, i) => console.log(`    [${i}] ${col.name}`));

  const archiveColumns = new Set();
  const skipColumns = new Set();

  if (AUTO) {
    for (const col of data.columns) {
      const lower = col.name.toLowerCase();
      if (archivePatterns.some(p => lower.includes(p))) archiveColumns.add(col.asana_gid);
      else if (skipPatterns.some(p => lower.includes(p))) skipColumns.add(col.asana_gid);
    }
    console.log(`  Archive: ${[...archiveColumns].length} columns`);
    console.log(`  Skip:    ${[...skipColumns].length} columns`);
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    for (const col of data.columns) {
      const answer = await ask(rl, `\n  "${col.name}" — (a)rchive / (s)kip / (enter) keep: `);
      const choice = answer.trim().toLowerCase();
      if (choice === 'a') archiveColumns.add(col.asana_gid);
      else if (choice === 's') skipColumns.add(col.asana_gid);
    }
    rl.close();
  }

  // 5. Upsert columns
  console.log('\n[5] Upserting columns...');
  const columnGidToId = {};
  for (const col of data.columns) {
    if (skipColumns.has(col.asana_gid)) {
      console.log(`  Skipped: ${col.name}`);
      continue;
    }
    const isArchive = archiveColumns.has(col.asana_gid);
    const result = await db.collection('columns').findOneAndUpdate(
      { asanaGid: col.asana_gid, boardId },
      {
        $set: {
          boardId,
          name: col.name,
          position: col.position,
          color: '#e0e0e0',
          asanaGid: col.asana_gid,
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, returnDocument: 'after' }
    );
    columnGidToId[col.asana_gid] = result._id;
    console.log(`  ${isArchive ? '[archive] ' : '[active]  '} ${col.name}`);
  }

  // 6. Upsert custom fields
  // Register project-level fields AND any per-card ("disconnected") fields like
  // SEM - KPI or Sharepoint Link, which Asana keeps on tasks after removing them
  // from the project. Without this they would be silently dropped.
  console.log('\n[6] Upserting custom fields...');
  const fieldMeta = {}; // gid -> { name, type, options }

  // Project-level fields carry full type + option metadata.
  for (const cf of data.custom_fields) {
    fieldMeta[cf.asana_gid] = {
      name: cf.name,
      type: mapFieldType(cf.type),
      options: cf.options.map(o => o.name),
    };
  }

  // Per-card ("disconnected") fields only expose { gid, name, value } — the export
  // dropped their type. Reconstruct it from the values actually used so each field
  // behaves the way it did in Asana: a small set of short, repeated values is an
  // enum dropdown (e.g. SEM - KPI); URLs are url; everything else is text.
  const seenValues = {}; // gid -> { name, values: Set }
  for (const card of data.cards) {
    for (const cf of card.custom_fields || []) {
      if (fieldMeta[cf.gid]) continue; // already typed from the project definition
      if (cf.value == null || cf.value === '') continue;
      const slot = seenValues[cf.gid] || (seenValues[cf.gid] = { name: cf.name, values: new Set() });
      slot.values.add(String(cf.value));
    }
  }

  for (const [gid, info] of Object.entries(seenValues)) {
    const values = [...info.values];
    const isUrl = /url|link/i.test(info.name) || values.every(v => /^https?:\/\//.test(v));
    let type = 'text';
    let options = [];
    if (isUrl) {
      type = 'url';
    } else if (values.length >= 2 && values.every(v => v.length <= 40 && !v.includes('\n'))) {
      type = 'enum';
      options = values.sort();
    }
    fieldMeta[gid] = { name: info.name, type, options };
  }

  const fieldGidToId = {};
  let fieldPos = 0;
  for (const [gid, meta] of Object.entries(fieldMeta)) {
    const result = await db.collection('custom_fields').findOneAndUpdate(
      { asanaGid: gid, boardId },
      {
        $set: {
          boardId,
          name: meta.name,
          type: meta.type,
          options: meta.options,
          isRequired: false,
          position: fieldPos++,
          asanaGid: gid,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
    fieldGidToId[gid] = result._id;
    console.log(`  ${meta.name} (${meta.type}) → ${result._id}`);
  }

  // 7. Build user map from assignees in the export
  console.log('\n[7] Upserting users from assignees...');
  const assigneeMap = {};
  const seenEmails = new Set();
  for (const card of data.cards) {
    if (card.assignee && card.assignee.email && !seenEmails.has(card.assignee.email)) {
      seenEmails.add(card.assignee.email);
      const result = await db.collection('users').findOneAndUpdate(
        { email: card.assignee.email },
        {
          $set: { name: card.assignee.name, email: card.assignee.email },
          $setOnInsert: { role: 'member', createdAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' }
      );
      assigneeMap[card.assignee.asana_gid] = result._id;
    }
  }
  console.log(`  ${seenEmails.size} users upserted.`);

  // 8. Upsert cards + subtasks + comments
  console.log(`\n[8] Upserting cards, subtasks, and comments...`);

  const report = {
    cards: { inserted: 0, updated: 0, skipped: 0 },
    subtasks: { total: 0 },
    comments: { total: 0 },
  };

  for (let i = 0; i < data.cards.length; i++) {
    const card = data.cards[i];
    progress(i + 1, data.cards.length, card.title.substring(0, 35));

    // Skip cards whose column was skipped
    if (card.column_gid && skipColumns.has(card.column_gid)) {
      report.cards.skipped++;
      continue;
    }

    const columnId = card.column_gid ? columnGidToId[card.column_gid] : null;
    if (!columnId) {
      report.cards.skipped++;
      continue;
    }

    // Archived = lives in an archive-named column ONLY. Completion is tracked
    // separately (isCompleted) so completed cards still show in their column.
    const isArchived = archiveColumns.has(card.column_gid);

    // Build fieldValues from custom fields
    const fieldValues = [];
    for (const cf of card.custom_fields || []) {
      const fieldId = fieldGidToId[cf.gid];
      const meta = fieldMeta[cf.gid];
      if (!fieldId || !meta || cf.value == null || cf.value === '') continue;
      const entry = { fieldId };
      if (meta.type === 'enum') entry.valueEnum = cf.value;
      else if (meta.type === 'number') entry.valueNumber = Number(cf.value);
      else if (meta.type === 'date') entry.valueDate = new Date(cf.value);
      else entry.valueText = cf.value;
      fieldValues.push(entry);
    }

    // Tags (e.g. NEW LAUNCH, SEM, PMAX) — normalize to an array of strings.
    const tags = (card.tags || []).map(t => (typeof t === 'string' ? t : t.name)).filter(Boolean);

    // Image attachments already uploaded to S3 during export.
    const attachments = (card.attachments || [])
      .filter(a => a && a.url)
      .map(a => ({ name: a.name, url: a.url, isImage: !!a.is_image, inline: !!a.inline, createdAt: a.created_at ? new Date(a.created_at) : null }));

    const assigneeId = card.assignee?.asana_gid ? assigneeMap[card.assignee.asana_gid] : null;

    const cardResult = await db.collection('cards').findOneAndUpdate(
      { asanaGid: card.asana_gid },
      {
        $set: {
          boardId,
          columnId,
          title: card.title,
          description: card.description || '',
          descriptionHtml: card.description_html || null,
          assigneeId: assigneeId || null,
          dueDate: card.due_date ? new Date(card.due_date) : null,
          isArchived,
          isCompleted: card.is_completed || false,
          completedAt: card.completed_at ? new Date(card.completed_at) : null,
          tags,
          attachments,
          fieldValues,
          asanaGid: card.asana_gid,
          asanaProjectGid: card.asana_project_gid,
          updatedAt: new Date(card.modified_at),
        },
        $setOnInsert: {
          position: i,
          createdAt: new Date(card.created_at),
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    const cardId = cardResult._id;
    const isNew = !cardResult.asanaGid;
    if (isNew) report.cards.inserted++;
    else report.cards.updated++;

    // Upsert subtasks
    for (let si = 0; si < (card.subtasks || []).length; si++) {
      const sub = card.subtasks[si];
      await db.collection('subtasks').updateOne(
        { asanaGid: sub.asana_gid },
        {
          $set: {
            cardId,
            title: sub.title,
            isComplete: sub.is_complete,
            notes: sub.notes || '',
            dueDate: sub.due_date ? new Date(sub.due_date) : null,
            asanaGid: sub.asana_gid,
          },
          $setOnInsert: {
            position: si,
            assigneeId: null,
            createdAt: new Date(sub.created_at),
          },
        },
        { upsert: true }
      );
      report.subtasks.total++;
    }

    // Upsert comments (preserve original timestamps)
    for (const comment of card.comments || []) {
      await db.collection('comments').updateOne(
        { asanaGid: comment.asana_gid },
        {
          $set: {
            cardId,
            authorId: null,
            body: comment.body,
            bodyHtml: comment.body_html || null,
            isMigrated: true,
            migratedAuthorName: comment.author?.name || 'Unknown',
            migratedAuthorEmail: comment.author?.email || null,
            asanaGid: comment.asana_gid,
            createdAt: new Date(comment.created_at),
          },
        },
        { upsert: true }
      );
      report.comments.total++;
    }
  }

  console.log('\n');

  // 9. Print report
  console.log('='.repeat(60));
  console.log('SEED REPORT');
  console.log('='.repeat(60));
  console.log(`Board:         ${data.project.name} (${boardId})`);
  console.log(`Cards:         ${report.cards.inserted} inserted, ${report.cards.updated} updated, ${report.cards.skipped} skipped`);
  console.log(`Subtasks:      ${report.subtasks.total}`);
  console.log(`Comments:      ${report.comments.total}`);
  console.log(`Users:         ${seenEmails.size}`);
  console.log(`Columns kept:  ${data.columns.length - skipColumns.size}`);
  console.log(`Archive cols:  ${archiveColumns.size}`);
  console.log('\n✓ Seed complete.');

  await client.close();
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
