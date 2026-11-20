import { formatClockLabel, generateClockQuestion, generateRaceWave, snapClockHandAngle } from '../core.js';
import { el } from '../dom.js';
import { bounceElement, burstAtElement, burstParticles, shakeElement } from '../fx.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

export function mount(container, ctx) {
  let mode = 'race'; // 'race' | 'clock'
  let level = 1;
  let destroyed = false;
  let raceRaf = null;
  let roundTimer = null;

  // Race state
  let wave = generateRaceWave(level);
  let carLane = 1; // 0, 1, 2
  let gateProgress = 0.08;
  let raceLocked = false;

  // Clock state
  let clockTarget = generateClockQuestion(level);
  let curHour = 12;
  let curMinute = 0;
  let clockNight = false;
  let clockLocked = false;

  const root = el('div', { class: 'game-stage-shell' });
  const topSwitch = el('div', { class: 'game-mode-bar' });
  const stageArea = el('div', { class: 'game-play-arena' });
  root.append(topSwitch, stageArea);
  container.appendChild(root);

  function stopLoops() {
    if (raceRaf) {
      cancelAnimationFrame(raceRaf);
      raceRaf = null;
    }
    if (roundTimer) {
      clearTimeout(roundTimer);
      roundTimer = null;
    }
  }

  function renderModeBar() {
    topSwitch.replaceChildren(
      el('button', {
        type: 'button',
        class: `mode-pill-btn ${mode === 'race' ? 'is-active' : ''}`,
        text: '🏎️ かずレース',
        onClick: () => {
          ctx.sound.playTap();
          stopLoops();
          mode = 'race';
          setupRaceWave();
          renderModeBar();
          renderStage();
        },
      }),
      el('button', {
        type: 'button',
        class: `mode-pill-btn ${mode === 'clock' ? 'is-active' : ''}`,
        text: '🕒 くるくる とけい',
        onClick: () => {
          ctx.sound.playTap();
          stopLoops();
          mode = 'clock';
          setupClockRound();
          renderModeBar();
          renderStage();
        },
      }),
      el('button', {
        type: 'button',
        class: 'mode-pill-btn level-cycle-btn',
        text: `⭐ Lv.${level}`,
        onClick: () => {
          ctx.sound.playTap();
          level = (level % 3) + 1;
          if (mode === 'race') setupRaceWave();
          else setupClockRound();
          renderModeBar();
          renderStage();
        },
      })
    );
  }

  function setupRaceWave() {
    raceLocked = false;
    gateProgress = 0.06;
    wave = generateRaceWave(level);
    ctx.voice.speakJa(
      wave.isAdd
        ? `${wave.a} たす ${wave.b} は いくつ？ レーンを えらぼう！`
        : `${wave.answer} の ゲート へ ゴー！`
    );
  }

  function renderRaceStage() {
    stopLoops();

    const stage = el('div', { class: 'race-stage' });

    // ビジュアルお題（文字ゼロ：図形アイコンで数を提示）
    const targetVisual = el('div', { class: 'race-target-banner' });
    if (wave.isAdd) {
      const grpA = el('span', { class: 'race-dots-grp' });
      for (let i = 0; i < wave.a; i += 1) grpA.append('💎');
      const grpB = el('span', { class: 'race-dots-grp' });
      for (let i = 0; i < wave.b; i += 1) grpB.append('💎');
      targetVisual.append(grpA, el('span', { class: 'race-plus', text: '+' }), grpB);
    } else {
      const grp = el('span', { class: 'race-dots-grp' });
      for (let i = 0; i < wave.answer; i += 1) grp.append('🚀');
      targetVisual.append(grp);
    }

    const highway = el('div', { class: 'race-highway' });
    const gatesRow = el('div', { class: 'race-gates-row' });

    const gateCards = wave.lanes.map((num, laneIdx) => {
      const card = el('button', {
        type: 'button',
        class: `race-gate-btn ${carLane === laneIdx ? 'is-aimed' : ''}`,
        text: String(num),
        onClick: () => {
          if (raceLocked) return;
          carLane = laneIdx;
          updateCarLane();
          // レーンをタップしただけでも加速判定できる気持ちよさ
          if (gateProgress < 0.72) {
            gateProgress = Math.min(0.75, gateProgress + 0.18);
          }
        },
      });
      gatesRow.appendChild(card);
      return card;
    });

    const carWrap = el('div', { class: 'race-car-slot' }, [
      el('div', { class: 'race-car-sprite', text: '🏎️' }),
      el('div', { class: 'race-exhaust-flame', text: '🔥' }),
    ]);

    // 3レーンタップ領域
    const laneTouchGrid = el('div', { class: 'race-lane-triggers' });
    for (let i = 0; i < 3; i += 1) {
      laneTouchGrid.appendChild(
        el('button', {
          type: 'button',
          class: 'race-lane-tap',
          'aria-label': `レーン ${i + 1}`,
          onClick: () => {
            if (raceLocked) return;
            ctx.sound.playTap();
            carLane = i;
            updateCarLane();
          },
        })
      );
    }

    const boostBtn = el('button', {
      type: 'button',
      class: 'btn-toy btn-red race-boost-btn',
      text: '🔥 ブースト！',
      onClick: () => {
        if (raceLocked) return;
        gateProgress = 0.85;
      },
    });

    highway.append(laneTouchGrid, gatesRow, carWrap);
    stage.append(targetVisual, highway, boostBtn);
    stageArea.replaceChildren(stage);

    function updateCarLane() {
      const pct = carLane * 33.333 + 16.666;
      carWrap.style.left = `${pct}%`;
      gateCards.forEach((c, idx) => c.classList.toggle('is-aimed', idx === carLane));
    }
    updateCarLane();

    let lastTs = performance.now();
    const tick = (now) => {
      if (destroyed || mode !== 'race') {
        raceRaf = null;
        return;
      }
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      if (!raceLocked) {
        const reduced = (ctx.getState() || {}).reducedMotion;
        const speed = reduced ? 0.08 : 0.16;
        gateProgress += dt * speed;
        gatesRow.style.top = `${Math.round(gateProgress * 66)}%`;

        if (gateProgress >= 0.84) {
          const chosenNum = wave.lanes[carLane];
          if (chosenNum === wave.answer) {
            raceLocked = true;
            gateCards[carLane].classList.add('is-correct-gate');
            ctx.sound.playTurbo();
            burstAtElement(carWrap, { count: 34, preset: 'fire' });
            burstAtElement(gateCards[carLane], { count: 26, preset: 'stars' });
            bounceElement(carWrap);
            ctx.voice.speakJa(`ターボ ブースト！ ${chosenNum} だいせいこう！`);
            ctx.awardSuccess(20, { dockId: 'turbo-math', missionId: 'm_math' });
            roundTimer = setTimeout(() => {
              if (!destroyed && mode === 'race') {
                setupRaceWave();
                renderRaceStage();
              }
            }, 1250);
            return;
          }
          // 優しいポヨン反発
          gateProgress = 0.25;
          gatesRow.style.top = `${Math.round(gateProgress * 66)}%`;
          shakeElement(carWrap);
          ctx.sound.playBoing();
          ctx.voice.speakJa(`ぽよん！ これは ${chosenNum} だよ！ ${wave.answer} へ まがろう！`);
        }
      }
      raceRaf = requestAnimationFrame(tick);
    };
    raceRaf = requestAnimationFrame(tick);
  }

  function setupClockRound() {
    clockLocked = false;
    clockTarget = generateClockQuestion(level);
    curHour = (clockTarget.hour + 4) % 12 || 12;
    curMinute = 0;
    ctx.voice.speakJa(`${clockTarget.label} に はりを まわして ワープだ！`);
  }

  function renderClockStage() {
    stopLoops();
    const allowHalf = level >= 2;
    const stage = el('div', { class: `clock-warp-stage ${clockNight ? 'is-night' : 'is-day'}` });

    const skyBar = el('div', { class: 'clock-sky-banner' }, [
      el('button', {
        type: 'button',
        class: 'sky-orb-btn',
        text: clockNight ? '🌙 よる' : '☀️ ひる',
        'aria-label': 'ひると よるを きりかえる',
        onClick: () => {
          ctx.sound.playTap();
          clockNight = !clockNight;
          ctx.voice.speakJa(clockNight ? 'おほしさま の よる！' : 'おひさま の ひる！');
          renderClockStage();
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-gold',
        text: `🎯 ${clockTarget.label} に ワープ！ 🔊`,
        onClick: () => {
          ctx.sound.playTap();
          ctx.voice.speakJa(`${clockTarget.label} に あわせよう！`);
        },
      }),
    ]);

    const clockWrap = el('div', { class: 'interactive-clock-wrap' });
    const svg = svgEl('svg', { viewBox: '0 0 240 240', class: 'interactive-clock-svg' });

    svg.appendChild(svgEl('circle', { cx: 120, cy: 120, r: 108, fill: '#F8FAFC', stroke: '#00D2FF', 'stroke-width': 9 }));
    for (let i = 0; i < 12; i += 1) {
      const angle = (i * 30 - 90) * (Math.PI / 180);
      const num = i === 0 ? 12 : i;
      const tx = svgEl('text', {
        x: (120 + Math.cos(angle) * 82).toFixed(1),
        y: (120 + Math.sin(angle) * 82 + 7).toFixed(1),
        'text-anchor': 'middle',
        fill: '#102030',
        'font-size': 20,
        'font-weight': '900',
      });
      tx.textContent = String(num);
      svg.appendChild(tx);
    }

    const hourHand = svgEl('line', {
      x1: 120,
      y1: 120,
      x2: 120,
      y2: 66,
      stroke: '#FF4757',
      'stroke-width': 11,
      'stroke-linecap': 'round',
    });
    const minHand = svgEl('line', {
      x1: 120,
      y1: 120,
      x2: 120,
      y2: 44,
      stroke: '#0088CC',
      'stroke-width': 6,
      'stroke-linecap': 'round',
    });
    const knob = svgEl('circle', { cx: 120, cy: 120, r: 11, fill: '#0D1B2A', stroke: '#FFB800', 'stroke-width': 3 });
    svg.append(hourHand, minHand, knob);

    clockWrap.appendChild(svg);

    const liveLabel = el('div', { class: 'clock-live-pill', text: `いま： ${formatClockLabel(curHour, curMinute)}` });

    function updateHands() {
      const mAng = (curMinute * 6 - 90) * (Math.PI / 180);
      const hAng = (((curHour % 12) + curMinute / 60) * 30 - 90) * (Math.PI / 180);
      hourHand.setAttribute('x2', (120 + Math.cos(hAng) * 54).toFixed(1));
      hourHand.setAttribute('y2', (120 + Math.sin(hAng) * 54).toFixed(1));
      minHand.setAttribute('x2', (120 + Math.cos(mAng) * 78).toFixed(1));
      minHand.setAttribute('y2', (120 + Math.sin(mAng) * 78).toFixed(1));
      liveLabel.textContent = `いま： ${formatClockLabel(curHour, curMinute)}`;
    }
    updateHands();

    function checkClockWin() {
      if (clockLocked) return;
      const targetMinute = allowHalf && clockTarget.minute === 30 ? 30 : 0;
      if (curHour === clockTarget.hour && curMinute === targetMinute) {
        clockLocked = true;
        ctx.sound.playTurbo();
        burstAtElement(clockWrap, { count: 36, preset: 'stars' });
        bounceElement(clockWrap);
        ctx.voice.speakJa(`ワープ せいこう！ ${formatClockLabel(curHour, curMinute)} だね！`);
        ctx.awardSuccess(20, { dockId: 'turbo-math', missionId: 'm_math' });
        roundTimer = setTimeout(() => {
          if (!destroyed && mode === 'clock') {
            setupClockRound();
            renderClockStage();
          }
        }, 1400);
      }
    }

    let spinning = false;
    function applyPointerAngle(e) {
      const r = svg.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const rad = Math.atan2(e.clientY - cy, e.clientX - cx);
      const deg = (rad * 180) / Math.PI + 90;
      const snapped = snapClockHandAngle(deg, allowHalf);
      if (snapped.hour !== curHour || snapped.minute !== curMinute) {
        curHour = snapped.hour;
        curMinute = snapped.minute;
        ctx.sound.playTap();
        updateHands();
      }
    }

    svg.style.touchAction = 'none';
    svg.addEventListener('pointerdown', (e) => {
      if (clockLocked) return;
      e.preventDefault();
      spinning = true;
      svg.setPointerCapture?.(e.pointerId);
      applyPointerAngle(e);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!spinning || clockLocked) return;
      e.preventDefault();
      applyPointerAngle(e);
    });
    const endSpin = (e) => {
      if (e && svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      if (!spinning) return;
      spinning = false;
      checkClockWin();
    };
    svg.addEventListener('pointerup', endSpin);
    svg.addEventListener('pointercancel', endSpin);
    svg.addEventListener('lostpointercapture', endSpin);

    const stepTime = (mins) => {
      if (clockLocked) return;
      ctx.sound.playTap();
      let total = (curHour % 12) * 60 + curMinute + mins;
      while (total < 0) total += 720;
      total %= 720;
      let h = Math.floor(total / 60);
      if (h === 0) h = 12;
      curHour = h;
      curMinute = total % 60;
      updateHands();
      ctx.voice.speakJa(formatClockLabel(curHour, curMinute));
      checkClockWin();
    };

    const btnRow = el('div', { class: 'btn-row' }, [
      el('button', { type: 'button', class: 'btn-toy btn-cyan mini-toy-btn', text: '⏪ -1じかん', onClick: () => stepTime(-60) }),
      allowHalf ? el('button', { type: 'button', class: 'btn-toy btn-emerald mini-toy-btn', text: '+30ぷん', onClick: () => stepTime(30) }) : null,
      el('button', { type: 'button', class: 'btn-toy btn-cyan mini-toy-btn', text: '+1じかん ⏩', onClick: () => stepTime(60) }),
    ]);

    stage.append(skyBar, clockWrap, liveLabel, btnRow);
    stageArea.replaceChildren(stage);
  }

  function renderStage() {
    if (mode === 'race') renderRaceStage();
    else renderClockStage();
  }

  setupRaceWave();
  renderModeBar();
  renderStage();

  return () => {
    destroyed = true;
    stopLoops();
  };
}
