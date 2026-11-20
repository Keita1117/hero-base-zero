import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ATTRACTIONS,
  HIRAGANA_LIST,
  MECH_PUZZLES,
  KITCHEN_ITEMS,
  HERO_STICKERS,
  ENGLISH_ALPHABET,
  ROBO_STAGES,
  DAILY_HABITS,
  MECH_EVOLUTIONS,
  MECH_COLORS,
  MECH_PARTS,
} from '../js/data.js';

import {
  getEvolutionStage,
  getDailyMissions,
  simulateRoboPath,
  generateMathQuestion,
  generateClockQuestion,
  classifyRgbColor,
  evaluateTraceCoverage,
  sanitizeProfile,
  generateParentChallenge,
  advanceStarGauge,
  pickNewSticker,
  generateRaceWave,
  generateKitchenOrder,
  snapClockHandAngle,
} from '../js/core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function bfsHasPath(stage) {
  const cols = stage.cols ?? 5;
  const rows = stage.rows ?? 4;
  const blocked = new Set((stage.obstacles || []).map(([x, y]) => `${x},${y}`));
  const startKey = `${stage.start[0]},${stage.start[1]}`;
  const goalKey = `${stage.goal[0]},${stage.goal[1]}`;
  if (blocked.has(startKey) || blocked.has(goalKey)) return false;

  const queue = [[stage.start[0], stage.start[1], []]];
  const visited = new Set([startKey]);
  const dirs = [
    ['up', 0, -1],
    ['down', 0, 1],
    ['left', -1, 0],
    ['right', 1, 0],
  ];

  while (queue.length > 0) {
    const [x, y, pathCmds] = queue.shift();
    if (x === stage.goal[0] && y === stage.goal[1]) {
      return pathCmds;
    }
    for (const [cmd, dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (blocked.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push([nx, ny, [...pathCmds, cmd]]);
    }
  }
  return null;
}

test('HIRAGANA_LIST has 46 unique characters with valid normalized strokes', () => {
  assert.equal(HIRAGANA_LIST.length, 46);
  const chars = new Set(HIRAGANA_LIST.map((item) => item.char));
  assert.equal(chars.size, 46);

  for (const item of HIRAGANA_LIST) {
    assert.ok(typeof item.char === 'string' && item.char.length === 1);
    assert.ok(typeof item.word === 'string' && item.word.length > 0);
    assert.ok(typeof item.emoji === 'string' && item.emoji.length > 0);
    assert.ok(Array.isArray(item.strokes) && item.strokes.length >= 1, `strokes missing for ${item.char}`);
    for (const stroke of item.strokes) {
      assert.ok(Array.isArray(stroke) && stroke.length >= 2, `stroke too short for ${item.char}`);
      for (const [x, y] of stroke) {
        assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `out-of-range point (${x},${y}) in ${item.char}`);
      }
    }
  }
});

test('v2 game data collections (ATTRACTIONS, MECH_PUZZLES, KITCHEN_ITEMS, HERO_STICKERS) are complete', () => {
  assert.equal(ATTRACTIONS.length, 6);
  assert.equal(new Set(ATTRACTIONS.map((a) => a.id)).size, 6);
  assert.ok(MECH_PUZZLES.length >= 4);
  for (const puzzle of MECH_PUZZLES) {
    assert.equal(puzzle.parts.length, 4);
    for (const part of puzzle.parts) {
      assert.ok(part.targetX >= 0 && part.targetX <= 1);
      assert.ok(part.targetY >= 0 && part.targetY <= 1);
    }
  }
  assert.ok(KITCHEN_ITEMS.length >= 12);
  assert.equal(HERO_STICKERS.length, 30);
  assert.equal(new Set(HERO_STICKERS.map((s) => s.id)).size, 30);

  assert.equal(ENGLISH_ALPHABET.length, 26);
  assert.equal(DAILY_HABITS.length, 6);
  assert.equal(MECH_EVOLUTIONS.length, 5);
  assert.equal(MECH_COLORS.length, 5);
  assert.equal(MECH_PARTS.length, 4);
});

test('ROBO_STAGES has 12 solvable stages verified by BFS and simulateRoboPath', () => {
  assert.equal(ROBO_STAGES.length, 12);
  for (const stage of ROBO_STAGES) {
    const solution = bfsHasPath(stage);
    assert.ok(Array.isArray(solution) && solution.length > 0, `Stage ${stage.id} has no BFS path`);
    const sim = simulateRoboPath(stage, solution);
    assert.equal(sim.reachedGoal, true, `Stage ${stage.id} BFS solution failed simulateRoboPath`);
  }
});

test('v2 core game loop functions (advanceStarGauge, pickNewSticker, generateRaceWave, generateKitchenOrder, snapClockHandAngle)', () => {
  assert.deepEqual(advanceStarGauge(0), { stars: 1, capsuleReady: false });
  assert.deepEqual(advanceStarGauge(1), { stars: 2, capsuleReady: false });
  assert.deepEqual(advanceStarGauge(2), { stars: 0, capsuleReady: true });

  const owned = HERO_STICKERS.slice(0, 29).map((s) => s.id);
  const lastPick = pickNewSticker(owned);
  assert.equal(lastPick.id, HERO_STICKERS[29].id);

  const fullPick = pickNewSticker(HERO_STICKERS.map((s) => s.id));
  assert.ok(HERO_STICKERS.some((s) => s.id === fullPick.id));

  for (let lv = 1; lv <= 3; lv += 1) {
    for (let i = 0; i < 40; i += 1) {
      const wave = generateRaceWave(lv);
      assert.equal(wave.lanes.length, 3);
      assert.equal(new Set(wave.lanes).size, 3);
      assert.ok(wave.lanes.includes(wave.answer));
      assert.ok(wave.answer >= 1);
    }
  }

  for (let i = 0; i < 30; i += 1) {
    const order = generateKitchenOrder();
    assert.ok(order.items.length >= 2 && order.items.length <= 3);
    assert.ok(typeof order.customerEmoji === 'string' && order.customerEmoji.length > 0);
  }

  assert.deepEqual(snapClockHandAngle(0), { hour: 12, minute: 0 });
  assert.deepEqual(snapClockHandAngle(90), { hour: 3, minute: 0 });
  assert.deepEqual(snapClockHandAngle(180), { hour: 6, minute: 0 });
  assert.deepEqual(snapClockHandAngle(270), { hour: 9, minute: 0 });
  assert.deepEqual(snapClockHandAngle(95, true), { hour: 3, minute: 0 });
  assert.deepEqual(snapClockHandAngle(105, true), { hour: 3, minute: 30 });
});

test('getEvolutionStage, getDailyMissions, generateMathQuestion, generateClockQuestion, classifyRgbColor, evaluateTraceCoverage', () => {
  assert.equal(getEvolutionStage(0).level, 1);
  assert.equal(getEvolutionStage(60).level, 2);
  assert.equal(getEvolutionStage(600).level, 5);
  assert.equal(getEvolutionStage(Infinity).level, 1);

  const d1 = getDailyMissions('2026-11-21');
  assert.equal(d1.length, 3);
  assert.equal(new Set(d1.map((m) => m.id)).size, 3);

  for (const mode of ['count', 'add', 'sub']) {
    const q = generateMathQuestion(mode, 2);
    assert.ok(q.answer >= 0);
    assert.equal(q.options.length, 4);
    assert.ok(q.options.includes(q.answer));
  }

  const cq = generateClockQuestion(2);
  assert.ok(cq.hour >= 1 && cq.hour <= 12);
  assert.equal(cq.options.length, 4);

  assert.equal(classifyRgbColor(220, 35, 40), 'red');
  assert.equal(classifyRgbColor(30, 110, 230), 'blue');
  assert.equal(classifyRgbColor(240, 210, 35), 'yellow');
  assert.equal(classifyRgbColor(40, 185, 75), 'green');
  assert.equal(classifyRgbColor(240, 240, 240), 'other');

  const strokes = [[[0.2, 0.2], [0.5, 0.2], [0.8, 0.2]]];
  assert.equal(evaluateTraceCoverage(strokes, [], 0.16).passed, false);
  assert.equal(
    evaluateTraceCoverage(strokes, [[0.2, 0.2], [0.4, 0.2], [0.6, 0.2], [0.8, 0.2]], 0.16).passed,
    true
  );
});

test('sanitizeProfile strips XSS, prototypes, and keeps v2 star/sticker state safe', () => {
  const dirty = {
    childName: '<script>alert(1)</script>てす\nと',
    timerMinutes: 999,
    energy: -50,
    stars: 2,
    stickers: ['s01', '<bad>', 's02'],
    placedStickers: [{ id: 's01', x: 1.5, y: -0.2 }, { id: 'bad', x: 0.5, y: 0.5 }],
    bgmEnabled: true,
    unlockedParts: ['wing', '<bad>'],
  };
  const clean = sanitizeProfile(dirty);
  assert.ok(!clean.childName.includes('<'));
  assert.equal(clean.timerMinutes, 15);
  assert.equal(clean.energy, 0);
  assert.equal(clean.stars, 2);
  assert.deepEqual(clean.stickers, ['s01', 's02']);
  assert.equal(clean.placedStickers.length, 1);
  assert.ok(clean.placedStickers[0].x <= 0.95 && clean.placedStickers[0].y >= 0.05);
  assert.equal(clean.bgmEnabled, true);
  assert.deepEqual(clean.unlockedParts, ['none', 'wing']);

  const malicious = JSON.parse(
    '{"__proto__":{"polluted":true},"energy":1e99,"dockCounts":{"__proto__":99,"__defineGetter__":5}}'
  );
  const safeObj = sanitizeProfile(malicious);
  assert.equal({}.polluted, undefined);
  assert.equal(safeObj.energy, 999999);
  assert.equal(Object.hasOwn(safeObj.dockCounts, '__proto__'), false);
  assert.equal(Object.hasOwn(safeObj.dockCounts, '__defineGetter__'), false);

  const ch = generateParentChallenge();
  assert.equal(ch.a * ch.b, ch.answer);
});

test('PWA manifest, PNG icons, and sw.js precache files exist and are valid', () => {
  const manifestPath = path.join(ROOT_DIR, 'manifest.webmanifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);

  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const icon of manifest.icons) {
    const iconFile = path.join(ROOT_DIR, icon.src.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(iconFile), `Missing icon: ${icon.src}`);
    if (icon.src.endsWith('.png')) {
      assert.ok(fs.readFileSync(iconFile).subarray(0, 8).equals(pngSig));
    }
  }

  const swText = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  const match = swText.match(/PRECACHE_URLS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(match, 'PRECACHE_URLS array not found in sw.js');
  const entries = [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(entries.length >= 12);
  for (const entry of entries) {
    const rel = entry === './' ? 'index.html' : entry.replace(/^\.\//, '');
    assert.ok(fs.existsSync(path.join(ROOT_DIR, rel)), `Precache entry does not exist: ${entry}`);
  }
});
