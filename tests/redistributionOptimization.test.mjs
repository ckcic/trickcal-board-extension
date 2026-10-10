import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendHwangRedistribution } from '../src/domain/hwangRedistribution.ts';

const start = () => ({ id: 1, nodeType: 2, grid: { x: 0, y: 0 } });
const yellow = (id, x, y, statType = 88, cost = 2) => ({
  id,
  nodeType: 5,
  grid: { x, y },
  requireItems: [{ item: 610004, value: cost }],
  stats: [{ statType, statValue: 60 }],
});
const bokr = (id, x, y, statType = 88, cost = 4) => ({
  id,
  nodeType: 4,
  grid: { x, y },
  requireItems: [{ item: 610003, value: cost }],
  stats: [{ statType, statValue: 13 }],
});
const normal = (id, x, y) => ({
  id,
  nodeType: 3,
  grid: { x, y },
  requireGold: 10,
  requireItems: [{ item: 610001, value: 3 }],
});
const apostle = (id, nodes, stepStr = '') => ({
  apostleId: id,
  name: `사도${id}`,
  isOwned: true,
  boards: [{ unlocked: true, masterNodes: nodes, stepStr }],
});
const mapFor = (...apostles) => new Map(apostles.map(a => [String(a.apostleId), a]));
const options = (overrides = {}) => ({
  ownedCrayons: 0,
  ownedBokr: 0,
  maxReset: 0,
  priorities: [{ stat: 'atk_phys', target: 6 }],
  ...overrides,
});

test('초기화된 사도는 불필요한 곁가지 일반칸을 복구하지 않고 목표에 필요한 최소 일반칸만 연결한다', () => {
  // 사도 1: start(1, 0,0), normal(2, 1,0), yellow(3, 2,0, atk), normal(4, 0,1, 곁가지1), normal(5, 0,2, 곁가지2)
  // 원래 모든 칸이 칠해져 있었으나, 초기화 시 목표에 불필요한 곁가지 일반칸(4, 5)은 칠하지 않아야 함
  const nodes1 = [
    start(),
    normal(2, 1, 0),
    yellow(3, 2, 0, 95, 2), // 원래는 HP 황크였음
    normal(4, 0, 1),
    normal(5, 0, 2),
  ];
  const a = apostle(1, nodes1, '11111');

  // 사도 2: 공격력 황크가 있는 사도
  const b = apostle(2, [start(), yellow(2, 1, 0, 88, 2)], '10');

  // 사도 1을 초기화하여 황크를 환급받고, 사도 2의 공격력 황크를 칠하는 시나리오
  const plan = recommendHwangRedistribution(
    mapFor(a, b),
    options({ maxReset: 1, priorities: [{ stat: 'atk_phys', target: 6 }] })
  );

  assert.equal(plan.resetCount, 1);
  assert.equal(plan.after.atk_phys, 6);

  // 사도 1의 액션 확인: 초기화되었으나 불필요한 곁가지 일반칸 4, 5는 칠하지 않아야 함
  const actionA = plan.actions.find(act => act.apostle.apostleId === 1);
  assert.ok(actionA);
  assert.equal(actionA.reset, true);

  // 곁가지 일반칸 4, 5는 paint에 포함되지 않아야 함
  const paintedIds = actionA.paint.map(entry => entry.node.id);
  assert.ok(!paintedIds.includes(4), '곁가지 일반칸 4는 칠하지 않아야 함');
  assert.ok(!paintedIds.includes(5), '곁가지 일반칸 5는 칠하지 않아야 함');
});

test('황크 목표 단계에서는 보크가 넉넉해도 미색칠 보크칸 대신 일반칸 우회로를 탄다 (국룰)', () => {
  // 구조:
  // (0,0) start
  // (1,0) bokr(2) - 보크 지름길
  // (2,0) yellow(3) - 목표 공격력 황크
  // (0,1) normal(4), (1,1) normal(5), (2,1) normal(6) - 일반칸 우회로
  const nodes = [
    start(),
    bokr(2, 1, 0, 88, 4),
    yellow(3, 2, 0, 88, 2),
    normal(4, 0, 1),
    normal(5, 1, 1),
    normal(6, 2, 1),
  ];
  const a = apostle(1, nodes, '100000');

  // 보크가 10개나 넉넉히 있어도, 황크 단계이므로 보크 지름길을 타지 않고 일반칸 우회로를 선택해야 함
  const plan = recommendHwangRedistribution(
    mapFor(a),
    options({ ownedCrayons: 2, ownedBokr: 10, priorities: [{ stat: 'atk_phys', target: 6 }] })
  );

  assert.equal(plan.after.atk_phys, 6);
  assert.equal(plan.spend.ultraCrayon, 2);
  assert.equal(plan.spend.epicCrayon, 0, '황크 단계에서 우회로가 있을 때 보크 크레파스를 소모하지 않아야 함');

  const paintedIds = plan.actions[0].paint.map(entry => entry.node.id);
  assert.ok(!paintedIds.includes(2), '보크 노드(2)는 칠하지 않아야 함');
  assert.deepEqual(paintedIds.sort(), [3, 4, 5, 6].sort(), '일반칸 우회로(4, 5, 6)와 목표 황크(3)만 칠해야 함');
});

test('사도 초기화로 환급된 보크는 황크 경로에 쓰이지 않고 보크 단계 목표에 배분된다', () => {
  // 사도 1: 방어력 황크와 보크를 찍어둔 상태
  const a = apostle(1, [start(), yellow(2, 1, 0, 95, 2), bokr(3, 2, 0, 95, 4)], '111');

  // 사도 2:
  // (0,0) start
  // (1,0) bokr(2, 물공) 지름길
  // (2,0) yellow(3, 물공) 목표 황크
  // (0,1) normal(4), (1,1) normal(5), (2,1) normal(6) 일반칸 우회로
  // (0,2) bokr(7, 체력) 목표 보크
  const b = apostle(2, [
    start(),
    bokr(2, 1, 0, 88, 4),
    yellow(3, 2, 0, 88, 2),
    normal(4, 0, 1),
    normal(5, 1, 1),
    normal(6, 2, 1),
    bokr(7, 0, 2, 95, 4), // 체력 보크
  ], '1000000');

  // 1단계: 황크 공격력 6%
  // 2단계: 보크 체력 1칸
  const stages = [
    { resource: 'hwang', allowBlocked: false, targets: [{ stat: 'atk_phys', target: 6 }] },
    { resource: 'bokr', allowBlocked: false, targets: [{ stat: 'hp', target: 1 }] },
  ];

  const plan = recommendHwangRedistribution(
    mapFor(a, b),
    options({ maxReset: 1, stages })
  );

  assert.equal(plan.resetCount, 1);
  assert.equal(plan.after.atk_phys, 6);

  // 사도 1이 초기화되어 보크 4개 환급
  assert.equal(plan.refund.epicCrayon, 4);

  // 사도 2의 액션: 1단계 황크 목표에서 bokr(2)를 지름길로 낭비하지 않고, 2단계에서 목표 bokr(7)에 보크 4개를 사용해야 함
  const actionB = plan.actions.find(act => act.apostle.apostleId === 2);
  assert.ok(actionB);
  const paintedIdsB = actionB.paint.map(e => e.node.id);

  assert.ok(!paintedIdsB.includes(2), '황크 지름길 보크(2)는 칠하지 않아야 함');
  assert.ok(paintedIdsB.includes(7), '목표 보크(7)가 칠해져야 함');
  assert.equal(actionB.spend.epicCrayon, 4);
});

test('일반칸 우회로가 없는 외길 구조에서만 예외적으로 보크를 통과한다', () => {
  // (0,0) start -> (1,0) bokr(2) -> (2,0) yellow(3) 외길
  const nodes = [start(), bokr(2, 1, 0, 88, 4), yellow(3, 2, 0, 88, 2)];
  const a = apostle(1, nodes, '100');

  // 보크 예산이 없으면 도달 불가
  const planNoBokr = recommendHwangRedistribution(
    mapFor(a),
    options({ ownedCrayons: 2, ownedBokr: 0, priorities: [{ stat: 'atk_phys', target: 6 }] })
  );
  assert.equal(planNoBokr.after.atk_phys, 0);

  // 보크 예산이 있으면 외길이므로 통과 가능
  const planWithBokr = recommendHwangRedistribution(
    mapFor(a),
    options({ ownedCrayons: 2, ownedBokr: 4, priorities: [{ stat: 'atk_phys', target: 6 }] })
  );
  assert.equal(planWithBokr.after.atk_phys, 6);
  assert.equal(planWithBokr.spend.epicCrayon, 4);
  assert.equal(planWithBokr.spend.ultraCrayon, 2);
});

test('초기화 시 과거 일반칸 복구를 이유로 과거 보크나 불필요한 황크를 다시 칠하지 않는다', () => {
  // 사도 1: start(1, 0,0) -> bokr(2, 1,0, 체력 4개) -> normal(3, 2,0), 그리고 wasted yellow(4, 0,1, 체력 2개)
  // 원래 1, 2, 3, 4가 모두 칠해져 있었음 ('1111')
  // 사도 2: start(1, 0,0) -> yellow(2, 1,0, 공격력 2개) ('10')
  const a = apostle(1, [start(), bokr(2, 1, 0, 95, 4), normal(3, 2, 0), yellow(4, 0, 1, 95, 2)], '1111');
  const b = apostle(2, [start(), yellow(2, 1, 0, 88, 2)], '10');

  // 사도 1을 초기화하여 보크 4개를 회수하고 사도 2의 공격력 황크만 칠하는 상황
  const plan = recommendHwangRedistribution(
    mapFor(a, b),
    options({ maxReset: 1, priorities: [{ stat: 'atk_phys', target: 6 }] })
  );

  assert.equal(plan.resetCount, 1);
  assert.equal(plan.after.atk_phys, 6);

  // 사도 1의 과거 일반칸(3)을 복구하느라 보크(2)를 다시 칠하지 않아야 함!
  const actionA = plan.actions.find(act => act.apostle.apostleId === 1);
  assert.ok(actionA);
  assert.equal(actionA.reset, true);

  const paintedIdsA = actionA.paint.map(e => e.node.id);
  assert.ok(!paintedIdsA.includes(2), '과거 보크(2)를 복구 목적으로 칠하지 않아야 함');
  assert.ok(!paintedIdsA.includes(3), '목표와 무관한 과거 일반칸(3)을 칠하지 않아야 함');
  assert.equal(actionA.spend.epicCrayon, 0);
  assert.equal(plan.remainingBokr, 4, '초기화로 환급된 보크 4개가 온전히 보존되어야 함');
});

test('소지 골드 및 만개 물뿌리개 미입력 시 잔여 계산을 생략하고 입력 시 잔여/부족분을 계산한다', () => {
  // start(1, 0,0) -> normal(2, 1,0, 골드 1000) -> yellow(3, 2,0, 골드 500)
  const n2 = { ...normal(2, 1, 0), requireGold: 1000 };
  const y3 = { ...yellow(3, 2, 0, 88, 2), requireGold: 500 };
  const a = apostle(1, [start(), n2, y3], '100');

  // 1. 미입력 시 (undefined)
  const planDefault = recommendHwangRedistribution(
    mapFor(a),
    options({ ownedCrayons: 2, priorities: [{ stat: 'atk_phys', target: 6 }] })
  );
  assert.equal(planDefault.spend.gold, 1500);
  assert.equal(planDefault.remainingGold, undefined);
  assert.equal(planDefault.remainingWateringCan, undefined);

  // 2. 소지 골드 입력 - 여유 (잔여)
  const planSurplus = recommendHwangRedistribution(
    mapFor(a),
    options({ ownedCrayons: 2, ownedGold: 2000, priorities: [{ stat: 'atk_phys', target: 6 }] })
  );
  assert.equal(planSurplus.remainingGold, 500);

  // 3. 소지 골드 입력 - 부족
  const planShort = recommendHwangRedistribution(
    mapFor(a),
    options({ ownedCrayons: 2, ownedGold: 1000, priorities: [{ stat: 'atk_phys', target: 6 }] })
  );
  assert.equal(planShort.remainingGold, -500);
});

test('소지 만개 물뿌리개와 햇살구름을 10:1 교환비로 합산하여 잔여/부족분을 계산한다', () => {
  // start(1, 0,0) -> node with 4 watering cans -> yellow(3, 2,0)
  const n2 = {
    ...normal(2, 1, 0),
    requireItems: [{ item: 610005, value: 4 }], // 만개 물뿌리개 4개 필요
  };
  const y3 = yellow(3, 2, 0, 88, 2);
  const a = apostle(1, [start(), n2, y3], '100');

  // 1. 물뿌리개 2개 + 햇살구름 25개 (2 + 2 = 4개 가용, 소모 4개 -> 잔여 0)
  const planExact = recommendHwangRedistribution(
    mapFor(a),
    options({
      ownedCrayons: 2,
      ownedWateringCan: 2,
      ownedClouds: 25,
      priorities: [{ stat: 'atk_phys', target: 6 }],
    })
  );
  assert.equal(planExact.spend.wateringCan, 4);
  assert.equal(planExact.remainingWateringCan, 0);

  // 2. 물뿌리개 1개 + 햇살구름 15개 (1 + 1 = 2개 가용, 소모 4개 -> 2개 부족: -2)
  const planShort = recommendHwangRedistribution(
    mapFor(a),
    options({
      ownedCrayons: 2,
      ownedWateringCan: 1,
      ownedClouds: 15,
      priorities: [{ stat: 'atk_phys', target: 6 }],
    })
  );
  assert.equal(planShort.remainingWateringCan, -2);

  // 3. 물뿌리개 5개 + 햇살구름 0개 (5개 가용, 소모 4개 -> 1개 잔여: 1)
  const planSurplus = recommendHwangRedistribution(
    mapFor(a),
    options({
      ownedCrayons: 2,
      ownedWateringCan: 5,
      priorities: [{ stat: 'atk_phys', target: 6 }],
    })
  );
  assert.equal(planSurplus.remainingWateringCan, 1);
});

