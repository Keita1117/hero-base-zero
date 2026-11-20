import { PATTERN_ITEMS, ROBO_STAGES } from '../data.js';
import { simulateRoboPath } from '../core.js';
import { el } from '../dom.js';

const CMD_SYMBOLS = {
  up: '⬆️',
  down: '⬇️',
  left: '⬅️',
  right: '➡️',
};

export function mount(container, ctx) {
  let activeTab = 'robo';
  let stageIdx = 0;
  let queue = [];
  let running = false;
  let roboPos = [...ROBO_STAGES[0].start];
  let hitCell = null;
  let stepTimer = null;
  let destroyed = false;

  // Pattern mode state
  let patternRound = null;
  let patternLocked = false;

  const root = el('div', { class: 'dock-shell robo-dock' });
  const tabsBar = el('div', { class: 'sub-tabs', role: 'tablist', 'aria-label': 'ロボ・コマンド' });
  const body = el('div', { class: 'dock-body' });
  root.append(tabsBar, body);
  container.appendChild(root);

  function clearStepTimer() {
    if (stepTimer) {
      clearTimeout(stepTimer);
      stepTimer = null;
    }
  }

  function renderTabs() {
    const tabs = [
      { id: 'robo', label: '🤖 ロボそうじゅう' },
      { id: 'pattern', label: '🔷 かたち・パターン' },
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
            clearStepTimer();
            running = false;
            activeTab = t.id;
            renderTabs();
            renderView();
          },
        })
      )
    );
  }

  function selectStage(idx) {
    clearStepTimer();
    running = false;
    stageIdx = idx;
    queue = [];
    hitCell = null;
    roboPos = [...ROBO_STAGES[stageIdx].start];
    renderRoboView();
  }

  function renderRoboView() {
    const stage = ROBO_STAGES[stageIdx];
    const clearedStages = new Set((ctx.getState() || {}).completedRoboStages || []);

    const wrap = el('div', { class: 'panel-card robo-card' });

    // Stage bar
    const stageBar = el('div', { class: 'stage-selector-bar' });
    ROBO_STAGES.forEach((st, idx) => {
      const done = clearedStages.has(st.id);
      stageBar.appendChild(
        el('button', {
          type: 'button',
          class: `stage-chip ${idx === stageIdx ? 'is-active' : ''} ${done ? 'is-done' : ''}`,
          text: done ? `${st.id}⭐` : String(st.id),
          'aria-label': `ステージ ${st.id}`,
          onClick: () => {
            ctx.sound.playTap();
            selectStage(idx);
          },
        })
      );
    });

    const status = el('div', {
      class: 'game-status-banner',
      text: `${stage.title}（めやす ${stage.par}ほ）`,
    });

    // 5x4 Grid
    const grid = el('div', { class: 'robo-grid' });
    const obstacleSet = new Set(stage.obstacles.map(([x, y]) => `${x},${y}`));

    for (let y = 0; y < stage.rows; y += 1) {
      for (let x = 0; x < stage.cols; x += 1) {
        const key = `${x},${y}`;
        const isRobo = roboPos[0] === x && roboPos[1] === y;
        const isGoal = stage.goal[0] === x && stage.goal[1] === y;
        const isObs = obstacleSet.has(key);
        const isHit = hitCell && hitCell[0] === x && hitCell[1] === y;

        let cellIcon = '';
        let cls = 'robo-cell';
        if (isObs) {
          cellIcon = '☄️';
          cls += ' is-obstacle';
        } else if (isGoal) {
          cellIcon = '⚡';
          cls += ' is-goal';
        }
        if (isRobo) {
          cellIcon = '🤖';
          cls += ' is-robo';
        }
        if (isHit) cls += ' is-hit';

        grid.appendChild(el('div', { class: cls, text: cellIcon }));
      }
    }

    // Command queue display
    const queueBox = el('div', { class: 'robo-queue-box' });
    if (queue.length === 0) {
      queueBox.appendChild(el('span', { class: 'queue-placeholder', text: 'したの やじるしを おして めいれいを ならべよう！' }));
    } else {
      queue.forEach((cmd) => {
        queueBox.appendChild(el('span', { class: 'queue-chip', text: CMD_SYMBOLS[cmd] }));
      });
    }

    const addCmd = (cmd) => {
      if (running || queue.length >= 16) return;
      ctx.sound.playTap();
      queue.push(cmd);
      renderRoboView();
    };

    const dirPad = el('div', { class: 'robo-dir-pad' }, [
      el('button', { type: 'button', class: 'btn-toy btn-cyan dir-btn', text: '⬆️ うえ', onClick: () => addCmd('up') }),
      el('button', { type: 'button', class: 'btn-toy btn-cyan dir-btn', text: '⬇️ した', onClick: () => addCmd('down') }),
      el('button', { type: 'button', class: 'btn-toy btn-cyan dir-btn', text: '⬅️ ひだり', onClick: () => addCmd('left') }),
      el('button', { type: 'button', class: 'btn-toy btn-cyan dir-btn', text: '➡️ みぎ', onClick: () => addCmd('right') }),
    ]);

    const actionsRow = el('div', { class: 'btn-row' }, [
      el('button', {
        type: 'button',
        class: 'btn-toy btn-slate',
        text: '↩️ 1つ けす',
        onClick: () => {
          if (running || queue.length === 0) return;
          ctx.sound.playTap();
          queue.pop();
          renderRoboView();
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-slate',
        text: '🧹 やりなおす',
        onClick: () => {
          ctx.sound.playTap();
          selectStage(stageIdx);
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-emerald',
        disabled: running ? 'true' : null,
        text: running ? '⚡ はしりちゅう…' : '▶ じっこう！',
        onClick: () => runSimulation(),
      }),
    ]);

    wrap.append(stageBar, status, grid, queueBox, dirPad, actionsRow);
    body.replaceChildren(wrap);
  }

  function runSimulation() {
    if (running || queue.length === 0) {
      if (queue.length === 0) {
        ctx.sound.playTryAgain();
        ctx.voice.speakJa('やじるしボタンで めいれいを いれてね！');
      }
      return;
    }

    running = true;
    let result;
    const stage = ROBO_STAGES[stageIdx];
    try {
      result = simulateRoboPath(stage, queue);
    } catch {
      running = false;
      renderRoboView();
      return;
    }
    hitCell = null;
    roboPos = [...stage.start];

    const speed = (ctx.getState() || {}).reducedMotion ? 110 : 340;
    let stepIndex = 1;

    const advanceStep = () => {
      if (destroyed || activeTab !== 'robo') return;
      if (stepIndex < result.steps.length) {
        roboPos = [...result.steps[stepIndex]];
        ctx.sound.playTap();
        renderRoboView();
        stepIndex += 1;
        stepTimer = setTimeout(advanceStep, speed);
        return;
      }

      running = false;
      if (result.reachedGoal) {
        ctx.sound.playSuccess();
        ctx.voice.speakJa('やったー！ ゴール とうちゃく！ だいせいこう！');
        ctx.awardEnergy(25, {
          dockId: 'robo',
          missionId: 'm_robo_clear',
          roboStageId: stage.id,
        });
        renderRoboView();
        const banner = body.querySelector('.game-status-banner');
        if (banner) banner.textContent = `✨ ステージ ${stage.id} クリア！ +25⚡`;
        stepTimer = setTimeout(() => {
          if (!destroyed && activeTab === 'robo') {
            selectStage((stageIdx + 1) % ROBO_STAGES.length);
          }
        }, 1400);
      } else {
        ctx.sound.playTryAgain();
        hitCell = [...roboPos];
        const msg = result.hitWall
          ? 'おっと！ かべに ぶつかったよ！'
          : result.hitObstacle
          ? 'いんせきに ぶつかった！ よけて すすもう！'
          : 'もうすこし！ ゴールまで つづけよう！';
        ctx.voice.speakJa(msg);
        renderRoboView();
        const banner = body.querySelector('.game-status-banner');
        if (banner) banner.textContent = msg;
      }
    };

    stepTimer = setTimeout(advanceStep, speed);
  }

  function createPatternRound() {
    if (PATTERN_ITEMS.length < 4) return;
    patternLocked = false;
    const pool = [...PATTERN_ITEMS].sort(() => Math.random() - 0.5);
    const a = pool[0];
    const b = pool[1];
    const c = pool[2];
    const useThree = Math.random() > 0.5;
    const seq = useThree ? [a, b, c, a, b] : [a, b, a, b, a];
    const answer = useThree ? c : b;
    const distractors = pool.filter((o) => o.id !== answer.id).slice(0, 3);
    const options = [answer, ...distractors].sort(() => Math.random() - 0.5);
    patternRound = { seq, answer, options };
    ctx.voice.speakJa('つぎに くる マークは どれかな？');
  }

  function renderPatternView() {
    if (!patternRound) createPatternRound();

    const card = el('div', { class: 'panel-card pattern-card' });
    const status = el('div', {
      class: 'game-status-banner',
      text: '🔷 きまりを みつけよう！ 「？」に はいるのは どれ？',
    });

    const seqRow = el('div', { class: 'pattern-seq-row' });
    patternRound.seq.forEach((item) => {
      seqRow.appendChild(
        el('div', { class: 'pattern-slot', style: { borderColor: item.color } }, [
          el('span', { class: 'pattern-symbol', text: item.symbol }),
        ])
      );
    });
    seqRow.appendChild(
      el('div', { class: 'pattern-slot is-question' }, [el('span', { text: '❓' })])
    );

    const optsGrid = el('div', { class: 'choice-grid-2x2' });
    patternRound.options.forEach((opt) => {
      const btn = el('button', {
        type: 'button',
        class: 'choice-card-btn',
        onClick: () => {
          if (patternLocked) return;
          if (opt.id === patternRound.answer.id) {
            patternLocked = true;
            btn.classList.add('is-correct');
            ctx.sound.playSuccess();
            ctx.voice.speakJa(`せいかい！ ${opt.label} だね！`);
            status.textContent = `✨ せいかい！ シールド かいふく！ +15⚡`;
            ctx.awardEnergy(15, { dockId: 'robo', missionId: 'm_robo_clear' });
            clearStepTimer();
            stepTimer = setTimeout(() => {
              if (!destroyed && activeTab === 'pattern') {
                createPatternRound();
                renderPatternView();
              }
            }, 1300);
          } else {
            btn.classList.add('is-wrong');
            ctx.sound.playTryAgain();
            ctx.voice.speakJa('もういちど ならびかたを みてみよう！');
          }
        },
      }, [
        el('span', { class: 'choice-emoji', text: opt.symbol, 'aria-hidden': 'true' }),
        el('span', { class: 'choice-label', text: opt.label }),
      ]);
      optsGrid.appendChild(btn);
    });

    card.append(status, seqRow, optsGrid);
    body.replaceChildren(card);
  }

  function renderView() {
    if (activeTab === 'robo') renderRoboView();
    else renderPatternView();
  }

  renderTabs();
  renderView();
  ctx.voice.speakJa('ロボ・コマンド！ やじるしを ならべて ロボを うごかそう！');

  return () => {
    destroyed = true;
    clearStepTimer();
  };
}
