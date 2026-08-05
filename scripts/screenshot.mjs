// Dev-only: screenshot a page of the running app, so UI changes can be LOOKED at instead
// of reasoned about. Three layout bugs shipped blind is what prompted this.
//
// Drives the installed Edge/Chrome over CDP using Node 22's built-in WebSocket — no
// Playwright, no browser download, no new dependencies.
//
// Usage (dev server must already be running):
//   node scripts/screenshot.mjs "/boards/<id>?view=calendar" out.png [width] [height]
//
// Seeds the shared access password into localStorage first, otherwise every page is the
// AccessGate lock screen (see CLAUDE.md → Auth).

import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import 'dotenv/config';

const [pathArg = '/', outFile = 'screenshot.png', width = '1500', height = '1000'] = process.argv.slice(2);
const ORIGIN = process.env.SCREENSHOT_ORIGIN || 'http://localhost:5173';
const PORT = 9222;

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const exe = BROWSERS.find(existsSync);
if (!exe) { console.error('No Edge/Chrome found.'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = spawn(exe, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shot-'))}`,
  `--window-size=${width},${height}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  'about:blank',
], { stdio: 'ignore' });

// One CDP conversation, ids tracked so responses can be awaited.
let ws, nextId = 1;
const pending = new Map();
const events = [];

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('browser never exposed a page target');
}

const waitForEvent = async (name, timeoutMs = 20000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (events.some(e => e.method === name)) return true;
    await sleep(100);
  }
  return false;
};

try {
  const wsUrl = await connect();
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Console.enable');

  // Origin first, so localStorage is writable for it, then seed the gate password.
  await send('Page.navigate', { url: ORIGIN });
  await waitForEvent('Page.loadEventFired');
  const pw = process.env.ACCESS_PASSWORD || '';
  // SHOT_STORAGE='{"calendar.mode":"week"}' seeds extra keys. Needed for anything a
  // component reads once at mount — setting it after load is too late.
  const extra = JSON.parse(process.env.SHOT_STORAGE || '{}');
  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('accessPassword', ${JSON.stringify(pw)});
      Object.entries(${JSON.stringify(extra)}).forEach(([k, v]) => localStorage.setItem(k, v)); 'ok'`,
  });

  events.length = 0;
  await send('Page.navigate', { url: ORIGIN + pathArg });
  await waitForEvent('Page.loadEventFired');
  // Poll for a real condition, don't just sleep. A fixed sleep once had me "verifying"
  // an empty, still-loading calendar and concluding the layout was fixed.
  if (process.env.SHOT_WAIT_FOR) {
    const deadline = Date.now() + Number(process.env.SHOT_WAIT_TIMEOUT || 30000);
    let ok = false;
    while (Date.now() < deadline) {
      const r = await send('Runtime.evaluate', {
        expression: process.env.SHOT_WAIT_FOR, returnByValue: true,
      }).catch(() => null);
      if (r?.result?.value) { ok = true; break; }
      await sleep(400);
    }
    if (!ok) console.log('WARNING: wait-for condition never became true — shot may be premature');
    await sleep(600);   // let the last paint settle
  } else {
    await sleep(Number(process.env.SHOT_WAIT_MS || 9000));
  }

  // Optional probe: SHOT_EVAL="expression" runs in the page and prints the result, for
  // answering "what does the app actually think it has?" without guessing from pixels.
  if (process.env.SHOT_EVAL) {
    const r = await send('Runtime.evaluate', {
      expression: process.env.SHOT_EVAL, awaitPromise: true, returnByValue: true,
    });
    console.log('eval:', JSON.stringify(r.result?.value ?? r.result?.description));
  }

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(outFile, Buffer.from(data, 'base64'));

  const errors = events
    .filter(e => e.method === 'Runtime.exceptionThrown'
      || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
    .map(e => e.params?.exceptionDetails?.text
      || e.params?.args?.map(a => a.value || a.description).join(' '));
  console.log(`saved ${outFile}`);
  if (errors.length) console.log('console errors:\n  ' + errors.slice(0, 8).join('\n  '));
  else console.log('no console errors');
} finally {
  browser.kill();
}
