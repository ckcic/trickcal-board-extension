import assert from 'node:assert/strict';
import test from 'node:test';
import { searchResetSets } from '../src/domain/redistributionSearch.ts';
import { recommendHwangRedistribution, iterateHwangRedistribution } from '../src/domain/hwangRedistribution.ts';
import { calculateRedistributionCurve } from '../src/domain/redistributionCurve.ts';

const compare = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
const start = { id: 1, nodeType: 2, grid: { x: 0, y: 0 } };
const yellow = (id, x, y, cost, type = 88, value = 60) => ({ id, nodeType: 5, grid: { x, y }, requireItems: [{ item: 610004, value: cost }], stats: [{ statType: type, statValue: value }] });
const normal = (id, x, y) => ({ id, nodeType: 3, grid: { x, y }, requireItems: [{ item: 610001, value: 1 }] });
const apostle = (id, nodes, stepStr = '') => ({ apostleId: id, name: `가명${id}`, isOwned: true, boards: [{ unlocked: true, masterNodes: [start, ...nodes], stepStr }] });
const mapFor = (...apostles) => new Map(apostles.map(a => [String(a.apostleId), a]));
const options = (overrides = {}) => ({ ownedCrayons: 0, ownedBokr: 0, maxReset: 0, priorities: [{ stat: 'atk_phys', target: 6 }], ...overrides });

test('small reset search agrees with an independent bitmask oracle for every limit, including infeasible parents', () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  const value = set => set.size === 1 && set.has(8) ? null : { ids: [...set], gain: [...set].reduce((v, id) => v + id, 0) + (set.has(8) && set.has(7) ? 100 : 0) };
  const score = v => [v.gain, -v.ids.length];
  let calls = 0;
  const points = [...searchResetSets(ids, 8, set => { calls++; return value(set); }, score, compare)];
  assert.equal(calls, 256);
  for (const { limit, best } of points) {
    let optimum = value(new Set());
    for (let mask = 0; mask < 256; mask++) {
      const set = new Set(ids.filter((_, i) => mask & (1 << i)));
      if (set.size > limit) continue;
      const candidate = value(set);
      if (candidate && compare(score(candidate), score(optimum)) > 0) optimum = candidate;
    }
    assert.deepEqual(score(best), score(optimum));
  }
});

test('large reset beam considers every singleton and retains a non-prefix pair', () => {
  const seen = new Set();
  const points = [...searchResetSets(Array.from({ length: 12 }, (_, i) => i + 1), 2, ids => {
    seen.add([...ids].join(',')); return { ids: [...ids], gain: (ids.has(12) ? 50 : 0) + (ids.has(1) ? 5 : 0) };
  }, v => [v.gain, -v.ids.length], compare)];
  for (let id = 1; id <= 12; id++) assert.ok(seen.has(String(id)));
  assert.deepEqual(points[2].best.ids, [1, 12]);
});

test('reset search skips a high-refund apostle whose normal restoration consumes the refund', () => {
  const progress = mapFor(
    apostle(1, [yellow(2, 1, 0, 4, 99), normal(3, 2, 0)], '111'),
    apostle(2, [yellow(2, 1, 0, 2, 99)], '11'),
    apostle(3, [yellow(2, 1, 0, 2)]));
  const original = JSON.stringify([...progress]);
  const plan = recommendHwangRedistribution(progress, options({ maxReset: 1 }));
  assert.equal(plan.after.atk_phys, 6);
  assert.deepEqual(plan.actions.filter(a => a.reset).map(a => a.apostle.apostleId), [2]);
  assert.ok(plan.selected.has('1:0:2'));
  assert.equal(JSON.stringify([...progress]), original);
  const points = [...iterateHwangRedistribution(progress, options({ maxReset: 3 }))];
  assert.equal(points[0].plan.after.atk_phys, 0);
  assert.ok(points.every((p, i) => p.plan.resetCount <= i && (i === 0 || p.plan.after.atk_phys >= points[i - 1].plan.after.atk_phys)));
});

test('multi-resource paths use extra hwang to avoid an unaffordable bokr shortcut', () => {
  const bokr = { id: 2, nodeType: 4, grid: { x: 1, y: 0 }, requireItems: [{ item: 610003, value: 5 }] };
  const progress = mapFor(apostle(1, [bokr, yellow(3, 2, 0, 2), yellow(4, 0, 1, 2, 95), normal(5, 1, 1), normal(6, 2, 1)]));
  const plan = recommendHwangRedistribution(progress, options({ ownedCrayons: 4 }));
  assert.equal(plan.after.atk_phys, 6);
  assert.equal(plan.spend.ultraCrayon, 4); assert.equal(plan.spend.epicCrayon, 0);
  assert.deepEqual(plan.actions[0].paint.map(e => e.node.id), [4, 5, 6, 3]);
  assert.equal(recommendHwangRedistribution(progress, options({ ownedCrayons: 2 })).after.atk_phys, 0);
  const cheap = recommendHwangRedistribution(progress, options({ ownedCrayons: 2, ownedBokr: 5 }));
  assert.equal(cheap.after.atk_phys, 6); assert.equal(cheap.spend.ultraCrayon, 2);
});

test('alternative routes still respect blocked hwang and closed gates', () => {
  for (const blocker of [yellow(4, 0, 1, 2, 99), { id: 4, nodeType: 1, grid: { x: 0, y: 1 } }]) {
    const progress = mapFor(apostle(1, [
      { id: 2, nodeType: 4, grid: { x: 1, y: 0 }, requireItems: [{ item: 610003, value: 5 }] },
      yellow(3, 2, 0, 2), blocker, normal(5, 1, 1), normal(6, 2, 1)]));
    const plan = recommendHwangRedistribution(progress, options({ ownedCrayons: 4, stages: [{ allowBlocked: false, targets: [{ stat: 'atk_phys', target: 6 }] }] }));
    assert.equal(plan.after.atk_phys, 0);
  }
});

test('bounded allocation lookahead escapes the ratio-greedy knapsack trap', () => {
  const progress = mapFor(apostle(1, [yellow(2, 1, 0, 3, 88, 50)]),
    apostle(2, [yellow(2, 1, 0, 4)]), apostle(3, [yellow(2, 1, 0, 4)]));
  const plan = recommendHwangRedistribution(progress, options({ ownedCrayons: 8, priorities: [{ stat: 'atk_phys', target: 12 }] }));
  // Independent exhaustive 0/1 knapsack: greedy buys 5 + 6, optimum buys 6 + 6.
  const items = [[3, 5], [4, 6], [4, 6]];
  let optimum = 0;
  for (let mask = 0; mask < 8; mask++) {
    const chosen = items.filter((_, i) => mask & (1 << i));
    if (chosen.reduce((v, [cost]) => v + cost, 0) <= 8) optimum = Math.max(optimum, chosen.reduce((v, [, gain]) => v + gain, 0));
  }
  assert.equal(plan.after.atk_phys, optimum); assert.equal(plan.spend.ultraCrayon, 8);
  assert.equal(plan.remaining, 0); assert.equal(plan.selected.has('1:0:1'), false);
});

test('checkpoints expose intermediate work without changing completed limits or results', () => {
  const progress = mapFor(...Array.from({ length: 10 }, (_, i) => apostle(i, [yellow(2, 1, 0, 2, 99)], '11')),
    apostle(11, [yellow(2, 1, 0, 2)]));
  const input = options({ maxReset: 2 });
  const ordinary = [...iterateHwangRedistribution(progress, input)];
  const interactive = [...iterateHwangRedistribution(progress, input, true)];
  assert.ok(interactive.filter(p => p.pending && p.limit === 1).length >= 10);
  assert.deepEqual(interactive.filter(p => !p.pending), ordinary);
});

test('curve can cancel inside a reset-limit search and never appends checkpoint duplicates', async () => {
  const progress = mapFor(apostle(1, [yellow(2, 1, 0, 2, 99)], '11'), apostle(2, [yellow(2, 1, 0, 2)]));
  const controller = new AbortController();
  await assert.rejects(calculateRedistributionCurve(progress, options(), done => {
    if (done === 1) setTimeout(() => controller.abort(), 0);
  }, controller.signal), /취소/);
  const curve = await calculateRedistributionCurve(progress, options());
  assert.deepEqual(curve.points.map(p => p.limit), [0, 1, 2]);
});
