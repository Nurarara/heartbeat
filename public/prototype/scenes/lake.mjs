/** Original layered watercolor and ink study; all geometry is local and seeded. */
export function renderLake({ seed = 1, hour = 13, temperature = 20, festive = false, phase = '', season = 'summer' } = {}) {
  const n = Number(seed) >>> 0 || 1, id = `lake-${n}`;
  let state = n;
  const random = () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const h = Number(hour) || 0;
  const night = phase === 'night' || (!phase && (h < 6 || h >= 21));
  const dawn = ['dawn', 'sunrise', 'morning'].includes(phase) || (!phase && h >= 6 && h < 10);
  const dusk = ['dusk', 'sunset', 'evening'].includes(phase) || (!night && !phase && h >= 17);
  const autumn = season === 'autumn', winter = season === 'winter';
  const sky = night ? ['#152635', '#4c6066', '#829085'] : dawn || dusk ? ['#c6c8bc', '#e8d6bd', '#f0e2c6'] : ['#b5cbd0', '#dce2d2', '#eee9d2'];
  const ridge = night ? ['#62767a', '#4a6266', '#354e51'] : autumn ? ['#a5aea1', '#8d9a88', '#7b8870'] : winter ? ['#a6b5b1', '#8d9e9a', '#738c85'] : ['#a4b9af', '#7f9e92', '#668b7b'];
  const shore = night ? '#344a43' : autumn ? '#9f966d' : winter ? '#8b9680' : '#869b6b';
  const center = 590 + random() * 380;
  const boatX = 660 + random() * 430, boatY = 733 + random() * 56;
  const jetty = random() > .48;
  let art = `<defs>
    <linearGradient id="${id}-sky" x2="0" y2="1"><stop stop-color="${sky[0]}"/><stop offset=".7" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
    <linearGradient id="${id}-water" x2="0" y2="1"><stop stop-color="${night ? '#617981' : '#c4d4cd'}"/><stop offset=".45" stop-color="${night ? '#3e5d68' : '#a8c2bc'}"/><stop offset="1" stop-color="${night ? '#203c49' : '#779e9d'}"/></linearGradient>
    <radialGradient id="${id}-wash"><stop stop-color="${dusk ? '#efcaac' : '#f6e8bf'}" stop-opacity="${night ? '.03' : '.48'}"/><stop offset="1" stop-color="#eee6c8" stop-opacity="0"/></radialGradient>
    <pattern id="${id}-paper" width="37" height="31" patternUnits="userSpaceOnUse"><path d="M3 4h3M17 19l5-1M27 9h2M8 27h3" stroke="#fff8de" stroke-width=".8" opacity=".16"/><path d="M12 8h2M29 25h3" stroke="#465c59" stroke-width=".4" opacity=".12"/></pattern>
    <filter id="${id}-soft"><feGaussianBlur stdDeviation="18"/></filter>
  </defs><rect width="1600" height="1000" fill="url(#${id}-sky)"/>
  <ellipse cx="${center}" cy="353" rx="610" ry="340" fill="url(#${id}-wash)"/>`;
  for (let i = 0; i < 6; i++) {
    const x = -100 + i * 320 + random() * 70, y = 165 + random() * 165;
    art += `<path d="M${x} ${y}q130-29 310-4t230 8q-245 26-540-4Z" fill="${night ? '#b3b9ae' : '#faf2db'}" opacity="${night ? '.035' : '.24'}"/>`;
  }
  const mountains = [];
  for (let i = 0; i < 3; i++) {
    const y = 450 + i * 45, peak = 90 + random() * 110;
    const path = `M-80 ${y + 88}Q180 ${y - peak} 460 ${y + 20}Q${center} ${y - peak * .8} 1110 ${y + 12}T1680 ${y + 53}V680H-80Z`;
    mountains.push(path);
    art += `<path d="${path}" fill="${ridge[i]}" opacity="${.5 + i * .2}"/>`;
    art += `<path d="M-80 ${y + 88}Q180 ${y - peak} 460 ${y + 20}Q${center} ${y - peak * .8} 1110 ${y + 12}T1680 ${y + 53}" fill="none" stroke="${night ? '#a1aaa0' : '#617a72'}" stroke-width="1" opacity=".26"/>`;
  }
  art += `<path d="M0 589Q430 556 810 591T1600 588V1000H0Z" fill="url(#${id}-water)"/>
    <g transform="translate(0 1179) scale(1 -.74)" opacity=".11" filter="url(#${id}-soft)">${mountains.map((d, i) => `<path d="${d}" fill="${ridge[i]}"/>`).join('')}</g>
    <ellipse cx="${center}" cy="667" rx="370" ry="73" fill="url(#${id}-wash)" opacity=".6"/>`;
  for (let i = 0; i < 190; i++) {
    const y = 590 + random() ** .8 * 410, d = (y - 570) / 430;
    const x = random() * 1600, w = 10 + random() * (15 + d * 130);
    art += `<path d="M${x} ${y}q${w * .5} ${random() * 2} ${w} 0" stroke="${i % 3 ? '#e7e6cd' : '#365e63'}" stroke-width="${.5 + d * .5}" opacity="${night ? '.1' : '.19'}" fill="none"/>`;
  }
  // A low island and its slender, hand-drawn trees.
  const island = 1130 + random() * 130;
  art += `<path d="M${island - 180} 606q180-27 360 0q-180 6-360 0Z" fill="${ridge[2]}"/>`;
  for (let i = 0; i < 24; i++) {
    const x = island - 150 + i * 12 + random() * 10, y = 600 + random() * 4, height = 14 + random() * 30;
    art += `<path d="M${x} ${y}v-${height}" stroke="${ridge[2]}" stroke-width="1.8"/><path d="M${x} ${y - height}l-${height * .25} ${height * .7}h${height * .5}Z" fill="${ridge[2]}"/>`;
  }
  art += `<path d="M0 784q130-49 267-3q-122 56-267 64Z M1600 886q-149-34-236 28l-106 86h342Z" fill="${shore}"/>
    <path d="M0 813q147-25 251-31M1375 914q109-42 225-14" stroke="${night ? '#b0b6a1' : '#e8dbad'}" stroke-width="2" fill="none" opacity=".45"/>`;
  if (jetty) {
    art += `<path d="M0 980L${boatX - 80} ${boatY - 11}l95 14L148 1000Z" fill="${night ? '#4c5049' : '#9f9272'}" stroke="${night ? '#344442' : '#716e58'}" stroke-width="2"/>`;
    for (let i = 0; i < 15; i++) {
      const t = i / 15, x = (boatX - 80) * t, y = 980 + (boatY - 11 - 980) * t;
      art += `<path d="M${x} ${y}l${145 - 50 * t} ${20 - 6 * t}" stroke="#4d5d55" stroke-width="${1.7 - t}" opacity=".5"/>`;
    }
    art += `<path d="M${boatX - 71} ${boatY - 4}v48M${boatX + 8} ${boatY + 9}v42" stroke="#5e695b" stroke-width="6"/>`;
  }
  art += `<g transform="translate(${boatX + (jetty ? 146 : 0)} ${boatY}) rotate(${random() * 12 - 6})"><ellipse cy="15" rx="68" ry="10" fill="#355c60" opacity=".16"/><path d="M-65-6Q-4-22 63-5L43 15Q-1 27-48 11Z" fill="${night ? '#8d8b70' : '#c0a47c'}" stroke="${night ? '#3d5557' : '#6c7564'}" stroke-width="1.5"/><path d="M-55-7q56-12 108 1l-16 9q-43 8-83-4Z" fill="${night ? '#3f5655' : '#7c8d78'}"/><path d="M-21-8l-3 15M18-9l-3 16" stroke="#baa681" stroke-width="5"/><path d="M-10-20L34 26m0 0 13 9" stroke="#686f5c" stroke-width="2"/></g>`;
  // Reeds, fine stems, and foreground pencil marks frame the open water.
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < 58; i++) {
      const x = side ? 1410 + random() * 230 : -40 + random() * 180;
      const y = 900 + random() * 130, height = 70 + random() * 180;
      const bend = (random() - .5) * 90;
      art += `<path d="M${x} ${y}q${bend * .6} ${-height * .55} ${bend} ${-height}" fill="none" stroke="${night ? '#42615b' : autumn || winter ? '#7b805c' : '#547d60'}" stroke-width="${.7 + random() * 1.3}" opacity=".8"/>`;
      if (i % 3 === 0) art += `<path d="M${x + bend} ${y - height}l${bend * .07} -17" stroke="${night ? '#696e58' : '#9a8c62'}" stroke-width="3" stroke-linecap="round"/>`;
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = center - 220 + random() * 400, y = 270 + random() * 100;
    art += `<path d="M${x} ${y}q7-5 13 0q6-6 13-1" stroke="${night ? '#abb5a7' : '#7b918b'}" fill="none" stroke-width="1" opacity=".5"/>`;
  }
  art += `<rect width="1600" height="1000" fill="url(#${id}-paper)"/>${night ? '<rect width="1600" height="1000" fill="#10263a" opacity=".28"/>' : ''}`;
  return art;
}
