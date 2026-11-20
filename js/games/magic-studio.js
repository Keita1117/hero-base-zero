import { el, isSafeDataImageUrl } from '../dom.js';
import { bounceElement, burstAtElement, burstParticles } from '../fx.js';

const PEN_COLORS = [
  { id: 'red', label: 'あか', hex: '#FF4757' },
  { id: 'blue', label: 'あお', hex: '#00A8FF' },
  { id: 'gold', label: 'きいろ', hex: '#FFB800' },
  { id: 'green', label: 'みどり', hex: '#1DD1A1' },
  { id: 'purple', label: 'むらさき', hex: '#A55EEA' },
  { id: 'rainbow', label: 'にじ', hex: 'rainbow' },
];

const STAMPS = ['🦖', '🚀', '🚒', '⭐', '⚡', '👑'];

const BAND_MONSTERS = [
  { id: 0, name: 'ドンゴン', icon: '🦖', role: '🥁', color: '#FF4757' },
  { id: 1, name: 'ビリロボ', icon: '🤖', role: '⚡', color: '#FFB800' },
  { id: 2, name: 'ピコUFO', icon: '🛸', role: '🎹', color: '#00D2FF' },
  { id: 3, name: 'ファイヤードラ', icon: '🐉', role: '🎺', color: '#1DD1A1' },
];

const FIREWORK_KEYS = [
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
  let mode = 'alive'; // 'alive' | 'band'
  let destroyed = false;

  // Alive drawing state
  let drawPhase = 'edit'; // 'edit' | 'play'
  let penColor = '#FF4757';
  let activeStamp = null;
  let strokes = [];
  let currentStroke = null;
  let stamps = [];
  let spriteUrl = '';
  let stageRaf = null;
  let savedDrawings = [];
  let hueStep = 0;

  // Monster band state
  const activeMonsters = [true, false, true, false];
  let bandTimer = null;
  let bandBeat = 0;

  const root = el('div', { class: 'game-stage-shell' });
  const topSwitch = el('div', { class: 'game-mode-bar' });
  const stageArea = el('div', { class: 'game-play-arena' });
  root.append(topSwitch, stageArea);
  container.appendChild(root);

  function stopAnim() {
    if (stageRaf) {
      cancelAnimationFrame(stageRaf);
      stageRaf = null;
    }
  }

  function stopBand() {
    if (bandTimer) {
      clearInterval(bandTimer);
      bandTimer = null;
    }
  }

  function renderModeBar() {
    topSwitch.replaceChildren(
      el('button', {
        type: 'button',
        class: `mode-pill-btn ${mode === 'alive' ? 'is-active' : ''}`,
        text: '🎨 いきもの おえかき',
        onClick: () => {
          ctx.sound.playTap();
          stopBand();
          mode = 'alive';
          renderModeBar();
          renderStage();
        },
      }),
      el('button', {
        type: 'button',
        class: `mode-pill-btn ${mode === 'band' ? 'is-active' : ''}`,
        text: '🥁 モンスター バンド',
        onClick: () => {
          ctx.sound.playTap();
          stopAnim();
          mode = 'band';
          renderModeBar();
          renderStage();
        },
      })
    );
  }

  function buildAliveSprite(sourceCanvas) {
    const out = document.createElement('canvas');
    out.width = sourceCanvas.width;
    out.height = sourceCanvas.height;
    const c = out.getContext('2d');
    c.drawImage(sourceCanvas, 0, 0);

    // 描いた絵の上部に自動でかわいい目玉👀を付けて生き物化！
    const cx = out.width * 0.5;
    const cy = out.height * 0.36;
    const eyeR = Math.max(14, out.width * 0.045);
    const offset = eyeR * 1.35;

    for (const dx of [-offset, offset]) {
      c.save();
      c.fillStyle = '#FFFFFF';
      c.strokeStyle = '#0D1B2A';
      c.lineWidth = Math.max(3, eyeR * 0.22);
      c.beginPath();
      c.arc(cx + dx, cy, eyeR, 0, Math.PI * 2);
      c.fill();
      c.stroke();

      c.fillStyle = '#0D1B2A';
      c.beginPath();
      c.arc(cx + dx + eyeR * 0.15, cy, eyeR * 0.48, 0, Math.PI * 2);
      c.fill();

      c.fillStyle = '#FFFFFF';
      c.beginPath();
      c.arc(cx + dx, cy - eyeR * 0.22, eyeR * 0.18, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    return out.toDataURL('image/png');
  }

  function renderDrawEdit() {
    stopAnim();
    const stage = el('div', { class: 'alive-draw-stage' });

    const paletteRow = el('div', { class: 'palette-bar' });
    PEN_COLORS.forEach((c) => {
      paletteRow.appendChild(
        el('button', {
          type: 'button',
          class: `color-dot-btn ${penColor === c.hex && !activeStamp ? 'is-active' : ''} ${c.hex === 'rainbow' ? 'is-rainbow' : ''}`,
          style: c.hex === 'rainbow' ? {} : { backgroundColor: c.hex },
          'aria-label': c.label,
          onClick: () => {
            ctx.sound.playTap();
            activeStamp = null;
            penColor = c.hex;
            renderDrawEdit();
          },
        })
      );
    });
    STAMPS.forEach((st) => {
      paletteRow.appendChild(
        el('button', {
          type: 'button',
          class: `stamp-btn ${activeStamp === st ? 'is-active' : ''}`,
          text: st,
          'aria-label': `スタンプ ${st}`,
          onClick: () => {
            ctx.sound.playTap();
            activeStamp = activeStamp === st ? null : st;
            renderDrawEdit();
          },
        })
      );
    });

    const canvasWrap = el('div', { class: 'alive-canvas-wrap' });
    const canvas = el('canvas', { class: 'alive-canvas', 'aria-label': 'おえかき ステージ' });
    canvasWrap.appendChild(canvas);

    const actions = el('div', { class: 'btn-row' }, [
      el('button', {
        type: 'button',
        class: 'btn-toy btn-slate mini-toy-btn',
        text: '🧹 けす',
        onClick: () => {
          ctx.sound.playTap();
          strokes = [];
          stamps = [];
          redraw();
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-emerald',
        text: '✨ いのちを ふきこむ！',
        onClick: () => {
          if (strokes.length === 0 && stamps.length === 0) {
            ctx.sound.playBoing();
            ctx.voice.speakJa('なにか かいてから おしてね！');
            return;
          }
          ctx.sound.playTransform();
          spriteUrl = buildAliveSprite(canvas);
          drawPhase = 'play';
          ctx.awardSuccess(20, { dockId: 'magic-studio', missionId: 'm_studio' });
          renderDrawPlay();
        },
      }),
    ]);

    stage.append(paletteRow, canvasWrap, actions);

    if (savedDrawings.length > 0) {
      const strip = el('div', { class: 'saved-drawings-strip' });
      savedDrawings.slice(0, 5).forEach((item) => {
        if (!isSafeDataImageUrl(item.dataUrl)) return;
        strip.appendChild(
          el('button', {
            type: 'button',
            class: 'saved-drawing-thumb',
            onClick: () => {
              ctx.sound.playTap();
              spriteUrl = item.dataUrl;
              drawPhase = 'play';
              renderDrawPlay();
            },
          }, [el('img', { src: item.dataUrl, alt: 'おえかき' })])
        );
      });
      stage.appendChild(strip);
    }

    stageArea.replaceChildren(stage);

    const ctx2d = canvas.getContext('2d');
    let cw = 320;
    let ch = 220;

    function resize() {
      const wAvail = Math.floor((canvasWrap.clientWidth || 300) - 16);
      const hAvail = Math.floor((stageArea.clientHeight || 400) - 175);
      cw = Math.max(200, Math.min(520, wAvail));
      ch = Math.max(150, Math.min(280, Math.round(cw * 0.62), Math.max(160, hAvail)));
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
      for (const s of [...strokes, ...(currentStroke ? [currentStroke] : [])]) {
        if (s.points.length < 2) continue;
        ctx2d.save();
        ctx2d.lineCap = 'round';
        ctx2d.lineJoin = 'round';
        ctx2d.lineWidth = 12;
        if (s.color === 'rainbow') {
          for (let i = 1; i < s.points.length; i += 1) {
            ctx2d.strokeStyle = `hsl(${(s.hue + i * 14) % 360}, 92%, 56%)`;
            ctx2d.beginPath();
            ctx2d.moveTo(s.points[i - 1][0] * cw, s.points[i - 1][1] * ch);
            ctx2d.lineTo(s.points[i][0] * cw, s.points[i][1] * ch);
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
      for (const st of stamps) {
        ctx2d.save();
        ctx2d.font = '42px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText(st.char, st.x * cw, st.y * ch);
        ctx2d.restore();
      }
    }

    function getPos(e) {
      const r = canvas.getBoundingClientRect();
      return [
        Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1))),
        Math.max(0, Math.min(1, (e.clientY - r.top) / (r.height || 1))),
      ];
    }

    let sparkClock = 0;
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const [nx, ny] = getPos(e);
      if (activeStamp) {
        stamps.push({ char: activeStamp, x: nx, y: ny });
        ctx.sound.playPop();
        burstParticles(e.clientX, e.clientY, { count: 14, preset: 'stars' });
        redraw();
        return;
      }
      canvas.setPointerCapture?.(e.pointerId);
      hueStep = (hueStep + 45) % 360;
      currentStroke = { color: penColor, hue: hueStep, points: [[nx, ny], [nx + 0.002, ny + 0.002]] };
      redraw();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!currentStroke) return;
      e.preventDefault();
      currentStroke.points.push(getPos(e));
      redraw();
      const now = Date.now();
      if (now - sparkClock > 90) {
        sparkClock = now;
        burstParticles(e.clientX, e.clientY, { count: 4, preset: 'stars' });
      }
    });

    const endStroke = (e) => {
      if (e && canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!currentStroke) return;
      strokes.push(currentStroke);
      currentStroke = null;
      redraw();
    };
    const cancelStroke = (e) => {
      if (e && canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      currentStroke = null;
      redraw();
    };
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', cancelStroke);
    canvas.addEventListener('lostpointercapture', cancelStroke);

    resize();
  }

  function renderDrawPlay() {
    stopAnim();
    const stage = el('div', { class: 'alive-play-stage' });
    const playground = el('div', { class: 'live-space-stage' });
    const safeUrl = isSafeDataImageUrl(spriteUrl) ? spriteUrl : '';
    const creature = el('button', {
      type: 'button',
      class: 'live-sprite-btn',
      'aria-label': 'うごく いきもの',
    }, [safeUrl ? el('img', { src: safeUrl, alt: 'うごく いきもの', class: 'live-sprite-img' }) : null]);

    playground.appendChild(creature);

    let px = 40;
    let py = 50;
    let vx = 2.1;
    let vy = 1.6;

    creature.addEventListener('click', () => {
      ctx.sound.playCombo();
      vy = -4.5;
      vx = (Math.random() > 0.5 ? 1 : -1) * (2.0 + Math.random() * 1.8);
      burstAtElement(creature, { count: 22, preset: 'stars' });
      ctx.voice.speakJa('ぴょーん！ うまれたよ！');
    });

    const controls = el('div', { class: 'btn-row' }, [
      el('button', {
        type: 'button',
        class: 'btn-toy btn-cyan mini-toy-btn',
        text: '✏️ かきなおす',
        onClick: () => {
          ctx.sound.playTap();
          drawPhase = 'edit';
          renderDrawEdit();
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-gold mini-toy-btn',
        text: '💾 ほぞん',
        onClick: async () => {
          ctx.sound.playSuccess();
          await ctx.storage.saveMediaItem('drawings', { dataUrl: spriteUrl });
          savedDrawings = await ctx.storage.listMediaItems('drawings');
          burstAtElement(creature, { count: 26, preset: 'confetti' });
          ctx.voice.speakJa('ほぞん したよ！');
        },
      }),
    ]);

    stage.append(playground, controls);
    stageArea.replaceChildren(stage);

    const animate = () => {
      if (destroyed || mode !== 'alive' || drawPhase !== 'play') {
        stageRaf = null;
        return;
      }
      const reduced = (ctx.getState() || {}).reducedMotion;
      const sw = playground.clientWidth || 300;
      const sh = playground.clientHeight || 240;
      const w = creature.offsetWidth || 120;
      const h = creature.offsetHeight || 96;

      if (!reduced) {
        px += vx;
        py += vy;
        vy += 0.08;
        if (px <= 6) { px = 6; vx = Math.abs(vx); }
        else if (px >= sw - w - 6) { px = Math.max(6, sw - w - 6); vx = -Math.abs(vx); }
        if (py <= 6) { py = 6; vy = Math.abs(vy); }
        else if (py >= sh - h - 6) { py = Math.max(6, sh - h - 6); vy = -(2.4 + Math.random() * 1.4); }
        creature.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) rotate(${(vx * 3).toFixed(1)}deg)`;
      } else {
        creature.style.transform = `translate3d(${Math.max(6, (sw - w) / 2)}px, ${Math.max(6, (sh - h) / 2)}px, 0)`;
      }
      stageRaf = requestAnimationFrame(animate);
    };
    stageRaf = requestAnimationFrame(animate);
  }

  function startBandLoop() {
    stopBand();
    bandTimer = setInterval(() => {
      if (destroyed || mode !== 'band') {
        stopBand();
        return;
      }
      const step = bandBeat % 8;
      if (activeMonsters[0] && (step === 0 || step === 4)) ctx.sound.playBeatStep(0);
      if (activeMonsters[1] && (step === 2 || step === 6)) ctx.sound.playBeatStep(1);
      if (activeMonsters[2] && (step % 2 === 0)) ctx.sound.playBeatStep(2);
      if (activeMonsters[3] && (step === 3 || step === 7)) ctx.sound.playBeatStep(3);

      const cards = stageArea.querySelectorAll('.band-monster-btn');
      cards.forEach((btn, idx) => {
        if (activeMonsters[idx] && step % 2 === 0) bounceElement(btn);
      });
      bandBeat += 1;
    }, 260);
  }

  function renderBandStage() {
    stopBand();
    const stage = el('div', { class: 'band-stage' });

    const monstersGrid = el('div', { class: 'band-monsters-grid' });
    BAND_MONSTERS.forEach((m, idx) => {
      const on = activeMonsters[idx];
      const btn = el('button', {
        type: 'button',
        class: `band-monster-btn ${on ? 'is-playing' : ''}`,
        style: { borderColor: on ? m.color : '' },
        onClick: () => {
          ctx.sound.unlock();
          activeMonsters[idx] = !activeMonsters[idx];
          ctx.sound.playBeatStep(idx);
          burstAtElement(btn, { count: 16, preset: 'stars' });
          renderBandStage();
        },
      }, [
        el('span', { class: 'band-monster-emoji', text: m.icon }),
        el('span', { class: 'band-monster-role', text: `${m.role} ${on ? '🎵' : '💤'}` }),
      ]);
      monstersGrid.appendChild(btn);
    });

    const pianoRow = el('div', { class: 'firework-piano-row' });
    FIREWORK_KEYS.forEach((k) => {
      const keyBtn = el('button', {
        type: 'button',
        class: 'firework-key-btn',
        style: { backgroundColor: k.color },
        text: k.label,
        onPointerdown: (e) => {
          e.preventDefault();
          ctx.sound.playNote(k.freq);
          burstAtElement(keyBtn, { count: 18, preset: 'confetti' });
          bounceElement(keyBtn);
        },
      });
      pianoRow.appendChild(keyBtn);
    });

    stage.append(monstersGrid, pianoRow);
    stageArea.replaceChildren(stage);
    if (activeMonsters.some(Boolean)) startBandLoop();
  }

  function renderStage() {
    if (mode === 'alive') {
      if (drawPhase === 'play' && spriteUrl) renderDrawPlay();
      else renderDrawEdit();
    } else {
      renderBandStage();
    }
  }

  ctx.storage.listMediaItems('drawings').then((list) => {
    if (destroyed) return;
    savedDrawings = Array.isArray(list) ? list : [];
    if (mode === 'alive' && drawPhase === 'edit') renderDrawEdit();
  }).catch(() => {});

  renderModeBar();
  renderStage();
  ctx.voice.speakJa('うごく おえかき と モンスター バンド！');

  return () => {
    destroyed = true;
    stopAnim();
    stopBand();
  };
}
