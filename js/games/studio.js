import { el, isSafeDataImageUrl } from '../dom.js';

const PEN_COLORS = [
  { id: 'red', label: 'あか', hex: '#FF4757' },
  { id: 'blue', label: 'あお', hex: '#00A8FF' },
  { id: 'gold', label: 'きいろ', hex: '#FFB800' },
  { id: 'green', label: 'みどり', hex: '#1DD1A1' },
  { id: 'purple', label: 'むらさき', hex: '#A55EEA' },
  { id: 'ink', label: 'くろ', hex: '#102030' },
  { id: 'rainbow', label: 'にじ', hex: 'rainbow' },
];

const STAMPS = ['⭐', '⚡', '🚀', '🦖', '👑', '💎'];

const BEAT_TRACKS = [
  { name: '🥁 ドン', color: '#FF4757' },
  { name: '⚡ パシッ', color: '#FFB800' },
  { name: '🎹 ピコ', color: '#00D2FF' },
  { name: '🔫 ビーム', color: '#1DD1A1' },
];

const PIANO_NOTES = [
  { label: 'ド', freq: 261.63, color: '#FF4757' },
  { label: 'レ', freq: 293.66, color: '#FF9F43' },
  { label: 'ミ', freq: 329.63, color: '#FFB800' },
  { label: 'ファ', freq: 349.23, color: '#1DD1A1' },
  { label: 'ソ', freq: 392.0, color: '#00D2FF' },
  { label: 'ラ', freq: 440.0, color: '#54A0FF' },
  { label: 'シ', freq: 493.88, color: '#A55EEA' },
  { label: 'ド↑', freq: 523.25, color: '#FF6B81' },
];

export function mount(container, ctx) {
  let activeTab = 'draw';
  let destroyed = false;

  // Draw state
  let drawMode = 'edit'; // 'edit' | 'live'
  let penColor = '#FF4757';
  let penSize = 10;
  let activeStamp = null;
  let strokes = [];
  let currentStroke = null;
  let stampsPlaced = [];
  let spriteDataUrl = '';
  let stageAnimId = null;
  let savedDrawings = [];
  let rainbowHue = 0;

  // Beat state
  let pattern = [
    [1, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 1, 0],
    [1, 0, 1, 0, 0, 1, 0, 1],
    [0, 0, 0, 1, 0, 0, 0, 1],
  ];
  let isPlaying = false;
  let currentStep = -1;
  let bpm = 120;
  let beatTimer = null;

  const root = el('div', { class: 'dock-shell studio-dock' });
  const tabsBar = el('div', { class: 'sub-tabs', role: 'tablist', 'aria-label': 'ビート＆うごくアトリエ' });
  const body = el('div', { class: 'dock-body' });
  root.append(tabsBar, body);
  container.appendChild(root);

  function stopStageAnim() {
    if (stageAnimId) {
      cancelAnimationFrame(stageAnimId);
      stageAnimId = null;
    }
  }

  function stopBeat() {
    if (beatTimer) {
      clearInterval(beatTimer);
      beatTimer = null;
    }
    isPlaying = false;
    currentStep = -1;
  }

  function renderTabs() {
    const tabs = [
      { id: 'draw', label: '🎨 うごく おえかき' },
      { id: 'beat', label: '🎵 ヒーロー ビート' },
    ];
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
            stopStageAnim();
            if (t.id !== 'beat') stopBeat();
            activeTab = t.id;
            renderTabs();
            renderView();
          },
        })
      )
    );
  }

  function renderDrawEditor() {
    stopStageAnim();
    const card = el('div', { class: 'panel-card draw-card' });

    // Palette
    const colorBar = el('div', { class: 'palette-bar' });
    PEN_COLORS.forEach((c) => {
      colorBar.appendChild(
        el('button', {
          type: 'button',
          class: `color-dot-btn ${penColor === c.hex && !activeStamp ? 'is-active' : ''} ${c.hex === 'rainbow' ? 'is-rainbow' : ''}`,
          style: c.hex === 'rainbow' ? '' : `background:${c.hex}`,
          'aria-label': c.label,
          onClick: () => {
            ctx.sound.playTap();
            activeStamp = null;
            penColor = c.hex;
            renderDrawEditor();
          },
        })
      );
    });

    // Sizes + Stamps
    const toolsBar = el('div', { class: 'tools-bar' });
    [
      { label: 'ほそい', size: 5 },
      { label: 'ふつう', size: 11 },
      { label: 'ふとい', size: 20 },
    ].forEach((sz) => {
      toolsBar.appendChild(
        el('button', {
          type: 'button',
          class: `level-pill ${penSize === sz.size && !activeStamp ? 'is-active' : ''}`,
          text: sz.label,
          onClick: () => {
            ctx.sound.playTap();
            activeStamp = null;
            penSize = sz.size;
            renderDrawEditor();
          },
        })
      );
    });

    STAMPS.forEach((st) => {
      toolsBar.appendChild(
        el('button', {
          type: 'button',
          class: `stamp-btn ${activeStamp === st ? 'is-active' : ''}`,
          text: st,
          'aria-label': `スタンプ ${st}`,
          onClick: () => {
            ctx.sound.playTap();
            activeStamp = activeStamp === st ? null : st;
            renderDrawEditor();
          },
        })
      );
    });

    const canvasWrap = el('div', { class: 'draw-canvas-wrap' });
    const canvas = el('canvas', { class: 'draw-canvas', 'aria-label': 'おえかき ボード' });
    canvasWrap.appendChild(canvas);

    const actions = el('div', { class: 'btn-row' }, [
      el('button', {
        type: 'button',
        class: 'btn-toy btn-slate',
        text: '↩️ 1つ もどす',
        onClick: () => {
          ctx.sound.playTap();
          if (stampsPlaced.length > 0 && (!strokes.length || stampsPlaced[stampsPlaced.length - 1].order > strokes[strokes.length - 1].order)) {
            stampsPlaced.pop();
          } else {
            strokes.pop();
          }
          redraw();
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-slate',
        text: '🧹 ぜんぶ けす',
        onClick: () => {
          ctx.sound.playTap();
          strokes = [];
          stampsPlaced = [];
          redraw();
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-emerald',
        text: '▶ うごかす！',
        onClick: () => {
          if (strokes.length === 0 && stampsPlaced.length === 0) {
            ctx.sound.playTryAgain();
            ctx.voice.speakJa('なにか え や スタンプを かいてから うごかそう！');
            return;
          }
          ctx.sound.playSuccess();
          spriteDataUrl = canvas.toDataURL('image/png');
          drawMode = 'live';
          ctx.awardEnergy(20, { dockId: 'studio', missionId: 'm_studio_create' });
          renderDrawLiveStage();
        },
      }),
    ]);

    card.append(colorBar, toolsBar, canvasWrap, actions);

    if (savedDrawings.length > 0) {
      const strip = el('div', { class: 'saved-drawings-strip' });
      savedDrawings.slice(0, 6).forEach((item) => {
        if (!isSafeDataImageUrl(item.dataUrl)) return;
        strip.appendChild(
          el('button', {
            type: 'button',
            class: 'saved-drawing-thumb',
            'aria-label': 'ほぞんした えを うごかす',
            onClick: () => {
              ctx.sound.playTap();
              spriteDataUrl = item.dataUrl;
              drawMode = 'live';
              renderDrawLiveStage();
            },
          }, [el('img', { src: item.dataUrl, alt: 'おえかき' })])
        );
      });
      card.appendChild(strip);
    }

    body.replaceChildren(card);

    const ctx2d = canvas.getContext('2d');
    let cw = 360;
    let ch = 280;
    let orderCounter = Math.max(
      0,
      ...strokes.map((s) => s.order || 0),
      ...stampsPlaced.map((s) => s.order || 0)
    );

    function resize() {
      const innerW = Math.floor((canvasWrap.clientWidth || 300) - 16);
      cw = Math.max(200, Math.min(520, innerW));
      ch = Math.round(cw * 0.72);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }

    function redraw() {
      if (!ctx2d) return;
      ctx2d.clearRect(0, 0, cw, ch);

      const allItems = [
        ...strokes.map((s) => ({ kind: 'stroke', item: s, order: s.order })),
        ...(currentStroke ? [{ kind: 'stroke', item: currentStroke, order: 999999 }] : []),
        ...stampsPlaced.map((st) => ({ kind: 'stamp', item: st, order: st.order })),
      ].sort((a, b) => a.order - b.order);

      for (const entry of allItems) {
        if (entry.kind === 'stamp') {
          const st = entry.item;
          ctx2d.save();
          ctx2d.font = '44px sans-serif';
          ctx2d.textAlign = 'center';
          ctx2d.textBaseline = 'middle';
          ctx2d.fillText(st.char, st.x * cw, st.y * ch);
          ctx2d.restore();
        } else {
          const s = entry.item;
          if (s.points.length < 2) continue;
          ctx2d.save();
          ctx2d.lineCap = 'round';
          ctx2d.lineJoin = 'round';
          ctx2d.lineWidth = s.size;
          if (s.color === 'rainbow') {
            for (let i = 1; i < s.points.length; i += 1) {
              const p1 = s.points[i - 1];
              const p2 = s.points[i];
              ctx2d.strokeStyle = `hsl(${(s.hueBase + i * 12) % 360}, 90%, 55%)`;
              ctx2d.beginPath();
              ctx2d.moveTo(p1[0] * cw, p1[1] * ch);
              ctx2d.lineTo(p2[0] * cw, p2[1] * ch);
              ctx2d.stroke();
            }
          } else {
            ctx2d.strokeStyle = s.color;
            ctx2d.beginPath();
            s.points.forEach(([nx, ny], idx) => {
              if (idx === 0) ctx2d.moveTo(nx * cw, ny * ch);
              else ctx2d.lineTo(nx * cw, ny * ch);
            });
            ctx2d.stroke();
          }
          ctx2d.restore();
        }
      }
    }

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return [0.5, 0.5];
      return [
        Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
      ];
    }

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const [nx, ny] = getPos(e);
      if (activeStamp) {
        orderCounter += 1;
        stampsPlaced.push({ char: activeStamp, x: nx, y: ny, order: orderCounter });
        ctx.sound.playTap();
        redraw();
        return;
      }
      canvas.setPointerCapture?.(e.pointerId);
      rainbowHue = (rainbowHue + 45) % 360;
      orderCounter += 1;
      currentStroke = {
        color: penColor,
        size: penSize,
        hueBase: rainbowHue,
        points: [[nx, ny], [nx + 0.002, ny + 0.002]],
        order: orderCounter,
      };
      redraw();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!currentStroke) return;
      e.preventDefault();
      currentStroke.points.push(getPos(e));
      redraw();
    });

    const endStroke = (e) => {
      if (e && canvas.hasPointerCapture?.(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      if (!currentStroke) return;
      strokes.push(currentStroke);
      currentStroke = null;
      redraw();
    };
    const cancelStroke = (e) => {
      if (e && canvas.hasPointerCapture?.(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      currentStroke = null;
      redraw();
    };
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', cancelStroke);
    canvas.addEventListener('lostpointercapture', cancelStroke);

    resize();
  }

  function renderDrawLiveStage() {
    stopStageAnim();
    const card = el('div', { class: 'panel-card live-stage-card' });
    const info = el('div', {
      class: 'game-status-banner',
      text: '🚀 えを タップすると ジャンプするよ！ うちゅうを たんけんしよう！',
    });

    const stage = el('div', { class: 'live-space-stage' });
    const spriteBtn = el('button', {
      type: 'button',
      class: 'live-sprite-btn',
      'aria-label': 'うごく えを タップして ジャンプ',
    }, [el('img', { src: spriteDataUrl, alt: 'じぶんで かいた キャラ', class: 'live-sprite-img' })]);

    stage.appendChild(spriteBtn);

    let px = 40;
    let py = 40;
    let vx = 1.9;
    let vy = 1.4;
    let bounceBoost = 0;

    spriteBtn.addEventListener('click', () => {
      ctx.sound.playCombo();
      bounceBoost = 1;
      vy = -4.2;
      vx = (Math.random() > 0.5 ? 1 : -1) * (1.8 + Math.random() * 1.6);
      ctx.voice.speakJa('ぴょーん！ げんきに うごいてるよ！');
    });

    const controls = el('div', { class: 'btn-row' }, [
      el('button', {
        type: 'button',
        class: 'btn-toy btn-cyan',
        text: '✏️ かきなおす',
        onClick: () => {
          ctx.sound.playTap();
          drawMode = 'edit';
          renderDrawEditor();
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-gold',
        text: '💾 ずかんへ ほぞん',
        onClick: async () => {
          ctx.sound.playSuccess();
          await ctx.storage.saveMediaItem('drawings', { dataUrl: spriteDataUrl });
          savedDrawings = await ctx.storage.listMediaItems('drawings');
          info.textContent = '✨ ほぞんしたよ！ つぎも あそべるよ！';
        },
      }),
    ]);

    card.append(info, stage, controls);
    body.replaceChildren(card);

    const animate = () => {
      if (destroyed || activeTab !== 'draw' || drawMode !== 'live') {
        stageAnimId = null;
        return;
      }
      const reduced = (ctx.getState() || {}).reducedMotion;
      const sw = stage.clientWidth || 320;
      const sh = stage.clientHeight || 260;
      const w = spriteBtn.offsetWidth || 130;
      const h = spriteBtn.offsetHeight || 110;

      if (!reduced) {
        px += vx;
        py += vy;
        if (bounceBoost > 0) {
          vy += 0.16;
          bounceBoost = Math.max(0, bounceBoost - 0.02);
        }
        if (px <= 8) {
          px = 8;
          vx = Math.abs(vx);
        } else if (px >= sw - w - 8) {
          px = Math.max(8, sw - w - 8);
          vx = -Math.abs(vx);
        }
        if (py <= 8) {
          py = 8;
          vy = Math.abs(vy);
        } else if (py >= sh - h - 8) {
          py = Math.max(8, sh - h - 8);
          vy = -Math.max(1.2, Math.abs(vy) * 0.8);
        }
        const tilt = (vx * 3).toFixed(1);
        spriteBtn.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) rotate(${tilt}deg)`;
      } else {
        spriteBtn.style.transform = `translate3d(${Math.max(8, (sw - w) / 2)}px, ${Math.max(8, (sh - h) / 2)}px, 0)`;
      }
      stageAnimId = requestAnimationFrame(animate);
    };
    stageAnimId = requestAnimationFrame(animate);
  }

  function renderBeatView() {
    const card = el('div', { class: 'panel-card beat-card' });

    const controls = el('div', { class: 'btn-row' }, [
      el('button', {
        type: 'button',
        class: `btn-toy ${isPlaying ? 'btn-red' : 'btn-emerald'}`,
        text: isPlaying ? '⏹️ とめる' : '▶ さいせい！',
        onClick: () => {
          ctx.sound.unlock();
          if (isPlaying) {
            stopBeat();
            renderBeatView();
          } else {
            stopBeat();
            isPlaying = true;
            ctx.awardEnergy(15, { dockId: 'studio', missionId: 'm_studio_create' });
            const stepMs = Math.round((60 / bpm / 2) * 1000);
            beatTimer = setInterval(() => {
              if (destroyed || activeTab !== 'beat') {
                stopBeat();
                return;
              }
              currentStep = (currentStep + 1) % 8;
              BEAT_TRACKS.forEach((_, trIdx) => {
                if (pattern[trIdx][currentStep]) {
                  ctx.sound.playBeatStep(trIdx);
                }
              });
              const cols = body.querySelectorAll('.beat-step-btn');
              cols.forEach((btn) => {
                const st = Number(btn.getAttribute('data-step'));
                btn.classList.toggle('is-now', st === currentStep);
              });
            }, stepMs);
            renderBeatView();
          }
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-cyan',
        text: '⚡ ヒーローきょく',
        onClick: () => {
          ctx.sound.playTap();
          pattern = [
            [1, 0, 1, 0, 1, 0, 0, 0],
            [0, 0, 0, 1, 0, 0, 1, 0],
            [1, 1, 0, 0, 1, 0, 1, 1],
            [0, 0, 1, 0, 0, 1, 0, 1],
          ];
          renderBeatView();
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-slate',
        text: '🧹 クリア',
        onClick: () => {
          ctx.sound.playTap();
          pattern = pattern.map((row) => row.map(() => 0));
          renderBeatView();
        },
      }),
    ]);

    const seqGrid = el('div', { class: 'beat-grid' });
    BEAT_TRACKS.forEach((tr, trIdx) => {
      const row = el('div', { class: 'beat-row' });
      row.appendChild(el('div', { class: 'beat-track-label', text: tr.name }));
      const stepsWrap = el('div', { class: 'beat-steps-wrap' });
      for (let s = 0; s < 8; s += 1) {
        const active = pattern[trIdx][s] === 1;
        stepsWrap.appendChild(
          el('button', {
            type: 'button',
            class: `beat-step-btn ${active ? 'is-on' : ''} ${currentStep === s ? 'is-now' : ''}`,
            style: active ? `background:${tr.color}; border-color:${tr.color}` : '',
            'data-step': s,
            'aria-label': `${tr.name} ${s + 1}`,
            onClick: () => {
              pattern[trIdx][s] = pattern[trIdx][s] ? 0 : 1;
              if (pattern[trIdx][s]) ctx.sound.playBeatStep(trIdx);
              renderBeatView();
            },
          })
        );
      }
      row.appendChild(stepsWrap);
      seqGrid.appendChild(row);
    });

    const pianoTitle = el('div', { class: 'game-status-banner', text: '🎹 ヒーロー けんばん（おすと おとが なるよ！）' });
    const pianoRow = el('div', { class: 'piano-row' });
    PIANO_NOTES.forEach((note) => {
      pianoRow.appendChild(
        el('button', {
          type: 'button',
          class: 'piano-key-btn',
          style: `--note-color:${note.color}`,
          text: note.label,
          onPointerdown: (e) => {
            e.preventDefault();
            ctx.sound.playNote(note.freq);
          },
        })
      );
    });

    card.append(controls, seqGrid, pianoTitle, pianoRow);
    body.replaceChildren(card);
  }

  function renderView() {
    if (activeTab === 'draw') {
      if (drawMode === 'live' && spriteDataUrl) renderDrawLiveStage();
      else renderDrawEditor();
    } else {
      renderBeatView();
    }
  }

  ctx.storage.listMediaItems('drawings').then((list) => {
    if (destroyed) return;
    savedDrawings = list;
    if (activeTab === 'draw' && drawMode === 'edit') renderDrawEditor();
  });

  renderTabs();
  renderView();
  ctx.voice.speakJa('ビート＆うごく アトリエ！ えをかいて うごかそう！');

  return () => {
    destroyed = true;
    stopStageAnim();
    stopBeat();
  };
}
