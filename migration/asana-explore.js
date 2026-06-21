/**
 * asana-explore.js  v2
 * 
 * READ-ONLY script. Does not modify any data.
 * 
 * Usage:
 *   ASANA_PAT=your_token_here node asana-explore.js
 */

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const ASANA_PAT = process.env.ASANA_PAT || 'PASTE_YOUR_TOKEN_HERE';
const BASE_URL = 'https://app.asana.com/api/1.0';

// Hardcoded GIDs for the 4 Phase 1 buying team boards
// (identified from first exploration run)
const PHASE1_BOARDS = [
  { gid: '1156457376337923', name: 'The A Team (Team Rachel)' },
  { gid: '1205337491932114', name: 'The Dream Team (Team Conrad)' },
  { gid: '1208888075650797', name: 'Team Kathy' },
  // Team Tots GID — need to find it, searching by name below
];

// Also search for these by name in case GID is unknown
const PHASE1_NAME_SEARCH = ['team tots', 'team t tots', 'team tran'];

const headers = {
  'Authorization': `Bearer ${ASANA_PAT}`,
  'Accept': 'application/json',
};

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status} on ${path}: ${text}`);
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

async function exploreBoard(project) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📋 ${project.name}`);
  console.log(`   GID: ${project.gid}`);

  // Sections (columns)
  const sections = await getAll(`/projects/${project.gid}/sections`);
  console.log(`\n   Columns (${sections.length}):`);
  for (const s of sections) {
    console.log(`     [${s.gid}] "${s.name}"`);
  }

  // Tasks with full fields
  console.log(`\n   Loading cards...`);
  const tasks = await getAll(
    `/projects/${project.gid}/tasks`,
    '&opt_fields=gid,name,assignee.name,due_on,completed,memberships.section.name,num_subtasks,created_at,modified_at'
  );

  const active = tasks.filter(t => !t.completed);
  const completed = tasks.filter(t => t.completed);
  console.log(`   Cards: ${tasks.length} total | ${active.length} active | ${completed.length} completed/archived`);

  // Check assignee coverage
  const assigned = tasks.filter(t => t.assignee);
  console.log(`   Assigned: ${assigned.length}/${tasks.length} cards have an assignee`);

  // Sample 3 active cards with full detail
  console.log(`\n   Sample active cards:`);
  const sample = active.slice(0, 3);
  for (const t of sample) {
    const assignee = t.assignee?.name || '(unassigned)';
    const section = t.memberships?.[0]?.section?.name || '(no column)';
    console.log(`\n     • "${t.name}"`);
    console.log(`       Column: ${section}`);
    console.log(`       Assignee: ${assignee}`);
    console.log(`       Due: ${t.due_on || 'none'}`);
    console.log(`       Subtasks: ${t.num_subtasks || 0}`);
    console.log(`       GID: ${t.gid}`);

    // Fetch actual stories (comments) for this one card
    try {
      const stories = await getAll(
        `/tasks/${t.gid}/stories`,
        '&opt_fields=gid,type,text,created_at,created_by.name'
      );
      const comments = stories.filter(s => s.type === 'comment');
      const systemEntries = stories.filter(s => s.type !== 'comment');
      console.log(`       Comments: ${comments.length} | System entries: ${systemEntries.length}`);
      if (comments.length > 0) {
        const first = comments[0];
        const preview = (first.text || '').substring(0, 80).replace(/\n/g, ' ');
        console.log(`       First comment by ${first.created_by?.name}: "${preview}..."`);
      }
    } catch (e) {
      console.log(`       Comments: (could not fetch — ${e.message})`);
    }
  }
  if (active.length > 3) {
    console.log(`\n     ... and ${active.length - 3} more active cards`);
  }

  // Spot check comment access on a few more cards
  console.log(`\n   Checking comment access on 5 random cards...`);
  const checkSample = active.slice(0, 5);
  let totalComments = 0;
  let accessErrors = 0;
  for (const t of checkSample) {
    try {
      const stories = await getAll(`/tasks/${t.gid}/stories`, '&opt_fields=gid,type');
      const comments = stories.filter(s => s.type === 'comment');
      totalComments += comments.length;
    } catch (e) {
      accessErrors++;
    }
  }
  if (accessErrors > 0) {
    console.log(`   ⚠️  Access errors on ${accessErrors}/5 cards — PAT may lack comment permissions`);
  } else {
    console.log(`   ✓ Comment access confirmed (${totalComments} comments across 5 sampled cards)`);
  }

  return { project, sections, totalCards: tasks.length, activeCards: active.length };
}

async function main() {
  console.log('='.repeat(60));
  console.log('ASANA EXPLORATION SCRIPT v2 — READ ONLY');
  console.log('='.repeat(60));

  // Auth check
  console.log('\n[1] Authenticating...');
  const me = await get('/users/me');
  console.log(`✓ Logged in as: ${me.data.name} (${me.data.email})`);

  // Workspace
  console.log('\n[2] Finding workspace...');
  const workspaces = await getAll('/workspaces');
  const workspace = workspaces[0];
  console.log(`✓ Workspace: ${workspace.name} (gid: ${workspace.gid})`);

  // Find Team Tots by searching all projects
  console.log('\n[3] Searching for missing boards (Team Tots)...');
  const allProjects = await getAll(
    `/workspaces/${workspace.gid}/projects`,
    '&archived=false'
  );
  console.log(`   Total active projects: ${allProjects.length}`);

  const found = allProjects.filter(p =>
    PHASE1_NAME_SEARCH.some(name => p.name.toLowerCase().includes(name))
  );
  if (found.length > 0) {
    console.log(`   Found:`);
    found.forEach(p => console.log(`     ✓ [${p.gid}] ${p.name}`));
    // Add to board list
    found.forEach(p => {
      if (!PHASE1_BOARDS.find(b => b.gid === p.gid)) {
        PHASE1_BOARDS.push({ gid: p.gid, name: p.name });
      }
    });
  } else {
    console.log(`   ⚠️  Team Tots not found by name search. Check if it's archived or named differently.`);
    // Print any project with "team" in the name
    const teamProjects = allProjects.filter(p => p.name.toLowerCase().includes('team'));
    console.log(`   All projects with "team" in the name:`);
    teamProjects.forEach(p => console.log(`     - [${p.gid}] ${p.name}`));
  }

  // Deep explore each Phase 1 board
  console.log('\n\n' + '='.repeat(60));
  console.log(`DEEP DIVE: ${PHASE1_BOARDS.length} PHASE 1 BOARDS`);
  console.log('='.repeat(60));

  const results = [];
  for (const board of PHASE1_BOARDS) {
    const result = await exploreBoard(board);
    results.push(result);
  }

  // Final summary
  console.log('\n\n' + '='.repeat(60));
  console.log('MIGRATION READINESS SUMMARY');
  console.log('='.repeat(60));
  let totalCards = 0;
  for (const r of results) {
    console.log(`\n${r.project.name}`);
    console.log(`  Columns: ${r.sections.length}`);
    console.log(`  Total cards: ${r.totalCards} (${r.activeCards} active)`);
    totalCards += r.totalCards;
  }
  console.log(`\nTotal cards to migrate: ${totalCards}`);
  console.log('\n✓ Exploration complete. No data was modified.');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});