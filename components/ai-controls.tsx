"use client";
import { useState } from 'react';
import type { AIStatus } from '@/lib/ai/types';
import type { CreativeDirection } from '@/lib/ambient-director';
import type { CreativeProposal } from '@/lib/creative';

const CRITERIA = ['Context fit', 'Restful atmosphere', 'Composition', 'Freshness', 'Coherent aesthetic'];
export function AIControls({ connection, busy, message, unlock, refresh, current, taste }: { connection: AIStatus; busy: boolean; message: string; unlock: (key: string) => Promise<boolean>; refresh: () => Promise<void>; current?: CreativeDirection | null; taste: (idea: CreativeProposal, preference: 'more' | 'less') => void }) {
  const [key, setKey] = useState(''), [unlocking, setUnlocking] = useState(false), [note, setNote] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [tasteApplied, setTasteApplied] = useState(false);
  const [checking, setChecking] = useState(false);
  if(connection.account&&!connection.authorized)return <details className="hb-creative-tools"><summary>Your artwork</summary><p role="status" className="hb-panel-note">{connection.configured?'Your session ended. Sign in again to prepare pictures.':connection.reason}</p><a href="/auth" className="hb-preferences-button">Sign in</a><a href="/app" className="hb-preferences-button">Your studio</a></details>;
  async function connect() {
    setUnlocking(true);
    try { if (await unlock(key)) { setKey(''); setNote('This browser is connected.'); } }
    catch { setNote('The connection could not be unlocked. Try again.'); }
    finally { setUnlocking(false); }
  }
  function saveRating() {
    if (!current?.artwork) return;
    try {
      const existing: unknown = JSON.parse(localStorage.getItem('heartbeat.image-ratings.v1') || '[]');
      const list = Array.isArray(existing) ? existing.slice(-99) : [];
      list.push({ version: 1, attemptId: current.artwork.attemptId, title: current.artwork.title, ratings, ratedAt: Date.now() });
      localStorage.setItem('heartbeat.image-ratings.v1', JSON.stringify(list)); setNote('Picture ratings saved in this browser.');
    } catch { setNote('This browser could not save the ratings.'); }
  }
  function exportRatings() {
    try {
      const raw = localStorage.getItem('heartbeat.image-ratings.v1') || '[]';
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })), link = document.createElement('a');
      link.href = url; link.download = 'heartbeat-picture-ratings.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setNote('Ratings could not be exported.'); }
  }
  return <details className="hb-creative-tools"><summary>AI connection and picture review</summary>
    <p className="hb-panel-note" role="status"><strong>{connection.authorized ? busy ? 'Connected · Preparing a picture' : 'Connected' : connection.configured ? 'Not connected' : 'AI setup unavailable'}</strong></p>
    <p className="hb-panel-note">{connection.reason}</p>
    {connection.authorized && <p className="hb-panel-note">{current?.artwork ? `Showing AI artwork: ${current.artwork.title}` : 'Showing free artwork while a generated picture is pending or unavailable.'}</p>}
    {connection.authorized && <p className="hb-panel-note">{connection.used || 0} of {connection.dailyLimit} {connection.account?'picture preparations used in your allowance.':'shared preparation attempts used today.'} {busy ? 'Preparing a picture; current artwork stays visible.' : message}</p>}
    {connection.configured && !connection.authorized && <div className="hb-ai-unlock"><label>Local AI access key<input type="password" autoComplete="off" aria-label="Local AI access key" value={key} onChange={event => setKey(event.target.value)} /></label><p className="hb-panel-note">Use the display access key from your local setup file. Your Cloudflare API token belongs only in the server setup file.</p><button className="hb-preferences-button" disabled={!key || unlocking} onClick={connect}>{unlocking ? 'Connecting…' : 'Connect AI'}</button>{message && <p className="hb-panel-note">{message}</p>}</div>}
    <button className="hb-preferences-button" disabled={checking} onClick={async () => { setChecking(true); try { await refresh(); setNote('Connection checked. Current status is shown above.'); } catch { setNote('Connection check failed. Please try again.'); } finally { setChecking(false); } }}>{checking ? 'Checking…' : 'Check AI connection'}</button>
    {current?.artwork && <div className="hb-idea"><p><strong>{current.artwork.title}</strong></p><p className="hb-panel-note">Judge the picture on screen: 1 is poor, 5 is excellent. A visually attractive picture can still be wrong for this moment.</p>{CRITERIA.map(criterion => <label className="hb-toggle" key={criterion}><span>{criterion}</span><select aria-label={criterion} value={ratings[criterion] || 0} onChange={event => setRatings(value => ({ ...value, [criterion]: Number(event.target.value) }))}><option value={0}>Not rated</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}</select></label>)}<button className="hb-preferences-button" onClick={saveRating}>Save picture ratings</button><div className="hb-idea-actions">{(['more', 'less'] as const).map(preference => <button key={preference} className="hb-preferences-button" disabled={tasteApplied} onClick={() => { taste(current.artwork!.proposal, preference); setTasteApplied(true); setNote('Scene ingredient preference applied to future ideas.'); }}>{preference === 'more' ? 'More of this scene' : 'Less of this scene'}</button>)}</div></div>}
    <button className="hb-preferences-button" onClick={exportRatings}>Export picture ratings</button>
    <p className="hb-panel-note" role="status">{note}</p>
  </details>;
}
