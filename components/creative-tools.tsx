"use client";

import { useState } from 'react';
import type { CreativeMemory, CreativeProposal } from '@/lib/creative';

export function CreativeTools({ preview, feedback, reset, memory }: {
  preview: () => CreativeProposal | null;
  feedback: (idea: CreativeProposal, preference: 'more' | 'less') => void;
  reset: () => void;
  memory?: CreativeMemory;
}) {
  const [idea, setIdea] = useState<CreativeProposal | null>(null);
  const [rated, setRated] = useState(false);
  const [message, setMessage] = useState('');
  return <details className="hb-creative-tools"><summary>Creative ideas and memory</summary>
    <p className="hb-panel-note">Explore proposals from the theme library. These are local planning previews; the free display still draws its six illustration families. Live image generation is controlled separately under AI connection.</p>
    <p className="hb-panel-note">{memory?.displayed || 0} displayed moments remembered in usage counts. Older detailed history is trimmed; your idea feedback stays until you reset it.</p>
    <button className="hb-preferences-button" onClick={() => { setIdea(preview()); setRated(false); setMessage(''); }}>Preview a scene idea</button>
    {idea && <div className="hb-idea"><p><strong>{idea.title}</strong></p><ul>{idea.themes.map(theme => <li key={theme.category}><span>{theme.category}</span> {theme.label}</li>)}</ul>
      <p className="hb-panel-note">{idea.lighting === 'dark' ? 'Dark, restful lighting is required.' : 'Lighting follows the local part of the day.'} This proposal has not been generated or displayed.</p>
      <details><summary>Read the image brief</summary><p className="hb-panel-note">{idea.prompt}</p></details>
      <div className="hb-idea-actions"><button className="hb-preferences-button" disabled={rated} onClick={() => { feedback(idea, 'more'); setRated(true); setMessage('Preference applied to future ideas.'); }}>More like this</button><button className="hb-preferences-button" disabled={rated} onClick={() => { feedback(idea, 'less'); setRated(true); setMessage('Preference applied to future ideas.'); }}>Less like this</button></div>
    </div>}
    <p className="hb-panel-note">Resetting forgets recent artwork, creative usage and idea feedback. Your city and display settings stay.</p>
    <button className="hb-preferences-button" onClick={() => { reset(); setIdea(null); setRated(false); setMessage('Creative history reset. Your city and display settings are kept.'); }}>Reset creative history</button>
    <p className="hb-panel-note" role="status">{message}</p>
  </details>;
}
