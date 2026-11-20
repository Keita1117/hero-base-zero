import {
  formatClockLabel,
  generateClockQuestion,
  generateMathQuestion,
} from '../core.js';
import { el } from '../dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

function createClockSvg(hour, minute) {
  const svg = svgEl('svg', {
    viewBox: '0 0 220 220',
    width: 210,
    height: 210,
    class: 'analog-clock-svg',
    'aria-label': `${formatClockLabel(hour, minute)} の とけい`,
  });

  svg.appendChild(
    svgEl('circle', {
      cx: 110,
      cy: 110,
      r: 100,
      fill: '#F8FAFC',
      stroke: '#00D2FF',
      'stroke-width': 8,
    })
  );

  for (let i = 0; i < 12; i += 1) {
    const angle = (i * 30 - 90) * (Math.PI / 180);
    const num = i === 0 ? 12 : i;
    const x = 110 + Math.cos(angle) * 76;
    const y = 110 + Math.sin(angle) * 76;
    const tx = svgEl('text', {
      x: x.toFixed(1),
      y: (y + 6).toFixed(1),
      'text-anchor': 'middle',
      fill: '#102030',
      'font-size': 18,
      'font-weight': '800',
    });
    tx.textContent = String(num);
    svg.appendChild(tx);

    const mx1 = 110 + Math.cos(angle) * 90;
    const my1 = 110 + Math.sin(angle) * 90;
    const mx2 = 110 + Math.cos(angle) * 96;
    const my2 = 110 + Math.sin(angle) * 96;
    svg.appendChild(
      svgEl('line', {
        x1: mx1.toFixed(1),
        y1: my1.toFixed(1),
        x2: mx2.toFixed(1),
        y2: my2.toFixed(1),
        stroke: '#2B4C73',
        'stroke-width': 3,
      })
    );
  }

  const minAngle = (minute * 6 - 90) * (Math.PI / 180);
  const hourAngle = (((hour % 12) + minute / 60) * 30 - 90) * (Math.PI / 180);

  // みじかい針（赤・時間）
  svg.appendChild(
    svgEl('line', {
      x1: 110,
      y1: 110,
      x2: (110 + Math.cos(hourAngle) * 48).toFixed(1),
      y2: (110 + Math.sin(hourAngle) * 48).toFixed(1),
      stroke: '#FF4757',
      'stroke-width': 9,
      'stroke-linecap': 'round',
    })
  );

  // ながい針（青・分）
  svg.appendChild(
    svgEl('line', {
      x1: 110,
      y1: 110,
      x2: (110 + Math.cos(minAngle) * 72).toFixed(1),
      y2: (110 + Math.sin(minAngle) * 72).toFixed(1),
      stroke: '#0088CC',
      'stroke-width': 5,
      'stroke-linecap': 'round',
    })
  );

  svg.appendChild(svgEl('circle', { cx: 110, cy: 110, r: 8, fill: '#0D1B2A' }));
  return svg;
}

export function mount(container, ctx) {
  let activeTab = 'count';
  let level = 1;
  let destroyed = false;
  let roundTimer = null;

  function scheduleRound(fn, ms) {
    if (roundTimer) clearTimeout(roundTimer);
    roundTimer = setTimeout(() => {
      roundTimer = null;
      fn();
    }, ms);
  }

  // Count state
  let countQ = generateMathQuestion('count', level);
  let tappedCount = 0;
  let tappedIndices = new Set();
  let mathLocked = false;

  // Calc state
  let calcOp = 'add';
  let calcQ = generateMathQuestion('add', level);

  // Clock state
  let clockMode = 'quiz'; // 'quiz' | 'sandbox'
  let clockQ = generateClockQuestion(level);
  let sandboxHour = 3;
  let sandboxMinute = 0;

  const root = el('div', { class: 'dock-shell math-dock' });
  const tabsBar = el('div', { class: 'sub-tabs', role: 'tablist', 'aria-label': 'かずと とけい' });
  const levelBar = el('div', { class: 'level-bar' });
  const body = el('div', { class: 'dock-body' });
  root.append(tabsBar, levelBar, body);
  container.appendChild(root);

  const tabs = [
    { id: 'count', label: '🔢 かぞえよう' },
    { id: 'calc', label: '⚡ がったい けいさん' },
    { id: 'clock', label: '🕒 とけい' },
  ];

  function renderTabs() {
    tabsBar.replaceChildren(
      ...tabs.map((t) =>
        el('button', {
          type: 'button',
          class: `sub-tab-btn ${activeTab === t.id ? 'is-active' : ''}`,
          role: 'tab',
          'aria-selected': String(activeTab === t.id),
          text: t.label,
          onClick: () => {
            ctx.sound.playTap();
            activeTab = t.id;
            mathLocked = false;
            renderTabs();
            renderView();
          },
        })
      )
    );
  }

  function renderLevelBar() {
    const levels = [
      { lv: 1, label: '⭐ かんたん' },
      { lv: 2, label: '⭐⭐ ふつう' },
      { lv: 3, label: '⭐⭐⭐ チャレンジ' },
    ];
    levelBar.replaceChildren(
      ...levels.map((item) =>
        el('button', {
          type: 'button',
          class: `level-pill ${level === item.lv ? 'is-active' : ''}`,
          text: item.label,
          onClick: () => {
            ctx.sound.playTap();
            level = item.lv;
            resetQuestions();
            renderLevelBar();
            renderView();
          },
        })
      )
    );
  }

  function resetQuestions() {
    mathLocked = false;
    tappedCount = 0;
    tappedIndices = new Set();
    countQ = generateMathQuestion('count', level);
    calcQ = generateMathQuestion(calcOp, level);
    clockQ = generateClockQuestion(level);
  }

  function renderCountView() {
    const card = el('div', { class: 'panel-card math-card' });
    const prompt = el('div', { class: 'game-status-banner', text: countQ.prompt });
    const counterBadge = el('div', {
      class: 'count-live-badge',
      text: `いま かぞえた かず：${tappedCount}`,
    });

    const itemsGrid = el('div', { class: 'count-tokens-grid' });
    for (let i = 0; i < countQ.count; i += 1) {
      const lit = tappedIndices.has(i);
      itemsGrid.appendChild(
        el('button', {
          type: 'button',
          class: `count-token-btn ${lit ? 'is-lit' : ''}`,
          'aria-label': `アイテム ${i + 1}`,
          onClick: () => {
            if (!tappedIndices.has(i)) {
              tappedIndices.add(i);
              tappedCount = tappedIndices.size;
              ctx.sound.playTap();
              ctx.voice.speakJa(String(tappedCount));
              renderCountView();
            } else {
              ctx.sound.playTap();
            }
          },
        }, [
          el('span', { text: countQ.emoji, 'aria-hidden': 'true' }),
          lit ? el('span', { class: 'token-num-tag', text: String([...tappedIndices].indexOf(i) + 1) }) : null,
        ])
      );
    }

    const ansRow = el('div', { class: 'number-options-grid' });
    countQ.options.forEach((opt) => {
      const btn = el('button', {
        type: 'button',
        class: 'num-choice-btn',
        text: String(opt),
        onClick: () => {
          if (mathLocked) return;
          if (opt === countQ.answer) {
            mathLocked = true;
            btn.classList.add('is-correct');
            ctx.sound.playSuccess();
            ctx.voice.speakJa(`せいかい！ ぜんぶで ${opt} こ！`);
            prompt.textContent = `✨ せいかい！ ${opt} こ だね！ +15⚡`;
            ctx.awardEnergy(15, { dockId: 'math', missionId: 'm_math_solve' });
            scheduleRound(() => {
              if (!destroyed && activeTab === 'count') {
                resetQuestions();
                renderCountView();
              }
            }, 1300);
          } else {
            btn.classList.add('is-wrong');
            ctx.sound.playTryAgain();
            ctx.voice.speakJa('もういちど 1つずつ タップして かぞえてみよう！');
          }
        },
      });
      ansRow.appendChild(btn);
    });

    card.append(prompt, counterBadge, itemsGrid, ansRow);
    body.replaceChildren(card);
  }

  function renderCalcView() {
    const card = el('div', { class: 'panel-card math-card' });

    const opSwitch = el('div', { class: 'btn-row' }, [
      el('button', {
        type: 'button',
        class: `btn-toy ${calcOp === 'add' ? 'btn-cyan' : 'btn-slate'}`,
        text: '➕ たしざん',
        onClick: () => {
          ctx.sound.playTap();
          calcOp = 'add';
          calcQ = generateMathQuestion('add', level);
          mathLocked = false;
          renderCalcView();
        },
      }),
      el('button', {
        type: 'button',
        class: `btn-toy ${calcOp === 'sub' ? 'btn-red' : 'btn-slate'}`,
        text: '➖ ひきざん',
        onClick: () => {
          ctx.sound.playTap();
          calcOp = 'sub';
          calcQ = generateMathQuestion('sub', level);
          mathLocked = false;
          renderCalcView();
        },
      }),
    ]);

    const prompt = el('div', { class: 'game-status-banner', text: calcQ.prompt });
    const equation = el('div', {
      class: 'math-equation-display',
      text: calcQ.mode === 'add' ? `${calcQ.a} ＋ ${calcQ.b} ＝ ？` : `${calcQ.a} − ${calcQ.b} ＝ ？`,
    });

    const visualBox = el('div', { class: 'math-visual-box' });
    if (calcQ.mode === 'add') {
      const leftGrp = el('div', { class: 'math-group' });
      for (let i = 0; i < calcQ.a; i += 1) leftGrp.appendChild(el('span', { class: 'math-vis-icon', text: calcQ.emoji }));
      const plus = el('span', { class: 'math-op-sign', text: '＋' });
      const rightGrp = el('div', { class: 'math-group' });
      for (let i = 0; i < calcQ.b; i += 1) rightGrp.appendChild(el('span', { class: 'math-vis-icon', text: calcQ.emoji }));
      visualBox.append(leftGrp, plus, rightGrp);
    } else {
      const grp = el('div', { class: 'math-group' });
      for (let i = 0; i < calcQ.a; i += 1) {
        const faded = i >= calcQ.a - calcQ.b;
        grp.appendChild(
          el('span', {
            class: `math-vis-icon ${faded ? 'is-faded-out' : ''}`,
            text: calcQ.emoji,
          })
        );
      }
      visualBox.appendChild(grp);
    }

    const ansRow = el('div', { class: 'number-options-grid' });
    calcQ.options.forEach((opt) => {
      const btn = el('button', {
        type: 'button',
        class: 'num-choice-btn',
        text: String(opt),
        onClick: () => {
          if (mathLocked) return;
          if (opt === calcQ.answer) {
            mathLocked = true;
            btn.classList.add('is-correct');
            ctx.sound.playSuccess();
            ctx.voice.speakJa(`せいかい！ こたえは ${opt}！`);
            prompt.textContent = `✨ だいせいかい！ こたえは ${opt}！ +15⚡`;
            ctx.awardEnergy(15, { dockId: 'math', missionId: 'm_math_solve' });
            scheduleRound(() => {
              if (!destroyed && activeTab === 'calc') {
                calcQ = generateMathQuestion(calcOp, level);
                mathLocked = false;
                renderCalcView();
              }
            }, 1300);
          } else {
            btn.classList.add('is-wrong');
            ctx.sound.playTryAgain();
            ctx.voice.speakJa('えを かぞえて もういちど チャレンジ！');
          }
        },
      });
      ansRow.appendChild(btn);
    });

    card.append(opSwitch, prompt, equation, visualBox, ansRow);
    body.replaceChildren(card);
  }

  function renderClockView() {
    const card = el('div', { class: 'panel-card math-card clock-card' });

    const modeSwitch = el('div', { class: 'btn-row' }, [
      el('button', {
        type: 'button',
        class: `btn-toy ${clockMode === 'quiz' ? 'btn-cyan' : 'btn-slate'}`,
        text: '🎯 とけい クイズ',
        onClick: () => {
          ctx.sound.playTap();
          clockMode = 'quiz';
          mathLocked = false;
          renderClockView();
        },
      }),
      el('button', {
        type: 'button',
        class: `btn-toy ${clockMode === 'sandbox' ? 'btn-gold' : 'btn-slate'}`,
        text: '🔧 はりを まわそう',
        onClick: () => {
          ctx.sound.playTap();
          clockMode = 'sandbox';
          renderClockView();
        },
      }),
    ]);

    if (clockMode === 'sandbox') {
      const label = formatClockLabel(sandboxHour, sandboxMinute);
      const clockWrap = el('div', { class: 'clock-svg-wrap' }, [createClockSvg(sandboxHour, sandboxMinute)]);
      const bigLabel = el('div', { class: 'math-equation-display', text: `いま： ${label}` });
      const advance = (mins) => {
        ctx.sound.playTap();
        let total = sandboxHour * 60 + sandboxMinute + mins;
        while (total >= 12 * 60) total -= 12 * 60;
        let h = Math.floor(total / 60);
        if (h === 0) h = 12;
        sandboxHour = h;
        sandboxMinute = total % 60;
        ctx.voice.speakJa(formatClockLabel(sandboxHour, sandboxMinute));
        renderClockView();
      };

      const controls = el('div', { class: 'btn-row' }, [
        el('button', { type: 'button', class: 'btn-toy btn-cyan', text: '+15ふん', onClick: () => advance(15) }),
        el('button', { type: 'button', class: 'btn-toy btn-emerald', text: '+30ぷん', onClick: () => advance(30) }),
        el('button', { type: 'button', class: 'btn-toy btn-gold', text: '+1じかん', onClick: () => advance(60) }),
      ]);
      card.append(modeSwitch, clockWrap, bigLabel, controls);
      body.replaceChildren(card);
      return;
    }

    const prompt = el('div', {
      class: 'game-status-banner',
      text: '🕒 いま なんじ かな？ あかい はりと あおい はりを みてね！',
    });
    const clockWrap = el('div', { class: 'clock-svg-wrap' }, [createClockSvg(clockQ.hour, clockQ.minute)]);
    const optsGrid = el('div', { class: 'choice-grid-2x2' });

    clockQ.options.forEach((opt) => {
      const btn = el('button', {
        type: 'button',
        class: 'btn-toy btn-slate clock-choice-btn',
        text: opt.label,
        onClick: () => {
          if (mathLocked) return;
          if (opt.hour === clockQ.hour && opt.minute === clockQ.minute) {
            mathLocked = true;
            btn.classList.add('is-correct');
            ctx.sound.playSuccess();
            ctx.voice.speakJa(`せいかい！ ${opt.label} だね！`);
            prompt.textContent = `✨ せいかい！ ${opt.label}！ +15⚡`;
            ctx.awardEnergy(15, { dockId: 'math', missionId: 'm_clock_read' });
            scheduleRound(() => {
              if (!destroyed && activeTab === 'clock' && clockMode === 'quiz') {
                clockQ = generateClockQuestion(level);
                mathLocked = false;
                renderClockView();
              }
            }, 1300);
          } else {
            btn.classList.add('is-wrong');
            ctx.sound.playTryAgain();
            ctx.voice.speakJa('あかい みじかい はりが どこを さしてるかな？');
          }
        },
      });
      optsGrid.appendChild(btn);
    });

    card.append(modeSwitch, prompt, clockWrap, optsGrid);
    body.replaceChildren(card);
  }

  function renderView() {
    if (activeTab === 'count') renderCountView();
    else if (activeTab === 'calc') renderCalcView();
    else renderClockView();
  }

  renderTabs();
  renderLevelBar();
  renderView();
  ctx.voice.speakJa('かずと とけい ラボ！ いっしょに かぞえて みよう！');

  return () => {
    destroyed = true;
    if (roundTimer) clearTimeout(roundTimer);
  };
}
