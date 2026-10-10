import assert from 'node:assert/strict';
import test from 'node:test';
import { createExampleRedistributionStages, recommendHwangRedistribution } from '../src/domain/hwangRedistribution.ts';
import { renderRedistributionStageEditor } from '../src/ui/redistributionStageEditor.ts';
import { renderRedistributionResult } from '../src/ui/hwangRedistribution.ts';

const start = { id: 1, nodeType: 2, grid: { x: 0, y: 0 } };
const node = (id, x, y, type, value = 80) => ({ id, nodeType: 5, grid: { x, y }, requireItems: [{ item: 610004, value: 2 }], stats: [{ statType: type, statValue: value }] });
const stage = (stat, target, allowBlocked = true) => ({ allowBlocked, targets: [{ stat, target }] });
const run = (nodes, stages, budget = 6, step = '') => recommendHwangRedistribution(new Map([['1', { apostleId: 1, name: '가명', isOwned: true,
  boards: [{ unlocked: true, masterNodes: [start, ...nodes], stepStr: step }] }]]), { ownedCrayons: budget, maxReset: 0, stages });

test('같은 스탯을 여러 단계에서 나눠 올리고 중간 단계의 목표를 먼저 처리한다', () => {
  const nodes = [node(2, 1, 0, 97), node(3, 2, 0, 97), node(4, 0, 1, 95)];
  const plan = run(nodes, [stage('crit', 8), stage('hp', 8), stage('crit', 16)]);
  assert.deepEqual(plan.actions[0].paint.map(entry => entry.node.id), [2, 4, 3]);
  assert.equal(plan.after.crit, 16); assert.equal(plan.after.hp, 8); assert.equal(plan.spend.ultraCrayon, 6);
  const limited = run(nodes, [stage('crit', 8), stage('hp', 8), stage('crit', 16)], 4);
  assert.equal(limited.after.crit, 8); assert.equal(limited.after.hp, 8);
  const reordered = run(nodes, [stage('crit', 16), stage('hp', 8)], 4);
  assert.equal(reordered.after.crit, 16); assert.equal(reordered.after.hp, 0);
});

test('단계 안에서는 스탯 나열 순서와 무관하게 목표 대비 덜 찬 스탯을 번갈아 채운다', () => {
  const plan = run([node(2, 1, 0, 97), node(3, 2, 0, 97), node(4, 0, 1, 95)],
    [{ allowBlocked: true, targets: [{ stat: 'crit', target: 16 }, { stat: 'hp', target: 16 }] }], 4);
  assert.equal(plan.after.crit, 8); assert.equal(plan.after.hp, 8);
});

test('전부 목표는 계정의 접근 가능한 칸으로 계산하며 막힌 경로는 뒤 단계로 미룬다', () => {
  const attack = (id, x, y) => ({ ...node(id, x, y, 88, 60), stats: [{ statType: 88, statValue: 60 }, { statType: 89, statValue: 60 }] });
  const plan = run([node(2, 1, 0, 99), attack(3, 2, 0), attack(4, 0, 1)],
    [stage('attack', null, false), stage('attack', null, true)]);
  assert.deepEqual(plan.actions[0].paint.map(entry => entry.node.id), [4, 2, 3]);
  assert.equal(plan.stageResults[0].targets[0].target, 6);
  assert.equal(plan.stageResults[0].targets[0].after, 6);
  assert.equal(plan.stageResults[1].targets[0].target, 12);
  assert.equal(plan.after.atk_phys, 12); assert.equal(plan.after.atk_mag, 12);
  const html = renderRedistributionResult(plan, { ownedCrayons: 6, maxReset: 0 });
  assert.match(html, /1단계/); assert.match(html, /2단계/); assert.match(html, /전부 · 6%/);
});

test('상승 단위보다 작은 목표는 실제 한 칸으로 올림하고 재화를 중복 청구하지 않는다', () => {
  const plan = run([node(2, 1, 0, 97)], [stage('crit', 5), stage('crit', 7)], 2);
  assert.equal(plan.after.crit, 8); assert.equal(plan.spend.ultraCrayon, 2);
  assert.equal(plan.actions[0].paint.length, 1);
});

for (const [type, stat] of [[92, 'def_phys'], [93, 'def_mag'], [99, 'crit_res']]) {
  test(`${stat} 목표를 추가해도 미색칠 선행 칸은 막힌 경로로 유지한다`, () => {
    const attack = (id, x, y) => ({ ...node(id, x, y, 88, 60), stats: [{ statType: 88, statValue: 60 }, { statType: 89, statValue: 60 }] });
    const nodes = [node(2, 1, 0, type), attack(3, 2, 0), attack(4, 0, 1)];
    const plan = run(nodes, [stage('attack', null, false), stage(stat, 8, true)]);
    assert.equal(plan.stageResults[0].targets[0].target, 6);
    assert.deepEqual(plan.actions[0].paint.map(entry => entry.node.id), [4, 2]);
    assert.equal(plan.after.atk_phys, 6); assert.equal(plan.after[stat], 8);
    const included = run(nodes, [stage('attack', null, true)]);
    assert.equal(included.after.atk_phys, 12);
  });
}

test('목표에 없는 체력·치명·치피·치피저 황크는 막힌 경로로 분류하지 않는다', () => {
  for (const type of [95, 97, 101, 103]) {
    const attack = { ...node(3, 2, 0, 88, 60), stats: [{ statType: 88, statValue: 60 }, { statType: 89, statValue: 60 }] };
    const plan = run([node(2, 1, 0, type), attack], [stage('attack', null, false)], 4);
    assert.deepEqual(plan.actions[0].paint.map(entry => entry.node.id), [2, 3]);
    assert.equal(plan.after.atk_phys, 6); assert.equal(plan.spend.ultraCrayon, 4);
  }
});

test('이미 칠한 방어력·치저 황크도 막힌 경로 제외에서는 통과하지 않는다', () => {
  for (const type of [92, 93, 99]) {
    const attack = { ...node(3, 2, 0, 88, 60), stats: [{ statType: 88, statValue: 60 }, { statType: 89, statValue: 60 }] };
    const plan = run([node(2, 1, 0, type), attack], [stage('attack', null, false)], 2, '110');
    assert.equal(plan.actions.length, 0);
    assert.equal(plan.after.atk_phys, 0); assert.equal(plan.spend.ultraCrayon, 0);
    assert.ok(plan.selected.has('1:0:1'));
  }
});

test('0인 단계는 무시하고 같은 단계 중복·빈 단계·잘못된 목표는 거부한다', () => {
  const nodes = [node(2, 1, 0, 97), node(3, 0, 1, 95)];
  assert.equal(run(nodes, [stage('crit', 0), stage('hp', 8)], 2).after.hp, 8);
  const bad = [[], [{ allowBlocked: true, targets: [] }],
    [{ allowBlocked: true, targets: [{ stat: 'crit', target: 8 }, { stat: 'crit', target: 16 }] }],
    [stage('hp', -1)], [stage('hp', NaN)], [stage('hp', Infinity)],
    [{ allowBlocked: true, targets: [{ stat: 'attack', target: 6 }, { stat: 'atk_phys', target: 6 }] }]];
  for (const stages of bad) assert.throws(() => run(nodes, stages), /입력/);
});

test('예시 7단계는 독립 복사되며 편집기에 추가·삭제·양방향 이동·전부 설정이 있다', () => {
  const stages = createExampleRedistributionStages();
  assert.equal(stages.length, 7); assert.equal(stages[0].targets[0].target, null);
  stages[1].targets[0].target = 123;
  assert.equal(createExampleRedistributionStages()[1].targets[0].target, 500);
  const html = renderRedistributionStageEditor(stages);
  for (const action of ['up', 'down', 'delete', 'add-target', 'remove-target']) assert.match(html, new RegExp(`data-stage-action="${action}"`));
  assert.match(html, /tcbe-rd-drag-handle/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /tcbe-rd-stage-order/);
  assert.match(html, /data-stage-order="0"/);
  assert.match(html, /막힌 경로 포함/); assert.match(html, /value="all"/);
  assert.equal((html.match(/data-stage="/g) || []).length, 7);
});

test('결과 렌더링에 빠른 점프를 위한 고유 앵커 섹션 ID가 포함된다', () => {
  const plan = run([node(2, 1, 0, 97)], [stage('crit', 8)], 2);
  const html = renderRedistributionResult(plan, { ownedCrayons: 2, maxReset: 0 });
  assert.match(html, /id="tcbe-sec-summary"/);
  assert.match(html, /id="tcbe-sec-stages"/);
  assert.match(html, /id="tcbe-sec-distribution"/);
  assert.match(html, /id="tcbe-sec-orders"/);
  assert.match(html, /id="tcbe-sec-maps"/);
  assert.match(html, /id="tcbe-rd-map-1"/);
});

