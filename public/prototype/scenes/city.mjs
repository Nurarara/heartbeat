// Original, locally rendered city study. Weather here is an artistic simulation.
export function renderCity({ seed = 1, hour = 19, temperature = 4, festive = true, phase = '', snowing = temperature <= 1 } = {}) {
  const key = String(seed).replace(/[^a-zA-Z0-9_-]/g, '_');
  const p = `city-${key}`;
  let state = 2166136261;
  for (const c of String(seed)) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  const random = () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
  const night = phase ? phase === 'night' || phase === 'dusk' : hour < 7 || hour >= 17;
  const late = hour >= 23 || hour < 6;
  const snow = snowing;
  const dusk = !night && (phase ? phase === 'dusk' : hour < 9 || hour >= 15);
  const sky = night ? ['#0c1427', '#233447', '#617079'] : dusk ? ['#758797', '#d2ad9a', '#edc4a0'] : ['#7cabb8', '#afc7c5', '#e2d9bc'];
  const brick = night ? ['#26323b', '#34343a', '#2f3b42', '#45403e'] : ['#6d6260', '#927564', '#7d7770', '#b49177'];
  // Each seed changes the character of the masonry as well as its lit windows.
  if (random() > .5) [brick[1], brick[3]] = [brick[3], brick[1]];
  const trim = night ? '#72736c' : '#c2b8a1';
  const glow = late ? '#dba960' : '#ffcd79';
  const lerp = (a, b, t) => a + (b - a) * t;
  const point = (q, u, v) => [lerp(lerp(q[0][0], q[1][0], u), lerp(q[3][0], q[2][0], u), v), lerp(lerp(q[0][1], q[1][1], u), lerp(q[3][1], q[2][1], u), v)];
  const coords = (q) => q.map(a => a.map(n => n.toFixed(1)).join(',')).join(' ');
  const box = (q, x, y, w, h) => [point(q, x, y), point(q, x + w, y), point(q, x + w, y + h), point(q, x, y + h)];
  const poly = (q, fill, rest = '') => `<polygon points="${coords(q)}" fill="${fill}" ${rest}/>`;
  const line = (a, b, stroke, width = 1, rest = '') => `<path d="M${a.join(' ')}L${b.join(' ')}" fill="none" stroke="${stroke}" stroke-width="${width}" ${rest}/>`;
  let art = `<defs>
    <linearGradient id="${p}-sky" x2="0" y2="1"><stop stop-color="${sky[0]}"/><stop offset=".64" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
    <linearGradient id="${p}-road" x2=".25" y2="1"><stop stop-color="${night ? '#48535b' : '#9b9b91'}"/><stop offset=".4" stop-color="${night ? '#273542' : '#6d7d80'}"/><stop offset="1" stop-color="${night ? '#0c1b2a' : '#334e5b'}"/></linearGradient>
    <linearGradient id="${p}-glass" x2=".4" y2="1"><stop stop-color="#ffc478"/><stop offset=".55" stop-color="#f1b76d"/><stop offset="1" stop-color="#9e603c"/></linearGradient>
    <linearGradient id="${p}-reflect" x2="0" y2="1"><stop stop-color="#f7c37a" stop-opacity=".52"/><stop offset="1" stop-color="#d0a573" stop-opacity="0"/></linearGradient>
    <radialGradient id="${p}-halo"><stop stop-color="#ffce83" stop-opacity=".42"/><stop offset=".28" stop-color="#ffbb65" stop-opacity=".15"/><stop offset="1" stop-color="#ffbd6c" stop-opacity="0"/></radialGradient>
    <radialGradient id="${p}-vignette"><stop offset=".4" stop-color="#061020" stop-opacity="0"/><stop offset="1" stop-color="#061020" stop-opacity="${night ? '.48' : '.2'}"/></radialGradient>
    <pattern id="${p}-grain" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M1 1h1M5 4h1M2 6h1" stroke="#e5d8b5" stroke-width=".5" opacity=".1"/></pattern>
  </defs>
  <rect width="1600" height="1000" fill="url(#${p}-sky)"/>
  <path d="M0 370Q380 260 730 345T1600 280V560H0Z" fill="${night ? '#53616d' : '#e8dac3'}" opacity=".13"/>
  <path d="M130 190Q370 143 560 211T1040 173T1530 128" fill="none" stroke="${night ? '#8a9199' : '#fff2db'}" stroke-width="25" opacity=".055"/>`;

  // Small skyline beyond the bend in the street.
  for (let i = 0; i < 14; i++) {
    const x = 570 + i * 39;
    const h = 66 + random() * 88;
    art += `<path d="M${x} 562V${490 - h}l18 -18 20 18V562Z" fill="${night ? '#273c49' : '#7c9392'}"/>`;
    for (let j = 0; j < 4; j++) art += `<rect x="${x + 8}" y="${498 - h + j * 23}" width="6" height="10" fill="${random() > .35 ? glow : '#3c5058'}" opacity=".56"/>`;
  }
  art += `<path d="M874 505V351h8v-17h5v17h8v154" fill="${night ? '#223441' : '#6f8285'}"/>
    <circle cx="884" cy="379" r="8" fill="#c4ba9c" opacity=".7"/>
    <path d="M884 373v6l4 2" stroke="#35444b" stroke-width="1.5" fill="none"/>
    <path d="M0 564H1600V1000H0Z" fill="url(#${p}-road)"/>
    <path d="M0 1000L695 548H787L231 1000Z" fill="${night ? '#41474a' : '#8b918d'}"/>
    <path d="M1600 1000L1000 548H923L1367 1000Z" fill="${night ? '#41474a' : '#8b918d'}"/>
    <path d="M225 1000L785 548M1372 1000L924 548" fill="none" stroke="${night ? '#8b8e81' : '#c5bd9e'}" stroke-width="3" opacity=".47"/>`;

  const facades = [
    { q: [[0, 5], [390, 150], [390, 790], [0, 1005]], cols: 4, rows: 4, color: brick[0], shop: true },
    { q: [[390, 150], [592, 281], [592, 671], [390, 790]], cols: 3, rows: 4, color: brick[1], shop: true },
    { q: [[592, 281], [705, 375], [705, 604], [592, 671]], cols: 2, rows: 3, color: brick[2], shop: true },
    { q: [[705, 375], [768, 431], [768, 564], [705, 604]], cols: 2, rows: 3, color: brick[1], shop: false },
    { q: [[1206, 155], [1600, 12], [1600, 1000], [1206, 791]], cols: 4, rows: 4, color: brick[1], shop: true },
    { q: [[1012, 280], [1206, 155], [1206, 791], [1012, 674]], cols: 3, rows: 4, color: brick[0], shop: true },
    { q: [[912, 383], [1012, 280], [1012, 674], [912, 606]], cols: 2, rows: 3, color: brick[3], shop: true },
    { q: [[866, 441], [912, 383], [912, 606], [866, 566]], cols: 1, rows: 3, color: brick[2], shop: false },
  ];
  for (const [index, f] of facades.entries()) {
    const q = f.q;
    art += poly(q, f.color);
    // Brickwork follows each facade's perspective instead of an overlaid flat texture.
    const courses = index < 2 || index === 4 || index === 5 ? 48 : 28;
    for (let r = 1; r < courses; r++) {
      const v = r / courses;
      art += line(point(q, 0, v), point(q, 1, v), '#c8aa8b', .8, 'opacity=".12"');
      for (let c = 0; c < 9; c++) {
        const u = (c + (r % 2) * .5) / 9;
        art += line(point(q, u, v), point(q, u, v + 1 / courses), '#c8aa8b', .6, 'opacity=".12"');
      }
    }
    for (const v of [.018, .043, .71, .735]) art += line(point(q, 0, v), point(q, 1, v), trim, v === .043 ? 6 : 2, 'opacity=".65"');
    art += line(q[0], q[3], '#101e29', 4, 'opacity=".85"');
    for (let r = 0; r < f.rows; r++) {
      for (let c = 0; c < f.cols; c++) {
        const u = .07 + c * .89 / f.cols;
        const v = .10 + r * .59 / f.rows;
        const w = .60 / f.cols;
        const h = .40 / f.rows;
        const lit = random() > (late ? .68 : night ? .28 : .79);
        art += poly(box(q, u - .01, v - .008, w + .02, h + .018), trim, 'opacity=".7"');
        art += poly(box(q, u, v, w, h), lit ? `url(#${p}-glass)` : night ? '#101e2a' : '#405b65');
        if (lit) {
          art += poly(box(q, u + w * .06, v, w * .2, h), '#e8c19b', 'opacity=".3"');
          art += poly(box(q, u + w * .76, v, w * .18, h), '#633d32', 'opacity=".35"');
        }
        art += line(point(q, u + w * .5, v), point(q, u + w * .5, v + h), '#2b3539', 2);
        art += line(point(q, u, v + h * .53), point(q, u + w, v + h * .53), '#2b3539', 2);
        art += line(point(q, u - .025, v + h + .012), point(q, u + w + .025, v + h + .012), trim, 3);
      }
    }
    if (f.shop) {
      art += poly(box(q, .035, .765, .93, .225), '#17292f');
      const panels = f.cols + 1;
      for (let c = 0; c < panels; c++) {
        const u = .058 + c * .9 / panels;
        const w = .76 / panels;
        art += poly(box(q, u, .79, w, .177), `url(#${p}-glass)`, `opacity="${late ? '.62' : '.95'}"`);
        art += poly(box(q, u, .918, w, .049), '#4d352c', 'opacity=".4"');
        art += line(point(q, u + w * .5, .79), point(q, u + w * .5, .967), '#39413b', 2);
        // A few quiet shelves and merchandise silhouettes.
        for (let s = 0; s < 3; s++) {
          const su = u + w * (.16 + s * .25);
          art += poly(box(q, su, .89 - random() * .025, w * .13, .03), '#534536', 'opacity=".65"');
        }
      }
      art += poly(box(q, .018, .746, .965, .035), index % 2 ? '#2e4948' : '#683c35');
      art += line(point(q, .018, .78), point(q, .983, .78), '#b99364', 2);
      if (festive) {
        for (let c = 0; c < 12; c++) {
          const a = point(q, .04 + c * .083, .752 + Math.sin(c / 11 * Math.PI) * .012);
          art += `<circle cx="${a[0]}" cy="${a[1]}" r="${index === 0 || index === 4 ? 2.5 : 1.7}" fill="${glow}"/>`;
        }
      }
    }
    // Slate roof lip and narrow chimney stacks.
    art += line(q[0], q[1], '#121f2a', 9);
    for (let c = 0; c < (index < 2 || index === 4 ? 3 : 1); c++) {
      const a = point(q, .18 + c * .29, 0);
      art += `<path d="M${a[0]} ${a[1]}v-27h18v27" fill="${f.color}" stroke="#182631" stroke-width="2"/><path d="M${a[0] - 2} ${a[1] - 27}h22" stroke="${trim}" stroke-width="3"/>`;
    }
  }

  // Long light streaks in damp stone, drawn as broken slivers.
  for (let i = 0; i < 110; i++) {
    const y = 578 + random() ** .65 * 422;
    const depth = (y - 548) / 452;
    const side = random() > .5;
    const x = side ? 870 + depth * 350 + random() * depth * 130 : 790 - depth * 370 - random() * depth * 130;
    const width = 6 + depth * 64 * random();
    art += `<path d="M${x} ${y}h${width}" stroke="${i % 4 ? '#e1ad69' : '#9daeb1'}" stroke-width="${.6 + depth * 2.5}" opacity="${.06 + random() * .2}"/>`;
  }
  for (let i = 0; i < 14; i++) {
    const d = (i / 14) ** 2;
    const y = 555 + d * 445;
    art += `<path d="M${785 - d * 550} ${y}Q820 ${y + d * 18} ${925 + d * 460} ${y}" fill="none" stroke="#adb0a1" stroke-width="${.4 + d}" opacity=".10"/>`;
  }
  for (let i = 0; i < 9; i++) art += line([805 + i * 10, 552], [220 + i * 150, 1000], '#071724', 1, 'opacity=".17"');
  art += `<path d="M475 857q120 -28 174 -10l-49 26 -198 26Z M1040 799q110 -12 141 4l-10 13 -110 1Z M670 969q150 -21 230 -6l-31 18 -207 6Z" fill="${night ? '#809293' : '#bad1cb'}" opacity=".1"/>`;

  function lamp(x, y, scale) {
    return `<g transform="translate(${x} ${y}) scale(${scale})">
      <ellipse cy="43" rx="25" ry="5" fill="#071722" opacity=".6"/>
      <path d="M-11 42h22l-5 -12H-6Z M-3 32V-195h6V32Z" fill="#16282e" stroke="#788079" stroke-width=".6"/>
      <path d="M-3 -181q-18 -3 -18 -21h42q0 18 -18 21" fill="#1d3035"/>
      <ellipse cy="-228" rx="76" ry="90" fill="url(#${p}-halo)"/>
      <path d="M-21 -204l5 -46h32l5 46Z" fill="${glow}" opacity="${late ? '.8' : '1'}"/>
      <path d="M-24 -252l24 -19 24 19Z M-23 -203h46v5h-46Z" fill="#203039"/>
      <path d="M-16 -249l4 44M16 -249l-4 44M0 -250v45" stroke="#364039" stroke-width="3"/>
      <circle cy="-274" r="3" fill="#627167"/>
    </g>`;
  }
  art += lamp(1074, 744, .68) + lamp(658, 651, .40) + lamp(929, 590, .21) + lamp(275, 917, 1.18);
  art += `<path d="M272 938l-39 62h76l-30 -62Z" fill="url(#${p}-reflect)" opacity=".4"/>
    <path d="M1075 774l-24 120h55l-25 -120Z" fill="url(#${p}-reflect)" opacity=".35"/>`;

  if (festive) {
    // Hanging canopy has its own depth rhythm, with individual warm bulbs.
    const strings = [[115, 172, 1500, 185, 257], [359, 306, 1273, 304, 358], [559, 407, 1080, 406, 440], [683, 467, 970, 466, 485]];
    for (let i = 0; i < strings.length; i++) {
      const [x1, y1, x2, y2, middle] = strings[i];
      const cy = 2 * middle - (y1 + y2) / 2;
      art += `<path d="M${x1} ${y1}Q${(x1 + x2) / 2} ${cy} ${x2} ${y2}" fill="none" stroke="#273535" stroke-width="${2 - i * .35}"/>`;
      const count = 40 - i * 8;
      for (let n = 0; n <= count; n++) {
        const t = n / count;
        const x = lerp(x1, x2, t);
        const y = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2;
        const r = 3.2 - i * .55;
        art += `<path d="M${x} ${y}v${5 - i}" stroke="#4b493e" stroke-width="1"/><circle cx="${x}" cy="${y + 5 - i}" r="${r * 3}" fill="${glow}" opacity=".07"/><circle cx="${x}" cy="${y + 5 - i}" r="${r}" fill="${n % 7 === 0 ? '#f3dfb2' : glow}"/>`;
      }
      if (i < 3) {
        const x = (x1 + x2) / 2;
        const y = middle + 14;
        const s = 1 - i * .23;
        art += `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -19L5 -6 19 -6 8 3 12 17 0 9 -12 17 -8 3 -19 -6 -5 -6Z" fill="none" stroke="${glow}" stroke-width="2" opacity=".9"/></g>`;
      }
    }
    // Street-side evergreen, with layered branches rather than a flat triangle.
    art += `<g transform="translate(${1156 + random() * 44} 753)"><ellipse cy="11" rx="63" ry="14" fill="#0a1b25" opacity=".7"/><path d="M-27 -13h54l-6 35h-42Z" fill="#6c4b35"/><path d="M-2 -197h7V0h-7Z" fill="#514337"/>`;
    for (let b = 0; b < 7; b++) {
      const y = -190 + b * 25;
      const w = 13 + b * 8;
      art += `<path d="M0 ${y - 24}q${w * .4} 24 ${w} 38l${-w * .28} -3 10 10q${-w * .7} -2 ${-w * .73} -7q${-w * .1} 6 ${-w * .85} 7l10 -10 -${w * .28} 3Q-${w * .4} ${y} 0 ${y - 24}Z" fill="${b % 2 ? '#23413d' : '#1b3634'}" stroke="#37534a" stroke-width="1"/>`;
      for (let n = 0; n < 4 + b; n++) {
        const x = (random() - .5) * w * 1.5;
        art += `<circle cx="${x}" cy="${y + 13 + random() * 20}" r="${1.3 + random()}" fill="${random() > .3 ? glow : '#bc6553'}"/>`;
      }
    }
    art += `<path d="M0 -224l3 7 8 1 -6 5 2 8 -7 -4 -7 4 2 -8 -6 -5 8 -1Z" fill="#f3d08b"/></g>`;
  }

  // An unhurried couple and a bicycle give scale without making the scene busy.
  art += `<g fill="#172832"><ellipse cx="845" cy="628" rx="15" ry="3" opacity=".5"/><circle cx="840" cy="588" r="4"/><path d="M836 593h8l4 21 -6 1 -1 12h-3l-1 -12 -5 -1Z"/><circle cx="854" cy="591" r="3.5"/><path d="M851 596h7l5 21h-6v12h-3l-2 -13 -5 -1Z"/><path d="M844 601l6 5" stroke="#172832" stroke-width="3"/></g>
  <g transform="translate(485 766) scale(.64)" fill="none" stroke="#18282e" stroke-width="3"><circle cx="-35" cy="0" r="25"/><circle cx="39" cy="0" r="25"/><path d="M-35 0l24 -39 22 39h-46l14 -27h49L39 0M-11 -39h-10m24 0h14l10 -12h10"/><path d="M5 -42V-58h-14"/></g>`;

  // Snow is a deliberately simulated response to the temperature control.
  if (snow) {
    for (let i = 0; i < 170; i++) {
      const x = random() * 1600;
      const y = random() * 1000;
      const r = .6 + random() ** 3 * 2.3;
      art += `<circle cx="${x}" cy="${y}" r="${r}" fill="#eeeade" opacity="${.22 + random() * .46}"/>`;
    }
    art += `<path d="M2 16L387 159M1210 165L1599 22M399 160L590 289" stroke="#dbded4" stroke-width="4" opacity=".48"/>`;
  } else if (night) {
    for (let i = 0; i < 15; i++) {
      const x = 470 + random() * 650;
      const y = 25 + random() * 150;
      art += `<circle cx="${x}" cy="${y}" r="${.5 + random() * .6}" fill="#d6dccf" opacity="${.1 + random() * .35}"/>`;
    }
  }
  art += `<rect width="1600" height="1000" fill="url(#${p}-grain)" opacity=".55"/><rect width="1600" height="1000" fill="url(#${p}-vignette)"/>`;
  return art;
}
