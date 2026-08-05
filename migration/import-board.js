'use strict';

/**
 * import-board.js — one command to import a board end to end.
 *
 *   node migration/import-board.js rachel
 *   node migration/import-board.js --all
 *
 * Runs, in order:
 *   1. asana-migrate  (Asana -> JSON, uploads attachments to S3)
 *   2. asana-seed     (JSON -> MongoDB, with this board's archive/skip decisions)
 *   3. lumina-match   (--apply, links cards to Lumina line items)
 *
 * The per-board decisions come from boards.config.js, so nobody has to remember which
 * columns to archive on which board. Each step is a normal script you can still run on
 * its own; this just stops you assembling the same three commands by hand every time.
 *
 * Stops at the first failing step — a half-migrated export shouldn't be seeded, and an
 * incomplete seed shouldn't be matched against Lumina.
 *
 * Flags:
 *   --skip-migrate   reuse the existing export JSON (re-seed without re-pulling Asana)
 *   --skip-match     import only, link Lumina later
 *   --dry-match      run lumina-match as a dry run instead of --apply
 */

require('dotenv').config();

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const BOARDS = require('./boards.config');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const positional = args.filter(a => !a.startsWith('--'));

function usage(msg) {
  if (msg) console.error(`\n${msg}`);
  console.error('\nUsage: node migration/import-board.js <board> [--all] [--skip-migrate] [--skip-match] [--dry-match]');
  console.error('\nBoards:');
  for (const b of BOARDS) console.error(`  ${b.key.padEnd(8)} ${b.name}  (${b.gid})`);
  process.exit(1);
}

const targets = flag('all')
  ? BOARDS
  : BOARDS.filter(b => positional.includes(b.key) || positional.includes(b.gid));

if (!targets.length) usage(positional.length ? `Unknown board: ${positional.join(', ')}` : null);

// Inherit stdio so the underlying scripts' progress bars and prompts behave normally.
function run(label, script, scriptArgs) {
  console.log(`\n${'='.repeat(64)}\n${label}\n${'='.repeat(64)}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...scriptArgs], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
  if (r.status !== 0) {
    console.error(`\nFAILED: ${label} (exit ${r.status}). Stopping.`);
    process.exit(r.status || 1);
  }
}

for (const board of targets) {
  const exportFile = `asana-export-${board.key}.json`;
  const exportPath = path.join(__dirname, exportFile);

  console.log(`\n\n########  ${board.name}  ########`);

  if (!flag('skip-migrate')) {
    run(`1/3  Asana -> ${exportFile}`, 'asana-migrate.js', [
      `--project=${board.gid}`,
      `--out=${exportFile}`,
    ]);
  } else if (!fs.existsSync(exportPath)) {
    console.error(`\n--skip-migrate but ${exportFile} doesn't exist. Run without it first.`);
    process.exit(1);
  }

  const seedArgs = [exportFile];
  if (board.archive?.length) seedArgs.push(`--archive=${board.archive.join(',')}`);
  if (board.skip?.length) seedArgs.push(`--skip=${board.skip.join(',')}`);
  run('2/3  Seed into MongoDB', 'asana-seed.js', seedArgs);

  if (!flag('skip-match')) {
    // --board takes the Asana GID as well as a Mongo id, so the config's gid is enough.
    const matchArgs = [`--board=${board.gid}`];
    if (!flag('dry-match')) matchArgs.push('--apply');
    run(`3/3  Link Lumina${flag('dry-match') ? ' (dry run)' : ''}`, 'lumina-match.js', matchArgs);
  }

  console.log(`\n########  ${board.name} — done  ########`);
}

console.log('\nAll requested boards imported.');
