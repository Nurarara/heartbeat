// Simulated DOM: actual connection hook and panel, with mocked HTTP. No inference.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

const dom = new JSDOM('<div id="app"></div>', { url: 'http://127.0.0.1:5173', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'localStorage']) Object.defineProperty(globalThis, key, { value: key === 'window' ? dom.window : dom.window[key], configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let connected = false, allow = false, checks = 0;
globalThis.fetch = async (url) => {
  if (url === '/api/ai/status') { checks++; return Response.json({ configured: true, authorized: connected, available: connected, reason: connected ? 'AI is connected for this browser.' : 'Unlock this browser with the local AI access key.', dailyLimit: 3, used: 2 }); }
  if (url === '/api/ai/session') { if (!allow) return Response.json({ error: 'Connection blocked: open Heartbeat at its configured address, then connect again.' }, { status: 403 }); connected = true; return Response.json({ connected: true }); }
  throw new Error(`Unexpected request ${url}; connection checks must not generate pictures`);
};
const output = await build({ stdin: { contents: `import React from 'react';import {useAIPlayback} from './hooks/use-ai-playback';import {AIControls} from './components/ai-controls';export default function Harness(){const ai=useAIPlayback({base:null,memory:null,preferences:null,at:Date.now(),paused:false,visible:true,accept:()=>false,reject:()=>{},localCanDisplay:()=>true});return <AIControls connection={ai.connection} busy={ai.busy} message={ai.message} unlock={ai.unlock} refresh={ai.refresh} taste={()=>{}}/>}`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, tsconfig: 'tsconfig.json', logLevel: 'silent' });
const artifact = new URL('../.sites-runtime/tests/ai-connection.cjs', import.meta.url);
await mkdir(new URL('../.sites-runtime/tests/', import.meta.url), { recursive: true }); await writeFile(artifact, output.outputFiles[0].contents);
const Harness = createRequire(import.meta.url)(fileURLToPath(artifact)).default;
const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('app'));
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
const click = async label => { const button = [...document.querySelectorAll('button')].find(item => item.textContent === label); assert.ok(button, label); await act(async () => button.click()); await settle(); };
try {
  await act(async () => root.render(React.createElement(Harness))); await settle();
  assert.match(document.body.textContent, /Not connected/);
  const input = document.querySelector('input');
  await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'test-display-access-key'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  await click('Connect AI');
  assert.match(document.body.textContent, /Connection blocked/);
  assert.match(document.body.textContent, /Not connected/);
  const previous = checks; await click('Check AI connection'); assert.ok(checks > previous);
  assert.match(document.body.textContent, /Connection checked/);
  allow = true; await click('Connect AI');
  assert.equal(document.querySelector('[role="status"]').textContent, 'Connected');
  assert.match(document.body.textContent, /2 of 3/);
  assert.match(document.body.textContent, /Showing free artwork/);
  assert.equal(document.querySelector('input'), null);
  console.log('Passed actual connection hook/panel: rejected login stays visibly disconnected, status check reports completion, successful login shows connected/budget and clears the key field. Mocked HTTP; no inference.');
} finally { await act(async () => root.unmount()); dom.window.close(); }
