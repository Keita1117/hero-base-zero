import { HIRAGANA_LIST, WORD_PUZZLES } from '../data.js';
import { evaluateTraceCoverage } from '../core.js';
import { el } from '../dom.js';

function pickRandom(arr, excludeItem = null) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const pool = excludeItem ? arr.filter((x) => x !== excludeItem) : arr;
  return pool[Math.floor(Math.random() * pool.length)] || arr[0];
}

export function mount(container, ctx) {
  let activeTab = 'trace';
  let currentCharIdx = 0;
  let showPicker = false;
  let destroyed = false;
  let animFrameId = null;
  let roundTimer = null;

  function scheduleRound(fn, ms) {
    if (roundTimer) clearTimeout(roundTimer);
    roundTimer = setTimeout(() => {
      roundTimer = null;
      fn();
    }, ms);
  }

  // Trace state
  let drawnStrokes = [];
  let currentStroke = null;
  let traceSolved = false;
  let particles = [];

  // Radar state
  let radarTarget = null;
  let radarOptions = [];
  let radarLocked = false;
  let radarHintVisible = false;

  // Word puzzle state
  let puzzleTarget = WORD_PUZZLES[0];
  let puzzleTiles = [];
  let puzzlePicked = [];
  let puzzleSolved = false;

  const root = el('div', { class: 'dock-shell hiragana-dock' });
  const tabsBar = el('div', { class: 'sub-tabs', role: 'tablist', 'aria-label': 'ひらがな モード' });
  const body = el('div', { class: 'dock-body' });
  root.append(tabsBar, body);
  container.appendChild(root);

  const tabs = [
    { id: 'trace', label: '⚡ なぞりレーザー' },
    { id: 'radar', label: '🎯 ことばレーダー' },
    { id: 'word', label: '🧩 もじがったい' },
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
            renderTabs();
            renderActiveMode();
          },
        })
      )
    );
  }

  function renderTraceMode() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    const item = HIRAGANA_LIST[currentCharIdx];
    const clearedSet = new Set((ctx.getState() || {}).clearedHiragana || []);

    const layout = el('div', { class: 'trace-layout' });

    const infoCard = el('div', { class: 'panel-card trace-info' });
    const headerRow = el('div', { class: 'trace-char-row' }, [
      el('div', { class: 'big-char-badge', text: item.char }),
      el('div', { class: 'trace-word-box' }, [
        el('div', { class: 'trace-emoji', text: item.emoji, 'aria-hidden': 'true' }),
        el('div', { class: 'trace-word', text: item.word }),
        el('div', { class: 'trace-hint', text: item.hint }),
      ]),
    ]);

    const voiceBtn = el('button', {
      type: 'button',
      class: 'btn-toy btn-cyan',
      text: '🔊 おとを きく',
      onClick: () => {
        ctx.sound.playTap();
        ctx.voice.speakJa(`${item.char}！ ${item.word}！`);
      },
    });

    const togglePickerBtn = el('button', {
      type: 'button',
      class: 'btn-toy btn-slate',
      text: showPicker ? '▲ いちらんを とじる' : '🔡 50おん えらぶ',
      onClick: () => {
        ctx.sound.playTap();
        showPicker = !showPicker;
        renderTraceMode();
      },
    });

    const progressBadge = el('div', {
      class: 'stat-pill',
      text: `クリアした もじ：${clearedSet.size} / ${HIRAGANA_LIST.length}`,
    });

    infoCard.append(headerRow, el('div', { class: 'btn-row' }, [voiceBtn, togglePickerBtn]), progressBadge);

    if (showPicker) {
      const grid = el('div', { class: 'kana-picker-grid' });
      HIRAGANA_LIST.forEach((h, idx) => {
        const done = clearedSet.has(h.char);
        grid.appendChild(
          el('button', {
            type: 'button',
            class: `kana-pick-btn ${idx === currentCharIdx ? 'is-current' : ''} ${done ? 'is-done' : ''}`,
            text: h.char,
            onClick: () => {
              ctx.sound.playTap();
              currentCharIdx = idx;
              drawnStrokes = [];
              traceSolved = false;
              particles = [];
              showPicker = false;
              renderTraceMode();
              ctx.voice.speakJa(`${h.char}！ ${h.word}`);
            },
          })
        );
      });
      infoCard.appendChild(grid);
    }

    // Canvas Board
    const boardCard = el('div', { class: 'panel-card trace-board-card' });
    const statusText = el('div', {
      class: 'game-status-banner',
      text: traceSolved ? `✨ すごい！ 「${item.char}」 クリア！` : `「${item.char}」を ゆびで なぞろう！`,
    });

    const canvasWrap = el('div', { class: 'trace-canvas-wrap' });
    const canvas = el('canvas', { class: 'trace-canvas', 'aria-label': `ひらがな ${item.char} なぞりボード` });
    canvasWrap.appendChild(canvas);

    const checkBtn = el('button', {
      type: 'button',
      class: 'btn-toy btn-emerald',
      text: '⚡ レーザー はっしゃ！',
      onClick: () => verifyTrace(true),
    });
    const clearBtn = el('button', {
      type: 'button',
      class: 'btn-toy btn-slate',
      text: '🧹 けす',
      onClick: () => {
        ctx.sound.playTap();
        drawnStrokes = [];
        currentStroke = null;
        traceSolved = false;
        particles = [];
        statusText.textContent = `「${item.char}」を ゆびで なぞろう！`;
        drawCanvas();
      },
    });
    const nextBtn = el('button', {
      type: 'button',
      class: 'btn-toy btn-gold',
      text: '▶ つぎの もじ',
      onClick: () => {
        ctx.sound.playTap();
        currentCharIdx = (currentCharIdx + 1) % HIRAGANA_LIST.length;
        drawnStrokes = [];
        currentStroke = null;
        traceSolved = false;
        particles = [];
        renderTraceMode();
        const nxt = HIRAGANA_LIST[currentCharIdx];
        ctx.voice.speakJa(`${nxt.char}！ ${nxt.word}`);
      },
    });

    boardCard.append(statusText, canvasWrap, el('div', { class: 'btn-row' }, [clearBtn, checkBtn, nextBtn]));
    layout.append(infoCard, boardCard);
    body.replaceChildren(layout);

    const ctx2d = canvas.getContext('2d');
    let cssSize = 300;

    function resizeCanvas() {
      const innerW = Math.floor((canvasWrap.clientWidth || 280) - 20);
      cssSize = Math.max(200, Math.min(360, innerW));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssSize * dpr);
      canvas.height = Math.round(cssSize * dpr);
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCanvas();
    }

    function drawCanvas() {
      if (!ctx2d || destroyed) return;
      const s = cssSize;
      ctx2d.clearRect(0, 0, s, s);

      // 補助クロスライン
      ctx2d.save();
      ctx2d.strokeStyle = 'rgba(16, 32, 48, 0.12)';
      ctx2d.lineWidth = 2;
      ctx2d.setLineDash([6, 6]);
      ctx2d.beginPath();
      ctx2d.moveTo(s / 2, 12);
      ctx2d.lineTo(s / 2, s - 12);
      ctx2d.moveTo(12, s / 2);
      ctx2d.lineTo(s - 12, s / 2);
      ctx2d.stroke();
      ctx2d.restore();

      // お手本文字（薄いグレー）
      ctx2d.save();
      ctx2d.fillStyle = 'rgba(16, 32, 48, 0.14)';
      ctx2d.font = `700 ${Math.round(s * 0.72)}px "Hiragino Maru Gothic ProN", "Yu Gothic UI", "Meiryo", sans-serif`;
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(item.char, s / 2, s * 0.52);
      ctx2d.restore();

      // ストロークガイド点線と開始番号
      item.strokes.forEach((stroke, idx) => {
        ctx2d.save();
        ctx2d.strokeStyle = 'rgba(0, 140, 210, 0.35)';
        ctx2d.lineWidth = 4;
        ctx2d.setLineDash([7, 7]);
        ctx2d.lineCap = 'round';
        ctx2d.lineJoin = 'round';
        ctx2d.beginPath();
        stroke.forEach(([nx, ny], pIdx) => {
          const px = nx * s;
          const py = ny * s;
          if (pIdx === 0) ctx2d.moveTo(px, py);
          else ctx2d.lineTo(px, py);
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

      // ユーザーのレーザー線
      const allStrokes = currentStroke ? [...drawnStrokes, currentStroke] : drawnStrokes;
      for (const stroke of allStrokes) {
        if (stroke.length < 2) continue;
        ctx2d.save();
        ctx2d.lineCap = 'round';
        ctx2d.lineJoin = 'round';

        ctx2d.strokeStyle = 'rgba(0, 210, 255, 0.45)';
        ctx2d.lineWidth = Math.max(16, s * 0.06);
        ctx2d.beginPath();
        stroke.forEach(([nx, ny], i) => {
          if (i === 0) ctx2d.moveTo(nx * s, ny * s);
          else ctx2d.lineTo(nx * s, ny * s);
        });
        ctx2d.stroke();

        ctx2d.strokeStyle = '#00A8FF';
        ctx2d.lineWidth = Math.max(9, s * 0.032);
        ctx2d.stroke();

        ctx2d.strokeStyle = '#FFFFFF';
        ctx2d.lineWidth = 3;
        ctx2d.stroke();
        ctx2d.restore();
      }

      // クリア火花パーティクル
      if (particles.length > 0) {
        for (const p of particles) {
          ctx2d.save();
          ctx2d.globalAlpha = Math.max(0, p.life);
          ctx2d.fillStyle = p.color;
          ctx2d.beginPath();
          ctx2d.arc(p.x * s, p.y * s, p.r, 0, Math.PI * 2);
          ctx2d.fill();
          ctx2d.restore();
        }
      }
    }

    function spawnSparkles() {
      const colors = ['#FF4757', '#FFB800', '#00D2FF', '#1DD1A1'];
      particles = Array.from({ length: 28 }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.008 + Math.random() * 0.016;
        return {
          x: 0.5,
          y: 0.5,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 4 + Math.random() * 5,
          life: 1,
          color: colors[Math.floor(Math.random() * colors.length)],
        };
      });

      const tick = () => {
        if (destroyed || activeTab !== 'trace') return;
        let alive = false;
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.03;
          if (p.life > 0) alive = true;
        }
        drawCanvas();
        if (alive) {
          animFrameId = requestAnimationFrame(tick);
        } else {
          particles = [];
          drawCanvas();
        }
      };
      animFrameId = requestAnimationFrame(tick);
    }

    function verifyTrace(manual = false) {
      if (traceSolved) return;
      const allPts = drawnStrokes.flat();
      const res = evaluateTraceCoverage(item.strokes, allPts, 0.17);
      if (res.passed) {
        traceSolved = true;
        ctx.sound.playSuccess();
        ctx.voice.speakJa(`${item.char}！ ${item.word}！ だいせいこう！`);
        statusText.textContent = `✨ やったね！ 「${item.char}」 マスター！ +15⚡`;
        ctx.awardEnergy(15, {
          dockId: 'hiragana',
          missionId: 'm_hiragana_trace',
          hiraganaChar: item.char,
        });
        spawnSparkles();
      } else if (manual) {
        ctx.sound.playTryAgain();
        ctx.voice.speakJa(`あかい 1 の ところから せんに そって なぞってみよう！`);
        statusText.textContent = 'もうすこし！ ガイドの せんを なぞってみよう！';
      }
    }

    function getNormPoint(e) {
      const rect = canvas.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / (rect.width || 1)));
      const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / (rect.height || 1)));
      return [nx, ny];
    }

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ctx.sound.playLaser();
      canvas.setPointerCapture?.(e.pointerId);
      currentStroke = [getNormPoint(e)];
      drawCanvas();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!currentStroke) return;
      e.preventDefault();
      currentStroke.push(getNormPoint(e));
      drawCanvas();
    });

    const finishStroke = (e) => {
      if (e && canvas.hasPointerCapture?.(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      if (!currentStroke) return;
      if (currentStroke.length >= 2) {
        drawnStrokes.push(currentStroke);
      }
      currentStroke = null;
      drawCanvas();
      verifyTrace(false);
    };

    const cancelStroke = (e) => {
      if (e && canvas.hasPointerCapture?.(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      currentStroke = null;
      drawCanvas();
    };

    canvas.addEventListener('pointerup', finishStroke);
    canvas.addEventListener('pointercancel', cancelStroke);
    canvas.addEventListener('lostpointercapture', cancelStroke);

    resizeCanvas();
  }

  function setupRadarRound() {
    radarLocked = false;
    radarHintVisible = false;
    radarTarget = pickRandom(HIRAGANA_LIST);
    if (!radarTarget) return;
    const pool = [...HIRAGANA_LIST].filter((h) => h.char !== radarTarget.char).sort(() => Math.random() - 0.5);
    const opts = [radarTarget, ...pool.slice(0, 3)].sort(() => Math.random() - 0.5);
    radarOptions = opts;
    ctx.voice.speakJa(`『${radarTarget.char}』で はじまる ものを ロックオン！`);
  }

  function renderRadarMode() {
    if (!radarTarget) setupRadarRound();

    const wrap = el('div', { class: 'panel-card radar-card' });
    const prompt = el('div', {
      class: 'radar-prompt',
      text: `🎯 『${radarTarget.char}』で はじまる ものは どれ？`,
    });

    const voiceBtn = el('button', {
      type: 'button',
      class: 'btn-toy btn-cyan',
      text: '🔊 もういちど きく',
      onClick: () => {
        ctx.sound.playTap();
        ctx.voice.speakJa(`『${radarTarget.char}』で はじまる ものは どれかな？`);
      },
    });
    const hintBtn = el('button', {
      type: 'button',
      class: 'btn-toy btn-slate',
      text: radarHintVisible ? '💡 ヒント オン' : '💡 もじを みる',
      onClick: () => {
        ctx.sound.playTap();
        radarHintVisible = !radarHintVisible;
        renderRadarMode();
      },
    });

    const grid = el('div', { class: 'choice-grid-2x2' });
    const feedback = el('div', {
      class: 'game-status-banner',
      text: 'えを タップして ロックオンしよう！',
    });

    radarOptions.forEach((opt) => {
      const cardBtn = el('button', {
        type: 'button',
        class: 'choice-card-btn',
        onClick: () => {
          if (radarLocked) return;
          if (opt.char === radarTarget.char) {
            radarLocked = true;
            cardBtn.classList.add('is-correct');
            ctx.sound.playSuccess();
            ctx.voice.speakJa(`せいかい！ ${opt.char} の ${opt.word}！`);
            feedback.textContent = `✨ せいかい！ ${opt.word}！ +15⚡`;
            ctx.awardEnergy(15, {
              dockId: 'hiragana',
              missionId: 'm_hiragana_word',
            });
            scheduleRound(() => {
              if (!destroyed && activeTab === 'radar') {
                setupRadarRound();
                renderRadarMode();
              }
            }, 1300);
          } else {
            cardBtn.classList.add('is-wrong');
            ctx.sound.playTryAgain();
            ctx.voice.speakJa(`これは ${opt.word} だよ！ 『${radarTarget.char}』を さがそう！`);
            feedback.textContent = `これは 「${opt.word}」！ 『${radarTarget.char}』の つく ものだよ`;
          }
        },
      }, [
        el('span', { class: 'choice-emoji', text: opt.emoji, 'aria-hidden': 'true' }),
        el('span', {
          class: 'choice-label',
          text: radarHintVisible || radarLocked ? opt.word : '？？？',
        }),
      ]);
      grid.appendChild(cardBtn);
    });

    wrap.append(prompt, el('div', { class: 'btn-row' }, [voiceBtn, hintBtn]), grid, feedback);
    body.replaceChildren(wrap);
  }

  function setupWordPuzzle(item = null) {
    puzzleTarget = item || pickRandom(WORD_PUZZLES, puzzleTarget);
    puzzleSolved = false;
    puzzlePicked = [];

    const chars = Array.from(puzzleTarget.word);
    const extraPool = HIRAGANA_LIST.map((h) => h.char).filter((c) => !chars.includes(c)).sort(() => Math.random() - 0.5);
    const targetLen = Math.min(8, chars.length + 3);
    const tiles = [...chars, ...extraPool.slice(0, Math.max(0, targetLen - chars.length))];
    puzzleTiles = tiles
      .map((ch, idx) => ({ id: `${idx}_${ch}`, ch, used: false }))
      .sort(() => Math.random() - 0.5);

    ctx.voice.speakJa(`『${puzzleTarget.word}』を がったい させよう！`);
  }

  function renderWordMode() {
    if (!puzzleTiles.length) setupWordPuzzle();

    const card = el('div', { class: 'panel-card word-puzzle-card' });
    const hero = el('div', { class: 'puzzle-hero' }, [
      el('div', { class: 'puzzle-emoji', text: puzzleTarget.emoji, 'aria-hidden': 'true' }),
      el('div', { class: 'puzzle-hint-text', text: puzzleTarget.hint }),
    ]);

    const hearBtn = el('button', {
      type: 'button',
      class: 'btn-toy btn-cyan',
      text: '🔊 こたえを きく',
      onClick: () => {
        ctx.sound.playTap();
        ctx.voice.speakJa(puzzleTarget.word);
      },
    });

    const targetChars = Array.from(puzzleTarget.word);
    const slotsRow = el('div', { class: 'word-slots-row' });
    targetChars.forEach((_, idx) => {
      const picked = puzzlePicked[idx];
      slotsRow.appendChild(
        el('div', {
          class: `word-slot ${picked ? 'is-filled' : ''} ${puzzleSolved ? 'is-solved' : ''}`,
          text: picked ? picked.ch : '',
        })
      );
    });

    const status = el('div', {
      class: 'game-status-banner',
      text: puzzleSolved ? `✨ 「${puzzleTarget.word}」 かんせい！ +20⚡` : 'したの ブロックを じゅんばんに タップ！',
    });

    const tilesGrid = el('div', { class: 'word-tiles-grid' });
    puzzleTiles.forEach((tile) => {
      tilesGrid.appendChild(
        el('button', {
          type: 'button',
          class: `word-tile-btn ${tile.used ? 'is-used' : ''}`,
          disabled: tile.used || puzzleSolved ? 'true' : null,
          text: tile.ch,
          onClick: () => {
            if (tile.used || puzzleSolved) return;
            ctx.sound.playTap();
            tile.used = true;
            puzzlePicked.push(tile);

            if (puzzlePicked.length === targetChars.length) {
              const built = puzzlePicked.map((t) => t.ch).join('');
              if (built === puzzleTarget.word) {
                puzzleSolved = true;
                ctx.sound.playSuccess();
                ctx.voice.speakJa(`やったね！ ${puzzleTarget.word}！ かんせい！`);
                ctx.awardEnergy(20, {
                  dockId: 'hiragana',
                  missionId: 'm_hiragana_word',
                });
                renderWordMode();
                scheduleRound(() => {
                  if (!destroyed && activeTab === 'word') {
                    setupWordPuzzle();
                    renderWordMode();
                  }
                }, 1400);
                return;
              }
              ctx.sound.playTryAgain();
              ctx.voice.speakJa(`おしい！ ${puzzleTarget.word} に なるように ならべよう！`);
              renderWordMode();
              scheduleRound(() => {
                if (!destroyed && activeTab === 'word' && !puzzleSolved) {
                  puzzlePicked.forEach((t) => {
                    t.used = false;
                  });
                  puzzlePicked = [];
                  renderWordMode();
                }
              }, 700);
              return;
            }
            renderWordMode();
          },
        })
      );
    });

    const undoBtn = el('button', {
      type: 'button',
      class: 'btn-toy btn-slate',
      text: '↩️ 1つ もどす',
      onClick: () => {
        if (puzzleSolved || puzzlePicked.length === 0) return;
        ctx.sound.playTap();
        const last = puzzlePicked.pop();
        last.used = false;
        renderWordMode();
      },
    });
    const skipBtn = el('button', {
      type: 'button',
      class: 'btn-toy btn-gold',
      text: '🔀 つぎの ことば',
      onClick: () => {
        ctx.sound.playTap();
        setupWordPuzzle();
        renderWordMode();
      },
    });

    card.append(hero, hearBtn, slotsRow, status, tilesGrid, el('div', { class: 'btn-row' }, [undoBtn, skipBtn]));
    body.replaceChildren(card);
  }

  function renderActiveMode() {
    if (activeTab === 'trace') renderTraceMode();
    else if (activeTab === 'radar') renderRadarMode();
    else renderWordMode();
  }

  renderTabs();
  renderActiveMode();
  ctx.voice.speakJa(`ひらがな レーザーへ ようこそ！ 「${HIRAGANA_LIST[currentCharIdx].char}」を なぞってみよう！`);

  return () => {
    destroyed = true;
    if (roundTimer) clearTimeout(roundTimer);
    if (animFrameId) cancelAnimationFrame(animFrameId);
  };
}
