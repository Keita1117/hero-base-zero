import { MECH_PUZZLES, ROBO_STAGES } from '../data.js';
import { el } from '../dom.js';
import { bounceElement, burstAtElement, burstParticles, makeDraggable, shakeElement } from '../fx.js';

export function mount(container, ctx) {
  let mode = 'assemble'; // 'assemble' | 'maze'
  let destroyed = false;
  let roundTimer = null;
  let dragCleanups = [];

  // Assemble state
  let puzzleIdx = 0;
  let dockedIds = new Set();

  // Maze state
  let stageIdx = 0;
  let roboPos = [...ROBO_STAGES[0].start];
  let mazeLocked = false;

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
  }

  function renderModeBar() {
    topSwitch.replaceChildren(
      el('button', {
        type: 'button',
        class: `mode-pill-btn ${mode === 'assemble' ? 'is-active' : ''}`,
        text: '🛠️ メカがったい',
        onClick: () => {
          ctx.sound.playTap();
          mode = 'assemble';
          dockedIds = new Set();
          renderModeBar();
          renderStage();
        },
      }),
      el('button', {
        type: 'button',
        class: `mode-pill-btn ${mode === 'maze' ? 'is-active' : ''}`,
        text: '🚀 タッチめいろ',
        onClick: () => {
          ctx.sound.playTap();
          mode = 'maze';
          roboPos = [...ROBO_STAGES[stageIdx].start];
          mazeLocked = false;
          renderModeBar();
          renderStage();
        },
      })
    );
  }

  function renderAssembleStage() {
    cleanupDrags();
    clearTimers();

    const puzzle = MECH_PUZZLES[puzzleIdx];
    const stage = el('div', { class: 'assemble-stage' });

    const picker = el('div', { class: 'puzzle-switcher' });
    MECH_PUZZLES.forEach((p, idx) => {
      picker.appendChild(
        el('button', {
          type: 'button',
          class: `stage-chip ${idx === puzzleIdx ? 'is-active' : ''}`,
          text: `${p.emoji} ${p.name}`,
          onClick: () => {
            ctx.sound.playTap();
            puzzleIdx = idx;
            dockedIds = new Set();
            ctx.voice.speakJa(`${p.name} を がったい させよう！`);
            renderAssembleStage();
          },
        })
      );
    });

    const bay = el('div', { class: 'assemble-bay', style: { borderColor: puzzle.color } });
    const bayLabel = el('div', {
      class: 'assemble-bay-title',
      text: dockedIds.size === puzzle.parts.length ? `✨ ${puzzle.name} かんせい！` : `${puzzle.emoji} パーツを はめよう！`,
    });
    bay.appendChild(bayLabel);

    const slotMap = new Map();
    puzzle.parts.forEach((part) => {
      const docked = dockedIds.has(part.id);
      const slot = el('div', {
        class: `assemble-slot ${docked ? 'is-docked' : ''}`,
        style: {
          left: `${Math.round(part.targetX * 100)}%`,
          top: `${Math.round(part.targetY * 100)}%`,
          borderColor: part.color,
          backgroundColor: docked ? part.color : '',
        },
      }, [
        el('span', { class: 'slot-icon', text: part.icon }),
        el('small', { class: 'slot-label', text: part.label }),
      ]);
      slotMap.set(part.id, slot);
      bay.appendChild(slot);
    });

    const tray = el('div', { class: 'assemble-parts-tray' });
    puzzle.parts.forEach((part) => {
      if (dockedIds.has(part.id)) return;
      const chip = el('div', {
        class: 'mech-part-draggable',
        style: { borderColor: part.color },
        role: 'button',
        tabindex: '0',
        'aria-label': part.label,
      }, [
        el('span', { class: 'part-drag-icon', text: part.icon }),
        el('span', { class: 'part-drag-name', text: part.label }),
      ]);

      const destroy = makeDraggable(chip, {
        getTargets: () => [{ id: part.id, el: slotMap.get(part.id), radius: 95 }],
        snapRadius: 95,
        onStart: () => ctx.sound.playTap(),
        onNear: (t) => t.el.classList.add('is-slot-glow'),
        onLeave: (t) => t.el.classList.remove('is-slot-glow'),
        onDrop: (t) => {
          if (t.id !== part.id) return false;
          dockedIds.add(part.id);
          ctx.sound.playDocking();
          burstAtElement(t.el, { count: 24, preset: 'stars' });
          bounceElement(t.el);

          if (dockedIds.size === puzzle.parts.length) {
            ctx.sound.playTransform();
            burstAtElement(bay, { count: 40, preset: 'confetti' });
            ctx.voice.speakJa(`ガシャン！ ${puzzle.name} がったい かんせい！！`);
            ctx.awardSuccess(25, { dockId: 'robo-rescue', missionId: 'm_robo' });
            renderAssembleStage();
            roundTimer = setTimeout(() => {
              if (!destroyed && mode === 'assemble') {
                puzzleIdx = (puzzleIdx + 1) % MECH_PUZZLES.length;
                dockedIds = new Set();
                renderAssembleStage();
              }
            }, 1500);
          } else {
            ctx.voice.speakJa(`${part.label} がったい！`);
            renderAssembleStage();
          }
          return true;
        },
        onMiss: () => {
          ctx.sound.playBoing();
        },
      });
      dragCleanups.push(destroy);
      tray.appendChild(chip);
    });

    stage.append(picker, bay, tray);
    stageArea.replaceChildren(stage);
  }

  function renderMazeStage() {
    cleanupDrags();
    clearTimers();

    const st = ROBO_STAGES[stageIdx];
    const rawCompleted = (ctx.getState() || {}).completedRoboStages;
    const clearedSet = new Set(Array.isArray(rawCompleted) ? rawCompleted : []);
    const obstacleSet = new Set(st.obstacles.map(([x, y]) => `${x},${y}`));

    const stage = el('div', { class: 'touch-maze-stage' });
    const stageBar = el('div', { class: 'stage-selector-bar' });
    ROBO_STAGES.forEach((s, idx) => {
      stageBar.appendChild(
        el('button', {
          type: 'button',
          class: `stage-chip ${idx === stageIdx ? 'is-active' : ''} ${clearedSet.has(s.id) ? 'is-done' : ''}`,
          text: clearedSet.has(s.id) ? `${s.id}⭐` : String(s.id),
          onClick: () => {
            ctx.sound.playTap();
            stageIdx = idx;
            roboPos = [...ROBO_STAGES[stageIdx].start];
            mazeLocked = false;
            renderMazeStage();
          },
        })
      );
    });

    const grid = el('div', { class: 'robo-grid touch-robo-grid' });

    function tryMoveTo(tx, ty) {
      if (mazeLocked) return;
      const [rx, ry] = roboPos;
      const dx = tx - rx;
      const dy = ty - ry;
      // 同じ列または同じ行であれば直線に沿って1歩または障害物手前まで移動
      if ((dx === 0 && dy === 0) || (dx !== 0 && dy !== 0)) {
        ctx.sound.playBoing();
        return;
      }
      const stepX = dx === 0 ? 0 : Math.sign(dx);
      const stepY = dy === 0 ? 0 : Math.sign(dy);
      const steps = Math.abs(dx) + Math.abs(dy);
      let nx = rx;
      let ny = ry;
      let hit = false;

      for (let i = 0; i < steps; i += 1) {
        const candX = nx + stepX;
        const candY = ny + stepY;
        if (candX < 0 || candX >= st.cols || candY < 0 || candY >= st.rows || obstacleSet.has(`${candX},${candY}`)) {
          hit = true;
          break;
        }
        nx = candX;
        ny = candY;
        if (nx === st.goal[0] && ny === st.goal[1]) break;
      }

      if (nx === rx && ny === ry && hit) {
        ctx.sound.playBoing();
        shakeElement(grid);
        ctx.voice.speakJa('いんせきが あるよ！ べつの みちを タップ！');
        return;
      }

      roboPos = [nx, ny];
      if (nx === st.goal[0] && ny === st.goal[1]) {
        mazeLocked = true;
        ctx.sound.playSuccess();
        renderMazeStage();
        const goalEl = grid.querySelector('.is-robo');
        burstAtElement(goalEl || grid, { count: 34, preset: 'confetti' });
        ctx.voice.speakJa('やったー！ チビきょうりゅうを きゅうしゅつしたぞ！');
        ctx.awardSuccess(25, { dockId: 'robo-rescue', missionId: 'm_robo', roboStageId: st.id });
        roundTimer = setTimeout(() => {
          if (!destroyed && mode === 'maze') {
            stageIdx = (stageIdx + 1) % ROBO_STAGES.length;
            roboPos = [...ROBO_STAGES[stageIdx].start];
            mazeLocked = false;
            renderMazeStage();
          }
        }, 1350);
      } else {
        ctx.sound.playLaser();
        renderMazeStage();
      }
    }

    for (let y = 0; y < st.rows; y += 1) {
      for (let x = 0; x < st.cols; x += 1) {
        const isRobo = roboPos[0] === x && roboPos[1] === y;
        const isGoal = st.goal[0] === x && st.goal[1] === y;
        const isObs = obstacleSet.has(`${x},${y}`);
        const isStraightNeighbor =
          !isObs && !isRobo && ((x === roboPos[0] || y === roboPos[1]));

        const cellBtn = el('button', {
          type: 'button',
          class: `robo-cell ${isObs ? 'is-obstacle' : ''} ${isGoal ? 'is-goal' : ''} ${isRobo ? 'is-robo' : ''} ${isStraightNeighbor ? 'is-reachable' : ''}`,
          text: isRobo ? '🤖' : isObs ? '☄️' : isGoal ? '🦕' : isStraightNeighbor ? '✨' : '',
          onClick: () => tryMoveTo(x, y),
        });
        grid.appendChild(cellBtn);
      }
    }

    stage.append(stageBar, grid);
    stageArea.replaceChildren(stage);
  }

  function renderStage() {
    if (mode === 'assemble') renderAssembleStage();
    else renderMazeStage();
  }

  renderModeBar();
  renderStage();

  return () => {
    destroyed = true;
    clearTimers();
    cleanupDrags();
  };
}
