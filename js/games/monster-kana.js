import { HIRAGANA_LIST } from '../data.js';
import { evaluateTraceCoverage } from '../core.js';
import { el } from '../dom.js';
import { createMechSvg } from '../mech-svg.js';
import { bounceElement, burstAtElement, burstParticles, makeDraggable, shakeElement } from '../fx.js';

function pickDistinctItems(arr, count = 3) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, count);
}

export function mount(container, ctx) {
  let mode = 'feed'; // 'feed' | 'beam'
  let destroyed = false;
  let roundTimer = null;
  let dragCleanups = [];
  let guideRaf = null;
  let showPicker = false;

  // Feed state
  let feedChoices = [];
  let feedTarget = null;
  let feedLocked = false;
  let rexMouthOpen = false;
  let rexMood = 'idle';

  // Beam trace state
  let beamCharIdx = 0;
  let drawnStrokes = [];
  let currentStroke = null;
  let beamSolved = false;
  let guideProgress = 0;

  const root = el('div', { class: 'game-stage-shell' });
  const topSwitch = el('div', { class: 'game-mode-bar' });
  const stageArea = el('div', { class: 'game-play-arena' });
  root.append(topSwitch, stageArea);
  container.appendChild(root);

  function cleanupDrags() {
    dragCleanups.forEach((fn) => fn());
    dragCleanups = [];
  }

  function clearTimers() {
    if (roundTimer) {
      clearTimeout(roundTimer);
      roundTimer = null;
    }
    if (guideRaf) {
      cancelAnimationFrame(guideRaf);
      guideRaf = null;
    }
  }

  function renderModeBar() {
    topSwitch.replaceChildren(
      el('button', {
        type: 'button',
        class: `mode-pill-btn ${mode === 'feed' ? 'is-active' : ''}`,
        text: '🍖 もぐもぐ',
        onClick: () => {
          ctx.sound.playTap();
          mode = 'feed';
          setupFeedRound();
          renderModeBar();
          renderStage();
        },
      }),
      el('button', {
        type: 'button',
        class: `mode-pill-btn ${mode === 'beam' ? 'is-active' : ''}`,
        text: '⚔️ ビームなぞり',
        onClick: () => {
          ctx.sound.playTap();
          mode = 'beam';
          drawnStrokes = [];
          currentStroke = null;
          beamSolved = false;
          renderModeBar();
          renderStage();
        },
      })
    );
  }

  function setupFeedRound() {
    feedLocked = false;
    rexMouthOpen = false;
    rexMood = 'idle';
    feedChoices = pickDistinctItems(HIRAGANA_LIST, 3);
    feedTarget = feedChoices[Math.floor(Math.random() * feedChoices.length)];
    ctx.voice.speakJa(`『${feedTarget.char}』の ${feedTarget.word} を たべさせて！`);
  }

  function renderFeedStage() {
    cleanupDrags();
    if (!feedTarget) setupFeedRound();

    const state = ctx.getState() || {};
    const stage = el('div', { class: 'kana-feed-stage' });

    // ターゲットおねだり吹き出し（特大文字＋絵＋スピーカーのみ）
    const orderBubble = el('button', {
      type: 'button',
      class: 'giant-target-bubble',
      'aria-label': `${feedTarget.char} を きく`,
      onClick: () => {
        ctx.sound.playTap();
        ctx.voice.speakJa(`『${feedTarget.char}』！ ${feedTarget.word}！`);
      },
    }, [
      el('span', { class: 'target-char-hero', text: feedTarget.char }),
      el('span', { class: 'target-emoji-hero', text: feedTarget.emoji }),
      el('span', { class: 'target-sound-badge', text: '🔊' }),
    ]);

    // 巨大レックスドロップゾーン
    const mouthZone = el('div', { class: 'rex-mouth-zone' });
    const renderRex = () => {
      mouthZone.replaceChildren(
        createMechSvg({
          stage: Math.max(2, ctx.getEvoLevel?.() || 2),
          colorId: state.mechColor || 'crimson',
          partId: state.mechPart || 'none',
          mood: rexMood,
          mouthOpen: rexMouthOpen,
          size: 176,
        })
      );
    };
    renderRex();

    // ドラッグ案内ハンド
    const guideHand = el('div', { class: 'drag-guide-hand', text: '👆', 'aria-hidden': 'true' });

    // 下段：3つの大きな食べ物カプセル
    const tray = el('div', { class: 'food-capsule-tray' });

    feedChoices.forEach((choice) => {
      const cap = el('div', {
        class: 'food-capsule',
        role: 'button',
        tabindex: '0',
        'aria-label': `${choice.char} ${choice.word}`,
      }, [
        el('div', { class: 'food-cap-emoji', text: choice.emoji }),
        el('div', { class: 'food-cap-char', text: choice.char }),
      ]);

      // キーボード・単発タップでも音が鳴って誘導が見える
      cap.addEventListener('click', () => {
        if (feedLocked) return;
        ctx.sound.playPop();
        ctx.voice.speakJa(`${choice.char}！ ${choice.word}！ レックスの おくちに いれてね！`);
        bounceElement(cap);
      });

      const destroyDrag = makeDraggable(cap, {
        getTargets: () => [{ id: 'rex', el: mouthZone, radius: 130 }],
        snapRadius: 130,
        enabled: () => !feedLocked,
        onStart: () => {
          ctx.sound.playTap();
          guideHand.classList.add('is-hidden');
        },
        onNear: () => {
          rexMouthOpen = true;
          mouthZone.classList.add('is-hungry-near');
          renderRex();
        },
        onLeave: () => {
          if (!feedLocked) {
            rexMouthOpen = false;
            mouthZone.classList.remove('is-hungry-near');
            renderRex();
          }
        },
        onDrop: (_, droppedEl, pt) => {
          if (feedLocked) return false;
          if (choice.char === feedTarget.char) {
            feedLocked = true;
            droppedEl.style.opacity = '0';
            droppedEl.style.pointerEvents = 'none';
            rexMouthOpen = false;
            rexMood = 'roar';
            mouthZone.classList.remove('is-hungry-near');
            renderRex();
            bounceElement(mouthZone);
            ctx.sound.playChomp();
            setTimeout(() => ctx.sound.playRoar(), 180);
            burstParticles(pt.x, pt.y, { count: 34, preset: 'fire' });
            burstAtElement(mouthZone, { count: 28, preset: 'stars' });
            ctx.voice.speakJa(`もぐもぐ！ ${choice.char} の ${choice.word}！ おいしい！`);
            ctx.awardSuccess(20, {
              dockId: 'monster-kana',
              missionId: 'm_kana',
              hiraganaChar: choice.char,
            });
            roundTimer = setTimeout(() => {
              if (!destroyed && mode === 'feed') {
                setupFeedRound();
                renderFeedStage();
              }
            }, 1350);
            return true;
          }
          // 不正解：コミカルに弾み返る（叱らない）
          rexMouthOpen = false;
          mouthZone.classList.remove('is-hungry-near');
          renderRex();
          shakeElement(mouthZone);
          ctx.sound.playBoing();
          ctx.voice.speakJa(`ぷっぷー！ それは ${choice.char} だよ！ 『${feedTarget.char}』を さがそう！`);
          return false;
        },
      });
      dragCleanups.push(destroyDrag);
      tray.appendChild(cap);
    });

    stage.append(orderBubble, mouthZone, guideHand, tray);
    stageArea.replaceChildren(stage);
  }

  function renderBeamStage() {
    cleanupDrags();
    clearTimers();

    const item = HIRAGANA_LIST[beamCharIdx];
    const stage = el('div', { class: 'beam-trace-stage' });

    const topBar = el('div', { class: 'beam-hud-row' }, [
      el('button', {
        type: 'button',
        class: 'btn-toy btn-cyan mini-toy-btn',
        text: `🔊 ${item.emoji} ${item.word}`,
        onClick: () => {
          ctx.sound.playTap();
          ctx.voice.speakJa(`${item.char}！ ${item.word}`);
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-slate mini-toy-btn',
        text: '🔡 えらぶ',
        onClick: () => {
          ctx.sound.playTap();
          showPicker = !showPicker;
          renderBeamStage();
        },
      }),
      el('div', { class: `beam-monster-target ${beamSolved ? 'is-blasted' : ''}`, text: beamSolved ? '💥' : '👾' }),
    ]);

    if (showPicker) {
      const grid = el('div', { class: 'kana-mini-drawer' });
      HIRAGANA_LIST.forEach((h, idx) => {
        grid.appendChild(
          el('button', {
            type: 'button',
            class: `kana-pick-btn ${idx === beamCharIdx ? 'is-current' : ''}`,
            text: h.char,
            onClick: () => {
              ctx.sound.playTap();
              beamCharIdx = idx;
              drawnStrokes = [];
              beamSolved = false;
              showPicker = false;
              renderBeamStage();
              ctx.voice.speakJa(`${h.char}！ ${h.word}`);
            },
          })
        );
      });
      stage.append(topBar, grid);
      stageArea.replaceChildren(stage);
      return;
    }

    const canvasWrap = el('div', { class: 'beam-canvas-wrap' });
    const canvas = el('canvas', { class: 'beam-canvas', 'aria-label': `ひらがな ${item.char}` });
    canvasWrap.appendChild(canvas);

    const actions = el('div', { class: 'btn-row' }, [
      el('button', {
        type: 'button',
        class: 'btn-toy btn-slate mini-toy-btn',
        text: '🧹 やりなおす',
        onClick: () => {
          ctx.sound.playTap();
          drawnStrokes = [];
          currentStroke = null;
          beamSolved = false;
          renderBeamStage();
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-emerald mini-toy-btn',
        text: '⚡ ビーム！',
        onClick: () => checkBeamTrace(true),
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-gold mini-toy-btn',
        text: '▶ つぎ',
        onClick: () => {
          ctx.sound.playTap();
          beamCharIdx = (beamCharIdx + 1) % HIRAGANA_LIST.length;
          drawnStrokes = [];
          currentStroke = null;
          beamSolved = false;
          renderBeamStage();
          const nxt = HIRAGANA_LIST[beamCharIdx];
          ctx.voice.speakJa(`${nxt.char}！ ${nxt.word}`);
        },
      }),
    ]);

    stage.append(topBar, canvasWrap, actions);
    stageArea.replaceChildren(stage);

    const ctx2d = canvas.getContext('2d');
    let cssSize = 260;

    function resize() {
      const availW = Math.floor((canvasWrap.clientWidth || 280) - 16);
      const availH = Math.floor((stageArea.clientHeight || 420) - 125);
      cssSize = Math.max(190, Math.min(340, availW, Math.max(210, availH)));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssSize * dpr);
      canvas.height = Math.round(cssSize * dpr);
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function draw() {
      if (!ctx2d || destroyed) return;
      const s = cssSize;
      ctx2d.clearRect(0, 0, s, s);

      // お手本文字
      ctx2d.save();
      ctx2d.fillStyle = 'rgba(16, 32, 48, 0.14)';
      ctx2d.font = `800 ${Math.round(s * 0.72)}px "Hiragino Maru Gothic ProN", "Yu Gothic UI", sans-serif`;
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(item.char, s / 2, s * 0.52);
      ctx2d.restore();

      // ガイド線
      item.strokes.forEach((stroke, idx) => {
        ctx2d.save();
        ctx2d.strokeStyle = 'rgba(0, 140, 210, 0.35)';
        ctx2d.lineWidth = 5;
        ctx2d.setLineDash([6, 6]);
        ctx2d.lineCap = 'round';
        ctx2d.beginPath();
        stroke.forEach(([nx, ny], pIdx) => {
          if (pIdx === 0) ctx2d.moveTo(nx * s, ny * s);
          else ctx2d.lineTo(nx * s, ny * s);
        });
        ctx2d.stroke();
        ctx2d.restore();

        const [sx, sy] = stroke[0];
        ctx2d.save();
        ctx2d.fillStyle = idx === 0 ? '#FF4757' : '#0088CC';
        ctx2d.beginPath();
        ctx2d.arc(sx * s, sy * s, 11, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.fillStyle = '#FFFFFF';
        ctx2d.font = 'bold 12px sans-serif';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText(String(idx + 1), sx * s, sy * s + 0.5);
        ctx2d.restore();
      });

      // 動く光るナビゲーションドット（1画目ガイド）
      if (!beamSolved && drawnStrokes.length === 0 && !currentStroke && item.strokes[0]?.length >= 2) {
        const st = item.strokes[0];
        const segFloat = guideProgress * (st.length - 1);
        const idx = Math.min(st.length - 2, Math.floor(segFloat));
        const frac = segFloat - idx;
        const gx = (st[idx][0] + (st[idx + 1][0] - st[idx][0]) * frac) * s;
        const gy = (st[idx][1] + (st[idx + 1][1] - st[idx][1]) * frac) * s;
        ctx2d.save();
        ctx2d.fillStyle = 'rgba(255, 184, 0, 0.9)';
        ctx2d.beginPath();
        ctx2d.arc(gx, gy, 10, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.font = '18px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
        ctx2d.fillText('👆', gx - 4, gy + 20);
        ctx2d.restore();
      }

      // レーザー軌跡
      const all = currentStroke ? [...drawnStrokes, currentStroke] : drawnStrokes;
      for (const stroke of all) {
        if (stroke.length < 2) continue;
        ctx2d.save();
        ctx2d.lineCap = 'round';
        ctx2d.lineJoin = 'round';
        ctx2d.strokeStyle = 'rgba(0, 210, 255, 0.45)';
        ctx2d.lineWidth = 18;
        ctx2d.beginPath();
        stroke.forEach(([nx, ny], i) => {
          if (i === 0) ctx2d.moveTo(nx * s, ny * s);
          else ctx2d.lineTo(nx * s, ny * s);
        });
        ctx2d.stroke();
        ctx2d.strokeStyle = '#00A8FF';
        ctx2d.lineWidth = 9;
        ctx2d.stroke();
        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.lineWidth = 3;
        ctx2d.stroke();
        ctx2d.restore();
      }
    }

    function animateGuide() {
      if (destroyed || mode !== 'beam' || beamSolved || drawnStrokes.length > 0) {
        guideRaf = null;
        return;
      }
      const reduced = (ctx.getState() || {}).reducedMotion;
      guideProgress = (guideProgress + (reduced ? 0.004 : 0.014)) % 1;
      draw();
      guideRaf = requestAnimationFrame(animateGuide);
    }

    function checkBeamTrace(manual = false) {
      if (beamSolved) return;
      const res = evaluateTraceCoverage(item.strokes, drawnStrokes.flat(), 0.18);
      if (res.passed) {
        beamSolved = true;
        ctx.sound.playTurbo();
        const monsterEl = topBar.querySelector('.beam-monster-target');
        if (monsterEl) {
          monsterEl.textContent = '💥';
          monsterEl.classList.add('is-blasted');
          burstAtElement(monsterEl, { count: 36, preset: 'fire' });
        }
        burstAtElement(canvas, { count: 28, preset: 'laser' });
        ctx.voice.speakJa(`${item.char} ビーム！ ドカーン！ すごいぞ！`);
        ctx.awardSuccess(20, {
          dockId: 'monster-kana',
          missionId: 'm_kana',
          hiraganaChar: item.char,
        });
        roundTimer = setTimeout(() => {
          if (!destroyed && mode === 'beam') {
            beamCharIdx = (beamCharIdx + 1) % HIRAGANA_LIST.length;
            drawnStrokes = [];
            currentStroke = null;
            beamSolved = false;
            renderBeamStage();
          }
        }, 1450);
      } else if (manual) {
        ctx.sound.playBoing();
        ctx.voice.speakJa('あかい 1 から せんを なぞって ビームを だそう！');
      }
    }

    function getPt(e) {
      const r = canvas.getBoundingClientRect();
      return [
        Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1))),
        Math.max(0, Math.min(1, (e.clientY - r.top) / (r.height || 1))),
      ];
    }

    let sparkThrottle = 0;
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ctx.sound.playLaser();
      canvas.setPointerCapture?.(e.pointerId);
      currentStroke = [getPt(e)];
      draw();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!currentStroke) return;
      e.preventDefault();
      currentStroke.push(getPt(e));
      draw();
      const now = Date.now();
      if (now - sparkThrottle > 90) {
        sparkThrottle = now;
        burstParticles(e.clientX, e.clientY, { count: 4, preset: 'laser' });
      }
    });

    const endStroke = (e) => {
      if (e && canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!currentStroke) return;
      if (currentStroke.length >= 2) drawnStrokes.push(currentStroke);
      currentStroke = null;
      draw();
      checkBeamTrace(false);
    };
    const cancelStroke = (e) => {
      if (e && canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (currentStroke && currentStroke.length >= 2) drawnStrokes.push(currentStroke);
      currentStroke = null;
      draw();
    };
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', cancelStroke);
    canvas.addEventListener('lostpointercapture', endStroke);

    resize();
    guideRaf = requestAnimationFrame(animateGuide);
  }

  function renderStage() {
    if (mode === 'feed') renderFeedStage();
    else renderBeamStage();
  }

  setupFeedRound();
  renderModeBar();
  renderStage();

  return () => {
    destroyed = true;
    clearTimers();
    cleanupDrags();
  };
}
