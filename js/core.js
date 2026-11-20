import {
  ATTRACTIONS,
  HERO_STICKERS,
  KITCHEN_ITEMS,
  MECH_COLORS,
  MECH_EVOLUTIONS,
  MECH_PARTS,
} from './data.js';

const VALID_TIMER_MINUTES = new Set([0, 10, 15, 20, 30]);
const VALID_COLOR_IDS = new Set(MECH_COLORS.map((c) => c.id));
const VALID_PART_IDS = new Set(MECH_PARTS.map((p) => p.id));
const VALID_STICKER_IDS = new Set(HERO_STICKERS.map((s) => s.id));
const VALID_ATTRACTION_IDS = new Set(ATTRACTIONS.map((a) => a.id));

const DAILY_MISSION_POOL = [
  { id: 'm_kana', dockId: 'monster-kana', title: 'ひらがな 2かい', icon: '🦖', targetCount: 2, rewardEnergy: 30 },
  { id: 'm_math', dockId: 'turbo-math', title: 'かずレース 2かい', icon: '🏎️', targetCount: 2, rewardEnergy: 30 },
  { id: 'm_robo', dockId: 'robo-rescue', title: 'ロボがったい 1かい', icon: '🤖', targetCount: 1, rewardEnergy: 35 },
  { id: 'm_kitchen', dockId: 'hero-kitchen', title: 'りょうり 1かい', icon: '🍔', targetCount: 1, rewardEnergy: 35 },
  { id: 'm_studio', dockId: 'magic-studio', title: 'おえかき 1かい', icon: '🎨', targetCount: 1, rewardEnergy: 30 },
  { id: 'm_habit', dockId: 'habit-base', title: 'しれい 1つ', icon: '🏝️', targetCount: 1, rewardEnergy: 30 },
];

export function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getEvolutionStage(energyInput) {
  const rawNum = Number(energyInput);
  const energy = Number.isFinite(rawNum) ? Math.max(0, Math.min(999999, Math.floor(rawNum))) : 0;
  let current = MECH_EVOLUTIONS[0];
  let currentIndex = 0;

  for (let i = 0; i < MECH_EVOLUTIONS.length; i += 1) {
    if (energy >= MECH_EVOLUTIONS[i].minEnergy) {
      current = MECH_EVOLUTIONS[i];
      currentIndex = i;
    }
  }

  const next = MECH_EVOLUTIONS[currentIndex + 1] || null;
  if (!next) {
    return {
      ...current,
      energy,
      nextEnergy: null,
      remainingToNext: 0,
      progressPct: 100,
      isMax: true,
    };
  }

  const span = next.minEnergy - current.minEnergy;
  const gained = energy - current.minEnergy;
  const progressPct = Math.max(0, Math.min(100, Math.round((gained / span) * 100)));

  return {
    ...current,
    energy,
    nextEnergy: next.minEnergy,
    nextName: next.name,
    remainingToNext: Math.max(0, next.minEnergy - energy),
    progressPct,
    isMax: false,
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getDailyMissions(dateStr) {
  const key = String(dateStr || getLocalDateKey());
  const pool = [...DAILY_MISSION_POOL];
  let seed = hashString(key);

  const nextRand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

export function advanceStarGauge(currentStars) {
  const s = Math.max(0, Math.floor(Number(currentStars) || 0));
  const next = s + 1;
  if (next >= 3) {
    return { stars: 0, capsuleReady: true };
  }
  return { stars: next, capsuleReady: false };
}

export function pickNewSticker(ownedIds = [], rng = Math.random) {
  const owned = new Set(Array.isArray(ownedIds) ? ownedIds : []);
  const unowned = HERO_STICKERS.filter((st) => !owned.has(st.id));
  const pool = unowned.length > 0 ? unowned : HERO_STICKERS;
  return pool[Math.floor(rng() * pool.length)] || HERO_STICKERS[0];
}

function randInt(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function shuffleWithRng(arr, rng) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function generateRaceWave(level = 1, rng = Math.random) {
  const lv = Math.max(1, Math.min(3, Math.floor(Number(level) || 1)));
  const isAdd = lv >= 2 && rng() > 0.4;
  let a = 1;
  let b = 0;
  let answer = 1;

  if (isAdd) {
    const maxTerm = lv === 2 ? 4 : 6;
    a = randInt(1, maxTerm, rng);
    b = randInt(1, maxTerm, rng);
    answer = a + b;
  } else {
    const minN = lv === 1 ? 1 : lv === 2 ? 3 : 5;
    const maxN = lv === 1 ? 5 : lv === 2 ? 9 : 14;
    answer = randInt(minN, maxN, rng);
    a = answer;
  }

  const laneSet = new Set([answer]);
  let guard = 0;
  while (laneSet.size < 3 && guard < 80) {
    guard += 1;
    const offset = randInt(-3, 3, rng);
    const cand = Math.max(1, answer + offset);
    laneSet.add(cand);
  }
  for (let v = 1; laneSet.size < 3; v += 1) {
    laneSet.add(v);
  }

  return {
    level: lv,
    isAdd,
    a,
    b,
    answer,
    lanes: shuffleWithRng([...laneSet], rng),
  };
}

const CUSTOMER_EMOJIS = ['🦖', '🤖', '🦁', '🐼', '🚀', '🥷'];

export function generateKitchenOrder(rng = Math.random) {
  const count = rng() > 0.45 ? 3 : 2;
  const shuffled = shuffleWithRng(KITCHEN_ITEMS, rng);
  const items = shuffled.slice(0, count);
  const customerEmoji = CUSTOMER_EMOJIS[randInt(0, CUSTOMER_EMOJIS.length - 1, rng)];
  return {
    customerEmoji,
    items,
  };
}

export function snapClockHandAngle(angleDeg, allowHalf = false) {
  let deg = Number(angleDeg);
  if (!Number.isFinite(deg)) deg = 0;
  deg = ((deg % 360) + 360) % 360;

  if (allowHalf) {
    const step15 = Math.round(deg / 15) % 24;
    let hour = Math.floor(step15 / 2);
    if (hour === 0) hour = 12;
    const minute = step15 % 2 === 1 ? 30 : 0;
    return { hour, minute };
  }

  let hour = Math.round(deg / 30) % 12;
  if (hour === 0) hour = 12;
  return { hour, minute: 0 };
}

export function simulateRoboPath(stage, commands = []) {
  const cols = Math.floor(Number(stage?.cols ?? 5));
  const rows = Math.floor(Number(stage?.rows ?? 4));
  if (!stage || !Array.isArray(stage.start) || !Array.isArray(stage.goal) || cols <= 0 || rows <= 0) {
    return {
      steps: [],
      finalPos: [0, 0],
      reachedGoal: false,
      hitWall: false,
      hitObstacle: false,
      outOfBounds: true,
      failedAtStep: 0,
    };
  }
  const startX = Number(stage.start[0]);
  const startY = Number(stage.start[1]);
  const goalX = Number(stage.goal[0]);
  const goalY = Number(stage.goal[1]);
  if (
    !Number.isInteger(startX) ||
    !Number.isInteger(startY) ||
    !Number.isInteger(goalX) ||
    !Number.isInteger(goalY) ||
    startX < 0 ||
    startX >= cols ||
    startY < 0 ||
    startY >= rows
  ) {
    return {
      steps: [],
      finalPos: [0, 0],
      reachedGoal: false,
      hitWall: false,
      hitObstacle: false,
      outOfBounds: true,
      failedAtStep: 0,
    };
  }
  const cmds = Array.isArray(commands) ? commands : [];
  const rawObs = Array.isArray(stage.obstacles) ? stage.obstacles : [];
  const obstacles = new Set(
    rawObs.filter((o) => Array.isArray(o) && o.length >= 2).map(([ox, oy]) => `${ox},${oy}`)
  );
  let x = startX;
  let y = startY;
  const steps = [[x, y]];

  const delta = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };

  for (let i = 0; i < cmds.length; i += 1) {
    const d = delta[cmds[i]];
    if (!d) continue;
    const nx = x + d[0];
    const ny = y + d[1];
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) {
      return {
        steps,
        finalPos: [x, y],
        reachedGoal: false,
        hitWall: true,
        hitObstacle: false,
        outOfBounds: true,
        failedAtStep: i,
      };
    }
    if (obstacles.has(`${nx},${ny}`)) {
      return {
        steps,
        finalPos: [x, y],
        reachedGoal: false,
        hitWall: false,
        hitObstacle: true,
        outOfBounds: false,
        failedAtStep: i,
      };
    }
    x = nx;
    y = ny;
    steps.push([x, y]);
    if (x === goalX && y === goalY) {
      return {
        steps,
        finalPos: [x, y],
        reachedGoal: true,
        hitWall: false,
        hitObstacle: false,
        outOfBounds: false,
        failedAtStep: -1,
      };
    }
  }

  return {
    steps,
    finalPos: [x, y],
    reachedGoal: x === goalX && y === goalY,
    hitWall: false,
    hitObstacle: false,
    outOfBounds: false,
    failedAtStep: -1,
  };
}

function buildUniqueNumericOptions(answer, minVal, maxVal, rng) {
  const opts = new Set([answer]);
  let guard = 0;
  while (opts.size < 4 && guard < 100) {
    guard += 1;
    const offset = randInt(-3, 3, rng);
    const candidate = Math.max(minVal, Math.min(maxVal, answer + offset));
    opts.add(candidate);
  }
  for (let v = minVal; opts.size < 4 && v <= maxVal; v += 1) {
    opts.add(v);
  }
  for (let v = maxVal + 1; opts.size < 4; v += 1) {
    opts.add(v);
  }
  return shuffleWithRng([...opts], rng);
}

const COUNT_EMOJIS = ['💎', '🚀', '⭐', '🤖', '🦖', '⚡'];

export function generateMathQuestion(mode = 'count', level = 1, rng = Math.random) {
  const lv = Math.max(1, Math.min(3, Number(level) || 1));
  const emoji = COUNT_EMOJIS[randInt(0, COUNT_EMOJIS.length - 1, rng)];

  if (mode === 'add') {
    const maxTerm = lv === 1 ? 3 : lv === 2 ? 5 : 8;
    const minTerm = lv === 3 ? 2 : 1;
    const a = randInt(minTerm, maxTerm, rng);
    const b = randInt(minTerm, maxTerm, rng);
    const answer = a + b;
    return {
      mode: 'add',
      level: lv,
      a,
      b,
      emoji,
      prompt: `${a} ＋ ${b} ＝ ？`,
      answer,
      options: buildUniqueNumericOptions(answer, 1, Math.max(10, answer + 4), rng),
    };
  }

  if (mode === 'sub') {
    const minA = lv === 1 ? 2 : lv === 2 ? 4 : 6;
    const maxA = lv === 1 ? 5 : lv === 2 ? 10 : 15;
    const a = randInt(minA, maxA, rng);
    const b = randInt(1, a, rng);
    const answer = a - b;
    return {
      mode: 'sub',
      level: lv,
      a,
      b,
      emoji,
      prompt: `${a} − ${b} ＝ ？`,
      answer,
      options: buildUniqueNumericOptions(answer, 0, Math.max(6, a), rng),
    };
  }

  const minCount = lv === 1 ? 1 : lv === 2 ? 4 : 8;
  const maxCount = lv === 1 ? 5 : lv === 2 ? 12 : 20;
  const answer = randInt(minCount, maxCount, rng);
  return {
    mode: 'count',
    level: lv,
    count: answer,
    emoji,
    prompt: `${answer} を えらぼう！`,
    answer,
    options: buildUniqueNumericOptions(answer, 1, Math.max(8, maxCount), rng),
  };
}

export function formatClockLabel(hour, minute) {
  if (minute === 0) return `${hour}じ`;
  if (minute === 30) return `${hour}じ はん`;
  return `${hour}じ ${minute}ふん`;
}

export function generateClockQuestion(level = 1, rng = Math.random) {
  const lv = Math.max(1, Math.min(3, Number(level) || 1));
  const minutePool = lv === 1 ? [0] : lv === 2 ? [0, 30] : [0, 15, 30, 45];
  const hour = randInt(1, 12, rng);
  const minute = minutePool[randInt(0, minutePool.length - 1, rng)];
  const answerKey = `${hour}:${minute}`;
  const optionMap = new Map();
  optionMap.set(answerKey, { hour, minute, label: formatClockLabel(hour, minute) });

  let guard = 0;
  while (optionMap.size < 4 && guard < 120) {
    guard += 1;
    const oh = randInt(1, 12, rng);
    const om = minutePool[randInt(0, minutePool.length - 1, rng)];
    const key = `${oh}:${om}`;
    if (!optionMap.has(key)) {
      optionMap.set(key, { hour: oh, minute: om, label: formatClockLabel(oh, om) });
    }
  }

  return {
    level: lv,
    hour,
    minute,
    label: formatClockLabel(hour, minute),
    options: shuffleWithRng([...optionMap.values()], rng),
  };
}

export function classifyRgbColor(r, g, b) {
  const rn = Math.max(0, Math.min(255, Number(r) || 0)) / 255;
  const gn = Math.max(0, Math.min(255, Number(g) || 0)) / 255;
  const bn = Math.max(0, Math.min(255, Number(b) || 0)) / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return 'other';

  const s = d / (1 - Math.abs(2 * l - 1));
  if (s < 0.25 || l < 0.14 || l > 0.90) {
    return 'other';
  }

  let h = 0;
  if (max === rn) {
    h = ((gn - bn) / d) % 6;
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  if (h >= 335 || h < 22) return 'red';
  if (h >= 38 && h < 72) return 'yellow';
  if (h >= 78 && h < 165) return 'green';
  if (h >= 190 && h <= 255) return 'blue';
  return 'other';
}

function buildCheckpoints(strokes) {
  const checkpoints = [];
  for (const stroke of strokes || []) {
    if (!Array.isArray(stroke) || stroke.length < 2) continue;
    for (let i = 0; i < stroke.length - 1; i += 1) {
      const [x1, y1] = stroke[i];
      const [x2, y2] = stroke[i + 1];
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(2, Math.ceil(dist / 0.06));
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        checkpoints.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      }
    }
  }
  return checkpoints;
}

export function evaluateTraceCoverage(strokes, points = [], tolerance = 0.16) {
  const checkpoints = buildCheckpoints(strokes);
  if (checkpoints.length === 0 || !Array.isArray(points) || points.length < 4) {
    return {
      passed: false,
      coverage: 0,
      hitCount: 0,
      totalPoints: checkpoints.length,
    };
  }

  let hitCount = 0;
  const tolSq = tolerance * tolerance;

  for (const [cx, cy] of checkpoints) {
    let hit = false;
    for (const pt of points) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const px = Number(pt[0]);
      const py = Number(pt[1]);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= tolSq) {
        hit = true;
        break;
      }
    }
    if (hit) hitCount += 1;
  }

  const coverage = hitCount / checkpoints.length;
  return {
    passed: coverage >= 0.62,
    coverage,
    hitCount,
    totalPoints: checkpoints.length,
  };
}

const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
]);

function isSafeKey(key) {
  return Boolean(key) && !FORBIDDEN_KEYS.has(key) && !(key in Object.prototype);
}

function sanitizeString(value, maxLen = 12) {
  const cleaned = String(value ?? '')
    .replace(/[<>&"'`]/g, '')
    .replace(/[\u0000-\u001F\u007F\u2000-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, '')
    .trim();
  return Array.from(cleaned).slice(0, maxLen).join('');
}

function sanitizeCountMap(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = sanitizeString(k, 32);
    if (!isSafeKey(key)) continue;
    const rawNum = Number(v);
    const n = Number.isFinite(rawNum) ? Math.max(0, Math.min(999999, Math.floor(rawNum))) : 0;
    Object.defineProperty(out, key, { value: n, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

export function createDefaultState(todayKey = getLocalDateKey()) {
  return {
    version: 2,
    childName: 'たいちょう',
    timerMinutes: 15,
    energy: 0,
    stars: 0,
    stickers: ['s01'],
    placedStickers: [{ id: 's01', x: 0.2, y: 0.65 }],
    soundEnabled: true,
    voiceEnabled: true,
    bgmEnabled: false,
    reducedMotion: false,
    mechColor: 'crimson',
    mechPart: 'none',
    unlockedParts: ['none'],
    completedRoboStages: [],
    clearedHiragana: [],
    dailyDate: todayKey,
    dailyHabitLog: {},
    missionProgress: {},
    claimedMissions: {},
    dockCounts: {},
  };
}

export function sanitizeProfile(raw) {
  const base = createDefaultState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return base;
  }

  const cleanName = sanitizeString(raw.childName, 12);
  const timerCandidate = Number(raw.timerMinutes);
  const energyCandidate = Number(raw.energy);
  const starsCandidate = Number(raw.stars);

  const unlockedSet = new Set(['none']);
  if (Array.isArray(raw.unlockedParts)) {
    for (const p of raw.unlockedParts) {
      if (VALID_PART_IDS.has(p)) unlockedSet.add(p);
    }
  }

  const mechColor = VALID_COLOR_IDS.has(raw.mechColor) ? raw.mechColor : 'crimson';
  const mechPart = unlockedSet.has(raw.mechPart) ? raw.mechPart : 'none';

  const stickersSet = new Set(['s01']);
  if (Array.isArray(raw.stickers)) {
    for (const s of raw.stickers) {
      if (VALID_STICKER_IDS.has(s)) stickersSet.add(s);
    }
  }

  const placedStickers = Array.isArray(raw.placedStickers) ? [] : [...base.placedStickers];
  if (Array.isArray(raw.placedStickers)) {
    for (const item of raw.placedStickers.slice(0, 30)) {
      if (!item || typeof item !== 'object' || !VALID_STICKER_IDS.has(item.id)) continue;
      const x = Number(item.x);
      const y = Number(item.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      placedStickers.push({
        id: item.id,
        x: Math.max(0.05, Math.min(0.95, x)),
        y: Math.max(0.05, Math.min(0.95, y)),
      });
    }
  }

  const completedRoboStages = Array.isArray(raw.completedRoboStages)
    ? [...new Set(raw.completedRoboStages.map((n) => Math.floor(Number(n))).filter((n) => n >= 1 && n <= 12))]
    : [];

  const clearedHiragana = Array.isArray(raw.clearedHiragana)
    ? [...new Set(raw.clearedHiragana.map((c) => sanitizeString(c, 2)).filter((c) => c.length === 1))]
    : [];

  const dailyHabitLog = {};
  if (raw.dailyHabitLog && typeof raw.dailyHabitLog === 'object' && !Array.isArray(raw.dailyHabitLog)) {
    for (const [k, v] of Object.entries(raw.dailyHabitLog)) {
      const key = sanitizeString(k, 24);
      if (isSafeKey(key) && v) dailyHabitLog[key] = true;
    }
  }

  const claimedMissions = {};
  if (raw.claimedMissions && typeof raw.claimedMissions === 'object' && !Array.isArray(raw.claimedMissions)) {
    for (const [k, v] of Object.entries(raw.claimedMissions)) {
      const key = sanitizeString(k, 32);
      if (isSafeKey(key) && v) claimedMissions[key] = true;
    }
  }

  const rawDockCounts = sanitizeCountMap(raw.dockCounts);
  const dockCounts = {};
  for (const [k, v] of Object.entries(rawDockCounts)) {
    if (VALID_ATTRACTION_IDS.has(k) && isSafeKey(k)) {
      dockCounts[k] = v;
    }
  }

  const dateMatch = typeof raw.dailyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dailyDate)
    ? raw.dailyDate
    : base.dailyDate;

  return {
    version: 2,
    childName: cleanName || base.childName,
    timerMinutes: VALID_TIMER_MINUTES.has(timerCandidate) ? timerCandidate : base.timerMinutes,
    energy: Number.isFinite(energyCandidate) ? Math.max(0, Math.min(999999, Math.floor(energyCandidate))) : 0,
    stars: Number.isFinite(starsCandidate) ? Math.max(0, Math.min(2, Math.floor(starsCandidate))) : 0,
    stickers: [...stickersSet],
    placedStickers,
    soundEnabled: raw.soundEnabled === undefined ? true : Boolean(raw.soundEnabled),
    voiceEnabled: raw.voiceEnabled === undefined ? true : Boolean(raw.voiceEnabled),
    bgmEnabled: Boolean(raw.bgmEnabled),
    reducedMotion: Boolean(raw.reducedMotion),
    mechColor,
    mechPart,
    unlockedParts: [...unlockedSet],
    completedRoboStages,
    clearedHiragana,
    dailyDate: dateMatch,
    dailyHabitLog,
    missionProgress: sanitizeCountMap(raw.missionProgress),
    claimedMissions,
    dockCounts,
  };
}

export function generateParentChallenge(rng = Math.random) {
  const a = randInt(2, 9, rng);
  const b = randInt(2, 9, rng);
  return {
    a,
    b,
    answer: a * b,
    question: `${a} × ${b} = ?`,
  };
}

export function formatTimeRemaining(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
