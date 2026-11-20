import { ENGLISH_ALPHABET, KITCHEN_ITEMS } from '../data.js';
import { generateKitchenOrder } from '../core.js';
import { el } from '../dom.js';
import { bounceElement, burstAtElement, burstParticles, makeDraggable, shakeElement } from '../fx.js';

function shuffleArr(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function mount(container, ctx) {
  let mode = 'cook'; // 'cook' | 'abc'
  let destroyed = false;
  let roundTimer = null;
  let sfxTimer = null;
  let dragCleanups = [];

  // Cook state
  let order = generateKitchenOrder();
  let platedIds = [];
  let panItem = null;
  let panCookHits = 0;
  let trayItems = [];
  let cookLocked = false;

  // ABC state
  let selectedLetter = ENGLISH_ALPHABET[17];

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
    if (sfxTimer) {
      clearTimeout(sfxTimer);
      sfxTimer = null;
    }
  }

  function setupOrderRound() {
    cookLocked = false;
    platedIds = [];
    panItem = null;
    panCookHits = 0;
    order = generateKitchenOrder();
    const orderSet = new Set(order.items.map((i) => i.id));
    const extras = shuffleArr(KITCHEN_ITEMS.filter((i) => !orderSet.has(i.id))).slice(0, 2);
    trayItems = shuffleArr([...order.items, ...extras]);

    const enNames = order.items.map((i) => i.en).join(', ');
    ctx.voice.speakEn(
      `${enNames}, please!`,
      `${order.items.map((i) => `${i.en}（${i.ja}）`).join(' と ')} を つくってね！`
    );
  }

  function renderModeBar() {
    topSwitch.replaceChildren(
      el('button', {
        type: 'button',
        class: `mode-pill-btn ${mode === 'cook' ? 'is-active' : ''}`,
        text: '🍔 りょうり',
        onClick: () => {
          ctx.sound.playTap();
          mode = 'cook';
          setupOrderRound();
          renderModeBar();
          renderStage();
        },
      }),
      el('button', {
        type: 'button',
        class: `mode-pill-btn ${mode === 'abc' ? 'is-active' : ''}`,
        text: '🔤 ABCボード',
        onClick: () => {
          ctx.sound.playTap();
          mode = 'abc';
          renderModeBar();
          renderStage();
        },
      })
    );
  }

  function finishOrder(customerEl) {
    if (cookLocked) return;
    cookLocked = true;
    ctx.sound.playChomp();
    sfxTimer = setTimeout(() => {
      sfxTimer = null;
      if (!destroyed) ctx.sound.playSuccess();
    }, 180);
    bounceElement(customerEl);
    burstAtElement(customerEl, { count: 38, preset: 'confetti' });
    ctx.voice.speakEn('Yummy! Thank you hero chef!', 'おいしーい！ ありがとう！');
    ctx.awardSuccess(25, { dockId: 'hero-kitchen', missionId: 'm_kitchen' });
    roundTimer = setTimeout(() => {
      if (!destroyed && mode === 'cook') {
        setupOrderRound();
        renderCookStage();
      }
    }, 1500);
  }

  function renderCookStage() {
    cleanupDrags();
    clearTimers();

    const stage = el('div', { class: 'kitchen-stage' });

    // お客さん＆オーダー吹き出し
    const customerWrap = el('div', { class: 'kitchen-customer-row' });
    const customerAvatar = el('div', { class: 'kitchen-customer-avatar', text: order.customerEmoji });
    const orderBubble = el('button', {
      type: 'button',
      class: 'kitchen-order-bubble',
      onClick: () => {
        ctx.sound.playTap();
        const en = order.items.map((i) => i.en).join(', ');
        ctx.voice.speakEn(`${en}, please!`, `${order.items.map((i) => i.ja).join(' と ')}！`);
      },
    });
    order.items.forEach((item) => {
      const done = platedIds.includes(item.id);
      orderBubble.appendChild(
        el('span', {
          class: `order-chip ${done ? 'is-done' : ''}`,
          text: item.emoji,
        })
      );
    });
    orderBubble.appendChild(el('span', { class: 'order-sound-tag', text: '🔊' }));
    customerWrap.append(customerAvatar, orderBubble);

    // 調理カウンター（左：フライパン、右：お皿）
    const counter = el('div', { class: 'kitchen-counter-row' });

    const panZone = el('button', {
      type: 'button',
      class: `kitchen-pan-zone ${panItem ? 'has-food' : ''}`,
      'aria-label': 'フライパンで やく',
      onClick: () => {
        if (!panItem || cookLocked) return;
        panCookHits += 1;
        ctx.sound.playSizzle();
        burstAtElement(panZone, { count: 10, preset: 'fire' });
        bounceElement(panZone);
        if (panCookHits >= 3) {
          const cooked = panItem;
          panItem = null;
          panCookHits = 0;
          platedIds.push(cooked.id);
          ctx.sound.playPop();
          ctx.voice.speakEn(`Hot ${cooked.en}!`, `アツアツの ${cooked.ja} が やけたよ！`);
          renderCookStage();
          if (order.items.every((it) => platedIds.includes(it.id))) {
            const cEl = stageArea.querySelector('.kitchen-customer-avatar');
            finishOrder(cEl || panZone);
          }
        } else {
          renderCookStage();
        }
      },
    }, [
      el('div', { class: 'zone-emoji', text: panItem ? panItem.emoji : '🍳' }),
      el('div', {
        class: 'zone-tag',
        text: panItem ? `🔥 タップでやく (${panCookHits}/3)` : '🔥 やく',
      }),
    ]);

    const plateZone = el('div', { class: 'kitchen-plate-zone' });
    const stackWrap = el('div', { class: 'plate-stack-wrap' });
    if (platedIds.length === 0) {
      stackWrap.appendChild(el('span', { class: 'plate-empty-bun', text: '🍽️' }));
    } else {
      platedIds.forEach((id) => {
        const it = KITCHEN_ITEMS.find((x) => x.id === id);
        if (it) stackWrap.appendChild(el('span', { class: 'plated-food-item', text: it.emoji }));
      });
    }
    plateZone.append(stackWrap, el('div', { class: 'zone-tag', text: '🍽️ おさら' }));
    counter.append(panZone, plateZone);

    // 具材トレイ
    const tray = el('div', { class: 'kitchen-tray' });
    trayItems.forEach((item) => {
      const alreadyPlated = platedIds.includes(item.id) || panItem?.id === item.id;
      if (alreadyPlated) return;

      const chip = el('div', {
        class: 'kitchen-item-chip',
        style: { borderColor: item.color },
        role: 'button',
        tabindex: '0',
        'aria-label': `${item.en} ${item.ja}`,
      }, [
        el('span', { class: 'kitchen-chip-emoji', text: item.emoji }),
        el('span', { class: 'kitchen-chip-en', text: item.en }),
      ]);

      chip.addEventListener('click', () => {
        ctx.sound.playTap();
        ctx.voice.speakEn(item.en, `${item.en}（${item.ja}）`);
        bounceElement(chip);
      });

      const destroy = makeDraggable(chip, {
        getTargets: () => [
          { id: 'pan', el: panZone, radius: 100 },
          { id: 'plate', el: plateZone, radius: 105 },
        ],
        snapRadius: 105,
        enabled: () => !cookLocked,
        onStart: () => ctx.sound.playTap(),
        onNear: (t) => t.el.classList.add('is-slot-glow'),
        onLeave: (t) => t.el.classList.remove('is-slot-glow'),
        onDrop: (t) => {
          if (cookLocked) return false;
          const needed = order.items.some((o) => o.id === item.id);
          if (!needed) {
            ctx.sound.playBoing();
            shakeElement(orderBubble);
            ctx.voice.speakEn('Not in order!', 'ちゅうもん と ちがうみたい！');
            return false;
          }
          if (item.needsCook && t.id === 'plate') {
            ctx.sound.playBoing();
            bounceElement(panZone);
            ctx.voice.speakJa('まずは フライパンで ジュージュー やこう！');
            return false;
          }
          if (t.id === 'pan') {
            if (panItem) return false;
            panItem = item;
            panCookHits = 0;
            ctx.sound.playSizzle();
            ctx.voice.speakJa('フライパンを タップして ジュージュー やこう！');
            renderCookStage();
            return true;
          }
          if (t.id === 'plate') {
            platedIds.push(item.id);
            ctx.sound.playPop();
            burstAtElement(plateZone, { count: 18, preset: 'stars' });
            ctx.voice.speakEn(item.en, `${item.en}（${item.ja}）！`);
            renderCookStage();
            if (order.items.every((it) => platedIds.includes(it.id))) {
              const cEl = stageArea.querySelector('.kitchen-customer-avatar');
              finishOrder(cEl || plateZone);
            }
            return true;
          }
          return false;
        },
        onMiss: () => ctx.sound.playBoing(),
      });
      dragCleanups.push(destroy);
      tray.appendChild(chip);
    });

    stage.append(customerWrap, counter, tray);
    stageArea.replaceChildren(stage);
  }

  function renderAbcStage() {
    cleanupDrags();
    clearTimers();

    const stage = el('div', { class: 'abc-stage' });
    const spotlight = el('button', {
      type: 'button',
      class: 'abc-hero-card',
      style: { borderColor: selectedLetter.color },
      onClick: () => {
        ctx.sound.playPop();
        burstAtElement(spotlight, { count: 20, preset: 'stars' });
        ctx.voice.speakEn(
          `${selectedLetter.letter}! ${selectedLetter.word}!`,
          `${selectedLetter.letter}！ ${selectedLetter.word}（${selectedLetter.ja}）`
        );
      },
    }, [
      el('span', { class: 'abc-spot-letter', text: selectedLetter.letter, style: { color: selectedLetter.color } }),
      el('span', { class: 'abc-spot-emoji', text: selectedLetter.emoji }),
      el('div', { class: 'abc-spot-texts' }, [
        el('div', { class: 'abc-spot-word', text: selectedLetter.word }),
        el('div', { class: 'abc-spot-ja', text: selectedLetter.ja }),
      ]),
    ]);

    const grid = el('div', { class: 'abc-compact-grid' });
    ENGLISH_ALPHABET.forEach((item) => {
      const btn = el('button', {
        type: 'button',
        class: `abc-key-btn ${item.letter === selectedLetter.letter ? 'is-active' : ''}`,
        style: { borderColor: item.color },
        onClick: () => {
          selectedLetter = item;
          ctx.sound.playPop();
          burstAtElement(btn, { count: 14, preset: 'stars' });
          ctx.voice.speakEn(`${item.letter}! ${item.word}!`, `${item.letter}！ ${item.word}（${item.ja}）`);
          renderAbcStage();
        },
      }, [
        el('span', { class: 'abc-key-char', text: item.letter }),
        el('span', { class: 'abc-key-mini', text: item.emoji }),
      ]);
      grid.appendChild(btn);
    });

    stage.append(spotlight, grid);
    stageArea.replaceChildren(stage);
  }

  function renderStage() {
    if (mode === 'cook') renderCookStage();
    else renderAbcStage();
  }

  setupOrderRound();
  renderModeBar();
  renderStage();

  return () => {
    destroyed = true;
    clearTimers();
    cleanupDrags();
  };
}
