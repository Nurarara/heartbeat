/** Original, locally rendered artwork. Coordinates assume a 1600 × 1000 viewBox. */
export function renderRoom({ seed = 1, hour = 13, temperature = 24, festive = false, phase = '' } = {}) {
  const n = Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 1;
  const id = `room-${String(n).replace('-', 'm')}`;
  let state = n >>> 0;
  const random = () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const h = ((Number(hour) || 0) % 24 + 24) % 24;
  const night = phase ? phase === 'night' : h < 6 || h >= 20;
  const evening = !night && (phase ? phase === 'dusk' : h >= 17 || h < 8);
  const hot = Number(temperature) >= 22;
  const hue = Math.floor(random() * 18);
  const sky = night ? ['#121b38', '#3b5471', '#79878d'] : evening ? ['#707eaa', '#edb5a0', '#ffe2ae'] : ['#439ec3', '#91d5e7', '#d8f1e7'];
  const wood = night ? '#343337' : '#584336';
  const trim = night ? '#48474a' : '#785b42';
  const light = night ? '#9fbac8' : evening ? '#ffcc96' : '#fff5c7';
  const blanket = night ? '#7b909b' : hot ? `hsl(${180 + hue} 22% 70%)` : `hsl(${30 + hue} 31% 65%)`;
  const clouds = Array.from({ length: 7 }, (_, i) => {
    const x = 80 + i * 155 + random() * 70, y = 98 + random() * 205, s = 0.6 + random() * 0.8;
    return `<g transform="translate(${x} ${y}) scale(${s})" opacity="${night ? '.12' : '.72'}" fill="${night ? '#b0bdcd' : '#fffbed'}"><path d="M-90 20C-75 6-58 14-49 1C-35-17-16-10-7-23C10-44 44-33 49-10C69-17 84-7 91 8C115 6 131 15 133 23C69 29-24 30-90 20Z"/><path d="M-111 32C-50 26 30 29 80 35C35 42-50 40-111 32Z" opacity=".45"/></g>`;
  }).join('');
  const stars = night ? Array.from({ length: 65 }, () => `<circle cx="${130 + random() * 1090}" cy="${40 + random() * 360}" r="${.5 + random() * 1.3}" fill="#e9eddb" opacity="${.3 + random() * .6}"/>`).join('') : '';
  const hills = Array.from({ length: 3 }, (_, i) => {
    const y = 370 + i * 48;
    return `<path d="M60 ${y + 45}Q${200 + random() * 80} ${y - 120} 440 ${y + 5}Q${630 + random() * 100} ${y - 140} 850 ${y + 3}Q1040 ${y - 125} 1330 ${y + 70}V640H60Z" fill="${night ? ['#526b7b', '#3b5d69', '#294e53'][i] : evening ? ['#9eaaa0', '#819b8a', '#668b6a'][i] : ['#86b8ae', '#6da68a', '#528c69'][i]}"/>`;
  }).join('');
  const trees = Array.from({ length: 18 }, (_, i) => {
    const x = 140 + i * 67 + random() * 30, y = 474 + random() * 65, r = 15 + random() * 23;
    return `<path d="M${x} ${y + 60}v-64" stroke="${night ? '#304441' : '#66764c'}" stroke-width="4"/><path d="M${x - r} ${y + 8}Q${x - r * 1.4} ${y - 17} ${x - 10} ${y - 24}Q${x + 6} ${y - r * 1.5} ${x + 22} ${y - 20}Q${x + r * 1.5} ${y - 14} ${x + r} ${y + 12}Q${x} ${y + 27} ${x - r} ${y + 8}" fill="${night ? '#2d4b45' : i % 3 === 0 ? '#70914b' : '#4c8055'}"/>`;
  }).join('');
  const grain = Array.from({ length: 34 }, (_, i) => `<path d="M${i * 49 - 100} 1000L${470 + i * 25} 604" stroke="${night ? '#817c69' : '#846e4b'}" opacity="${i % 3 ? '.07' : '.14'}" stroke-width="1"/>`).join('');
  const hangingLeaves = Array.from({ length: 16 }, (_, i) => {
    const x = 1120 + random() * 160, y = 225 + i * 15 + random() * 15;
    return `<ellipse cx="${x}" cy="${y}" rx="${8 + random() * 11}" ry="5" transform="rotate(${-55 + random() * 110} ${x} ${y})" fill="${i % 3 === 0 ? '#8a9b5e' : '#5c7a51'}"/>`;
  }).join('');
  const festiveLights = festive ? `<path d="M119 83Q620 190 1187 88" fill="none" stroke="#3b5041" stroke-width="6"/>${Array.from({ length: 16 }, (_, i) => {
    const x = 150 + i * 65, t = i / 15, y = 90 + Math.sin(t * Math.PI) * 52;
    return `<circle cx="${x}" cy="${y}" r="13" fill="#ffd793" opacity=".14" filter="url(#${id}-glow)"/><ellipse cx="${x}" cy="${y}" rx="3" ry="5" fill="${i % 3 ? '#ffdb90' : '#d87760'}"/>`;
  }).join('')}` : '';

  return `<defs>
    <linearGradient id="${id}-sky" x2="0" y2="1"><stop stop-color="${sky[0]}"/><stop offset=".68" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
    <linearGradient id="${id}-wall" x1="0" x2="1" y2=".5"><stop stop-color="${night ? '#6d706a' : '#d2c9a7'}"/><stop offset=".6" stop-color="${night ? '#626664' : '#dfd7b9'}"/><stop offset="1" stop-color="${night ? '#3e4449' : '#aaa78c'}"/></linearGradient>
    <linearGradient id="${id}-floor" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="${night ? '#777c6b' : '#bdba88'}"/><stop offset="1" stop-color="${night ? '#454d48' : '#929574'}"/></linearGradient>
    <linearGradient id="${id}-futon" x2=".2" y2="1"><stop stop-color="${night ? '#a2aaa4' : '#e5dfc6'}"/><stop offset="1" stop-color="${night ? '#677c7b' : '#b4b5a0'}"/></linearGradient>
    <linearGradient id="${id}-blanket" x1=".1" y1="0" x2=".8" y2="1"><stop stop-color="${blanket}"/><stop offset="1" stop-color="${night ? '#475d6b' : hot ? '#658a8c' : '#987955'}"/></linearGradient>
    <radialGradient id="${id}-sunwash" cx=".4" cy=".2" r=".9"><stop stop-color="${light}" stop-opacity="${night ? '.06' : '.17'}"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}-glass" x2="1" y2="1"><stop stop-color="#e2ffff" stop-opacity=".45"/><stop offset=".5" stop-color="#c1e7de" stop-opacity=".04"/><stop offset="1" stop-color="#b4ebec" stop-opacity=".22"/></linearGradient>
    <pattern id="${id}-tatami" width="9" height="5" patternUnits="userSpaceOnUse"><path d="M0 1h9M0 4h9" stroke="#ece3ad" opacity=".13" stroke-width=".7"/><path d="M2 0v5M7 0v5" stroke="#3e503f" opacity=".055" stroke-width=".7"/></pattern>
    <pattern id="${id}-paper" width="32" height="26" patternUnits="userSpaceOnUse"><path d="M4 5l7 1M19 19l8-1M2 23l4-2M23 7l3 1" stroke="#615e45" opacity=".07" stroke-width=".7"/></pattern>
    <filter id="${id}-blur"><feGaussianBlur stdDeviation="10"/></filter>
    <filter id="${id}-glow"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="${id}-window"><path d="M117 42H1218V587H117Z"/></clipPath>
  </defs>
  <path fill="url(#${id}-wall)" d="M0 0H1600V1000H0Z"/>
  <path fill="url(#${id}-paper)" d="M0 0H1600V650H0Z"/>
  <g clip-path="url(#${id}-window)">
    <path fill="url(#${id}-sky)" d="M100 35H1240V620H100Z"/>
    ${stars}
    ${night ? `<circle cx="${710 + random() * 280}" cy="141" r="28" fill="#e4e7cb"/><circle cx="${720 + random() * 5}" cy="131" r="29" fill="${sky[0]}" opacity=".16"/>` : evening ? '<circle cx="395" cy="279" r="47" fill="#ffe2a8" opacity=".75"/>' : '<circle cx="881" cy="114" r="67" fill="#fff7cf" opacity=".1"/>'}
    ${clouds}${hills}
    <path d="M100 539Q398 507 660 550T1240 540V620H100Z" fill="${night ? '#527062' : '#96aa67'}"/>
    <path d="M175 564Q500 511 735 564T1240 565" fill="none" stroke="${night ? '#7a8e7b' : '#c7c38a'}" stroke-width="9"/>
    <g opacity=".8">${trees}</g>
    <g transform="translate(${410 + Math.round(random() * 100)} 454)"><path d="M0 65V9h110v56Z" fill="${night ? '#677b78' : '#e1d6b2'}"/><path d="M-14 12L51-25L125 12Z" fill="${night ? '#3e5056' : '#627b7c'}"/><path d="M-14 12L51-20L125 12" stroke="${night ? '#6a7b7e' : '#94a3a0'}" stroke-width="3" fill="none"/><path d="M13 29h20v26H13ZM57 27h37v19H57Z" fill="${night ? '#d8bd7e' : '#597d7a'}"/><path d="M0 57h110M53 15v50" stroke="#83917c" stroke-width="2"/></g>
    <g fill="${night ? '#c9d1cc' : '#45676a'}" opacity=".6"><path d="M675 251q8-9 17 0q8-8 16-1q-9-4-16 4q-8-7-17-3Z"/><path d="M716 238q6-7 12 0q6-6 12-1q-6-2-12 4q-5-6-12-3Z"/></g>
    <path d="M1162 591Q1154 501 1193 418Q1197 368 1180 329M1187 445l-55-45M1191 466l58-57" fill="none" stroke="#6f6950" stroke-width="7"/>
    ${hangingLeaves}
  </g>
  <!-- The room's deep timber frame and its open, folded shoji. -->
  <path d="M80 0h1179v44H80Z" fill="${wood}"/>
  <path d="M87 39h1166v13H87Z" fill="${trim}"/>
  <path d="M83 0h35v617H83ZM1217 0h39v640h-39Z" fill="${wood}"/>
  <path d="M117 572h1100v29H117Z" fill="#453f34"/>
  <path d="M91 594h1162l26 29H68Z" fill="${trim}"/>
  <path d="M113 601h1100" fill="none" stroke="${night ? '#8a8b7b' : '#d2ba88'}" stroke-width="3"/>
  <path d="M-10 19L165 63V565L-10 613Z" fill="${night ? '#92958b' : '#e4e1c5'}"/>
  <path d="M-10 19L165 63V565L-10 613Z" fill="url(#${id}-paper)"/>
  <g fill="none" stroke="${trim}"><path d="M-10 19L165 63V565L-10 613" stroke-width="13"/><path d="M40 33v566M102 47v535M-10 119l175 31M-10 222l175 17M-10 325l175 3M-10 429l175-10M-10 532l175-23" stroke-width="5"/></g>
  <path d="M1118 60l99-17v540l-99-22Z" fill="url(#${id}-glass)" stroke="${trim}" stroke-width="11"/>
  <path d="M1162 54v518M1118 232l99-5M1118 394l99 5" stroke="${trim}" stroke-width="4"/>
  <path d="M1129 71l29-4v480l-29-7Z" fill="#e6ffff" opacity=".08"/>
  <path d="M1257 0h16v638h-16Z" fill="${night ? '#8c8670' : '#d3c6a5'}"/>
  <path d="M1552 0h48v706h-48Z" fill="${wood}"/>
  <path d="M1272 26h281v12h-281Z" fill="${trim}" opacity=".7"/>
  <path d="M0 636L1280 618L1600 703V1000H0Z" fill="url(#${id}-floor)"/>
  <path d="M0 636L1280 618L1600 703V1000H0Z" fill="url(#${id}-tatami)"/>
  <g stroke="${night ? '#303f3a' : '#667454'}" fill="none"><path d="M-50 852L1379 650M365 1000L971 623M-20 674L1435 787M1200 1000L1168 621" stroke-width="13"/><path d="M-50 846L1379 644M359 1000L965 623M-20 668L1435 781M1194 1000L1162 621" stroke="${night ? '#91927b' : '#d3c796'}" stroke-width="2"/></g>
  ${grain}
  <path d="M164 603L1091 602L1441 1000H317Z" fill="${light}" opacity="${night ? '.06' : '.13'}"/>
  <path d="M164 603L171 603L549 1000H522ZM1116 603h10l353 397h-27Z" fill="#fff1b7" opacity="${night ? '0' : '.12'}"/>
  <!-- An old low cabinet, ceramics, a little indoor garden. -->
  <g transform="translate(1325 337)">
    <path d="M0 170L231 190V351L0 304Z" fill="${night ? '#484441' : '#70563f'}"/><path d="M-13 164L195 152L246 181L231 194L-13 177Z" fill="${night ? '#6d6250' : '#a18358'}"/>
    <path d="M9 185l207 19v53L9 230Zm0 59l207 26v57L9 288Z" fill="${night ? '#554c43' : '#886a4b'}" stroke="${wood}" stroke-width="3"/>
    <path d="M111 207v12m0 49v12" stroke="#b6a279" stroke-width="4"/>
    <path d="M40 310v24M206 343v18" stroke="${wood}" stroke-width="11"/>
    <path d="M98 150Q79 105 93 85h51q13 34-7 65Z" fill="${night ? '#74928a' : '#90a69c'}"/><ellipse cx="118" cy="85" rx="25" ry="6" fill="#5b7771"/>
    <path d="M116 86Q103 20 136-23M119 71Q151 8 181 18M116 60Q78 22 51 29" fill="none" stroke="#6b7750" stroke-width="3"/>
    <g fill="${night ? '#496457' : '#637b50'}"><path d="M123 40Q102 2 137-22Q151 12 123 40Z"/><path d="M139 41Q146 6 181 18Q171 44 139 41Z"/><path d="M98 48Q58 52 51 29Q86 13 98 48Z"/><path d="M112 16Q86-12 106-30Q130-7 112 16Z"/><path d="M160 19Q164-7 185-8Q189 15 160 19Z"/></g>
    <path d="M16 152v-15h52v19ZM18 132v-12h47v16Z" fill="#a79a76"/><path d="M13 136h59v4H13ZM18 116h48v5H18Z" fill="#756553"/>
    <path d="M166 161q-9-27 1-43h30q10 19 0 47Z" fill="#d5c7a2"/><path d="M195 125q24-4 18 15q-3 9-13 6" fill="none" stroke="#c6b58c" stroke-width="5"/>
  </g>
  <g opacity="${night ? '.45' : '.65'}" transform="translate(1350 92)"><path d="M0 0h133v159H0Z" fill="#b5ab87" stroke="${trim}" stroke-width="7"/><path d="M12 12h109v135H12Z" fill="#dad4b7"/><circle cx="64" cy="59" r="23" fill="#c89d73" opacity=".65"/><path d="M12 131q39-62 109-17v33H12Z" fill="#8d9a7e"/><path d="M12 138q70-42 109-8v17H12Z" fill="#647d70"/></g>
  <!-- Glass furin: the paper hangs into the breeze. -->
  <g class="gentle-sway" style="transform-origin:1014px 43px">
    <path d="M1014 43v143" stroke="${night ? '#b4b9a4' : '#d4d8bc'}" stroke-width="2"/>
    <path d="M981 232Q979 184 1014 183Q1049 185 1047 232Q1017 246 981 232Z" fill="${night ? '#a9d4da' : '#d0efdd'}" fill-opacity=".3" stroke="${night ? '#b5cbd0' : '#e6f9e5'}" stroke-opacity=".8" stroke-width="2"/>
    <path d="M987 231Q1015 223 1042 232" fill="none" stroke="#e8f9da" stroke-width="2" opacity=".8"/><path d="M992 211Q992 195 1006 191" stroke="#f1fff1" stroke-width="3" stroke-linecap="round" opacity=".75" fill="none"/>
    <path d="M1013 222v54" stroke="#bccab4" stroke-width="1.5"/><circle cx="1013" cy="228" r="4" fill="#8b9684"/>
    <path d="M1005 275L1030 272L1036 356L1011 361Z" fill="${festive ? '#b8574e' : '#c7d6af'}"/><path d="M1016 288l7 52M1014 295l11-1M1016 312l11-2M1019 327l9-1" stroke="${festive ? '#eecfa1' : '#6d8e7b'}" stroke-width="2" opacity=".65"/>
  </g>
  ${festiveLights}
  <!-- Low table, paperback and afternoon tea. -->
  <ellipse cx="389" cy="793" rx="188" ry="38" fill="#273c33" opacity=".17" filter="url(#${id}-blur)"/>
  <path d="M244 732v77l18 4v-76M501 714v68l17 3v-75" stroke="#514738" stroke-width="9"/>
  <path d="M218 711L446 661L555 709L322 763L218 729Z" fill="${night ? '#655d4b' : '#af8a57'}"/>
  <path d="M218 711L446 661L555 709L322 749Z" fill="${night ? '#84785c' : '#c29d64'}"/>
  <path d="M231 712l213-44M328 742l211-35M268 716l179-38" stroke="#e0c594" stroke-width="1" opacity=".35"/>
  <path d="M310 704l73-16l57 20l-75 19Z" fill="#e4ddba"/><path d="M310 704l52 17l3 6l-55-18Z" fill="#aaa68b"/><path d="M362 721l21-33M321 705l37 12M331 700l32 10M392 696l32 10M382 701l30 10" stroke="#958f78" stroke-width="1" opacity=".55"/>
  <ellipse cx="462" cy="709" rx="24" ry="8" fill="#857d61" opacity=".3"/><path d="M447 680q-3 20 6 24q10 6 23-2q6-7 3-24Z" fill="${night ? '#8e9e92' : '#c7d2b7'}"/><ellipse cx="463" cy="679" rx="16" ry="5" fill="#758a6b"/><ellipse cx="463" cy="678" rx="12" ry="3" fill="#a4b28a"/>
  ${!hot ? `<path d="M459 669q-9-13 0-25q7-10 0-20M469 665q8-12 1-21" stroke="#eee8d3" opacity=".2" fill="none" stroke-width="2"/>` : ''}
  <!-- A sleeping figure on a folded cotton futon. -->
  <ellipse cx="1029" cy="853" rx="339" ry="65" fill="#253e37" opacity=".22" filter="url(#${id}-blur)"/>
  <path d="M646 780Q787 725 1028 752Q1229 775 1366 865Q1371 884 1343 902Q1034 921 689 840Q651 827 646 780Z" fill="${night ? '#727e77' : '#b0b09a'}"/>
  <path d="M647 779Q775 719 1017 744Q1248 768 1366 854Q1281 891 1087 876Q841 865 654 813Q645 801 647 779Z" fill="url(#${id}-futon)"/>
  <path d="M665 806Q1021 890 1345 857" stroke="${night ? '#b2b8a3' : '#f0e7c8'}" stroke-width="3" opacity=".7" fill="none"/>
  <path d="M713 770Q765 732 845 748L934 785Q916 826 857 826L736 797Q716 788 713 770Z" fill="${night ? '#bdc2b6' : '#f1e9d2'}"/>
  <path d="M731 782Q790 755 847 767" fill="none" stroke="#b8b9a6" stroke-width="2" opacity=".4"/>
  <!-- Hair, face, loose sleeve and relaxed hand are intentionally quietly drawn. -->
  <path d="M784 761Q761 740 773 706Q788 675 829 679Q872 674 900 709L891 745L851 774Z" fill="${night ? '#30373e' : '#3a3b3c'}"/>
  <path d="M815 714Q839 696 869 712L894 735Q897 756 875 774L854 779Q827 769 815 750Z" fill="${night ? '#b9a99b' : '#e6bb98'}"/>
  <path d="M797 717Q813 685 851 693Q881 697 892 725L865 717L866 735L849 720L834 734L827 717L812 743L803 730L787 740Z" fill="${night ? '#30373e' : '#3a3b3c'}"/>
  <path d="M791 710q14-18 38-19M801 704q19-13 35-10M779 729l13-17" stroke="#66635a" fill="none" stroke-width="2" opacity=".5"/>
  <path d="M860 745q10 4 17-3" fill="none" stroke="#77685c" stroke-width="2" stroke-linecap="round"/><path d="M882 748l5 5l-5 2M865 763q6 3 12 0" fill="none" stroke="#b18470" stroke-width="1.5"/>
  <path d="M895 741L936 742L975 790L924 818L880 780Q898 761 895 741Z" fill="${night ? '#9aafa9' : '#c6d1ba'}"/>
  <path d="M910 756l26 39l-17 13M940 768l11 16" fill="none" stroke="#8eaa9c" stroke-width="2"/>
  <path d="M917 798Q896 789 870 798L825 811Q815 820 832 825L878 813L925 823Z" fill="${night ? '#b5a997' : '#e2b99a'}"/>
  <path d="M828 816l23-5M830 820l25-5M838 822l20-4" stroke="#af8a75" stroke-width="1" fill="none"/>
  <path d="M945 764Q1008 752 1088 787Q1203 803 1287 849L1264 869Q1090 887 939 844L912 819Z" fill="url(#${id}-blanket)"/>
  <path d="M944 769Q1029 763 1078 794M969 785Q1008 807 1019 842M1050 801Q1089 814 1121 855M1158 824l38 27M1257 846l-18 17" fill="none" stroke="${night ? '#b2bdb1' : hot ? '#c9d5ba' : '#ddc69f'}" stroke-width="3" opacity=".4"/>
  <path d="M938 786Q931 821 915 824Q1104 886 1278 861" fill="none" stroke="${night ? '#405860' : hot ? '#547f80' : '#8a6d4b'}" stroke-width="3" opacity=".6"/>
  <path d="M963 831Q1001 833 1030 853M1060 842l32 15M1180 854l46 6" fill="none" stroke="#eff1d8" stroke-width="1" opacity=".3"/>
  ${hot ? `<path d="M1266 839q36 3 47 17q-3 12-20 9l-32-9Z" fill="${night ? '#ab9e91' : '#d7ae8c'}"/><path d="M1301 853l7 6M1297 855l6 6" stroke="#ab846c" fill="none" stroke-width="1"/>` : ''}
  <!-- Foreground leaves give the room an intimate, observed viewpoint. -->
  <g transform="translate(60 922)">
    <path d="M0 74Q48-61 82-195M12 46Q-8-120-53-205M21 30Q105-63 171-78M7 56Q-53-25-93-37M26 7Q40-114 2-154" fill="none" stroke="#455b3e" stroke-width="5"/>
    <g fill="${night ? '#294d44' : '#426b48'}"><path d="M41-84Q12-172 82-195Q107-128 41-84Z"/><path d="M-17-105Q-89-137-53-205Q1-173-17-105Z"/><path d="M62-14Q109-117 171-78Q144-11 62-14Z"/><path d="M-19 16Q-101 31-93-37Q-45-54-19 16Z"/><path d="M21-62Q-17-113 2-154Q53-145 21-62Z"/><path d="M-12 58Q-61-7-124 25Q-104 81-12 58Z"/></g>
    <g fill="none" stroke="#b6bc7b" opacity=".22" stroke-width="2"><path d="M42-88l38-104M-16-107l-36-94M62-15l104-61M-18 16l-72-51M21-62L3-150"/></g>
    <path d="M-24 38h96L58 121H-5Z" fill="${night ? '#6d7561' : '#9b946e'}"/><ellipse cx="24" cy="39" rx="48" ry="10" fill="#58664b"/>
  </g>
  <path d="M0 0H1600V1000H0Z" fill="url(#${id}-sunwash)"/>
  <path d="M0 0H1600V1000H0Z" fill="${night ? '#152a44' : '#c5a56c'}" opacity="${night ? '.14' : '.025'}"/>
  `;
}
