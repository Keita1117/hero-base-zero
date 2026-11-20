import { MECH_COLORS } from './data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
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
  mouthOpen = false,
  size = 220,
} = {}) {
  const palette = MECH_COLORS.find((c) => c.id === colorId) || MECH_COLORS[0];
  const lv = Math.max(1, Math.min(5, Number(stage) || 1));
  const openJaw = Boolean(mouthOpen || mood === 'roar' || mood === 'eat');

  const svg = svgEl('svg', {
    viewBox: '0 0 280 260',
    width: size,
    height: size,
    class: `mech-svg mood-${mood} stage-${lv}`,
    'aria-hidden': 'true',
  });

  // 背面エネルギーオーラ
  svg.appendChild(
    svgEl('circle', {
      cx: 140,
      cy: 136,
      r: lv >= 4 ? 112 : 94,
      fill: palette.primary,
      'fill-opacity': mood === 'sleep' ? 0.08 : 0.18,
    })
  );

  // Stage 3以上 または wing装備：ジェットウィング
  if (lv >= 3 || partId === 'wing') {
    const wingL = svgEl('polygon', {
      points: '94,116 14,56 36,138 92,150',
      fill: palette.secondary,
      stroke: '#09131E',
      'stroke-width': 4,
      'stroke-linejoin': 'round',
    });
    const wingR = svgEl('polygon', {
      points: '186,116 266,56 244,138 188,150',
      fill: palette.secondary,
      stroke: '#09131E',
      'stroke-width': 4,
      'stroke-linejoin': 'round',
    });
    const stripeL = svgEl('polygon', { points: '80,122 30,82 46,128', fill: '#00D2FF' });
    const stripeR = svgEl('polygon', { points: '200,122 250,82 234,128', fill: '#00D2FF' });
    svg.append(wingL, wingR, stripeL, stripeR);
  }

  // Stage 4以上 または cannon装備：プラズマキャノン
  if (lv >= 4 || partId === 'cannon') {
    svg.append(
      svgEl('rect', { x: 42, y: 82, width: 28, height: 48, rx: 8, fill: '#182C44', stroke: '#00D2FF', 'stroke-width': 3.5 }),
      svgEl('rect', { x: 210, y: 82, width: 28, height: 48, rx: 8, fill: '#182C44', stroke: '#00D2FF', 'stroke-width': 3.5 }),
      svgEl('circle', { cx: 56, cy: 82, r: 8, fill: '#FFB800' }),
      svgEl('circle', { cx: 224, cy: 82, r: 8, fill: '#FFB800' })
    );
  }

  // 力強いメカ尻尾＋ジェット炎
  svg.append(
    svgEl('path', {
      d: 'M 86 178 Q 34 186 20 144 Q 42 152 84 152 Z',
      fill: palette.secondary,
      stroke: '#F8FAFC',
      'stroke-width': 3.5,
      'stroke-linejoin': 'round',
    }),
    svgEl('polygon', {
      points: '18,144 4,130 12,158',
      fill: mood === 'sleep' ? '#64748B' : '#FFB800',
    })
  );

  // 背びれサイバーフィン
  svg.append(
    svgEl('polygon', { points: '88,92 66,76 82,112', fill: '#00D2FF', stroke: '#09131E', 'stroke-width': 2.5 }),
    svgEl('polygon', { points: '84,124 60,118 82,146', fill: '#FFB800', stroke: '#09131E', 'stroke-width': 2.5 })
  );

  // 足・クローブーツ
  svg.append(
    svgEl('rect', { x: 96, y: 184, width: 32, height: 34, rx: 10, fill: '#182C44', stroke: '#00D2FF', 'stroke-width': 3 }),
    svgEl('rect', { x: 152, y: 184, width: 32, height: 34, rx: 10, fill: '#182C44', stroke: '#00D2FF', 'stroke-width': 3 }),
    svgEl('path', { d: 'M 90 218 L 132 218 L 128 232 L 88 232 Z', fill: palette.secondary, stroke: '#F8FAFC', 'stroke-width': 3 }),
    svgEl('path', { d: 'M 148 218 L 194 218 L 198 232 L 152 232 Z', fill: palette.secondary, stroke: '#F8FAFC', 'stroke-width': 3 })
  );

  // アーマー胴体＋ヘキサゴンプラズマコア
  svg.append(
    svgEl('rect', {
      x: 84,
      y: 112,
      width: 112,
      height: 82,
      rx: 26,
      fill: palette.primary,
      stroke: '#F8FAFC',
      'stroke-width': 4,
    }),
    svgEl('polygon', {
      points: '140,126 166,144 156,174 124,174 114,144',
      fill: '#09131E',
      stroke: '#00D2FF',
      'stroke-width': 3.5,
    }),
    svgEl('circle', {
      cx: 140,
      cy: 150,
      r: lv >= 3 ? 14 : 11,
      fill: mood === 'sleep' ? '#64748B' : '#00D2FF',
    }),
    svgEl('circle', {
      cx: 136,
      cy: 146,
      r: 4,
      fill: '#FFFFFF',
    })
  );

  // ちっちゃくてカッコいいティラノの前あし（クロー付き）
  svg.append(
    svgEl('path', { d: 'M 178 134 L 214 146 L 208 164 L 176 154 Z', fill: palette.secondary, stroke: '#F8FAFC', 'stroke-width': 3 }),
    svgEl('path', { d: 'M 102 134 L 66 146 L 72 164 L 104 154 Z', fill: palette.secondary, stroke: '#F8FAFC', 'stroke-width': 3 })
  );

  // 下あご（口が開くグループ）
  const jawGroup = svgEl('g', {
    transform: openJaw ? 'rotate(24 126 98)' : 'rotate(0 126 98)',
  });
  jawGroup.append(
    svgEl('path', {
      d: 'M 98 96 L 204 94 Q 214 112 192 118 L 102 118 Z',
      fill: palette.secondary,
      stroke: '#F8FAFC',
      'stroke-width': 3.5,
      'stroke-linejoin': 'round',
    }),
    // 下の牙
    svgEl('polygon', { points: '148,95 155,83 162,95', fill: '#FFFFFF' }),
    svgEl('polygon', { points: '170,95 177,83 184,95', fill: '#FFFFFF' }),
    svgEl('polygon', { points: '190,94 196,84 201,94', fill: '#FFFFFF' })
  );
  svg.appendChild(jawGroup);

  // 口内の光＆炎ブレス（大口や咆哮時）
  if (openJaw && mood !== 'sleep') {
    svg.appendChild(
      svgEl('ellipse', {
        cx: 174,
        cy: 102,
        rx: 26,
        ry: 12,
        fill: '#FF4757',
        'fill-opacity': 0.8,
      })
    );
  }
  if (mood === 'roar') {
    svg.append(
      svgEl('polygon', { points: '204,92 274,70 256,102 276,122 204,112', fill: '#FF9F43', 'fill-opacity': 0.9 }),
      svgEl('polygon', { points: '204,96 254,84 244,102 256,112 204,106', fill: '#FFD32A' })
    );
  }

  // 上あご・T-REXヘッド
  svg.append(
    svgEl('path', {
      d: 'M 86 58 Q 90 30 132 30 L 198 38 Q 222 48 216 86 L 94 94 Z',
      fill: palette.primary,
      stroke: '#F8FAFC',
      'stroke-width': 4,
      'stroke-linejoin': 'round',
    }),
    // 上の牙
    svgEl('polygon', { points: '144,91 151,105 158,91', fill: '#FFFFFF' }),
    svgEl('polygon', { points: '166,90 173,104 180,90', fill: '#FFFFFF' }),
    svgEl('polygon', { points: '188,88 195,102 202,88', fill: '#FFFFFF' })
  );

  // 鼻先の角（Stage 2以上）
  if (lv >= 2) {
    svg.appendChild(
      svgEl('polygon', {
        points: '192,42 214,20 206,46',
        fill: '#FFB800',
        stroke: '#FFF8DC',
        'stroke-width': 2.5,
      })
    );
  }

  // V字クラウン／ホーン（Stage 5 または crown装備）
  if (lv === 5 || partId === 'crown') {
    svg.appendChild(
      svgEl('polygon', {
        points: '108,34 114,10 130,24 140,4 150,24 166,10 172,34',
        fill: '#FFB800',
        stroke: '#FFF8DC',
        'stroke-width': 2.5,
      })
    );
  } else {
    svg.appendChild(
      svgEl('polygon', {
        points: '112,34 100,12 130,28',
        fill: '#FFB800',
        stroke: '#FFF8DC',
        'stroke-width': 2,
      })
    );
  }

  // サイバーバイザー＆目
  svg.appendChild(
    svgEl('rect', {
      x: 112,
      y: 44,
      width: 68,
      height: 30,
      rx: 12,
      fill: '#09131E',
      stroke: '#00D2FF',
      'stroke-width': 3,
    })
  );

  if (mood === 'sleep') {
    svg.append(
      svgEl('path', { d: 'M 124 60 Q 134 66 144 60', fill: 'none', stroke: '#94A3B8', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      svgEl('path', { d: 'M 152 60 Q 162 66 170 60', fill: 'none', stroke: '#94A3B8', 'stroke-width': 4, 'stroke-linecap': 'round' })
    );
    const zTxt = svgEl('text', { x: 214, y: 34, fill: '#FFB800', 'font-size': 22, 'font-weight': 'bold' });
    zTxt.textContent = 'Zzz';
    svg.appendChild(zTxt);
  } else if (mood === 'happy' || mood === 'eat') {
    svg.append(
      svgEl('path', { d: 'M 122 64 Q 132 48 142 64', fill: 'none', stroke: '#00D2FF', 'stroke-width': 5, 'stroke-linecap': 'round' }),
      svgEl('path', { d: 'M 152 64 Q 162 48 172 64', fill: 'none', stroke: '#00D2FF', 'stroke-width': 5, 'stroke-linecap': 'round' })
    );
  } else {
    svg.append(
      svgEl('circle', { cx: 132, cy: 59, r: 8, fill: '#00D2FF' }),
      svgEl('circle', { cx: 162, cy: 59, r: 8, fill: '#00D2FF' }),
      svgEl('circle', { cx: 129, cy: 56, r: 2.8, fill: '#FFFFFF' }),
      svgEl('circle', { cx: 159, cy: 56, r: 2.8, fill: '#FFFFFF' })
    );
  }

  return svg;
}
