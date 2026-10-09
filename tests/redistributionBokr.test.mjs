import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendHwangRedistribution, iterateHwangRedistribution, createRedistributionGoalPreview, readBokrValues, createExampleRedistributionStages } from '../src/domain/hwangRedistribution.ts';
import { calculateRedistributionCurve, readCurveValue } from '../src/domain/redistributionCurve.ts';
import { renderRedistributionCurve } from '../src/ui/redistributionCurve.ts';
import { renderRedistributionResult } from '../src/ui/hwangRedistribution.ts';
import { renderRedistributionStageEditor } from '../src/ui/redistributionStageEditor.ts';

const start = { id: 1, nodeType: 2, grid: { x: 0, y: 0 } };
const bokr = (id, x, y, stat = 3, cost = 3) => ({ id, nodeType: 4, grid: { x, y }, requireItems: [{ item: 610003, value: cost }], stats: [{ statType: stat, statValue: 13 }] });
const yellow = (id, x, y, stat = 88) => ({ id, nodeType: 5, grid: { x, y }, requireItems: [{ item: 610004, value: 2 }], stats: [{ statType: stat, statValue: 60 }, ...(stat === 88 ? [{ statType: 89, statValue: 60 }] : [])] });
const apostle = (id, nodes, step = '') => ({ apostleId: id, name: `가명${id}`, isOwned: true, boards: [{ unlocked: true, masterNodes: [start, ...nodes], stepStr: step }] });
const map = (...apostles) => new Map(apostles.map(apostle => [String(apostle.apostleId), apostle]));
const stage = (stat, target, resource = 'bokr', extra = {}) => ({ resource, allowBlocked: false, targets: [{ stat, target }], ...extra });
const run = (progress, stages, extra = {}) => recommendHwangRedistribution(progress, { ownedCrayons: 0, maxReset: 0, stages, ...extra });

test('황크 단계는 연결 보크만 최소 사용하며 보크 단계에서 물공·마공을 따로 배분한다', () => {
  const a = apostle(1, [bokr(2, 1, 0), yellow(3, 2, 0), bokr(4, 0, 1, 4), bokr(5, 1, 1, 3)]);
  const progress = map(a);
  const first = run(progress, [stage('attack', 6, 'hwang')], { ownedCrayons: 2, ownedBokr: 9 });
  assert.deepEqual(first.actions[0].paint.map(entry => entry.node.id), [2, 3]);
  assert.equal(first.remainingBokr, 6);
  const full = run(progress, [stage('attack', 6, 'hwang'), stage('atk_mag', 1), stage('atk_phys', 2)], { ownedCrayons: 2, ownedBokr: 9 });
  assert.deepEqual(full.actions[0].paint.map(entry => entry.node.id), [2, 3, 4, 5]);
  assert.equal(full.stageResults[1].targets[0].after, 1); assert.equal(full.stageResults[2].targets[0].after, 2);
  assert.equal(full.remainingBokr, 0); assert.equal(full.spend.epicCrayon, 9);
  assert.equal(full.after.atk_phys, 6); assert.equal(full.after.atk_mag, 6);
});

test('보크는 보유량+환급분까지만 쓰며 미입력 보유량은 0이다', () => {
  const progress = map(apostle(1, [bokr(2, 1, 0), yellow(3, 2, 0)]));
  for (const ownedBokr of [undefined, 0, 2]) {
    const plan = run(progress, [stage('attack', 6, 'hwang'), stage('atk_phys', null)], { ownedCrayons: 2, ownedBokr });
    assert.equal(plan.spend.epicCrayon, 0); assert.equal(plan.after.atk_phys, 0);
  }
  const limited = run(progress, [stage('atk_phys', 1)], { ownedBokr: 20 });
  assert.equal(limited.spend.epicCrayon, 3); assert.equal(limited.remainingBokr, 17);
});

test('초기화 환급 보크는 기존 보크 복구에 쓰고 목표 단계에서 중복 청구하지 않는다', () => {
  const a = apostle(1, [bokr(2, 1, 0), yellow(3, 2, 0, 99)], '111');
  const b = apostle(2, [yellow(2, 1, 0)]);
  const plan = run(map(a, b), [stage('attack', 6, 'hwang'), stage('atk_phys', 1)], { maxReset: 1 });
  assert.equal(plan.resetCount, 1); assert.equal(plan.refund.epicCrayon, 3);
  assert.equal(plan.spend.epicCrayon, 3); assert.equal(plan.remainingBokr, 0);
  assert.equal(plan.stageResults[1].targets[0].after, 1);
  assert.equal(plan.actions.flatMap(action => action.paint).filter(entry => entry.node.nodeType === 4).length, 1);
});

test('보크 단계는 지정한 차수만 목표로 삼으며 다른 차수는 별도 단계로 설정한다', () => {
  const a = { apostleId: 1, name: '차수', isOwned: true, boards: [
    { unlocked: true, masterNodes: [start, bokr(2, 1, 0), { id: 3, nodeType: 1, grid: { x: 0, y: 1 } }], stepStr: '101' },
    { unlocked: true, masterNodes: [bokr(2, 0, 0)], stepStr: '0' },
  ] };
  const first = run(map(a), [stage('atk_phys', 1, 'bokr', { boardIndex: 0 })], { ownedBokr: 3 });
  const second = run(map(a), [stage('atk_phys', 2, 'bokr', { boardIndex: 1 })], { ownedBokr: 6 });
  assert.equal(first.actions[0].paint[0].boardIndex, 0); assert.equal(second.actions[0].paint[0].boardIndex, 1);
  assert.equal(second.spend.epicCrayon, 3); assert.equal(second.stageResults[0].targets[0].after, 1);
  const both = run(map(a), [stage('atk_phys', 1, 'bokr', { boardIndex: 1 }), stage('atk_phys', 1, 'bokr', { boardIndex: 0 })], { ownedBokr: 6 });
  assert.deepEqual(both.actions[0].paint.map(entry => entry.boardIndex), [1, 0]);
  assert.deepEqual(both.stageResults.map(stage => stage.targets[0].after), [1, 1]);
});

test('꽃잎 개방은 물뿌리개·골드를 포함하고 방어력·치저 막힘 조건도 그대로 적용한다', () => {
  const petal = { id: 141, nodeType: 7, nextId: 42, requireGold: 50, requireItems: [{ item: 610005, value: 2 }] };
  const ext = { ...yellow(142, 2, 0), nodeType: 6, prevId: 41 };
  const progress = map(apostle(1, [yellow(2, 1, 0, 99), petal, ext]));
  const excluded = run(progress, [stage('attack', null, 'hwang')], { ownedCrayons: 4 });
  assert.equal(excluded.spend.wateringCan, 0); assert.equal(excluded.after.atk_phys, 0);
  const included = run(progress, [stage('attack', null, 'hwang', { allowBlocked: true }), stage('attack', 6, 'hwang')], { ownedCrayons: 4 });
  assert.equal(included.spend.wateringCan, 2); assert.equal(included.spend.gold, 50);
  assert.equal(included.refund.wateringCan, 0); assert.equal(included.after.atk_phys, 6);
  assert.deepEqual(included.actions[0].paint.map(entry => entry.node.id), [2, 141, 142]);
  const html = renderRedistributionResult(included, { ownedCrayons: 4, maxReset: 0 });
  assert.match(html, /tcbe-map-flower-open/); assert.match(html, /꽃잎 개방/);
});

test('보크 편집기는 스탯 분리·칸 단위·개별 차수를 제공하고 잘못된 단계를 거부한다', () => {
  const stages = [stage('atk_phys', 2, 'bokr', { boardIndex: 1 }), stage('atk_mag', null)];
  const html = renderRedistributionStageEditor(stages);
  assert.match(html, /목표 칸 수/); assert.match(html, /step="1" value="2"/); assert.match(html, /value="1" selected>1~2차/);
  assert.doesNotMatch(html, /차수 우선|data-board-order/); assert.match(html, /1칸당 \+13/);
  assert.match(html, /value="atk_phys" selected/); assert.match(html, /value="atk_mag" selected/);
  for (const invalid of [stage('attack', 1), stage('atk_phys', 1.5), stage('atk_phys', 1, 'bokr', { boardIndex: 3 })]) assert.throws(() => run(map(apostle(1, [])), [invalid]), /입력/);
});

test('인원별 계산은 0~보유 수를 비교하며 그래프·수치 표가 같은 결과를 사용한다', async () => {
  const progress = map(apostle(1, [yellow(2, 1, 0, 99)], '11'), apostle(2, [yellow(2, 1, 0)]));
  const options = { ownedCrayons: 0, ownedBokr: 0, maxReset: 1, stages: [stage('attack', 6, 'hwang'), stage('atk_phys', 1)] };
  const updates = [];
  const curve = await calculateRedistributionCurve(progress, options, (done, total) => updates.push([done, total]));
  assert.deepEqual(curve.points.map(point => point.limit), [0, 1, 2]);
  assert.deepEqual(curve.points.map(point => point.hwang.atk_phys), [0, 6, 6]);
  assert.equal(curve.points.at(-1).resetCount, 1); assert.deepEqual(updates.at(-1), [3, 3]);
  const plan = recommendHwangRedistribution(progress, options);
  assert.equal(plan.after.atk_phys, curve.points[1].hwang.atk_phys);
  assert.equal([...iterateHwangRedistribution(progress, options)].length, 2);
  const html = renderRedistributionCurve(curve);
  assert.match(html, /<path d=/); assert.match(html, /상한 없는 추천 \(1명 초기화\)/); assert.match(html, /인원별 수치 표/);
  assert.match(html, /보크 물공/); assert.doesNotMatch(html, /NaN|Infinity/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(calculateRedistributionCurve(progress, options, undefined, controller.signal), /취소/);
});

test('결과는 단계별 목표를 묶고 스탯별 배치에는 재화 아이콘과 보크 정수 수치를 표시한다', () => {
  const options = { ownedCrayons: 2, ownedBokr: 3, maxReset: 0, stages: [stage('attack', 6, 'hwang'), stage('atk_phys', 1)] };
  const plan = recommendHwangRedistribution(map(apostle(1, [yellow(2, 1, 0), bokr(3, 0, 1)])), options);
  const html = renderRedistributionResult(plan, options);
  for (const title of ['단계별 목표 요약', '스탯별 배치', '작업 순서']) assert.match(html, new RegExp(title));
  assert.match(html, /data-show-map="1"/); assert.match(html, /보: 물공 1/);
  assert.match(html, /<th><span class="tcbe-rd-resource-icon pastel-epic"/); assert.match(html, /\+13 <small>\(1칸\)/);
});

test('보크만 칠한 사도도 초기화 후보이며 환급 보크를 다른 스탯으로 배분한다', () => {
  const progress = map(apostle(1, [bokr(2, 1, 0, 5)], '11'), apostle(2, [bokr(2, 1, 0, 4)]));
  const plan = run(progress, [stage('atk_mag', 1, 'bokr', { boardIndex: 0 })], { maxReset: 1 });
  assert.equal(plan.resetCount, 1); assert.equal(plan.refund.epicCrayon, 3); assert.equal(plan.spend.epicCrayon, 3);
  assert.ok(!plan.selected.has('1:0:1')); assert.ok(plan.selected.has('2:0:1'));
});

test('전부 입력 미리보기와 초기화 인원별 목표는 같은 고정 경로 범위를 사용한다', () => {
  const progress = map(apostle(1, [yellow(2, 1, 0, 99), yellow(3, 2, 0), yellow(4, 0, 1, 99)], '1111'), apostle(2, [yellow(2, 1, 0)]));
  const goals = [stage('attack', null, 'hwang')];
  const preview = createRedistributionGoalPreview(progress);
  assert.equal(preview(goals[0], 'attack'), 6);
  const html = renderRedistributionStageEditor(goals, undefined, undefined, preview);
  assert.match(html, /step="6" value="6" disabled/);
  const points = [...iterateHwangRedistribution(progress, { ownedCrayons: 0, maxReset: 2, stages: goals })];
  assert.ok(points.every(({plan}) => plan.stageResults[0].targets[0].target === 6));
});

test('보크 그래프는 차수별 원본 스탯을 합산하며 목표는 칸 수로 유지한다', async () => {
  const actual = { ...bokr(2, 1, 0, 3), stats: [{ statType: 3, statValue: 17 }] };
  assert.equal(readBokrValues(actual).atk_phys, 17);
  const progress = map(apostle(1, [actual], '11'));
  const curve = await calculateRedistributionCurve(progress, { ownedCrayons: 0, maxReset: 0, stages: [stage('atk_phys', 1, 'bokr', { boardIndex: 0 }), stage('atk_phys', 1, 'bokr', { boardIndex: 1 })] });
  assert.equal(readCurveValue(curve.points[0], 'bokr', 'atk_phys', 0), 17);
  assert.equal(readCurveValue(curve.points[0], 'bokr', 'atk_phys', 1), 0);
  const html = renderRedistributionCurve(curve);
  assert.match(html, /물공 1차/); assert.match(html, /물공 2차/); assert.match(html, /정수 스탯/);
});

test('마지막 예시 단계는 앞 단계의 부족 목표를 막힌 경로까지 채운다', () => {
  const last = createExampleRedistributionStages().at(-1);
  assert.equal(last.allowBlocked, true);
  assert.deepEqual(last.targets.map(target => target.target), [2000, 900, 900, 500]);
});
