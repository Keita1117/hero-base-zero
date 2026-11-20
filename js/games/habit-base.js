import { DAILY_HABITS, HERO_STICKERS, MECH_COLORS, MECH_PARTS } from '../data.js';
import { classifyRgbColor, formatTimeRemaining, getEvolutionStage, getLocalDateKey } from '../core.js';
import { el, isSafeDataImageUrl } from '../dom.js';
import { createMechSvg } from '../mech-svg.js';
import { bounceElement, burstAtElement, burstParticles } from '../fx.js';

export function mount(container, ctx) {
  let mode = 'battle'; // 'battle' | 'diorama' | 'camera' | 'mech'
  let destroyed = false;
  let brushSeconds = 180;
  let brushTimer = null;
  let brushRunning = false;
  let germsLeft = 5;
  let stream = null;
  let activeVideoEl = null;
  let cameraState = 'idle';
  let scansCache = [];
  let lastScanMsg = '';

  const root = el('div', { class: 'game-stage-shell' });
  const topSwitch = el('div', { class: 'game-mode-bar' });
  const stageArea = el('div', { class: 'game-play-arena' });
  root.append(topSwitch, stageArea);
  container.appendChild(root);

  function stopBrush() {
    if (brushTimer) {
      clearInterval(brushTimer);
      brushTimer = null;
    }
    brushRunning = false;
  }

  function stopCamera() {
    if (activeVideoEl) {
      activeVideoEl.srcObject = null;
      activeVideoEl = null;
    }
    if (stream) {
      stream.getTracks().forEach((tr) => tr.stop());
      stream = null;
    }
    if (cameraState === 'live') cameraState = 'idle';
  }

  function renderModeBar() {
    const tabs = [
      { id: 'battle', label: '🪥 はみがき' },
      { id: 'diorama', label: '🏝️ シール' },
      { id: 'camera', label: '📷 カメラ' },
      { id: 'mech', label: '🦖 メカ' },
    ];
    topSwitch.replaceChildren(
      ...tabs.map((t) =>
        el('button', {
          type: 'button',
          class: `mode-pill-btn ${mode === t.id ? 'is-active' : ''}`,
          text: t.label,
          onClick: () => {
            ctx.sound.playTap();
            if (t.id !== 'camera') stopCamera();
            mode = t.id;
            renderModeBar();
            renderStage();
          },
        })
      )
    );
  }

  function completeHabit(habit) {
    const state = ctx.getState() || {};
    if (state.dailyHabitLog?.[habit.id]) {
      ctx.sound.playPop();
      return;
    }
    ctx.updateState((prev) => ({
      ...prev,
      dailyHabitLog: { ...prev.dailyHabitLog, [habit.id]: true },
    }));
    ctx.sound.playSuccess();
    ctx.voice.speakJa(`${habit.title} クリア！`);
    ctx.awardSuccess(habit.energy, { dockId: 'habit-base', missionId: 'm_habit' });
  }

  function renderBattleStage() {
    const state = ctx.getState() || {};
    const habitLog = state.dailyHabitLog || {};
    const stage = el('div', { class: 'habit-battle-stage' });

    // はみがきバイキンバトルエリア
    const toothZone = el('div', { class: 'tooth-battle-zone' });
    const timerRow = el('div', { class: 'tooth-hud-row' }, [
      el('span', { class: 'tooth-timer-pill', text: `🪥 ${formatTimeRemaining(brushSeconds)}` }),
      el('button', {
        type: 'button',
        class: `btn-toy ${brushRunning ? 'btn-red' : 'btn-emerald'} mini-toy-btn`,
        text: brushRunning ? '⏸️ とめる' : '▶ スタート',
        onClick: () => {
          ctx.sound.playTap();
          if (brushRunning) {
            stopBrush();
            renderBattleStage();
            return;
          }
          if (brushSeconds <= 0) brushSeconds = 180;
          brushRunning = true;
          ctx.voice.speakJa('は を こすって バイキンを やっつけよう！');
          brushTimer = setInterval(() => {
            if (destroyed || !brushRunning) {
              stopBrush();
              return;
            }
            brushSeconds = Math.max(0, brushSeconds - 1);
            const pill = stageArea.querySelector('.tooth-timer-pill');
            if (pill) pill.textContent = `🪥 ${formatTimeRemaining(brushSeconds)}`;
            if (brushSeconds <= 0) {
              brushSeconds = 0;
              stopBrush();
              const brushH = DAILY_HABITS.find((h) => h.id === 'brush');
              if (brushH) completeHabit(brushH);
            }
          }, 1000);
          renderBattleStage();
        },
      }),
    ]);

    const toothFace = el('button', {
      type: 'button',
      class: `giant-tooth-btn ${germsLeft === 0 ? 'is-sparkle' : ''}`,
      'aria-label': 'は を みがいて バイキンを たおす',
      onClick: (e) => {
        if (germsLeft <= 0) {
          ctx.sound.playPop();
          burstAtElement(toothFace, { count: 16, preset: 'stars' });
          return;
        }
        germsLeft -= 1;
        ctx.sound.playPop();
        burstParticles(e.clientX || toothFace.getBoundingClientRect().left + 80, e.clientY || toothFace.getBoundingClientRect().top + 80, {
          count: 18,
          preset: 'laser',
        });
        bounceElement(toothFace);
        if (germsLeft === 0) {
          stopBrush();
          burstAtElement(toothFace, { count: 38, preset: 'confetti' });
          const brushH = DAILY_HABITS.find((h) => h.id === 'brush');
          if (brushH) completeHabit(brushH);
          ctx.voice.speakJa('ピカピカ だいしょうり！ バイキンを ぜんめつ させたぞ！');
        }
        renderBattleStage();
      },
    }, [
      el('div', { class: 'tooth-emoji-big', text: germsLeft === 0 ? '😁✨' : '🦷' }),
      el('div', {
        class: 'germs-row',
        text: germsLeft > 0 ? '👾'.repeat(germsLeft) : '🌟 ピカピカ！',
      }),
    ]);

    toothZone.append(timerRow, toothFace);

    // その他の変身習慣スイッチ
    const switchesRow = el('div', { class: 'habit-switches-row' });
    DAILY_HABITS.filter((h) => h.id !== 'brush').forEach((h) => {
      const done = Boolean(habitLog[h.id]);
      const btn = el('button', {
        type: 'button',
        class: `habit-switch-btn ${done ? 'is-done' : ''}`,
        onClick: () => {
          completeHabit(h);
          burstAtElement(btn, { count: 22, preset: 'stars' });
          renderBattleStage();
        },
      }, [
        el('span', { class: 'habit-sw-icon', text: h.icon }),
        el('span', { class: 'habit-sw-title', text: done ? '✅' : h.title }),
      ]);
      switchesRow.appendChild(btn);
    });

    stage.append(toothZone, switchesRow);
    stageArea.replaceChildren(stage);
  }

  function renderDioramaStage() {
    const state = ctx.getState() || {};
    const owned = new Set(state.stickers || ['s01']);
    const placed = state.placedStickers || [];

    const stage = el('div', { class: 'diorama-stage' });
    const canvasBox = el('div', { class: 'diorama-canvas' });

    placed.forEach((p, idx) => {
      const st = HERO_STICKERS.find((x) => x.id === p.id);
      if (!st) return;
      const stickerBtn = el('button', {
        type: 'button',
        class: 'diorama-placed-sticker',
        style: { left: `${Math.round(p.x * 100)}%`, top: `${Math.round(p.y * 100)}%` },
        text: st.icon,
        'aria-label': st.name,
        onClick: () => {
          ctx.sound.playPop();
          bounceElement(stickerBtn);
          burstAtElement(stickerBtn, { count: 16, preset: 'stars' });
          ctx.voice.speakJa(`${st.name}！`);
        },
      });
      canvasBox.appendChild(stickerBtn);
    });

    if (placed.length === 0) {
      canvasBox.appendChild(el('div', { class: 'diorama-empty-hint', text: '👇 したの シールを タップして はろう！' }));
    }

    const stickerTray = el('div', { class: 'sticker-tray-grid' });
    HERO_STICKERS.forEach((st) => {
      const has = owned.has(st.id);
      const chip = el('button', {
        type: 'button',
        class: `sticker-chip-btn ${has ? 'is-owned' : 'is-locked'}`,
        disabled: has ? null : 'true',
        text: has ? st.icon : '🔒',
        'aria-label': has ? st.name : 'カプセルで ゲットしよう',
        onClick: () => {
          if (!has) return;
          ctx.sound.playPop();
          const nx = 0.14 + Math.random() * 0.72;
          const ny = 0.18 + Math.random() * 0.64;
          ctx.updateState((prev) => ({
            ...prev,
            placedStickers: [...(prev.placedStickers || []).slice(-24), { id: st.id, x: nx, y: ny }],
          }));
          ctx.voice.speakJa(`${st.name} を はったよ！`);
          renderDioramaStage();
        },
      });
      stickerTray.appendChild(chip);
    });

    const clearBtn = el('button', {
      type: 'button',
      class: 'btn-toy btn-slate mini-toy-btn',
      text: '🧹 シールを はりなおす',
      onClick: () => {
        ctx.sound.playTap();
        ctx.updateState((prev) => ({ ...prev, placedStickers: [] }));
        renderDioramaStage();
      },
    });

    stage.append(canvasBox, stickerTray, clearBtn);
    stageArea.replaceChildren(stage);
  }

  function renderCameraStage() {
    const stage = el('div', { class: 'camera-stage' });
    const viewBox = el('div', { class: 'camera-view-box' });

    const videoEl = el('video', { class: 'scanner-video', autoplay: '', playsinline: '', muted: '' });
    if (cameraState === 'live' && stream) {
      activeVideoEl = videoEl;
      videoEl.srcObject = stream;
      viewBox.appendChild(videoEl);
    } else if (scansCache[0] && isSafeDataImageUrl(scansCache[0].dataUrl)) {
      viewBox.appendChild(el('img', { src: scansCache[0].dataUrl, alt: 'スキャン', class: 'scanner-preview-img' }));
    } else {
      viewBox.appendChild(el('div', { class: 'camera-idle-emoji', text: '📷✨' }));
    }

    const fileInput = el('input', {
      type: 'file',
      accept: 'image/*',
      capture: 'environment',
      class: 'sr-only-input',
      id: 'v2-cam-file',
    });

    const saveScanColor = async (colorKey, dataUrl) => {
      const labelMap = { red: '🟥 あか', blue: '🟦 あお', yellow: '🟨 きいろ', green: '🟩 みどり', other: '✨ たからもの' };
      await ctx.storage.saveMediaItem('scans', {
        title: labelMap[colorKey] || '✨ たからもの',
        dataUrl,
        dateText: getLocalDateKey(),
      });
      scansCache = await ctx.storage.listMediaItems('scans');
      lastScanMsg = `${labelMap[colorKey] || '✨'} を ずかんへ ほぞん！`;
      ctx.sound.playSuccess();
      burstParticles(window.innerWidth / 2, window.innerHeight / 2, { count: 28, preset: 'stars' });
      ctx.awardSuccess(20, { dockId: 'habit-base', missionId: 'm_habit' });
      if (!destroyed && mode === 'camera') renderCameraStage();
    };

    const analyzeAndSave = (drawFn) => {
      try {
        const off = document.createElement('canvas');
        off.width = 400;
        off.height = 300;
        const c2 = off.getContext('2d');
        drawFn(c2, 400, 300);
        const data = c2.getImageData(140, 105, 120, 90).data;
        let r = 0, g = 0, b = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
        const color = classifyRgbColor(r / n, g / n, b / n);
        saveScanColor(color, off.toDataURL('image/jpeg', 0.8)).catch(() => {
          lastScanMsg = '⚠️ ほぞん できなかったよ';
          if (!destroyed && mode === 'camera') renderCameraStage();
        });
      } catch {
        lastScanMsg = '⚠️ べつの しゃしんを えらんでね';
        if (!destroyed && mode === 'camera') renderCameraStage();
      }
    };

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file || (file.type && !file.type.startsWith('image/'))) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => analyzeAndSave((c2, w, h) => c2.drawImage(img, 0, 0, w, h));
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });

    const controls = el('div', { class: 'btn-row' }, [
      cameraState !== 'live'
        ? el('button', {
            type: 'button',
            class: 'btn-toy btn-cyan mini-toy-btn',
            text: '🎥 カメラ',
            onClick: async () => {
              if (!navigator.mediaDevices?.getUserMedia) return;
              try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
                if (destroyed) { stopCamera(); return; }
                cameraState = 'live';
                renderCameraStage();
              } catch {
                ctx.voice.speakJa('しゃしん ボタンから とれるよ！');
              }
            },
          })
        : el('button', {
            type: 'button',
            class: 'btn-toy btn-red mini-toy-btn',
            text: '📸 パシャ！',
            onClick: () => {
              if (!videoEl.videoWidth) return;
              analyzeAndSave((c2, w, h) => c2.drawImage(videoEl, 0, 0, w, h));
              stopCamera();
            },
          }),
      el('label', { for: 'v2-cam-file', class: 'btn-toy btn-emerald mini-toy-btn' }, ['📁 しゃしん']),
    ]);

    const status = el('div', {
      class: 'game-status-banner',
      text: lastScanMsg || `ずかん：${scansCache.length} まい`,
    });

    stage.append(viewBox, fileInput, controls, status);
    stageArea.replaceChildren(stage);
  }

  function renderMechStage() {
    const state = ctx.getState() || {};
    const evo = getEvolutionStage(state.energy);

    const stage = el('div', { class: 'mech-custom-stage' });
    const mechBtn = el('button', {
      type: 'button',
      class: 'mech-hero-preview-btn',
      onClick: () => {
        ctx.sound.playRoar();
        bounceElement(mechBtn);
        burstAtElement(mechBtn, { count: 28, preset: 'fire' });
        ctx.voice.speakJa(`ガオー！ ${evo.name} だぞ！`);
      },
    }, [
      createMechSvg({
        stage: evo.level,
        colorId: state.mechColor,
        partId: state.mechPart,
        mood: 'happy',
        size: 190,
      }),
    ]);

    const colorRow = el('div', { class: 'mech-color-row' });
    MECH_COLORS.forEach((c) => {
      colorRow.appendChild(
        el('button', {
          type: 'button',
          class: `mech-color-btn ${state.mechColor === c.id ? 'is-active' : ''}`,
          style: { backgroundColor: c.primary },
          'aria-label': c.label,
          text: state.mechColor === c.id ? '✓' : '',
          onClick: () => {
            ctx.sound.playTap();
            ctx.updateState((prev) => ({ ...prev, mechColor: c.id }));
            renderMechStage();
          },
        })
      );
    });

    const partsRow = el('div', { class: 'btn-row' });
    MECH_PARTS.forEach((p) => {
      const unlocked = state.energy >= p.unlockEnergy || (state.unlockedParts || []).includes(p.id);
      partsRow.appendChild(
        el('button', {
          type: 'button',
          class: `btn-toy ${state.mechPart === p.id ? 'btn-cyan' : 'btn-slate'} mini-toy-btn`,
          disabled: unlocked ? null : 'true',
          text: unlocked ? `${p.icon} ${p.label}` : `🔒 ${p.unlockEnergy}⚡`,
          onClick: () => {
            if (!unlocked) return;
            ctx.sound.playDocking();
            ctx.updateState((prev) => ({ ...prev, mechPart: p.id }));
            renderMechStage();
          },
        })
      );
    });

    stage.append(mechBtn, colorRow, partsRow);
    stageArea.replaceChildren(stage);
  }

  function renderStage() {
    if (mode === 'battle') renderBattleStage();
    else if (mode === 'diorama') renderDioramaStage();
    else if (mode === 'camera') renderCameraStage();
    else renderMechStage();
  }

  ctx.storage.listMediaItems('scans').then((list) => {
    if (!destroyed) scansCache = Array.isArray(list) ? list : [];
  }).catch(() => {});

  renderModeBar();
  renderStage();
  ctx.voice.speakJa('はみがきバトル と シール きち！');

  return () => {
    destroyed = true;
    stopBrush();
    stopCamera();
  };
}
