/** Original procedural SVG artwork. No external assets or runtime model calls. */
export function renderCosmos({ seed = 1, temperature = 9 } = {}) {
  const id = `cosmos-${seed}`;
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const cold = temperature < 12;
  const stars = Array.from({ length: 420 }, (_, i) => {
    const x = random() * 1600, y = random() * 890, r = .35 + random() ** 4 * 1.9;
    const opacity = .16 + random() * .6;
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${i % 7 ? '#c7d9e9' : '#ddbd95'}" opacity="${opacity.toFixed(2)}"/>`;
  }).join('');
  const clusters = Array.from({ length: 540 }, () => {
    const t = random() * Math.PI * 2, distance = Math.sqrt(random());
    const x = 770 + Math.cos(t) * distance * 600, y = 410 + Math.sin(t) * distance * 77;
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(.3 + random() * .9).toFixed(2)}" fill="#e4d5c3" opacity="${(.08 + random() * .4).toFixed(2)}"/>`;
  }).join('');
  const angle = -24 + random() * 12;
  const planetX = 1140 + random() * 100;
  return `<defs>
    <linearGradient id="${id}-sky" x2=".3" y2="1"><stop stop-color="#030912"/><stop offset=".58" stop-color="#0d1727"/><stop offset="1" stop-color="#172b36"/></linearGradient>
    <radialGradient id="${id}-aura"><stop stop-color="${cold ? '#516075' : '#706456'}" stop-opacity=".34"/><stop offset=".5" stop-color="#38465f" stop-opacity=".16"/><stop offset="1" stop-color="#172338" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-core"><stop stop-color="#e8ce9f" stop-opacity=".65"/><stop offset=".18" stop-color="#b5a78b" stop-opacity=".35"/><stop offset=".58" stop-color="#727183" stop-opacity=".13"/><stop offset="1" stop-color="#41506c" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-planet" cx=".22" cy=".12" r=".95"><stop stop-color="#6e8c94"/><stop offset=".24" stop-color="#364956"/><stop offset=".55" stop-color="#152330"/><stop offset="1" stop-color="#070e18"/></radialGradient>
    <radialGradient id="${id}-vignette"><stop offset=".35" stop-color="#020710" stop-opacity="0"/><stop offset="1" stop-color="#020710" stop-opacity=".65"/></radialGradient>
    <filter id="${id}-soft"><feGaussianBlur stdDeviation="24"/></filter>
    <filter id="${id}-glow"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="${id}-grain"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".055"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter>
    <clipPath id="${id}-disc"><circle cx="${planetX}" cy="704" r="119"/></clipPath>
  </defs>
  <rect width="1600" height="1000" fill="url(#${id}-sky)"/>
  <ellipse cx="790" cy="360" rx="850" ry="590" fill="url(#${id}-aura)"/>
  <g>${stars}</g>
  <g transform="rotate(${angle} 770 410)">
    <ellipse cx="770" cy="410" rx="740" ry="152" fill="url(#${id}-aura)"/>
    <path d="M80 415 Q650 180 1390 440 Q810 295 150 486" fill="none" stroke="#5a637c" stroke-width="53" opacity=".2" filter="url(#${id}-soft)"/>
    <path d="M157 438 Q713 247 1355 425" fill="none" stroke="#b4a28c" stroke-width="22" opacity=".13" filter="url(#${id}-soft)"/>
    <ellipse cx="770" cy="410" rx="590" ry="120" fill="url(#${id}-core)"/>
    <ellipse cx="770" cy="410" rx="270" ry="77" fill="url(#${id}-core)"/>
    <g>${clusters}</g>
    <path d="M204 441 Q715 349 1308 419" fill="none" stroke="#09121e" stroke-width="9" opacity=".3"/>
    <path d="M272 451 Q760 367 1213 428" fill="none" stroke="#121c2a" stroke-width="5" opacity=".4"/>
    <path d="M371 385 Q750 309 1170 402" fill="none" stroke="#72808f" stroke-width="2" opacity=".16"/>
  </g>
  <g opacity=".75"><circle cx="398" cy="230" r="9" fill="#9db7cb" opacity=".14" filter="url(#${id}-glow)"/><path d="M398 223v14m-7-7h14" stroke="#c4d4dc" stroke-width=".8"/><circle cx="398" cy="230" r="1.4" fill="#e1e5de"/></g>
  <g clip-path="url(#${id}-disc)"><circle cx="${planetX}" cy="704" r="119" fill="url(#${id}-planet)"/>
    <path d="M${planetX - 130} 671 Q${planetX} 611 ${planetX + 130} 676 M${planetX - 130} 696 Q${planetX} 642 ${planetX + 130} 706 M${planetX - 130} 737 Q${planetX} 679 ${planetX + 130} 740" fill="none" stroke="#89a7ac" stroke-width="8" opacity=".065"/>
  </g>
  <path d="M${planetX - 91} 627 A119 119 0 0 1 ${planetX + 61} 602" fill="none" stroke="#9db6b9" stroke-width="1.5" opacity=".5"/>
  <path d="M0 896 Q130 855 250 903 Q419 857 578 921 Q815 865 1005 925 Q1230 848 1600 906 V1000 H0Z" fill="#080f17"/>
  <path d="M0 938 Q245 902 457 965 Q745 912 1030 968 Q1331 903 1600 948 V1000 H0Z" fill="#050b12"/>
  <rect width="1600" height="1000" fill="url(#${id}-vignette)"/>
  <rect width="1600" height="1000" filter="url(#${id}-grain)" opacity=".16"/>
  `;
}
