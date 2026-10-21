/** Original procedural field illustration; temperature supplies atmosphere, not weather claims. */
export function renderMeadow({ seed = 1, hour = 13, temperature = 20, festive = false, phase = '', season = 'summer' } = {}) {
  const n = Number(seed) >>> 0 || 1, id = `meadow-${n}`;
  let state = n;
  const random = () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const h = Number(hour) || 0;
  const night = phase === 'night' || (!phase && (h < 6 || h >= 21));
  const dusk = ['dusk', 'sunset', 'dawn', 'sunrise'].includes(phase) || (!night && !phase && (h < 8 || h >= 17));
  const winter = season === 'winter', autumn = season === 'autumn', spring = season === 'spring';
  const palettes = winter ? ['#b0b5a1', '#939d8b', '#738572', '#566d5e'] : autumn ? ['#cfb57a', '#b8a16a', '#9d9257', '#777d45'] : spring ? ['#b4c795', '#8fae79', '#75965e', '#4f7951'] : season === 'tropical' ? ['#aac489', '#78a36b', '#578e5e', '#376b4c'] : ['#c6cb91', '#a7b77b', '#8ba168', '#647f50'];
  const tint = Math.floor(random() * 13);
  const treeX = 390 + random() * 760, treeY = 624 + random() * 62;
  const treeScale = .80 + random() * .31;
  const sky = night ? ['#101e30', '#334958', '#617168'] : dusk ? ['#879aa7', '#dfba9b', '#f0d4a9'] : ['#88b7cb', '#c7dcd3', '#eee4bc'];
  let art = `<defs>
    <linearGradient id="${id}-sky" x2="0" y2="1"><stop stop-color="${sky[0]}"/><stop offset=".67" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
    <linearGradient id="${id}-field" x2=".15" y2="1"><stop stop-color="${palettes[1]}"/><stop offset="1" stop-color="${palettes[3]}"/></linearGradient>
    <radialGradient id="${id}-light"><stop stop-color="#fff0c2" stop-opacity="${night ? '.02' : '.4'}"/><stop offset="1" stop-color="#fff0c2" stop-opacity="0"/></radialGradient>
    <pattern id="${id}-paper" width="23" height="19" patternUnits="userSpaceOnUse"><path d="M2 4h3M16 12l3-1M7 17h2" stroke="#f9f1cd" stroke-width=".6" opacity=".13"/></pattern>
    <radialGradient id="${id}-edge"><stop offset=".5" stop-color="#0c2030" stop-opacity="0"/><stop offset="1" stop-color="#0c2030" stop-opacity="${night ? '.3' : '.1'}"/></radialGradient>
  </defs><rect width="1600" height="1000" fill="url(#${id}-sky)"/>
  <ellipse cx="${1190 - random() * 600}" cy="240" rx="510" ry="390" fill="url(#${id}-light)"/>`;
  for (let i = 0; i < 7; i++) {
    const x = -180 + i * 300 + random() * 100, y = 140 + random() * 200, s = .7 + random() * .7;
    art += `<g transform="translate(${x} ${y}) scale(${s})" fill="${night ? '#9aa9aa' : '#fff8dd'}" opacity="${night ? '.045' : '.33'}"><path d="M-170 22q37-20 79-14q23-23 60-14q26-24 57-10q37-15 61 13q45-7 74 18q54 1 81 17q-191 17-412-10Z"/><path d="M-128 48q170-14 334 4q-175 11-334-4Z" opacity=".5"/></g>`;
  }
  for (let i = 0; i < 4; i++) {
    const y = 460 + i * 46;
    const ridge = 35 + random() * 73;
    art += `<path d="M-80 ${y + 74}Q${240 + random() * 100} ${y - ridge} 640 ${y + 40}T1680 ${y + 30}V1000H-80Z" fill="${night ? ['#637577', '#536a68', '#405b56', '#304b43'][i] : palettes[i]}"/>`;
    if (i < 2) art += `<path d="M-80 ${y + 75}Q${200 + random() * 100} ${y - ridge} 640 ${y + 40}T1680 ${y + 30}" fill="none" stroke="#e2d8ab" opacity=".12" stroke-width="2"/>`;
  }
  art += `<path d="M0 760Q500 636 1600 731V1000H0Z" fill="url(#${id}-field)"/>
    <path d="M900 622Q618 715 844 828Q932 886 780 1000H912Q1070 873 937 807Q711 717 948 628Z" fill="${night ? '#a4a58b' : '#ddca94'}" opacity=".23"/>
    <path d="M0 806Q540 693 1085 783T1600 807" fill="none" stroke="${night ? '#798c75' : '#d9d59f'}" stroke-width="2" opacity=".35"/>`;
  // The distant field is deliberately spacious; fine marks gather toward the viewer.
  for (let i = 0; i < 400; i++) {
    const y = 625 + random() ** .6 * 375, depth = (y - 600) / 400;
    const x = random() * 1600, length = 2 + depth * random() * 21;
    art += `<path d="M${x} ${y}q${-4 * depth} ${-length * .6} ${-7 * depth} ${-length}" fill="none" stroke="${i % 3 ? palettes[0] : '#344f39'}" stroke-width="${.6 + depth * .8}" opacity="${.10 + depth * .18}"/>`;
    if (spring && i % 4 === 0) art += `<circle cx="${x - depth * 4}" cy="${y - length}" r="${.7 + depth * 1.2}" fill="${i % 8 ? '#efe5bb' : '#c3a2a5'}" opacity=".65"/>`;
  }
  art += `<ellipse cx="${treeX + 65}" cy="${treeY + 18}" rx="${210 * treeScale}" ry="${23 * treeScale}" transform="rotate(-6 ${treeX} ${treeY})" fill="#263e35" opacity=".17"/>
    <g transform="translate(${treeX} ${treeY}) scale(${treeScale})">
    <path d="M-20 14q24-84 5-196q-2-83 27-145q-12 102 9 181q6 83-6 160Z" fill="${night ? '#304039' : '#665c42'}"/>
    <g fill="none" stroke="${night ? '#34443c' : '#6e6346'}" stroke-linecap="round"><path d="M5-111q-61-93-138-116M9-160q57-99 135-117M2-209q-39-65-64-120M20-129q87-23 150-99M-10-140q-69-25-118-8" stroke-width="13"/><path d="M-76-203l-37-77M94-227l49-81M-13-264l45-86M-65-197l-88-5M117-199l71-20" stroke-width="6"/></g>`;
  if (!winter) {
    const canopy = autumn ? ['#a86e3e', '#bf8c48', '#d0aa64', '#887447'] : spring ? ['#86a46a', '#a8b881', '#b8c58d', '#638556'] : ['#64804e', '#879654', '#a1ac6b', '#4b704b'];
    for (let i = 0; i < 135; i++) {
      const angle = random() * Math.PI * 2, distance = Math.sqrt(random());
      const x = Math.cos(angle) * distance * 203;
      const y = -263 + Math.sin(angle) * distance * 102;
      const r = 12 + random() * 36;
      art += `<ellipse cx="${x}" cy="${y}" rx="${r * 1.3}" ry="${r}" fill="${canopy[i % canopy.length]}" opacity="${night ? '.43' : '.65'}"/>`;
    }
    for (let i = 0; i < 75; i++) {
      const x = -190 + random() * 370, y = -330 + random() * 145;
      art += `<path d="M${x} ${y}l5-2m-2 7 5-2" stroke="${night ? '#bdc3a0' : '#e1ce8d'}" opacity=".22" stroke-width="1.5"/>`;
    }
  } else {
    for (let i = 0; i < 32; i++) {
      const angle = random() * Math.PI * 2, distance = Math.sqrt(random());
      const x = Math.cos(angle) * distance * 165, y = -250 + Math.sin(angle) * distance * 100;
      art += `<path d="M0-170Q${x * .5} ${y - 20} ${x} ${y}l${random() * 22 - 11} -22" stroke="#626d60" stroke-width="1.4" opacity=".7" fill="none"/>`;
    }
  }
  art += '</g>';
  // Small animals are observed from far away, at the scale of the landscape.
  const dogsX = 400 + random() * 650, dogsY = 707 + random() * 38;
  const ballX = dogsX + 105 + random() * 65;
  for (let i = 0; i < 2; i++) {
    const x = dogsX - i * (35 + random() * 18), y = dogsY + i * 8;
    art += `<g transform="translate(${x} ${y}) scale(${.65 + i * .08})" fill="${i ? '#b9a58a' : '#3c4d43'}"><ellipse cx="0" cy="10" rx="23" ry="3" fill="#304f3a" opacity=".2"/><path d="M-19-2q12-11 30-4l10-8 9 3-3 8-11 2-5 8-4-1-2-7-12 1-10 10-4-2 6-11Z"/><path d="M-17-4q-12-13-21-7" fill="none" stroke="${i ? '#b9a58a' : '#3c4d43'}" stroke-width="3" stroke-linecap="round"/></g>`;
  }
  art += `<circle cx="${ballX}" cy="${dogsY + 4}" r="3.4" fill="${night ? '#b6a883' : '#ca8455'}"/>`;
  for (let i = 0; i < 3; i++) {
    const x = 900 + random() * 300, y = 195 + random() * 110;
    art += `<path d="M${x} ${y}q7-5 12 1q5-6 12-1" stroke="${night ? '#b0bdb5' : '#597f88'}" stroke-width="1.5" fill="none" opacity=".5"/>`;
  }
  art += `<rect width="1600" height="1000" fill="url(#${id}-paper)"/><rect width="1600" height="1000" fill="${night ? '#0b2033' : `hsl(${36 + tint} 35% 70%)`}" opacity="${night ? '.32' : '.025'}"/><rect width="1600" height="1000" fill="url(#${id}-edge)"/>`;
  return art;
}
