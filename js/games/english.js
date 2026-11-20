import { ENGLISH_ALPHABET, ENGLISH_QUIZ_ITEMS } from '../data.js';
import { el } from '../dom.js';

export function mount(container, ctx) {
  let activeTab = 'board';
  let selectedItem = ENGLISH_ALPHABET[17]; // R - Rocket
  let discoveredLetters = new Set(['R']);
  let quizTarget = null;
  let quizOptions = [];
  let quizLocked = false;
  let showWordHint = false;
  let destroyed = false;
  let roundTimer = null;

  const root = el('div', { class: 'dock-shell english-dock' });
  const tabsBar = el('div', { class: 'sub-tabs', role: 'tablist', 'aria-label': 'エイゴ ステーション' });
  const body = el('div', { class: 'dock-body' });
  root.append(tabsBar, body);
  container.appendChild(root);

  function renderTabs() {
    const tabs = [
      { id: 'board', label: '🔤 ABC ボード' },
      { id: 'quiz', label: '🎯 エイゴ クイズ' },
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

  function renderBoardView() {
    const card = el('div', { class: 'panel-card english-board-card' });

    const spotlight = el('div', {
      class: 'abc-spotlight',
      style: `border-color:${selectedItem.color}`,
    }, [
      el('div', { class: 'abc-spot-letter', text: selectedItem.letter, style: `color:${selectedItem.color}` }),
      el('div', { class: 'abc-spot-emoji', text: selectedItem.emoji, 'aria-hidden': 'true' }),
      el('div', { class: 'abc-spot-texts' }, [
        el('div', { class: 'abc-spot-word', text: selectedItem.word }),
        el('div', { class: 'abc-spot-ja', text: selectedItem.ja }),
      ]),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-cyan',
        text: '🔊 きく',
        onClick: () => {
          ctx.sound.playTap();
          ctx.voice.speakEn(
            `${selectedItem.letter}! ${selectedItem.word}!`,
            `${selectedItem.letter}！ ${selectedItem.word}（${selectedItem.ja}）！`
          );
        },
      }),
    ]);

    const progress = el('div', {
      class: 'stat-pill',
      text: `みつけた ABC：${discoveredLetters.size} / 26`,
    });

    const grid = el('div', { class: 'abc-grid' });
    ENGLISH_ALPHABET.forEach((item) => {
      const isSelected = item.letter === selectedItem.letter;
      const isSeen = discoveredLetters.has(item.letter);
      grid.appendChild(
        el('button', {
          type: 'button',
          class: `abc-key-btn ${isSelected ? 'is-active' : ''} ${isSeen ? 'is-seen' : ''}`,
          style: `--key-accent:${item.color}`,
          onClick: () => {
            ctx.sound.playTap();
            selectedItem = item;
            const wasNew = !discoveredLetters.has(item.letter);
            discoveredLetters.add(item.letter);
            ctx.voice.speakEn(
              `${item.letter}! ${item.word}!`,
              `${item.letter}！ ${item.word}（${item.ja}）！`
            );
            if (wasNew && discoveredLetters.size % 3 === 0) {
              ctx.sound.playCombo();
              ctx.awardEnergy(10, { dockId: 'english', missionId: 'm_english_play' });
            }
            renderBoardView();
          },
        }, [
          el('span', { class: 'abc-key-char', text: item.letter }),
          el('span', { class: 'abc-key-mini', text: item.emoji, 'aria-hidden': 'true' }),
        ])
      );
    });

    card.append(spotlight, progress, grid);
    body.replaceChildren(card);
  }

  function setupQuizRound() {
    if (!ENGLISH_QUIZ_ITEMS.length) return;
    quizLocked = false;
    showWordHint = false;
    const pool = [...ENGLISH_QUIZ_ITEMS].sort(() => Math.random() - 0.5);
    quizTarget = pool[0];
    quizOptions = pool.slice(0, 4).sort(() => Math.random() - 0.5);
    ctx.voice.speakEn(
      `Touch ${quizTarget.word}!`,
      `「${quizTarget.word}」を タッチしよう！`
    );
  }

  function renderQuizView() {
    if (!quizTarget) setupQuizRound();

    const card = el('div', { class: 'panel-card english-quiz-card' });
    const prompt = el('div', {
      class: 'game-status-banner',
      text: showWordHint
        ? `🔊 "${quizTarget.word}"（${quizTarget.ja}）は どれ？`
        : `🔊 "${quizTarget.word}" を タッチしよう！`,
    });

    const controls = el('div', { class: 'btn-row' }, [
      el('button', {
        type: 'button',
        class: 'btn-toy btn-cyan',
        text: '🔊 もういちど きく',
        onClick: () => {
          ctx.sound.playTap();
          ctx.voice.speakEn(
            `Where is ${quizTarget.word}?`,
            `「${quizTarget.word}」は どれかな？`
          );
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn-toy btn-slate',
        text: showWordHint ? '💡 いみを かくす' : '💡 にほんご ヒント',
        onClick: () => {
          ctx.sound.playTap();
          showWordHint = !showWordHint;
          renderQuizView();
        },
      }),
    ]);

    const grid = el('div', { class: 'choice-grid-2x2' });
    quizOptions.forEach((opt) => {
      const btn = el('button', {
        type: 'button',
        class: 'choice-card-btn',
        style: opt.swatch ? `border-color:${opt.swatch}` : '',
        onClick: () => {
          if (quizLocked) return;
          if (opt.word === quizTarget.word) {
            quizLocked = true;
            btn.classList.add('is-correct');
            ctx.sound.playSuccess();
            ctx.voice.speakEn(
              `Awesome! ${opt.word}!`,
              `やったー！ ${opt.word}（${opt.ja}）！`
            );
            prompt.textContent = `✨ Awesome! ${opt.word}（${opt.ja}）! +15⚡`;
            ctx.awardEnergy(15, { dockId: 'english', missionId: 'm_english_play' });
            if (roundTimer) clearTimeout(roundTimer);
            roundTimer = setTimeout(() => {
              roundTimer = null;
              if (!destroyed && activeTab === 'quiz') {
                setupQuizRound();
                renderQuizView();
              }
            }, 1400);
          } else {
            btn.classList.add('is-wrong');
            ctx.sound.playTryAgain();
            ctx.voice.speakEn(
              `That is ${opt.word}. Find ${quizTarget.word}!`,
              `それは ${opt.word}（${opt.ja}）だよ！`
            );
          }
        },
      }, [
        el('span', { class: 'choice-emoji', text: opt.emoji, 'aria-hidden': 'true' }),
        el('span', {
          class: 'choice-label',
          text: showWordHint || quizLocked ? `${opt.word} (${opt.ja})` : opt.word,
        }),
      ]);
      grid.appendChild(btn);
    });

    card.append(prompt, controls, grid);
    body.replaceChildren(card);
  }

  function renderView() {
    if (activeTab === 'board') renderBoardView();
    else renderQuizView();
  }

  renderTabs();
  renderView();
  ctx.voice.speakEn(
    'Welcome to English Station! Tap any letter!',
    'エイゴ ステーション！ すきな ABC を タップしてみよう！'
  );

  return () => {
    destroyed = true;
    if (roundTimer) clearTimeout(roundTimer);
  };
}
