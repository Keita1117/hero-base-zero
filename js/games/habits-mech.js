import { DAILY_HABITS, MECH_COLORS, MECH_EVOLUTIONS, MECH_PARTS } from '../data.js';
import { formatTimeRemaining, getEvolutionStage } from '../core.js';
import { createMechSvg } from '../mech-svg.js';
import { el } from '../dom.js';

export function mount(container, ctx) {
  let activeTab = 'habits';
  let brushSeconds = 180;
  let brushRunning = false;
  let brushTimer = null;
  let moodTimer = null;
  let mechMood = 'idle';
  let destroyed = false;

  const root = el('div', { class: 'dock-shell habits-dock' });
  const tabsBar = el('div', { class: 'sub-tabs', role: 'tablist', 'aria-label': 'しれいと メカ' });
  const body = el('div', { class: 'dock-body' });
  root.append(tabsBar, body);
  container.appendChild(root);

  function stopBrushTimer() {
    if (brushTimer) {
      clearInterval(brushTimer);
      brushTimer = null;
    }
    brushRunning = false;
  }

  function completeHabit(habit) {
    const state = ctx.getState();
    const alreadyDone = Boolean(state.dailyHabitLog?.[habit.id]);
    if (alreadyDone) {
      ctx.sound.playTap();
      ctx.voice.speakJa(`${habit.title} は きょう もう クリア したね！ えらい！`);
      return;
    }
    ctx.updateState((prev) => ({
      ...prev,
      dailyHabitLog: {
        ...prev.dailyHabitLog,
        [habit.id]: true,
      },
    }));
    ctx.sound.playSuccess();
    ctx.voice.speakJa(`やったー！ ${habit.title} ミッション かんりょう！ すごいぞ！`);
    ctx.awardEnergy(habit.energy, { dockId: 'habits', missionId: 'm_habit_check' });
  }

  function renderTabs() {
    const tabs = [
      { id: 'habits', label: '🦷 まいにち しれい' },
      { id: 'mech', label: '🦖 メカ しんかドック' },
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
            activeTab = t.id;
            renderTabs();
            renderView();
          },
        })
      )
    );
  }

  function renderHabitsView() {
    const state = ctx.getState();
    const habitLog = state.dailyHabitLog || {};

    const wrap = el('div', { class: 'habits-layout' });

    // はみがき ヒーロータイマーカード
    const brushCard = el('div', { class: 'panel-card brush-timer-card' }, [
      el('div', { class: 'brush-header' }, [
        el('span', { class: 'brush-icon', text: '🪥', 'aria-hidden': 'true' }),
        el('div', {}, [
          el('h3', { text: 'はみがき ヒーロータイマー（3ぷん）' }),
          el('p', { text: 'ばいきんを ビームで ぴかぴかに しよう！' }),
        ]),
      ]),
      el('div', { class: 'brush-clock-readout', text: formatTimeRemaining(brushSeconds) }),
      el('div', { class: 'btn-row' }, [
        el('button', {
          type: 'button',
          class: `btn-toy ${brushRunning ? 'btn-red' : 'btn-emerald'}`,
          text: brushRunning ? '⏸️ いったん とめる' : '▶ はみがき スタート！',
          onClick: () => {
            ctx.sound.playTap();
            if (brushRunning) {
              stopBrushTimer();
              renderHabitsView();
              return;
            }
            if (brushSeconds <= 0) brushSeconds = 180;
            brushRunning = true;
            ctx.voice.speakJa('はみがき スタート！ まえば から シャカシャカ しよう！');
            brushTimer = setInterval(() => {
              if (destroyed || !brushRunning) {
                stopBrushTimer();
                return;
              }
              brushSeconds -= 1;
              if (brushSeconds === 120) {
                ctx.sound.playCombo();
                ctx.voice.speakJa('あと 2ふん！ おくば も シャカシャカ！');
              } else if (brushSeconds === 60) {
                ctx.sound.playCombo();
                ctx.voice.speakJa('あと 1ぷん！ うらの は も ぴかぴかに！');
              } else if (brushSeconds <= 0) {
                brushSeconds = 0;
                stopBrushTimer();
                const brushHabit = DAILY_HABITS.find((h) => h.id === 'brush');
                if (brushHabit) completeHabit(brushHabit);
                if (!destroyed && activeTab === 'habits') renderHabitsView();
                return;
              }
              if (!destroyed && activeTab === 'habits') {
                const readout = body.querySelector('.brush-clock-readout');
                if (readout) readout.textContent = formatTimeRemaining(brushSeconds);
              }
            }, 1000);
            renderHabitsView();
          },
        }),
        el('button', {
          type: 'button',
          class: 'btn-toy btn-slate',
          text: '🔄 リセット',
          onClick: () => {
            ctx.sound.playTap();
            stopBrushTimer();
            brushSeconds = 180;
            renderHabitsView();
          },
        }),
      ]),
    ]);

    const grid = el('div', { class: 'habits-grid' });
    DAILY_HABITS.forEach((habit) => {
      const done = Boolean(habitLog[habit.id]);
      grid.appendChild(
        el('button', {
          type: 'button',
          class: `habit-card-btn ${done ? 'is-done' : ''}`,
          onClick: () => {
            completeHabit(habit);
            renderHabitsView();
          },
        }, [
          el('div', { class: 'habit-emoji', text: habit.icon, 'aria-hidden': 'true' }),
          el('div', { class: 'habit-title', text: habit.title }),
          el('div', { class: 'habit-desc', text: habit.desc }),
          el('div', {
            class: 'habit-badge',
            text: done ? '✅ きょうは クリア！' : `⚡ +${habit.energy} ゲット`,
          }),
        ])
      );
    });

    wrap.append(brushCard, grid);
    body.replaceChildren(wrap);
  }

  function renderMechView() {
    const state = ctx.getState();
    const evo = getEvolutionStage(state.energy);

    const wrap = el('div', { class: 'mech-dock-layout' });

    const stageCard = el('div', { class: 'panel-card mech-stage-card' });
    const mechWrap = el('button', {
      type: 'button',
      class: 'mech-tap-stage',
      'aria-label': 'あいぼうメカ レックス・ゼロ',
      onClick: () => {
        ctx.sound.playCombo();
        mechMood = 'happy';
        ctx.voice.speakJa(`${state.childName}！ きょうも パワー まんたん だよ！`);
        renderMechView();
        if (moodTimer) clearTimeout(moodTimer);
        moodTimer = setTimeout(() => {
          moodTimer = null;
          if (!destroyed) {
            mechMood = 'idle';
            if (activeTab === 'mech') renderMechView();
          }
        }, 1200);
      },
    }, [
      createMechSvg({
        stage: evo.level,
        colorId: state.mechColor,
        partId: state.mechPart,
        mood: mechMood,
        size: 230,
      }),
    ]);

    const evoBanner = el('div', { class: 'mech-evo-info' }, [
      el('div', { class: 'mech-lv-tag', text: `レベル ${evo.level}：${evo.name}` }),
      el('p', { text: evo.comment }),
      el('div', { class: 'energy-meter' }, [
        el('div', { class: 'energy-meter-fill', style: `width:${evo.progressPct}%` }),
      ]),
      el('div', {
        class: 'energy-meter-label',
        text: evo.isMax
          ? `⚡ さいきょう しんか たっせい！（${evo.energy}⚡）`
          : `つぎの しんか「${evo.nextName}」まで あと ${evo.remainingToNext}⚡`,
      }),
    ]);

    stageCard.append(mechWrap, evoBanner);

    // Customizer
    const customCard = el('div', { class: 'panel-card mech-custom-card' });

    const colorHeading = el('h3', { text: '🎨 ボディー カラー' });
    const colorRow = el('div', { class: 'mech-color-row' });
    MECH_COLORS.forEach((c) => {
      colorRow.appendChild(
        el('button', {
          type: 'button',
          class: `mech-color-btn ${state.mechColor === c.id ? 'is-active' : ''}`,
          style: `background:${c.primary}`,
          'aria-label': c.label,
          text: state.mechColor === c.id ? '✓' : '',
          onClick: () => {
            ctx.sound.playTap();
            ctx.updateState((prev) => ({ ...prev, mechColor: c.id }));
            ctx.voice.speakJa(`${c.label} に チェンジ！`);
            renderMechView();
          },
        })
      );
    });

    const partsHeading = el('h3', { text: '🛡️ パワーアップ そうび' });
    const partsRow = el('div', { class: 'mech-parts-row' });
    MECH_PARTS.forEach((p) => {
      const unlocked = state.energy >= p.unlockEnergy || (state.unlockedParts || []).includes(p.id);
      partsRow.appendChild(
        el('button', {
          type: 'button',
          class: `btn-toy ${state.mechPart === p.id ? 'btn-cyan' : 'btn-slate'} part-btn`,
          disabled: unlocked ? null : 'true',
          onClick: () => {
            if (!unlocked) return;
            ctx.sound.playTransform();
            ctx.updateState((prev) => ({ ...prev, mechPart: p.id }));
            ctx.voice.speakJa(`${p.label} を そうび したよ！`);
            renderMechView();
          },
        }, [
          el('span', { text: `${p.icon} ${p.label}` }),
          !unlocked ? el('small', { text: ` (${p.unlockEnergy}⚡ で かいほう)` }) : null,
        ])
      );
    });

    const roadmapHeading = el('h3', { text: '🚀 しんか ロードマップ' });
    const roadmap = el('div', { class: 'evo-roadmap' });
    MECH_EVOLUTIONS.forEach((st) => {
      const reached = state.energy >= st.minEnergy;
      roadmap.appendChild(
        el('div', { class: `evo-step ${reached ? 'is-reached' : ''}` }, [
          el('span', { class: 'evo-step-badge', text: st.badge }),
          el('div', {}, [
            el('div', { class: 'evo-step-name', text: `Lv.${st.level} ${st.name}` }),
            el('small', { text: `${st.minEnergy}⚡` }),
          ]),
        ])
      );
    });

    customCard.append(colorHeading, colorRow, partsHeading, partsRow, roadmapHeading, roadmap);
    wrap.append(stageCard, customCard);
    body.replaceChildren(wrap);
  }

  function renderView() {
    if (activeTab === 'habits') renderHabitsView();
    else renderMechView();
  }

  renderTabs();
  renderView();
  ctx.voice.speakJa('ヒーロー しれいと メカドック！ はみがきや おかたづけ で エネルギーを ためよう！');

  return () => {
    destroyed = true;
    stopBrushTimer();
    if (moodTimer) clearTimeout(moodTimer);
  };
}
