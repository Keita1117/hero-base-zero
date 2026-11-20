import { MECH_COLORS } from './data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

export function createMechSvg({
  stage = 1,
  colorId = 'crimson',
  partId = 'none',
  mood = 'idle',
  size = 200,
} = {}) {
  const palette = MECH_COLORS.find((c) => c.id === colorId) || MECH_COLORS[0];
  const lv = Math.max(1, Math.min(5, Number(stage) || 1));

  const svg = el('svg', {
    viewBox: '0 0 240 240',
    width: size,
    height: size,
    class: `mech-svg mood-${mood} stage-${lv}`,
    'aria-hidden': 'true',
  });

  // 背面オーラ
  const aura = el('circle', {
    cx: 120,
    cy: 126,
    r: lv >= 4 ? 92 : 78,
    fill: palette.primary,
    'fill-opacity': mood === 'sleep' ? 0.08 : 0.16,
  });
  svg.appendChild(aura);

  // 装備またはLv4以上のジェットウイング
  if (lv >= 4 || partId === 'wing') {
    const leftWing = el('polygon', {
      points: '76,120 14,76 32,140 72,150',
      fill: palette.secondary,
      stroke: '#0D1B2A',
      'stroke-width': 4,
    });
    const rightWing = el('polygon', {
      points: '164,120 226,76 208,140 168,150',
      fill: palette.secondary,
      stroke: '#0D1B2A',
      'stroke-width': 4,
    });
    const leftStripe = el('polygon', {
      points: '64,126 28,98 40,130',
      fill: '#00D2FF',
    });
    const rightStripe = el('polygon', {
      points: '176,126 212,98 200,130',
      fill: '#00D2FF',
    });
    svg.append(leftWing, rightWing, leftStripe, rightStripe);
  }

  // Lv5 または cannon 装備時のプラズマキャノン
  if (lv === 5 || partId === 'cannon') {
    const cLeft = el('rect', {
      x: 34,
      y: 90,
      width: 24,
      height: 44,
      rx: 8,
      fill: '#1E3A5F',
      stroke: '#00D2FF',
      'stroke-width': 3,
    });
    const cRight = el('rect', {
      x: 182,
      y: 90,
      width: 24,
      height: 44,
      rx: 8,
      fill: '#1E3A5F',
      stroke: '#00D2FF',
      'stroke-width': 3,
    });
    const muzzleL = el('circle', { cx: 46, cy: 90, r: 7, fill: '#FFB800' });
    const muzzleR = el('circle', { cx: 194, cy: 90, r: 7, fill: '#FFB800' });
    svg.append(cLeft, cRight, muzzleL, muzzleR);
  }

  if (lv === 1) {
    // たまごカプセル
    const shell = el('ellipse', {
      cx: 120,
      cy: 128,
      rx: 56,
      ry: 70,
      fill: '#1F3A5A',
      stroke: palette.primary,
      'stroke-width': 7,
    });
    const band = el('path', {
      d: 'M 65 130 Q 120 150 175 130',
      fill: 'none',
      stroke: '#00D2FF',
      'stroke-width': 6,
      'stroke-linecap': 'round',
    });
    const core = el('circle', {
      cx: 120,
      cy: 108,
      r: 22,
      fill: palette.primary,
      stroke: '#F8FAFC',
      'stroke-width': 4,
    });
    const sparkle = el('circle', { cx: 113, cy: 101, r: 6, fill: '#FFFFFF' });
    svg.append(shell, band, core, sparkle);
  } else {
    // 足・ボディ
    const footL = el('rect', {
      x: 76,
      y: 174,
      width: 30,
      height: 26,
      rx: 10,
      fill: '#1E3A5F',
      stroke: '#00D2FF',
      'stroke-width': 3,
    });
    const footR = el('rect', {
      x: 134,
      y: 174,
      width: 30,
      height: 26,
      rx: 10,
      fill: '#1E3A5F',
      stroke: '#00D2FF',
      'stroke-width': 3,
    });
    svg.append(footL, footR);

    // 胴体
    const body = el('rect', {
      x: 70,
      y: 108,
      width: 100,
      height: 76,
      rx: 26,
      fill: palette.primary,
      stroke: '#F8FAFC',
      'stroke-width': 4,
    });
    svg.appendChild(body);

    // 胸コア
    const chestPlate = el('polygon', {
      points: '120,122 146,144 120,168 94,144',
      fill: '#0D1B2A',
      stroke: '#00D2FF',
      'stroke-width': 3,
    });
    const reactor = el('circle', {
      cx: 120,
      cy: 145,
      r: lv >= 3 ? 13 : 9,
      fill: mood === 'sleep' ? '#576574' : '#00D2FF',
    });
    svg.append(chestPlate, reactor);

    // 腕
    const armL = el('rect', {
      x: 48,
      y: 120,
      width: 24,
      height: 44,
      rx: 12,
      fill: palette.secondary,
      stroke: '#F8FAFC',
      'stroke-width': 3,
    });
    const armR = el('rect', {
      x: 168,
      y: 120,
      width: 24,
      height: 44,
      rx: 12,
      fill: palette.secondary,
      stroke: '#F8FAFC',
      'stroke-width': 3,
    });
    svg.append(armL, armR);

    // 頭部
    const head = el('rect', {
      x: 68,
      y: 44,
      width: 104,
      height: 72,
      rx: 24,
      fill: palette.primary,
      stroke: '#F8FAFC',
      'stroke-width': 4,
    });
    svg.appendChild(head);

    // Lv3以上 V字ヒーローホーン
    if (lv >= 3) {
      const horn = el('polygon', {
        points: '120,56 76,22 104,48 120,30 136,48 164,22',
        fill: '#FFB800',
        stroke: '#FFF8DC',
        'stroke-width': 2.5,
      });
      svg.appendChild(horn);
    } else {
      const crest = el('polygon', {
        points: '120,26 108,46 132,46',
        fill: '#FFB800',
      });
      svg.appendChild(crest);
    }

    // バイザー
    const visor = el('rect', {
      x: 82,
      y: 64,
      width: 76,
      height: 32,
      rx: 14,
      fill: '#0D1B2A',
      stroke: '#00D2FF',
      'stroke-width': 3,
    });
    svg.appendChild(visor);

    if (mood === 'sleep') {
      const eyeL = el('path', {
        d: 'M 94 82 Q 104 88 112 82',
        fill: 'none',
        stroke: '#94A3B8',
        'stroke-width': 4,
        'stroke-linecap': 'round',
      });
      const eyeR = el('path', {
        d: 'M 128 82 Q 136 88 146 82',
        fill: 'none',
        stroke: '#94A3B8',
        'stroke-width': 4,
        'stroke-linecap': 'round',
      });
      const zText = el('text', {
        x: 178,
        y: 46,
        fill: '#FFB800',
        'font-size': 22,
        'font-weight': 'bold',
      });
      zText.textContent = 'Zzz';
      svg.append(eyeL, eyeR, zText);
    } else if (mood === 'happy') {
      const eyeL = el('path', {
        d: 'M 94 84 Q 103 70 112 84',
        fill: 'none',
        stroke: '#00D2FF',
        'stroke-width': 5,
        'stroke-linecap': 'round',
      });
      const eyeR = el('path', {
        d: 'M 128 84 Q 137 70 146 84',
        fill: 'none',
        stroke: '#00D2FF',
        'stroke-width': 5,
        'stroke-linecap': 'round',
      });
      svg.append(eyeL, eyeR);
    } else {
      const eyeL = el('circle', { cx: 103, cy: 80, r: 8, fill: '#00D2FF' });
      const eyeR = el('circle', { cx: 137, cy: 80, r: 8, fill: '#00D2FF' });
      const glintL = el('circle', { cx: 100, cy: 77, r: 2.5, fill: '#FFFFFF' });
      const glintR = el('circle', { cx: 134, cy: 77, r: 2.5, fill: '#FFFFFF' });
      svg.append(eyeL, eyeR, glintL, glintR);
    }
  }

  // クラウン装備またはLv5
  if (lv === 5 || partId === 'crown') {
    const crown = el('polygon', {
      points: '94,42 98,16 112,30 120,10 128,30 142,16 146,42',
      fill: '#FFB800',
      stroke: '#FFF8DC',
      'stroke-width': 2.5,
    });
    svg.appendChild(crown);
  }

  return svg;
}
