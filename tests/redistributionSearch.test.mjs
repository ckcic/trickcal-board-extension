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

test('조합 탐색은 실행 가능한 후보마다 목적함수 점수를 한 번만 계산한다', () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  let scoreCalls = 0, feasible = 0;
  const points = [...searchResetSets(ids, 8, set => {
    if (set.size === 1 && set.has(8)) return null;
    feasible++; return { ids: [...set], gain: [...set].reduce((v, id) => v + id, 0) };
  }, v => { scoreCalls++; return [v.gain, -v.ids.length]; }, compare)];
  assert.equal(scoreCalls, feasible);
  assert.equal(points.at(-1).best.gain, 36);
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
  const plan = recommendHwangRedistribution(progress, options({ maxReset: 1, restoreNormal: true }));
  assert.equal(plan.after.atk_phys, 6);
  assert.deepEqual(plan.actions.filter(a => a.reset).map(a => a.apostle.apostleId), [2]);
  assert.ok(plan.selected.has('1:0:2'));
  assert.equal(JSON.stringify([...progress]), original);
  const points = [...iterateHwangRedistribution(progress, options({ maxReset: 3, restoreNormal: true }))];
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

test('그래프 계산은 조기 포화 감지 시 남은 인원 상한을 일괄 채우며 결과 포인트를 온전히 유지한다', async () => {
  // 5명 사도 중 1명만 황크를 칠함
  const progress = mapFor(
    apostle(1, [yellow(2, 1, 0, 2, 99)], '11'),
    apostle(2, [yellow(2, 1, 0, 2)]),
    apostle(3, []),
    apostle(4, []),
    apostle(5, [])
  );
  // 목표 6은 1명만 초기화해도 즉시 달성됨
  const input = { ownedCrayons: 0, ownedBokr: 0, maxReset: 0, stages: [{ allowBlocked: true, targets: [{ stat: 'atk_phys', target: 6 }] }] };
  const updates = [];
  const curve = await calculateRedistributionCurve(progress, input, (done, total) => updates.push([done, total]));
  // 0~5 전체 포인트가 누락 없이 생성되어야 함
  assert.deepEqual(curve.points.map(p => p.limit), [0, 1, 2, 3, 4, 5]);
  // 1명 이후의 점수와 resetCount는 동일하게 유지되어야 함
  assert.equal(curve.points[0].resetCount, 0);
  assert.equal(curve.points[1].resetCount, 1);
  assert.equal(curve.points[2].resetCount, 1);
  assert.equal(curve.points[5].resetCount, 1);
  assert.equal(curve.points[1].hwang.atk_phys, 6);
  assert.equal(curve.points[5].hwang.atk_phys, 6);
  // 진행도 콜백의 마지막은 완료(total + 1)를 나타내야 함
  assert.deepEqual(updates.at(-1), [6, 6]);
});


test('상세 탐색은 빠른 탐색 레인을 포함하므로 모든 인원 상한에서 빠른 탐색보다 나쁜 조합을 고르지 않는다', () => {
  // 사도 간 상호작용(시너지·상쇄)이 있는 무작위 목적함수로 빔 탐색의 경로 의존성을 재현한다.
  let rng = 7;
  const next = () => (rng = (rng * 1103515245 + 12345) >>> 0) / 2 ** 32;
  for (let trial = 0; trial < 40; trial++) {
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    const solo = new Map(ids.map(id => [id, Math.floor(next() * 50)]));
    const pair = new Map();
    for (const a of ids) for (const b of ids) if (a < b && next() < 0.15) pair.set(`${a},${b}`, Math.floor(next() * 80) - 40);
    const value = set => {
      const list = [...set].sort((a, b) => a - b);
      let gain = list.reduce((sum, id) => sum + solo.get(id), 0);
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) gain += pair.get(`${list[i]},${list[j]}`) ?? 0;
      return { gain, size: list.length };
    };
    const score = v => [v.gain, -v.size];
    const fastPoints = [...searchResetSets(ids, 6, value, score, compare, false, true)];
    const thoroughPoints = [...searchResetSets(ids, 6, value, score, compare, false, false)];
    fastPoints.forEach((point, limit) => assert.ok(compare(score(thoroughPoints[limit].best), score(point.best)) >= 0,
      `trial ${trial} limit ${limit}: 상세 ${thoroughPoints[limit].best.gain} < 빠른 ${point.best.gain}`));
  }
});

test('1인 평가 후에는 정적 순위가 아니라 실제 1인 점수 순으로 조합을 확장한다', () => {
  // 정적 순위는 1..30이지만 실제 효과는 30, 29가 가장 크다. 상세 탐색의 2인 조합은 {29, 30}이어야 한다.
  const ids = Array.from({ length: 30 }, (_, i) => i + 1);
  const value = set => ({ gain: [...set].reduce((sum, id) => sum + (id >= 29 ? 100 : 1), 0), size: set.size });
  const points = [...searchResetSets(ids, 2, value, v => [v.gain, -v.size], compare)];
  assert.equal(points[2].best.gain, 200);
});
