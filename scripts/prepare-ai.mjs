// Local-only preparation. Never deploys, creates cloud resources or prints secrets.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

if (!existsSync('dist/server/wrangler.json')) throw new Error('Run npm run build first, then npm run ai:prepare.');
function wrangler(args) {
  const result = spawnSync(process.execPath, ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', '.wrangler/state', '--json', ...args], { encoding: 'utf8', timeout: 120000, windowsHide: true });
  if (result.status !== 0) throw new Error('Local database preparation failed. Check the local Wrangler configuration; no cloud resources were changed.');
  return JSON.parse(result.stdout);
}
const query = sql => wrangler(['--command', sql]).flatMap(result => result.results || []);
const tables = query("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ai_%'");
if (!tables.some(table => table.name === 'ai_attempts')) wrangler(['--file', 'drizzle/0003_bumpy_skullbuster.sql']);
const indexes = query("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'ai_attempt_%'");
if (!indexes.some(index => index.name === 'ai_attempt_owner_request')) wrangler(['--file', 'drizzle/0004_chemical_vulcan.sql']);
const columns = query('PRAGMA table_info(ai_attempts)');
if (!columns.some(column => column.name === 'image_hash')) wrangler(['--file', 'drizzle/0005_harsh_rachel_grey.sql']);
console.log('Local AI tables and indexes are ready. Existing world data and attempt history were preserved.');
if (!existsSync('.dev.vars')) {
  const template = readFileSync('.env.example', 'utf8').replace('GENERATED_BY_LOCAL_SETUP', randomBytes(32).toString('hex'));
  writeFileSync('.dev.vars', template, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored .dev.vars with AI disabled and a random display access key. Its contents are not printed.');
} else console.log('Existing .dev.vars was kept unchanged.');
console.log('Next: fill Account ID and Workers AI token in .dev.vars, set HEARTBEAT_AI_ENABLED=true, restart npm run dev, and open http://localhost:5173/. For the account application, run npm run product:prepare and sign in. The old shared key is only for /local-study.');
