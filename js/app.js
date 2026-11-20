import { ATTRACTIONS, MECH_PARTS } from './data.js';
import {
  advanceStarGauge,
  formatTimeRemaining,
  generateParentChallenge,
  generateRaceWave,
  getEvolutionStage,
  getLocalDateKey,
  pickNewSticker,
  sanitizeProfile,
  snapClockHandAngle,
} from './core.js';
import { el } from './dom.js';
import {
  clearAllMedia,
  deleteMediaItem,
  exportStateJson,
  importStateJson,
  listMediaItems,
  loadState,
  resetStateStorage,
  rollDailyStateIfNeeded,
  saveMediaItem,
  saveState,
} from './storage.js';
import { sound } from './sound.js';
import { voice } from './voice.js';
import { createMechSvg } from './mech-svg.js';
import { bounceElement, burstAtElement, burstParticles, setFxReducedMotion, shakeElement } from './fx.js';

import { mount as mountMonsterKana } from './games/monster-kana.js';
import { mount as mountTurboMath } from './games/turbo-math.js';
import { mount as mountRoboRescue } from './games/robo-rescue.js';
import { mount as mountHeroKitchen } from './games/hero-kitchen.js';
import { mount as mountMagicStudio } from './games/magic-studio.js';
import { mount as mountHabitBase } from './games/habit-base.js';

const ATTRACTION_MOUNTERS = {
  'monster-kana': mountMonsterKana,
  'turbo-math': mountTurboMath,
  'robo-rescue': mountRoboRescue,
  'hero-kitchen': mountHeroKitchen,
  'magic-studio': mountMagicStudio,
  'habit-base': mountHabitBase,
};

const VALID_ATTRACTION_IDS = new Set(ATTRACTIONS.map((a) => a.id));

let state = loadState();
let currentView = 'home'; // 'home' | attractionId
let activeCleanup = null;
let deferredInstallPrompt = null;

// Autonomous sleep timer state
let timerRemainingSec = state.timerMinutes > 0 ? state.timerMinutes * 60 : 0;
let lastTickMs = Date.now();
let sunsetWarned = false;
let sleepActive = false;

// Gate flow state
let gateChallenge = generateParentChallenge();
let gatePurpose = 'parent'; // 'parent' | 'unlock-sleep'
let resetConfirmStep = false;
let capsuleLocked = false;

// DOM refs
const appMain = document.getElementById('app-main');
const btnHome = document.getElementById('btn-home');
const btnBgm = document.getElementById('btn-bgm');
const btnMute = document.getElementById('btn-mute');
const btnParent = document.getElementById('btn-parent');
const hudEnergyVal = document.getElementById('hud-energy-val');
const hudTimerVal = document.getElementById('hud-timer-val');
const pillTimer = document.getElementById('pill-timer');
const starNodes = [...document.querySelectorAll('.hud-star')];

const capsuleDialog = document.getElementById('capsule-dialog');
const capsuleStage = document.getElementById('capsule-stage');
const capsuleCaption = document.getElementById('capsule-caption');
const btnCapsuleOk = document.getElementById('btn-capsule-ok');

const parentGateDialog = document.getElementById('parent-gate-dialog');
const gateQuestionEl = document.getElementById('gate-question');
const gateInputEl = document.getElementById('gate-answer-input');
const gateErrorEl = document.getElementById('gate-error');
const btnGateCancel = document.getElementById('btn-gate-cancel');
const btnGateSubmit = document.getElementById('btn-gate-submit');

const parentDialog = document.getElementById('parent-dialog');
const btnParentClose = document.getElementById('btn-parent-close');
const parentChildNameEl = document.getElementById('parent-child-name');
const btnSaveName = document.getElementById('btn-save-name');
const parentTimerSelectEl = document.getElementById('parent-timer-select');
const btnResetTimer = document.getElementById('btn-reset-timer');
const btnTestSleep = document.getElementById('btn-test-sleep');
const chkSound = document.getElementById('chk-sound');
const chkVoice = document.getElementById('chk-voice');
const chkBgm = document.getElementById('chk-bgm');
const chkReducedMotion = document.getElementById('chk-reduced-motion');
const parentStatsBox = document.getElementById('parent-stats-box');
const btnExportJson = document.getElementById('btn-export-json');
const inputImportJson = document.getElementById('input-import-json');
const btnResetAll = document.getElementById('btn-reset-all');
const parentIoStatus = document.getElementById('parent-io-status');

const sleepDialog = document.getElementById('sleep-dialog');
const sleepMechSlot = document.getElementById('sleep-mech-slot');
const btnSleepUnlock = document.getElementById('btn-sleep-unlock');

const evolveDialog = document.getElementById('evolve-dialog');
const evolveMechSlot = document.getElementById('evolve-mech-slot');
const evolveDesc = document.getElementById('evolve-desc');
const btnEvolveOk = document.getElementById('btn-evolve-ok');

window.addEventListener(
  'pointerdown',
  () => {
    sound.unlock();
  },
  { passive: true }
);

function syncAudioAndMotionPrefs() {
  sound.setMuted(!state.soundEnabled);
  sound.setBgmEnabled(Boolean(state.bgmEnabled));
  voice.setEnabled(state.voiceEnabled);
  setFxReducedMotion(Boolean(state.reducedMotion));
  document.body.classList.toggle('reduced-motion', Boolean(state.reducedMotion));
  btnMute.textContent = state.soundEnabled || state.voiceEnabled ? '🔊' : '🔇';
  btnBgm.textContent = state.bgmEnabled ? '🎵' : '🎶';
  btnBgm.classList.toggle('is-bgm-on', Boolean(state.bgmEnabled));
}

function updateHud() {
  hudEnergyVal.textContent = String(state.energy);
  const stars = Number(state.stars) || 0;
  starNodes.forEach((node, idx) => {
    const lit = idx < stars;
    node.textContent = lit ? '⭐' : '☆';
    node.classList.toggle('is-lit', lit);
  });

  if (state.timerMinutes <= 0) {
    hudTimerVal.textContent = '∞';
    pillTimer.classList.remove('is-sunset');
    document.body.classList.remove('sunset-mode');
  } else {
    hudTimerVal.textContent = formatTimeRemaining(timerRemainingSec);
    const inSunset = timerRemainingSec > 0 && timerRemainingSec <= 180;
    pillTimer.classList.toggle('is-sunset', inSunset);
    document.body.classList.toggle('sunset-mode', inSunset || sleepActive);
  }
  btnHome.classList.toggle('hidden', currentView === 'home');
}

function resetPlayTimer(minutes = state.timerMinutes) {
  timerRemainingSec = minutes > 0 ? minutes * 60 : 0;
  lastTickMs = Date.now();
  sunsetWarned = false;
  sleepActive = false;
  document.body.classList.remove('sunset-mode');
  updateHud();
}

function showEvolutionCelebration(evoStage) {
  evolveMechSlot.replaceChildren(
    createMechSvg({
      stage: evoStage.level,
      colorId: state.mechColor,
      partId: state.mechPart,
      mood: 'roar',
      size: 190,
    })
  );
  evolveDesc.textContent = `レベル ${evoStage.level}「${evoStage.name}」に パワーアップ！`;
  sound.playTransform();
  voice.speakJa(`すごいぞ！ レックス・ゼロ が ${evoStage.name} に しんかしたよ！`);
  if (!evolveDialog.open) {
    evolveDialog.showModal();
  }
}

function openCapsuleDialog(sticker) {
  if (capsuleDialog.open || sleepDialog.open) return;
  capsuleLocked = true;
  let taps = 0;
  btnCapsuleOk.classList.add('hidden');
  capsuleCaption.textContent = 'カプセルを 3かい タップして わろう！';

  const orbBtn = el('button', {
    type: 'button',
    class: 'gacha-capsule-orb',
    'aria-label': 'カプセルを タップして あける',
  }, [
    el('span', { class: 'gacha-orb-half-top' }),
    el('span', { class: 'gacha-orb-band' }),
    el('span', { class: 'gacha-orb-core', text: '🎁' }),
  ]);

  orbBtn.addEventListener('click', () => {
    if (!capsuleLocked) return;
    taps += 1;
    if (taps < 3) {
      sound.playCapsuleTap(taps);
      shakeElement(orbBtn);
      burstAtElement(orbBtn, { count: 14, preset: 'stars' });
      capsuleCaption.textContent = `あと ${3 - taps}かい！`;
      return;
    }

    capsuleLocked = false;
    sound.playCapsuleOpen();
    burstAtElement(orbBtn, { count: 44, preset: 'confetti' });
    const revealed = el('div', { class: 'capsule-revealed-sticker' }, [
      el('div', { class: 'revealed-sticker-icon', text: sticker.icon }),
      el('div', { class: 'revealed-sticker-name', text: `${sticker.name} シール ゲット！` }),
    ]);
    capsuleStage.replaceChildren(revealed);
    bounceElement(revealed);
    capsuleCaption.textContent = '🏝️ シール きち で はって あそべるよ！';
    btnCapsuleOk.classList.remove('hidden');
    voice.speakJa(`やったー！ ${sticker.name} シールを ゲット したよ！`);
  });

  capsuleStage.replaceChildren(orbBtn);
  capsuleDialog.showModal();
  voice.speakJa('ヒーロー カプセル とうじょう！ 3かい タップして わろう！');
}

function updateState(updater) {
  const prev = state;
  const next = typeof updater === 'function' ? updater(prev) : updater;
  state = saveState(rollDailyStateIfNeeded(next));
  syncAudioAndMotionPrefs();
  updateHud();
}

function awardSuccess(amount, meta = {}) {
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  const beforeEvo = getEvolutionStage(state.energy);

  const todayKey = getLocalDateKey();
  const working = rollDailyStateIfNeeded(state, todayKey);
  const totalEnergy = working.energy + add;

  const starRes = advanceStarGauge(working.stars);
  let unlockedSticker = null;
  const stickersSet = new Set(working.stickers || ['s01']);
  if (starRes.capsuleReady) {
    unlockedSticker = pickNewSticker([...stickersSet]);
    stickersSet.add(unlockedSticker.id);
  }

  const unlockedSet = new Set(working.unlockedParts || ['none']);
  for (const part of MECH_PARTS) {
    if (totalEnergy >= part.unlockEnergy) {
      unlockedSet.add(part.id);
    }
  }

  const newDockCounts = { ...working.dockCounts };
  if (typeof meta.dockId === 'string' && VALID_ATTRACTION_IDS.has(meta.dockId)) {
    newDockCounts[meta.dockId] = (newDockCounts[meta.dockId] || 0) + 1;
  }

  const clearedHiraganaSet = new Set(working.clearedHiragana || []);
  if (typeof meta.hiraganaChar === 'string' && Array.from(meta.hiraganaChar).length === 1) {
    clearedHiraganaSet.add(meta.hiraganaChar);
  }

  const roboStagesSet = new Set(working.completedRoboStages || []);
  const roboId = Math.floor(Number(meta.roboStageId));
  if (Number.isInteger(roboId) && roboId >= 1 && roboId <= 12) {
    roboStagesSet.add(roboId);
  }

  state = saveState({
    ...working,
    energy: totalEnergy,
    stars: starRes.stars,
    stickers: [...stickersSet],
    unlockedParts: [...unlockedSet],
    dockCounts: newDockCounts,
    clearedHiragana: [...clearedHiraganaSet],
    completedRoboStages: [...roboStagesSet],
  });

  updateHud();
  if (currentView === 'home') {
    renderHomeView();
  }

  const afterEvo = getEvolutionStage(state.energy);
  if (unlockedSticker) {
    setTimeout(() => {
      if (!sleepDialog.open && !evolveDialog.open) openCapsuleDialog(unlockedSticker);
    }, 450);
  } else if (afterEvo.level > beforeEvo.level) {
    setTimeout(() => {
      if (!sleepDialog.open && !capsuleDialog.open) showEvolutionCelebration(afterEvo);
    }, 450);
  }
}

const gameContext = {
  getState: () => state,
  getEvoLevel: () => getEvolutionStage(state.energy).level,
  updateState,
  awardSuccess,
  awardEnergy: awardSuccess,
  sound,
  voice,
  storage: {
    saveMediaItem,
    listMediaItems,
    deleteMediaItem,
  },
};

function unmountActiveView() {
  if (typeof activeCleanup === 'function') {
    try {
      activeCleanup();
    } catch {
      // Ignore cleanup errors
    }
    activeCleanup = null;
  }
}

function navigateTo(viewId) {
  unmountActiveView();
  currentView = viewId;
  appMain.replaceChildren();
  updateHud();

  if (viewId === 'home') {
    renderHomeView();
  } else if (ATTRACTION_MOUNTERS[viewId]) {
    const meta = ATTRACTIONS.find((a) => a.id === viewId);
    if (meta?.voice) voice.speakJa(meta.voice);
    activeCleanup = ATTRACTION_MOUNTERS[viewId](appMain, gameContext);
  } else {
    currentView = 'home';
    renderHomeView();
  }
}

function renderHomeView() {
  state = rollDailyStateIfNeeded(state);
  const evo = getEvolutionStage(state.energy);

  const island = el('div', { class: 'home-island' });

  // 中央：巨大T-REX相棒メカステージ
  const heroStage = el('div', { class: 'island-hero-stage' });
  let mechMood = 'idle';
  const rexBtn = el('button', {
    type: 'button',
    class: 'rex-center-btn',
    'aria-label': 'レックス・ゼロに タッチして ほえる',
    onClick: () => {
      sound.playRoar();
      mechMood = 'roar';
      renderRex();
      bounceElement(rexBtn);
      burstAtElement(rexBtn, { count: 28, preset: 'fire' });
      voice.speakJa(`ガオー！ ${state.childName}！ どこで あそぶ？`);
      setTimeout(() => {
        if (currentView === 'home' && rexBtn.isConnected) {
          mechMood = 'idle';
          renderRex();
        }
      }, 950);
    },
  });

  function renderRex() {
    rexBtn.replaceChildren(
      createMechSvg({
        stage: evo.level,
        colorId: state.mechColor,
        partId: state.mechPart,
        mood: mechMood,
        size: 196,
      })
    );
  }
  renderRex();

  const badgeRow = el('div', { class: 'island-badge-row' }, [
    el('span', { class: 'island-pill', text: `${evo.badge} ${evo.name}` }),
    el('span', { class: 'island-pill', text: `🏅 ${(state.stickers || []).length} / 30` }),
    deferredInstallPrompt
      ? el('button', {
          type: 'button',
          class: 'btn-toy btn-emerald mini-toy-btn',
          text: '📲 アプリいれる',
          onClick: async () => {
            if (!deferredInstallPrompt) return;
            sound.playTap();
            try {
              deferredInstallPrompt.prompt();
              await deferredInstallPrompt.userChoice;
            } catch {
              // Ignore
            }
            deferredInstallPrompt = null;
            renderHomeView();
          },
        })
      : null,
  ]);

  heroStage.append(rexBtn, badgeRow);

  // 周囲6大アトラクションボタン（極大アイコン＋短いひらがなのみ）
  const ring = el('section', { class: 'attractions-grid', 'aria-label': 'あそびの エリア' });
  ATTRACTIONS.forEach((attr) => {
    const tile = el('button', {
      type: 'button',
      class: 'attraction-toy-btn',
      style: { '--attr-color': attr.color, '--attr-bg': attr.bg },
      onClick: () => {
        sound.playPop();
        burstAtElement(tile, { count: 16, preset: 'stars' });
        navigateTo(attr.id);
      },
    }, [
      el('span', { class: 'attr-icon', text: attr.icon, 'aria-hidden': 'true' }),
      el('span', { class: 'attr-label', text: attr.label }),
    ]);
    ring.appendChild(tile);
  });

  island.append(heroStage, ring);
  appMain.replaceChildren(island);
}

// Sleep Mode
function openSleepDialog() {
  if (sleepDialog.open) return;
  sleepActive = true;
  voice.stop();
  sound.playSleep();
  const evo = getEvolutionStage(state.energy);
  sleepMechSlot.replaceChildren(
    createMechSvg({
      stage: evo.level,
      colorId: state.mechColor,
      partId: state.mechPart,
      mood: 'sleep',
      size: 164,
    })
  );
  updateHud();
  sleepDialog.showModal();
  voice.speakJa('きょうは たくさん あそんだね！ レックス・ゼロ も おやすみ するよ。また あしたね！');
}

sleepDialog.addEventListener('cancel', (e) => {
  e.preventDefault();
});

sleepDialog.addEventListener('close', () => {
  sleepDialog.returnValue = '';
  if (sleepActive) {
    queueMicrotask(() => {
      if (sleepActive && !sleepDialog.open) sleepDialog.showModal();
    });
  }
});

capsuleDialog.addEventListener('cancel', (e) => {
  if (capsuleLocked) e.preventDefault();
});
capsuleDialog.addEventListener('close', () => {
  capsuleLocked = false;
  capsuleDialog.returnValue = '';
});

evolveDialog.addEventListener('close', () => {
  evolveDialog.returnValue = '';
});

parentGateDialog.addEventListener('close', () => {
  parentGateDialog.returnValue = '';
});

parentDialog.addEventListener('close', () => {
  parentDialog.returnValue = '';
});

function openParentGate(purpose = 'parent') {
  gatePurpose = purpose;
  gateChallenge = generateParentChallenge();
  gateQuestionEl.textContent = gateChallenge.question;
  gateInputEl.value = '';
  gateErrorEl.textContent = '';
  if (!parentGateDialog.open) {
    parentGateDialog.showModal();
  }
}

async function openParentDialog() {
  resetConfirmStep = false;
  btnResetAll.textContent = '🗑️ 全データ初期化';
  parentIoStatus.textContent = '';
  parentChildNameEl.value = state.childName;
  parentTimerSelectEl.value = String(state.timerMinutes);
  chkSound.checked = Boolean(state.soundEnabled);
  chkVoice.checked = Boolean(state.voiceEnabled);
  chkBgm.checked = Boolean(state.bgmEnabled);
  chkReducedMotion.checked = Boolean(state.reducedMotion);

  const evo = getEvolutionStage(state.energy);
  let scans = [];
  let drawings = [];
  try {
    scans = await listMediaItems('scans');
    drawings = await listMediaItems('drawings');
  } catch {
    // Ignore
  }

  const statsEntries = [
    { label: '累計エネルギー', val: `${state.energy} ⚡` },
    { label: 'メカレベル', val: `Lv.${evo.level} ${evo.name}` },
    { label: 'ヒーローシール', val: `${(state.stickers || []).length} / 30 枚` },
    { label: 'ひらがな習得', val: `${(state.clearedHiragana || []).length} / 46 文字` },
    { label: 'ロボ迷路攻略', val: `${(state.completedRoboStages || []).length} / 12` },
    { label: 'カメラ / おえかき', val: `${scans.length} / ${drawings.length}` },
  ];

  parentStatsBox.replaceChildren(
    ...statsEntries.map((item) =>
      el('div', { class: 'parent-stat-tile' }, [
        el('small', { text: item.label }),
        el('strong', { text: item.val }),
      ])
    )
  );

  if (!parentDialog.open) {
    parentDialog.showModal();
  }
}

// Event Wiring
btnHome.addEventListener('click', () => {
  sound.playTap();
  navigateTo('home');
  voice.speakJa(`${state.childName}！ つぎは どこで あそぶ？`);
});

btnBgm.addEventListener('click', () => {
  sound.unlock();
  const nextBgm = !state.bgmEnabled;
  updateState((prev) => ({ ...prev, bgmEnabled: nextBgm }));
  sound.playTap();
});

btnMute.addEventListener('click', () => {
  const nextActive = !(state.soundEnabled || state.voiceEnabled);
  updateState((prev) => ({
    ...prev,
    soundEnabled: nextActive,
    voiceEnabled: nextActive,
  }));
  if (nextActive) sound.playTap();
});

btnParent.addEventListener('click', () => {
  sound.playTap();
  openParentGate('parent');
});

btnCapsuleOk.addEventListener('click', () => {
  sound.playTap();
  capsuleLocked = false;
  capsuleDialog.close('ok');
});

btnSleepUnlock.addEventListener('click', () => {
  sound.playTap();
  openParentGate('unlock-sleep');
});

btnGateCancel.addEventListener('click', () => {
  parentGateDialog.close('cancel');
});

btnGateSubmit.addEventListener('click', () => {
  const rawVal = gateInputEl.value.trim();
  const val = rawVal ? Number(rawVal) : NaN;
  if (!Number.isFinite(val) || val !== gateChallenge.answer) {
    sound.playTryAgain();
    gateErrorEl.textContent = '答えが違います。もう一度お試しください。';
    gateInputEl.focus();
    return;
  }
  sound.playSuccess();
  parentGateDialog.close('ok');
  if (gatePurpose === 'unlock-sleep') {
    resetPlayTimer(state.timerMinutes);
    if (sleepDialog.open) sleepDialog.close('unlocked');
    voice.speakJa('おやすみ モードを かいじょ したよ！');
  } else {
    openParentDialog();
  }
});

gateInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    btnGateSubmit.click();
  }
});

btnParentClose.addEventListener('click', () => {
  parentDialog.close('close');
});

btnSaveName.addEventListener('click', () => {
  const clean = sanitizeProfile({ ...state, childName: parentChildNameEl.value });
  updateState(clean);
  parentChildNameEl.value = state.childName;
  parentIoStatus.textContent = `呼び名を「${state.childName}」に保存しました。`;
  if (currentView === 'home') renderHomeView();
});

parentTimerSelectEl.addEventListener('change', () => {
  const mins = Number(parentTimerSelectEl.value);
  updateState((prev) => ({ ...prev, timerMinutes: mins }));
  resetPlayTimer(mins);
  parentIoStatus.textContent = mins > 0 ? `タイマーを ${mins}分 に設定しました。` : 'タイマー制限をオフにしました。';
});

btnResetTimer.addEventListener('click', () => {
  resetPlayTimer(state.timerMinutes);
  parentIoStatus.textContent = 'タイマーを再スタートしました。';
});

btnTestSleep.addEventListener('click', () => {
  parentDialog.close('test-sleep');
  openSleepDialog();
});

chkSound.addEventListener('change', () => {
  updateState((prev) => ({ ...prev, soundEnabled: chkSound.checked }));
});

chkVoice.addEventListener('change', () => {
  updateState((prev) => ({ ...prev, voiceEnabled: chkVoice.checked }));
});

chkBgm.addEventListener('change', () => {
  updateState((prev) => ({ ...prev, bgmEnabled: chkBgm.checked }));
});

chkReducedMotion.addEventListener('change', () => {
  updateState((prev) => ({ ...prev, reducedMotion: chkReducedMotion.checked }));
});

btnExportJson.addEventListener('click', () => {
  const jsonText = exportStateJson(state);
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hero-base-zero-backup-${getLocalDateKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  parentIoStatus.textContent = 'バックアップJSONをダウンロードしました。';
});

inputImportJson.addEventListener('change', () => {
  const file = inputImportJson.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => {
    parentIoStatus.textContent = 'ファイルの読み込みに失敗しました。';
  };
  reader.onload = () => {
    try {
      const imported = importStateJson(String(reader.result));
      updateState(imported);
      resetPlayTimer(state.timerMinutes);
      openParentDialog();
      if (currentView === 'home') renderHomeView();
      parentIoStatus.textContent = 'バックアップデータを復元しました。';
    } catch {
      parentIoStatus.textContent = '読み込みに失敗しました。正しいJSONファイルを選択してください。';
    }
  };
  reader.readAsText(file, 'utf-8');
});

btnResetAll.addEventListener('click', async () => {
  if (!resetConfirmStep) {
    resetConfirmStep = true;
    btnResetAll.textContent = '⚠️ 本当に初期化（もう一度押す）';
    return;
  }
  resetConfirmStep = false;
  btnResetAll.textContent = '🗑️ 全データ初期化';
  try {
    await clearAllMedia();
  } catch {
    // Ignore
  }
  state = resetStateStorage();
  resetPlayTimer(state.timerMinutes);
  syncAudioAndMotionPrefs();
  if (currentView === 'home') renderHomeView();
  await openParentDialog();
  parentIoStatus.textContent = 'すべてのデータを初期化しました。';
});

btnEvolveOk.addEventListener('click', () => {
  evolveDialog.close('ok');
});

// 1秒ごとの自律おやすみタイマー
setInterval(() => {
  const now = Date.now();
  const elapsedSec = Math.max(0, Math.floor((now - lastTickMs) / 1000));
  if (elapsedSec < 1) return;
  lastTickMs += elapsedSec * 1000;

  if (state.timerMinutes <= 0 || sleepActive) return;

  timerRemainingSec = Math.max(0, timerRemainingSec - elapsedSec);
  if (timerRemainingSec > 0 && timerRemainingSec <= 180 && !sunsetWarned) {
    sunsetWarned = true;
    voice.speakJa('あと 3ぷんで おやすみの じかんだよ！');
  }
  updateHud();
  if (timerRemainingSec === 0) {
    openSleepDialog();
  }
}, 1000);

// Service Worker 登録
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let swRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !swRefreshing) {
      swRefreshing = true;
      window.location.reload();
    }
  });
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// PWA インストールプロンプト対応
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (currentView === 'home') renderHomeView();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  if (currentView === 'home') renderHomeView();
});

// 初期起動
syncAudioAndMotionPrefs();
updateHud();
navigateTo('home');

// 組み込みセルフテスト
window.__runSelfTest = async function runSelfTest() {
  const snapshot = typeof structuredClone === 'function' ? structuredClone(state) : JSON.parse(JSON.stringify(state));
  const prevView = currentView;
  const results = [];

  try {
    const starTest = advanceStarGauge(2);
    const waveTest = generateRaceWave(2);
    const clockTest = snapClockHandAngle(90);
    const clean = sanitizeProfile({ childName: '<script>x</script>てすと' });
    const coreOk =
      starTest.capsuleReady === true &&
      waveTest.lanes.length === 3 &&
      clockTest.hour === 3 &&
      !clean.childName.includes('<');
    results.push({ name: 'core_v2_logic', ok: coreOk });

    const views = ['home', ...ATTRACTIONS.map((a) => a.id)];
    for (const v of views) {
      navigateTo(v);
      await new Promise((r) => setTimeout(r, 40));
      const hasDom = appMain.children.length > 0;
      const noOverflow = document.documentElement.scrollWidth <= window.innerWidth + 1;
      results.push({
        name: `view_${v}`,
        ok: hasDom && noOverflow,
        hasDom,
        noOverflow,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      });
    }

    parentGateDialog.showModal();
    const gateOpened = parentGateDialog.open;
    parentGateDialog.close();

    sleepDialog.showModal();
    const sleepOpened = sleepDialog.open;
    sleepDialog.close();

    capsuleDialog.showModal();
    const capOpened = capsuleDialog.open;
    capsuleLocked = false;
    capsuleDialog.close();

    results.push({
      name: 'native_dialogs',
      ok: gateOpened && !parentGateDialog.open && sleepOpened && !sleepDialog.open && capOpened && !capsuleDialog.open,
    });
  } finally {
    state = saveState(snapshot);
    syncAudioAndMotionPrefs();
    sleepActive = false;
    capsuleLocked = false;
    document.body.classList.remove('sunset-mode');
    navigateTo(prevView || 'home');
  }

  return {
    ok: results.every((r) => r.ok),
    results,
  };
};
