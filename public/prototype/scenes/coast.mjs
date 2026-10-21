/** Original quiet harbor illustration. Night is explicit, including polar-night contexts. */
export function renderCoast({ seed = 1, hour = 13, temperature = 20, festive = false, phase = '', season = 'summer' } = {}) {
  const n = Number(seed) >>> 0 || 1, id = `coast-${n}`;
  let state = n;
  const random = () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const h = Number(hour) || 0;
  const night = phase === 'night' || (!phase && (h < 6 || h >= 21));
  const dusk = ['dusk', 'sunset', 'dawn', 'sunrise', 'evening'].includes(phase) || (!night && !phase && (h < 8 || h >= 17));
  const winter = season === 'winter', autumn = season === 'autumn';
  const mirror = random() > .5;
  const lighthouseX = 310 + random() * 180;
  const sky = night ? ['#071321', '#162a3e', '#455b69'] : dusk ? ['#647f97', '#b4a6a5', '#e7bd9b'] : ['#88b4c8', '#b9d0d3', '#e4dfc8'];
  const sea = night ? ['#3b5665', '#1b374b', '#0a2032'] : dusk ? ['#a1aca9', '#648990', '#355e74'] : ['#b0cacc', '#79a9ae', '#477d91'];
  const cliff = night ? '#20383d' : winter ? '#7b8e82' : autumn ? '#8e8e68' : '#698a6a';
  let art = `<defs>
    <linearGradient id="${id}-sky" x2="0" y2="1"><stop stop-color="${sky[0]}"/><stop offset=".66" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
    <linearGradient id="${id}-sea" x2=".1" y2="1"><stop stop-color="${sea[0]}"/><stop offset=".48" stop-color="${sea[1]}"/><stop offset="1" stop-color="${sea[2]}"/></linearGradient>
    <radialGradient id="${id}-warm"><stop stop-color="#ffd999" stop-opacity="${night ? '.4' : '.22'}"/><stop offset="1" stop-color="#ffd999" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-horizon"><stop stop-color="${dusk ? '#f2d1a7' : '#afc6c5'}" stop-opacity="${night ? '.13' : '.26'}"/><stop offset="1" stop-color="#b6c8c7" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-vignette"><stop offset=".48" stop-color="#061425" stop-opacity="0"/><stop offset="1" stop-color="#061425" stop-opacity="${night ? '.4' : '.15'}"/></radialGradient>
    <pattern id="${id}-paper" width="29" height="23" patternUnits="userSpaceOnUse"><path d="M4 6h3M18 17h2M25 9h2" stroke="#eff2d9" stroke-width=".5" opacity=".09"/></pattern>
  </defs><rect width="1600" height="1000" fill="url(#${id}-sky)"/><g${mirror ? ' transform="translate(1600 0) scale(-1 1)"' : ''}>
  <ellipse cx="1110" cy="450" rx="690" ry="300" fill="url(#${id}-horizon)"/>`;
  if (night) {
    for (let i = 0; i < 145; i++) {
      const x = random() * 1600, y = 20 + random() * 430;
      art += `<circle cx="${x}" cy="${y}" r="${.4 + random() ** 3 * 1.2}" fill="${i % 9 ? '#c4d4d8' : '#e5ceb0'}" opacity="${.15 + random() * .5}"/>`;
    }
  }
  for (let i = 0; i < 7; i++) {
    const x = -230 + i * 300 + random() * 130, y = 120 + random() * 250;
    art += `<path d="M${x} ${y}q130-21 230-9t230 14q-232 27-460-5Z" fill="${night ? '#8c9fa8' : '#f4ead6'}" opacity="${night ? '.035' : '.21'}"/>`;
  }
  art += `<path d="M0 558Q130 494 265 540T574 529Q720 474 860 541T1200 535Q1380 490 1600 541V652H0Z" fill="${night ? '#2c4655' : '#7da0a4'}"/>
    <path d="M0 579Q200 557 390 582T800 578T1220 577T1600 576V1000H0Z" fill="url(#${id}-sea)"/>
    <path d="M470 596Q960 576 1600 594" fill="none" stroke="${night ? '#8fabae' : '#d7e2d1'}" stroke-width="1" opacity=".38"/>`;
  for (let i = 0; i < 260; i++) {
    const y = 591 + random() ** .72 * 409, depth = (y - 575) / 425;
    const x = random() * 1600, width = 4 + random() * (20 + depth * 90);
    art += `<path d="M${x} ${y}q${width * .5} ${random() * 3} ${width} 0" fill="none" stroke="${i % 4 ? '#bed0c9' : '#12394a'}" stroke-width="${.5 + depth * .7}" opacity="${night ? '.09' : '.2'}"/>`;
  }
  // A headland carries the lighthouse; the opposite bank holds a sheltered village.
  art += `<path d="M0 601Q173 542 ${lighthouseX - 46} 557Q${lighthouseX + 99} 542 580 650L690 677L420 723L102 769L0 751Z" fill="${cliff}"/>
    <path d="M0 751L102 769L420 723L690 677L592 724L412 760L142 808L0 787Z" fill="${night ? '#182f3b' : '#667c77'}"/>
    <path d="M0 758L137 781L410 735L641 686" stroke="${night ? '#7f9792' : '#c5bf9f'}" stroke-width="2" fill="none" opacity=".38"/>
    <path d="M0 630Q179 577 ${lighthouseX} 582" fill="none" stroke="${night ? '#a9ad94' : '#d3c89d'}" stroke-width="4" opacity=".3"/>`;
  art += `<g transform="translate(${lighthouseX} 565)">
    <path d="M-36 10l13-189h46L36 10Z" fill="${night ? '#899994' : '#e4dfc8'}"/>
    <path d="M0-178h23L36 10H10Z" fill="${night ? '#4e6a70' : '#b3c0b5'}"/>
    <path d="M-29-77h58l3 40H-32Z" fill="${night ? '#6e5b55' : '#b47664'}" opacity=".9"/>
    <path d="M-10 8v-30q10-13 20 0V8Z" fill="#273f49"/>
    <path d="M-5-132h10v20H-5Z" fill="${night ? '#d7bd82' : '#64838b'}"/>
    <path d="M-27-181v-36h54v36Z" fill="${night ? '#d7c48e' : '#a4c1bd'}"/>
    <ellipse cy="-199" rx="74" ry="65" fill="url(#${id}-warm)"/>
    <path d="M-30-219l30-20 30 20Z M-32-181h64v7h-64Z" fill="${night ? '#263b45' : '#526f76'}"/>
    <path d="M-16-216v34M0-217v34M16-216v34" stroke="#52676b" stroke-width="2"/>
    <path d="M-39-175v10h78v-10M-31-175v10M-16-175v10M0-175v10M16-175v10M31-175v10" fill="none" stroke="${night ? '#879996' : '#596f6e'}" stroke-width="2"/>
    <path d="M-46 10h92" stroke="${night ? '#233f43' : '#6a846b'}" stroke-width="7"/>
  </g>`;
  const shoreY = 658 + random() * 22;
  art += `<path d="M1085 ${shoreY + 25}Q1240 ${shoreY - 45} 1600 ${shoreY - 8}V864Q1440 741 1085 ${shoreY + 25}Z" fill="${night ? '#2a3d40' : '#7b8a75'}"/>
    <path d="M1050 ${shoreY + 28}L1600 ${shoreY + 59}v20L1050 ${shoreY + 38}Z" fill="${night ? '#334b50' : '#829c99'}"/>
    <path d="M1050 ${shoreY + 27}L1600 ${shoreY + 58}" fill="none" stroke="${night ? '#82938c' : '#d3cbae'}" stroke-width="2" opacity=".7"/>`;
  const homes = 6 + Math.floor(random() * 4);
  for (let i = 0; i < homes; i++) {
    const x = 1120 + i * 480 / homes;
    const width = 35 + random() * 22, height = 35 + random() * 28;
    const y = shoreY + 10 + (x - 1120) * .04;
    const warm = night || dusk || random() > .65;
    art += `<path d="M${x} ${y}v-${height}h${width}v${height}Z" fill="${night ? ['#5d6560', '#596667', '#6b6a5e'][i % 3] : ['#c6c1a7', '#b6bca8', '#d6c7aa'][i % 3]}"/>
      <path d="M${x - 5} ${y - height}l${width * .5 + 5} -18l${width * .5 + 5} 18Z" fill="${night ? '#30454b' : '#677e80'}"/>
      <path d="M${x + width * .68} ${y - height - 12}v-14h5v19" fill="${night ? '#4c5b59' : '#8b9381'}"/>`;
    for (let w = 0; w < 2; w++) art += `<rect x="${x + 6 + w * width * .48}" y="${y - height + 11}" width="7" height="11" fill="${warm ? '#edc68b' : '#688b92'}" opacity="${night ? '.85' : '.7'}"/>`;
    art += `<path d="M${x + width * .45} ${y}v-18h9v18" fill="#415d62"/>`;
    if (warm) {
      for (let r = 0; r < 10; r++) {
        const yy = shoreY + 64 + r * 10 + random() * 5;
        const xx = x + random() * 20 - r * 2;
        art += `<path d="M${xx} ${yy}h${7 + random() * (r + 5)}" stroke="#efc78c" stroke-width="1.3" opacity="${.20 - r * .014}"/>`;
      }
    }
  }
  art += `<g transform="translate(${880 + random() * 200} ${785 + random() * 70}) scale(.8)"><ellipse cy="13" rx="61" ry="6" fill="#102f3e" opacity=".25"/><path d="M-55-7h110L36 12h-68Z" fill="${night ? '#49616b' : '#b0b9ae'}" stroke="#345763" stroke-width="2"/><path d="M-2-8v-75M-2-74l-26 51h25Z" stroke="${night ? '#8b9b99' : '#e0ddc6'}" fill="${night ? '#6b8188' : '#d3d7c5'}" stroke-width="1"/><path d="M-9-8v-10h20v10" fill="#3e5b65"/></g>`;
  // Sparse foreground grass on a dark bluff anchors the wide, still sea.
  art += `<path d="M0 950q170-52 319 50H0Z" fill="${night ? '#0e2632' : '#456e65'}"/>`;
  for (let i = 0; i < 45; i++) {
    const x = random() * 270, y = 975 + random() * 35, height = 18 + random() * 57;
    art += `<path d="M${x} ${y}q-2 ${-height * .7} ${8 + random() * 15} ${-height}" fill="none" stroke="${night ? '#35534f' : '#7c9c76'}" stroke-width="1" opacity=".65"/>`;
  }
  art += `</g><rect width="1600" height="1000" fill="url(#${id}-paper)"/><rect width="1600" height="1000" fill="url(#${id}-vignette)"/>`;
  return art;
}
