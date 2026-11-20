import { DOCK_META, MECH_PARTS } from './data.js';
import { el } from './dom.js';
import {
  formatTimeRemaining,
  generateParentChallenge,
  getDailyMissions,
  getEvolutionStage,
  getLocalDateKey,
  sanitizeProfile,
} from './core.js';
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

import { mount as mountHiragana } from './games/hiragana.js';
import { mount as mountMath } from './games/math-clock.js';
import { mount as mountRobo } from './games/logic-robo.js';
import { mount as mountEnglish } from './games/english.js';
import { mount as mountScanner } from './games/scanner.js';
import { mount as mountStudio } from './games/studio.js';
import { mount as mountHabits } from './games/habits-mech.js';

const DOCK_MOUNTERS = {
  hiragana: mountHiragana,
  math: mountMath,
  robo: mountRobo,
  english: mountEnglish,
  scanner: mountScanner,
  studio: mountStudio,
  habits: mountHabits,
};

const VALID_DOCK_IDS = new Set(DOCK_META.map((d) => d.id));

let state = loadState();
let currentView = 'home'; // 'home' | dockId
let activeCleanup = null;

// Autonomous sleep timer state
let timerRemainingSec = state.timerMinutes > 0 ? state.timerMinutes * 60 : 0;
let lastTickMs = Date.now();
let sunsetWarned = false;
let sleepActive = false;

// Gate flow state
let gateChallenge = generateParentChallenge();
let gatePurpose = 'parent'; // 'parent' | 'unlock-sleep'
let resetConfirmStep = false;

// DOM refs
const appMain = document.getElementById('app-main');
const btnHome = document.getElementById('btn-home');
const btnMute = document.getElementById('btn-mute');
const btnParent = document.getElementById('btn-parent');
const hudEnergyVal = document.getElementById('hud-energy-val');
const hudTimerVal = document.getElementById('hud-timer-val');
const pillTimer = document.getElementById('pill-timer');
const bubbleText = document.getElementById('companion-bubble-text');

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

// Sound & Voice initialization
voice.setBubbleListener((txt) => {
  if (bubbleText) bubbleText.textContent = txt;
});

window.addEventListener(
  'pointerdown',
  () => {
    sound.unlock();
  },
  { passive: true }
);

function syncAudioAndMotionPrefs() {
  sound.setMuted(!state.soundEnabled);
  voice.setEnabled(state.voiceEnabled);
  document.body.classList.toggle('reduced-motion', Boolean(state.reducedMotion));
  btnMute.textContent = state.soundEnabled || state.voiceEnabled ? '🔊' : '🔇';
}

function updateHud() {
  hudEnergyVal.textContent = String(state.energy);
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
      mood: 'happy',
      size: 180,
    })
  );
  evolveDesc.textContent = `レベル ${evoStage.level}「${evoStage.name}」に パワーアップしたよ！ ${evoStage.comment}`;
  sound.playTransform();
  voice.speakJa(`すごいぞ！ レックス・ゼロ が ${evoStage.name} に しんかしたよ！`);
  if (!evolveDialog.open) {
    evolveDialog.showModal();
  }
}

function updateState(updater) {
  const prev = state;
  const next = typeof updater === 'function' ? updater(prev) : updater;
  state = saveState(rollDailyStateIfNeeded(next));
  syncAudioAndMotionPrefs();
  updateHud();
}

function awardEnergy(amount, meta = {}) {
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  const beforeEvo = getEvolutionStage(state.energy);

  const todayKey = getLocalDateKey();
  let working = rollDailyStateIfNeeded(state, todayKey);
  let bonusEnergy = 0;

  const newMissionProgress = { ...working.missionProgress };
  const newClaimed = { ...working.claimedMissions };

  if (meta.missionId) {
    const todayMissions = getDailyMissions(todayKey);
    const mission = todayMissions.find((m) => m.id === meta.missionId);
    if (mission) {
      const nextCount = (newMissionProgress[mission.id] || 0) + 1;
      newMissionProgress[mission.id] = nextCount;
      if (nextCount >= mission.targetCount && !newClaimed[mission.id]) {
        newClaimed[mission.id] = true;
        bonusEnergy += mission.rewardEnergy;
      }
    }
  }

  const totalEnergy = working.energy + add + bonusEnergy;

  // 解禁パーツ更新
  const unlockedSet = new Set(working.unlockedParts || ['none']);
  for (const part of MECH_PARTS) {
    if (totalEnergy >= part.unlockEnergy) {
      unlockedSet.add(part.id);
    }
  }

  const newDockCounts = { ...working.dockCounts };
  if (typeof meta.dockId === 'string' && VALID_DOCK_IDS.has(meta.dockId)) {
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
    unlockedParts: [...unlockedSet],
    dockCounts: newDockCounts,
    missionProgress: newMissionProgress,
    claimedMissions: newClaimed,
    clearedHiragana: [...clearedHiraganaSet],
    completedRoboStages: [...roboStagesSet],
  });

  updateHud();
  if (currentView === 'home') {
    renderHomeView();
  }

  const afterEvo = getEvolutionStage(state.energy);
  if (afterEvo.level > beforeEvo.level) {
    setTimeout(() => showEvolutionCelebration(afterEvo), 450);
  } else if (bonusEnergy > 0) {
    sound.playCombo();
    voice.speakJa(`きょうの しれい クリア！ ボーナス ${bonusEnergy} エネルギー ゲット！`);
  }
}

const dockContext = {
  getState: () => state,
  updateState,
  awardEnergy,
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
  } else if (DOCK_MOUNTERS[viewId]) {
    activeCleanup = DOCK_MOUNTERS[viewId](appMain, dockContext);
  } else {
    currentView = 'home';
    renderHomeView();
  }
}

function renderHomeView() {
  state = rollDailyStateIfNeeded(state);
  const evo = getEvolutionStage(state.energy);
  const todayMissions = getDailyMissions(getLocalDateKey());
  voice.notifyBubble(`${state.childName} の ひみつきち！ どの ドックから あそぶ？`);

  const layout = el('div', { class: 'home-layout' });

  // Hero Deck
  const heroCard = el('section', { class: 'panel-card home-hero' });
  const mechBtn = el('button', {
    type: 'button',
    class: 'hero-mech-btn',
    'aria-label': 'レックス・ゼロに タッチして あいさつ',
    onClick: () => {
      sound.playCombo();
      voice.speakJa(`${state.childName}！ きょうも いっしょに たのしく べんきょう しようぜ！`);
      mechBtn.replaceChildren(
        createMechSvg({
          stage: evo.level,
          colorId: state.mechColor,
          partId: state.mechPart,
          mood: 'happy',
          size: 168,
        })
      );
      setTimeout(() => {
        if (currentView === 'home' && mechBtn.isConnected) {
          mechBtn.replaceChildren(
            createMechSvg({
              stage: evo.level,
              colorId: state.mechColor,
              partId: state.mechPart,
              mood: 'idle',
              size: 168,
            })
          );
        }
      }, 1100);
    },
  }, [
    createMechSvg({
      stage: evo.level,
      colorId: state.mechColor,
      partId: state.mechPart,
      mood: 'idle',
      size: 168,
    }),
  ]);

  const greetingBox = el('div', { class: 'hero-greeting' }, [
    el('h1', { text: `${state.childName} の ひみつきち！` }),
    el('div', { class: 'hero-stage-badge', text: `${evo.badge} レベル ${evo.level}：${evo.name}` }),
    el('div', { class: 'energy-meter' }, [
      el('div', { class: 'energy-meter-fill', style: `width:${evo.progressPct}%` }),
    ]),
    el('div', {
      class: 'energy-meter-label',
      text: evo.isMax
        ? `⚡ さいきょう レベル かんせい！（${evo.energy}⚡）`
        : `⚡ つぎの しんか まで あと ${evo.remainingToNext} エネルギー！`,
    }),
  ]);

  heroCard.append(mechBtn, greetingBox);

  // Daily 3 Missions
  const missionsCard = el('section', { class: 'panel-card missions-strip' }, [
    el('h2', { text: '⭐ きょうの ヒーロー しれい（3つ クリアで ボーナス！）' }),
  ]);
  const missionsGrid = el('div', { class: 'missions-grid' });
  todayMissions.forEach((m) => {
    const cur = Math.min(m.targetCount, state.missionProgress?.[m.id] || 0);
    const claimed = Boolean(state.claimedMissions?.[m.id]);
    missionsGrid.appendChild(
      el('button', {
        type: 'button',
        class: `mission-card-btn ${claimed ? 'is-claimed' : ''}`,
        onClick: () => {
          sound.playTap();
          navigateTo(m.dockId);
        },
      }, [
        el('span', { class: 'mission-icon', text: m.icon, 'aria-hidden': 'true' }),
        el('div', { class: 'mission-info' }, [
          el('div', { class: 'mission-title', text: m.title }),
          el('div', {
            class: 'mission-progress',
            text: claimed ? `✅ クリア！ +${m.rewardEnergy}⚡` : `しんこう：${cur} / ${m.targetCount}（+${m.rewardEnergy}⚡）`,
          }),
        ]),
      ])
    );
  });
  missionsCard.appendChild(missionsGrid);

  // 7 Dock Launcher Grid
  const docksGrid = el('section', { class: 'docks-grid', 'aria-label': '7つの ドック' });
  DOCK_META.forEach((dock) => {
    docksGrid.appendChild(
      el('button', {
        type: 'button',
        class: 'dock-launch-card',
        style: `--dock-accent:${dock.color}`,
        onClick: () => {
          sound.playTap();
          navigateTo(dock.id);
        },
      }, [
        el('div', { class: 'dock-card-top' }, [
          el('span', { class: 'dock-card-icon', text: dock.icon, 'aria-hidden': 'true' }),
          el('span', { class: 'dock-card-go', text: 'しゅつどう ▶' }),
        ]),
        el('div', { class: 'dock-card-title', text: dock.title }),
        el('div', { class: 'dock-card-desc', text: dock.desc }),
      ])
    );
  });

  layout.append(heroCard, missionsCard, docksGrid);
  appMain.replaceChildren(layout);
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
  voice.speakJa('きょうは たくさん がんばったね！ レックス・ゼロ も おやすみ するよ。また あしたね！');
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

evolveDialog.addEventListener('close', () => {
  evolveDialog.returnValue = '';
});

parentGateDialog.addEventListener('close', () => {
  parentGateDialog.returnValue = '';
});

parentDialog.addEventListener('close', () => {
  parentDialog.returnValue = '';
});

// Parent Gate
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
  chkReducedMotion.checked = Boolean(state.reducedMotion);

  const evo = getEvolutionStage(state.energy);
  let scans = [];
  let drawings = [];
  try {
    scans = await listMediaItems('scans');
    drawings = await listMediaItems('drawings');
  } catch {
    // Fallback gracefully if IndexedDB is unavailable
  }

  const statsEntries = [
    { label: '累計エネルギー', val: `${state.energy} ⚡` },
    { label: 'メカレベル', val: `Lv.${evo.level} ${evo.name}` },
    { label: 'ひらがな習得', val: `${(state.clearedHiragana || []).length} / 46 文字` },
    { label: 'ロボ攻略', val: `${(state.completedRoboStages || []).length} / 12 ステージ` },
    { label: 'カメラ図鑑', val: `${scans.length} 件` },
    { label: 'おえかき保存', val: `${drawings.length} 件` },
    ...DOCK_META.map((d) => ({
      label: d.shortTitle,
      val: `${state.dockCounts?.[d.id] || 0} 回`,
    })),
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
  voice.speakJa(`${state.childName} の ひみつきち！ つぎは なにを する？`);
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

btnSleepUnlock.addEventListener('click', () => {
  sound.playTap();
  openParentGate('unlock-sleep');
});

btnGateCancel.addEventListener('click', () => {
  parentGateDialog.close('cancel');
});

btnGateSubmit.addEventListener('click', () => {
  const val = Number(gateInputEl.value.trim());
  if (val !== gateChallenge.answer) {
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
    // Continue resetting state even if media DB clear fails
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

// 1秒ごとの自律おやすみタイマー（バックグラウンド経過も実時刻で補正）
setInterval(() => {
  const now = Date.now();
  const elapsedSec = Math.max(0, Math.floor((now - lastTickMs) / 1000));
  if (elapsedSec < 1) return;
  lastTickMs += elapsedSec * 1000;

  if (state.timerMinutes <= 0 || sleepActive) return;

  timerRemainingSec = Math.max(0, timerRemainingSec - elapsedSec);
  if (timerRemainingSec > 0 && timerRemainingSec <= 180 && !sunsetWarned) {
    sunsetWarned = true;
    voice.speakJa('あと 3ぷんで おやすみの じかんだよ！ そろそろ しまいの じゅんびしようね！');
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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// 初期起動
syncAudioAndMotionPrefs();
updateHud();
navigateTo('home');

// 組み込みセルフテスト（実機検証用）
window.__runSelfTest = async function runSelfTest() {
  const snapshot = typeof structuredClone === 'function' ? structuredClone(state) : JSON.parse(JSON.stringify(state));
  const prevView = currentView;
  const results = [];

  try {
    // 1. Core checks
    const evo0 = getEvolutionStage(0);
    const evo600 = getEvolutionStage(600);
    const missions = getDailyMissions('2026-11-21');
    const clean = sanitizeProfile({ childName: '<script>x</script>てすと' });
    const coreOk =
      evo0.level === 1 &&
      evo600.level === 5 &&
      missions.length === 3 &&
      !clean.childName.includes('<');
    results.push({ name: 'core_logic', ok: coreOk });

    // 2. Mount & unmount Home + all 7 docks and check overflow
    const views = ['home', ...DOCK_META.map((d) => d.id)];
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

    // 3. Dialog open/close check
    parentGateDialog.showModal();
    const gateOpened = parentGateDialog.open;
    parentGateDialog.close();

    sleepDialog.showModal();
    const sleepOpened = sleepDialog.open;
    sleepDialog.close();

    results.push({
      name: 'native_dialogs',
      ok: gateOpened && !parentGateDialog.open && sleepOpened && !sleepDialog.open,
    });
  } finally {
    state = saveState(snapshot);
    syncAudioAndMotionPrefs();
    sleepActive = false;
    document.body.classList.remove('sunset-mode');
    navigateTo(prevView || 'home');
  }

  return {
    ok: results.every((r) => r.ok),
    results,
  };
};
