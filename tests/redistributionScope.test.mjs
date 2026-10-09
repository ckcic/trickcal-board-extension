import assert from 'node:assert/strict';
import test from 'node:test';
import { getSpentBokrCrayons, createRedistributionGoalPreview, recommendHwangRedistribution, getAttackPathAvailability } from '../src/domain/hwangRedistribution.ts';
import { calculateRedistributionCurve, readCurveValue } from '../src/domain/redistributionCurve.ts';
import { renderRedistributionResult } from '../src/ui/hwangRedistribution.ts';
import { renderRedistributionStageEditor } from '../src/ui/redistributionStageEditor.ts';
import { renderRedistributionCurve } from '../src/ui/redistributionCurve.ts';
import { searchResetSets } from '../src/domain/redistributionSearch.ts';
const start = { id: 1, nodeType: 2, grid: { x: 0, y: 0 } };
const yellow = (id, x, y, type = 88) => ({ id, nodeType: 5, grid: { x, y }, requireItems: [{ item: 610004, value: 2 }], stats: type === 88 ? [{ statType: 88, statValue: 60 }, { statType: 89, statValue: 60 }] : [{ statType: type, statValue: 80 }] });
const bokr = (id, x, y, type = 3) => ({ id, nodeType: 4, grid: { x, y }, requireItems: [{ item: 610003, value: 3 }], stats: [{ statType: type, statValue: 13 }] });
const gate = (id, x, y) => ({ id, nodeType: 1, grid: { x, y }, requireGold: 500000, requireItems: [{ item: 4300000, value: 5 }] });
const map = a => new Map([['1', a], ['alias', a]]);
const stage = (overrides = {}) => ({ allowBlocked: false, targets: [{ stat: 'attack', target: null }], ...overrides });
const options = (stages, overrides = {}) => ({ ownedCrayons: 10, ownedBokr: 30, maxReset: 0, stages, ...overrides });

test('spent bokr uses actual costs and excludes aliases, unowned and locked records', () => {
  const a = { apostleId: 1, isOwned: true, boards: [{ unlocked: true, masterNodes: [start, bokr(2, 1, 0)], stepStr: '11' }, { unlocked: false, masterNodes: [bokr(2, 0, 0)], stepStr: '1' }] };
  const progress = map(a); progress.set('other', { ...a, apostleId: 2, isOwned: false });
  assert.equal(getSpentBokrCrayons(progress), 3);
});

test('blocked paths never exclude bokr defense or resistance', () => {
  for (const type of [5, 6, 9]) {
    const a = { apostleId: 1, name: '가명', boards: [{ unlocked: true, masterNodes: [start, bokr(2, 1, 0, type), yellow(3, 2, 0)], stepStr: '100' }] };
    const plan = recommendHwangRedistribution(map(a), options([stage()]));
    assert.equal(plan.after.atk_phys, 6); assert.equal(plan.spend.epicCrayon, 3);
  }
});

test('gate and blocked toggles are independent; each gate is charged once and locked picks are not free', () => {
  for (const allowBlocked of [false, true]) for (const allowGates of [false, true]) {
    const a = { apostleId: 1, name: '가명', boards: [
      { unlocked: true, masterNodes: [start, yellow(2, 0, 1, 99), gate(3, 0, 2)], stepStr: '100' },
      { unlocked: false, masterNodes: [yellow(1, 0, 0), yellow(2, 0, 1)], stepStr: '11' },
    ] };
    const input = options([stage({ allowBlocked, allowGates })]);
    const plan = recommendHwangRedistribution(map(a), input);
    assert.equal(plan.before.atk_phys, 0);
    assert.equal(plan.after.atk_phys, allowBlocked && allowGates ? 12 : 0);
    assert.equal(plan.spend.gold, allowBlocked && allowGates ? 500000 : 0);
    if (allowBlocked && allowGates) {
      assert.deepEqual(plan.actions[0].paint.map(e => [e.boardIndex, e.node.id]), [[0, 2], [0, 3], [1, 1], [1, 2]]);
      const html = renderRedistributionResult(plan, input);
      assert.match(html, /관문 개방/); assert.match(html, /★1 공동 교단 증명서 5개/);
      assert.equal(plan.refund.gold, 0);
    }
  }
});

test('gate-only opening extends targets and cannot bypass a gate through a boundary neighbor', () => {
  const a = { apostleId: 1, name: '가명', boards: [
    { unlocked: true, masterNodes: [start, gate(2, 0, 1), { id: 3, nodeType: 3, grid: { x: 1, y: 0 } }, { id: 4, nodeType: 3, grid: { x: 1, y: 1 } }], stepStr: '1000' },
    { unlocked: false, masterNodes: [yellow(1, 0, 0), yellow(2, 1, 0)], stepStr: '00' },
  ] };
  const preview = createRedistributionGoalPreview(map(a));
  assert.equal(preview(stage(), 'attack'), 0);
  assert.equal(preview(stage({ allowGates: true }), 'attack'), 12);
  const plan = recommendHwangRedistribution(map(a), options([stage({ allowGates: true })]));
  assert.equal(plan.spend.gold, 500000); assert.equal(plan.actions[0].paint[0].node.nodeType, 1);
  assert.deepEqual(getAttackPathAvailability(map(a)), { current: { all: 0, unblocked: 0 }, opened: { all: 12, unblocked: 12 } });
});

test('cumulative bokr goals and curves count 1 / 1~2 / 1~3 without adding overlapping goals', async () => {
  const a = { apostleId: 1, name: '가명', boards: [
    { unlocked: true, masterNodes: [start, bokr(2, 0, 1), gate(3, 0, 2)], stepStr: '101' },
    { unlocked: true, masterNodes: [bokr(2, 0, 0), gate(3, 0, 1)], stepStr: '01' },
    { unlocked: true, masterNodes: [bokr(2, 0, 0)], stepStr: '0' },
  ] };
  const stages = [0, 1, 2].map(boardThrough => stage({ resource: 'bokr', boardThrough, targets: [{ stat: 'atk_phys', target: null }] }));
  const input = options(stages), preview = createRedistributionGoalPreview(map(a));
  assert.deepEqual(stages.map(s => preview(s, 'atk_phys')), [1, 2, 3]);
  const plan = recommendHwangRedistribution(map(a), input);
  assert.deepEqual(plan.stageResults.map(s => s.targets[0].after), [1, 2, 3]);
  assert.equal(plan.spend.epicCrayon, 9);
  const html = renderRedistributionResult(plan, input);
  assert.match(html, /1~2차/); assert.match(html, /1~3차/); assert.doesNotMatch(html, /6칸<\/td>/);
  const curve = await calculateRedistributionCurve(map(a), input);
  assert.equal(readCurveValue(curve.points[0], 'bokr', 'atk_phys', undefined, 1), 26);
  assert.match(renderRedistributionCurve(curve), /1~3차/);
  assert.throws(() => recommendHwangRedistribution(map(a), options([stage({ resource:'bokr', boardThrough: 3 })])), /입력/);
});

test('editor has icon radios and independent gate and hwang-blocked checkboxes', () => {
  const html = renderRedistributionStageEditor([stage({ resource:'bokr', boardThrough:1, allowGates:true, targets:[{stat:'atk_phys',target:2}] })]);
  assert.match(html, /type="radio" data-resource/); assert.match(html, /pastel-epic/);
  assert.match(html, /data-gates type="checkbox" checked/); assert.match(html, /황크 방어력·치저/);
  assert.match(html, /value="1" selected>1~2차/); assert.match(html, /1~3차/);
});

test('fast large-set search limits each reset count to three trials', () => {
  let calls = 0;
  const points = [...searchResetSets(Array.from({length:135},(_,i)=>i), 135, ids => { calls++; return {score:ids.size}; }, p=>[p.score], (a,b)=>a[0]-b[0], false, true)];
  assert.ok(calls <= 1+135*3);
  assert.equal(points.length,136); assert.equal(points[135].best.score,135);
});
