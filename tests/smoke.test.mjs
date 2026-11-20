import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HIRAGANA_LIST,
  WORD_PUZZLES,
  ENGLISH_ALPHABET,
  ENGLISH_QUIZ_ITEMS,
  ROBO_STAGES,
  PATTERN_ITEMS,
  DAILY_HABITS,
  MECH_EVOLUTIONS,
  MECH_COLORS,
  MECH_PARTS,
  DOCK_META,
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
    assert.ok(typeof item.hint === 'string' && item.hint.length > 0);
    assert.ok(Array.isArray(item.strokes) && item.strokes.length >= 1, `strokes missing for ${item.char}`);
    for (const stroke of item.strokes) {
      assert.ok(Array.isArray(stroke) && stroke.length >= 2, `stroke too short for ${item.char}`);
      for (const [x, y] of stroke) {
        assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `out-of-range point (${x},${y}) in ${item.char}`);
      }
    }
  }
});

test('WORD_PUZZLES, ENGLISH_ALPHABET, ENGLISH_QUIZ_ITEMS, PATTERN_ITEMS, DAILY_HABITS, and MECH data are complete', () => {
  assert.ok(WORD_PUZZLES.length >= 24);
  assert.equal(ENGLISH_ALPHABET.length, 26);
  const letters = new Set(ENGLISH_ALPHABET.map((e) => e.letter));
  assert.equal(letters.size, 26);
  for (let code = 65; code <= 90; code += 1) {
    assert.ok(letters.has(String.fromCharCode(code)));
  }
  assert.ok(ENGLISH_QUIZ_ITEMS.length >= 24);
  assert.ok(PATTERN_ITEMS.length >= 6);
  assert.equal(DAILY_HABITS.length, 6);
  assert.equal(MECH_EVOLUTIONS.length, 5);
  assert.equal(MECH_COLORS.length, 5);
  assert.equal(MECH_PARTS.length, 4);
  assert.equal(DOCK_META.length, 7);
});

test('ROBO_STAGES has 12 solvable stages verified by BFS and simulateRoboPath', () => {
  assert.equal(ROBO_STAGES.length, 12);
  for (const stage of ROBO_STAGES) {
    const solution = bfsHasPath(stage);
    assert.ok(Array.isArray(solution) && solution.length > 0, `Stage ${stage.id} has no BFS path`);
    const sim = simulateRoboPath(stage, solution);
    assert.equal(sim.reachedGoal, true, `Stage ${stage.id} BFS solution failed simulateRoboPath`);
    assert.equal(sim.hitWall, false);
    assert.equal(sim.hitObstacle, false);
  }
});

test('simulateRoboPath detects wall and obstacle collisions accurately', () => {
  const sampleStage = {
    id: 99,
    cols: 5,
    rows: 4,
    start: [0, 0],
    goal: [2, 0],
    obstacles: [[1, 0]],
  };

  const wallRes = simulateRoboPath(sampleStage, ['left']);
  assert.equal(wallRes.reachedGoal, false);
  assert.equal(wallRes.hitWall, true);
  assert.equal(wallRes.outOfBounds, true);

  const obsRes = simulateRoboPath(sampleStage, ['right']);
  assert.equal(obsRes.reachedGoal, false);
  assert.equal(obsRes.hitObstacle, true);

  const detourRes = simulateRoboPath(sampleStage, ['down', 'right', 'right', 'up']);
  assert.equal(detourRes.reachedGoal, true);
  assert.equal(detourRes.hitWall, false);
  assert.equal(detourRes.hitObstacle, false);
});

test('getEvolutionStage handles boundary energy values cleanly', () => {
  assert.equal(getEvolutionStage(0).level, 1);
  assert.equal(getEvolutionStage(59).level, 1);
  assert.equal(getEvolutionStage(60).level, 2);
  assert.equal(getEvolutionStage(179).level, 2);
  assert.equal(getEvolutionStage(180).level, 3);
  assert.equal(getEvolutionStage(359).level, 3);
  assert.equal(getEvolutionStage(360).level, 4);
  assert.equal(getEvolutionStage(599).level, 4);
  assert.equal(getEvolutionStage(600).level, 5);
  assert.equal(getEvolutionStage(9999).level, 5);
  assert.equal(getEvolutionStage(9999).isMax, true);
});

test('getDailyMissions is deterministic per date and returns 3 unique missions', () => {
  const d1a = getDailyMissions('2026-11-21');
  const d1b = getDailyMissions('2026-11-21');
  assert.deepEqual(d1a, d1b);
  assert.equal(d1a.length, 3);
  assert.equal(new Set(d1a.map((m) => m.id)).size, 3);

  const d2 = getDailyMissions('2026-11-22');
  const d3 = getDailyMissions('2026-11-23');
  const signatures = new Set([
    d1a.map((m) => m.id).join(','),
    d2.map((m) => m.id).join(','),
    d3.map((m) => m.id).join(','),
  ]);
  assert.ok(signatures.size >= 2);
});

test('generateMathQuestion and generateClockQuestion produce valid, non-negative, unique-option questions', () => {
  const modes = ['count', 'add', 'sub'];
  for (const mode of modes) {
    for (const level of [1, 2, 3]) {
      for (let i = 0; i < 100; i += 1) {
        const q = generateMathQuestion(mode, level);
        assert.ok(q.answer >= 0, `Negative math answer in ${mode} lv${level}`);
        assert.equal(q.options.length, 4);
        assert.equal(new Set(q.options).size, 4, `Duplicate options in ${mode} lv${level}`);
        assert.ok(q.options.includes(q.answer), `Answer missing from options in ${mode} lv${level}`);
      }
    }
  }

  for (const level of [1, 2, 3]) {
    for (let i = 0; i < 100; i += 1) {
      const cq = generateClockQuestion(level);
      assert.ok(cq.hour >= 1 && cq.hour <= 12);
      assert.ok([0, 15, 30, 45].includes(cq.minute));
      assert.equal(cq.options.length, 4);
      const keys = new Set(cq.options.map((o) => `${o.hour}:${o.minute}`));
      assert.equal(keys.size, 4, `Duplicate clock options in lv${level}`);
      assert.ok(keys.has(`${cq.hour}:${cq.minute}`));
    }
  }
});

test('classifyRgbColor distinguishes red, blue, yellow, green, and neutral colors', () => {
  assert.equal(classifyRgbColor(220, 35, 40), 'red');
  assert.equal(classifyRgbColor(30, 110, 230), 'blue');
  assert.equal(classifyRgbColor(240, 210, 35), 'yellow');
  assert.equal(classifyRgbColor(40, 185, 75), 'green');
  assert.equal(classifyRgbColor(240, 240, 240), 'other');
  assert.equal(classifyRgbColor(20, 20, 20), 'other');
  assert.equal(classifyRgbColor(128, 128, 128), 'other');
});

test('evaluateTraceCoverage accepts good trace and rejects empty or far trace', () => {
  const strokes = [
    [
      [0.2, 0.2],
      [0.5, 0.2],
      [0.8, 0.2],
    ],
    [
      [0.5, 0.2],
      [0.5, 0.8],
    ],
  ];

  const emptyRes = evaluateTraceCoverage(strokes, [], 0.16);
  assert.equal(emptyRes.passed, false);

  const farPoints = [
    [0.05, 0.95],
    [0.1, 0.95],
  ];
  const farRes = evaluateTraceCoverage(strokes, farPoints, 0.16);
  assert.equal(farRes.passed, false);

  const goodPoints = [
    [0.2, 0.2],
    [0.35, 0.21],
    [0.5, 0.2],
    [0.65, 0.2],
    [0.8, 0.2],
    [0.5, 0.4],
    [0.5, 0.6],
    [0.5, 0.8],
  ];
  const goodRes = evaluateTraceCoverage(strokes, goodPoints, 0.16);
  assert.equal(goodRes.passed, true);
  assert.ok(goodRes.coverage >= 0.8);
});

test('sanitizeProfile strips dangerous characters and normalizes invalid inputs', () => {
  const dirty = {
    childName: '<script>alert(1)</script>てす\nと',
    timerMinutes: 999,
    energy: -50,
    soundEnabled: 'yes',
    voiceEnabled: 1,
    reducedMotion: false,
    unlockedParts: ['wing', '<bad>', 'crown'],
  };
  const clean = sanitizeProfile(dirty);
  assert.ok(!clean.childName.includes('<'));
  assert.ok(!clean.childName.includes('>'));
  assert.ok(!clean.childName.includes('\n'));
  assert.ok(clean.childName.length <= 12);
  assert.equal(clean.timerMinutes, 15);
  assert.equal(clean.energy, 0);
  assert.equal(clean.soundEnabled, true);
  assert.deepEqual(clean.unlockedParts, ['none', 'wing', 'crown']);

  const blank = sanitizeProfile({ childName: '   <>  ' });
  assert.equal(blank.childName, 'たいちょう');

  // Red Team: prototype pollution & extreme values
  const malicious = JSON.parse(
    '{"__proto__":{"polluted":true},"energy":1e99,"dockCounts":{"__proto__":99,"hiragana":3},"dailyHabitLog":{"constructor":true}}'
  );
  const safeObj = sanitizeProfile(malicious);
  assert.equal({}.polluted, undefined);
  assert.equal(safeObj.energy, 999999);
  assert.equal(sanitizeProfile({ energy: 'Infinity' }).energy, 0);
  assert.equal(safeObj.dockCounts.hiragana, 3);
  assert.equal(Object.hasOwn(safeObj.dockCounts, '__proto__'), false);
  assert.equal(Object.hasOwn(safeObj.dailyHabitLog, 'constructor'), false);
  assert.equal(getEvolutionStage(Infinity).level, 1);
  assert.equal(simulateRoboPath(ROBO_STAGES[0], null).reachedGoal, false);

  const ch = generateParentChallenge();
  assert.equal(ch.a * ch.b, ch.answer);
  assert.ok(ch.question.includes('×'));
});

test('PWA manifest, PNG icons, and sw.js precache files exist and are valid', () => {
  const manifestPath = path.join(ROOT_DIR, 'manifest.webmanifest');
  assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest missing');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);

  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const icon of manifest.icons) {
    const iconFile = path.join(ROOT_DIR, icon.src.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(iconFile), `Missing icon: ${icon.src}`);
    if (icon.src.endsWith('.png')) {
      const header = fs.readFileSync(iconFile).subarray(0, 8);
      assert.ok(header.equals(pngSig), `Invalid PNG signature: ${icon.src}`);
    }
  }

  const swPath = path.join(ROOT_DIR, 'sw.js');
  assert.ok(fs.existsSync(swPath), 'sw.js missing');
  const swText = fs.readFileSync(swPath, 'utf8');
  const match = swText.match(/PRECACHE_URLS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(match, 'PRECACHE_URLS array not found in sw.js');
  const entries = [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(entries.length >= 10);
  for (const entry of entries) {
    const rel = entry === './' ? 'index.html' : entry.replace(/^\.\//, '');
    const fullPath = path.join(ROOT_DIR, rel);
    assert.ok(fs.existsSync(fullPath), `Precache entry does not exist: ${entry}`);
  }
});
