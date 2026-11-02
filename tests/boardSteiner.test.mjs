import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendHwangRedistribution } from '../src/domain/hwangRedistribution.ts';
import { calculateApostleRecovery, getBestRecoveryAlternative } from '../src/domain/boardRecovery.ts';
import { renderRedistributionResult } from '../src/ui/redistribution/redistributionResult.ts';

const start = (x = 0, y = 0, id = 1) => ({ id, nodeType: 2, grid: { x, y } });
const normal = (id, x, y, basic = 3, gold = 10, avg = 0) => ({
  id,
  nodeType: 3,
  grid: { x, y },
  requireGold: gold,
  requireItems: [
    ...(basic > 0 ? [{ item: 610001, value: basic }] : []),
    ...(avg > 0 ? [{ item: 610002, value: avg }] : []),
  ],
});
const yellow = (id, x, y, statType = 88, cost = 2, value = 60) => ({
  id,
  nodeType: 5,
  grid: { x, y },
  requireItems: [{ item: 610004, value: cost }],
  stats: [
    { statType, statValue: value },
    ...(statType === 88 ? [{ statType: 89, statValue: value }] : []),
  ],
});
const bokr = (id, x, y, statType = 3, cost = 3, value = 13) => ({
  id,
  nodeType: 4,
  grid: { x, y },
  requireItems: [{ item: 610003, value: cost }],
  stats: [{ statType, statValue: value }],
});
const gate = (id, x, y, gold = 0) => ({ id, nodeType: 1, grid: { x, y }, requireGold: gold });

const apostle = (id, boards) => ({
  apostleId: id,
  name: `검증사도${id}`,
  isOwned: true,
  boards,
});
const mapFor = (...items) => new Map(items.map(item => [String(item.apostleId), item]));

test('T자 최소 동선: 좌우 외곽 L자 경로(4칸) 대신 중앙 줄기 T자 동선(2칸)으로 두 목표를 연결한다', () => {
  // (0,0)N1  (1,0)START (2,0)N2
  // (0,1)N3  (1,1)N4    (2,1)N5
  // (0,2)T1  (1,2)N6    (2,2)T2
  const nodes = [
    normal(10, 0, 0),
    start(1, 0, 1),
    normal(20, 2, 0),
    normal(30, 0, 1),
    normal(40, 1, 1),
    normal(50, 2, 1),
    yellow(60, 0, 2, 88, 2),
    normal(70, 1, 2),
    yellow(80, 2, 2, 95, 2),
    yellow(90, 1, 0, 99, 4), // 초기화 유도용 치저 황크
  ];
  // 마지막 치저 황크(id 90)는 (0,0) 위가 아니라 별도 위치 (2,0) 옆 (3,0)에 배치
  nodes[9] = yellow(90, 2, 0, 99, 4);
  // N2를 일반칸 대신 치저 황크로 두지 않고, 별도 초기화 사도나 이 사도 자체를 초기화하는 시나리오:
  const boardNodes = [
    normal(10, 0, 0),
    start(1, 0, 1),
    normal(20, 2, 0),
    normal(30, 0, 1),
    normal(40, 1, 1),
    normal(50, 2, 1),
    yellow(60, 0, 2, 88, 2), // T1 (공격력)
    normal(70, 1, 2),
    yellow(80, 2, 2, 95, 2), // T2 (체력)
    yellow(90, 0, 0, 99, 4), // 잘못 찍힌 치저 황크
  ];
  // (0,0)은 일반칸 N1으로 유지하고 (1,0) START 옆 (1,-1) 대신 4x3 격자 구성
  const gridNodes = [
    normal(10, 0, 0),
    start(1, 0, 1),
    normal(20, 2, 0),
    yellow(99, 3, 0, 99, 4), // 초기화로 회수할 치저 황크 4개
    normal(30, 0, 1),
    normal(40, 1, 1),
    normal(50, 2, 1),
    yellow(60, 0, 2, 88, 2), // 1단계 목표: 공격력
    normal(70, 1, 2),
    yellow(80, 2, 2, 95, 2), // 2단계 목표: 체력
  ];
  // 초기 상태: 외곽 경로 N1(10)->N3(30)->T1(60) 및 N2(20)->치저(99)가 칠해진 상태
  const a = apostle(1, [{ unlocked: true, masterNodes: gridNodes, stepStr: '1111100100' }]);
  const plan = recommendHwangRedistribution(mapFor(a), {
    ownedCrayons: 0,
    maxReset: 1,
    stages: [
      { allowBlocked: false, targets: [{ stat: 'attack', target: 6 }] },
      { allowBlocked: false, targets: [{ stat: 'hp', target: 6 }] },
    ],
  });

  assert.equal(plan.resetCount, 1);
  assert.equal(plan.after.atk_phys, 6);
  assert.equal(plan.after.hp, 6);
  // 선택된 일반칸은 반드시 중앙 T자 줄기인 40(1,1)과 70(1,2) 딱 2칸이어야 함 (외곽 10, 30, 20, 50 미선택)
  const paintedNormals = plan.actions[0].paint.filter(e => e.node.nodeType === 3).map(e => e.node.id);
  assert.deepEqual(paintedNormals, [40, 70]);
  assert.equal(plan.spend.basicCrayon, 6);
  assert.equal(plan.spend.gold, 20);
});

test('1차 황크와 2차 보드 진입 관문을 연결할 때 5칸 분리 경로 대신 3칸 T자 동선으로 복구한다', () => {
  // 1차 보드:
  // (0,1)N1   (1,1)N2   (2,1)START
  // (0,2)N3   (1,2)N4   (2,2)N5
  // (0,3)H1   (1,3)N6   (2,3)N7
  //                     (2,4)GATE
  const board1 = [
    normal(11, 0, 1),
    normal(12, 1, 1),
    start(2, 1, 1),
    normal(13, 0, 2),
    normal(14, 1, 2),
    normal(15, 2, 2),
    yellow(16, 0, 3, 88, 2), // 1차 공격력 황크 (2개)
    normal(17, 1, 3),
    normal(18, 2, 3),
    gate(19, 2, 4),
    yellow(99, 2, 0, 99, 6), // 초기화 대상 치저 황크 (6개)
  ];
  const board2 = [
    normal(21, 2, 0),
    yellow(22, 2, 1, 88, 4), // 2차 공격력 황크 (4개)
  ];
  // 기존에 N2->N1->N3->H1 및 치저황크(99), 관문(19)가 열려 있던 사도를 초기화
  const a = apostle(1, [
    { unlocked: true, masterNodes: board1, stepStr: '11110010011' },
    { unlocked: true, masterNodes: board2, stepStr: '00' },
  ]);

  const plan = recommendHwangRedistribution(mapFor(a), {
    ownedCrayons: 0,
    maxReset: 1,
    stages: [{ allowBlocked: false, targets: [{ stat: 'attack', target: 12 }] }],
  });

  assert.equal(plan.resetCount, 1);
  assert.equal(plan.after.atk_phys, 12);
  // 1차 보드에서 칠하는 일반칸은 N5(15) -> N7(18) -> N6(17) 3칸 T자 동선이어야 함 (N1, N2, N3는 불필요!)
  const board1Normals = plan.actions[0].paint
    .filter(e => e.boardIndex === 0 && e.node.nodeType === 3)
    .map(e => e.node.id);
  assert.deepEqual(new Set(board1Normals), new Set([15, 17, 18]));
  assert.equal(board1Normals.length, 3);
});

test('앞 단계에서 미선택 칸을 피해 우회한 일반칸은 뒷 단계에서 직결 칸이 선택되면 자동으로 제거된다', () => {
  // (0,0)START --- (1,0)Bokr(물공) --- (2,0)Hwang(공격력)
  //   |                                  |
  // (0,1)N1    --- (1,1)N2         --- (2,1)N3
  const nodes = [
    start(0, 0, 1),
    bokr(2, 1, 0, 3, 3),      // 2단계 보크 목표
    yellow(3, 2, 0, 88, 2),   // 1단계 황크 목표
    normal(4, 0, 1),
    normal(5, 1, 1),
    normal(6, 2, 1),
  ];
  const a = apostle(1, [{ unlocked: true, masterNodes: nodes, stepStr: '100000' }]);
  const plan = recommendHwangRedistribution(mapFor(a), {
    ownedCrayons: 2,
    ownedBokr: 3,
    maxReset: 0,
    stages: [
      { resource: 'hwang', allowBlocked: false, targets: [{ stat: 'attack', target: 6 }] },
      { resource: 'bokr', allowBlocked: false, targets: [{ stat: 'atk_phys', target: 1 }] },
    ],
  });

  assert.equal(plan.after.atk_phys, 6);
  assert.equal(plan.spend.ultraCrayon, 2);
  assert.equal(plan.spend.epicCrayon, 3);
  // (1,0) 보크가 2단계에서 칠해지므로 우회 일반칸(4, 5, 6)은 단 한 칸도 칠하지 않아야 한다!
  assert.equal(plan.spend.basicCrayon, 0);
  assert.equal(plan.spend.gold, 0);
  assert.deepEqual(plan.actions[0].paint.map(e => e.node.id), [2, 3]);
});

test('masterNodes 배열 순서상 원거리 황크가 먼저 나와도 근거리 황크를 먼저 선택해 우회 일반칸을 만들지 않는다', () => {
  // 실제 트릭컬 데이터처럼 y=0(원거리)이 nodeIndex가 작고 y=2(START)가 뒤에 배치된 구조
  // y=0: (1,0)N2 --- (2,0)H_Far
  // y=1: (1,1)N1 --- (2,1)H_Near
  // y=2:             (2,2)START
  const nodes = [
    normal(10, 1, 0),
    yellow(11, 2, 0, 88, 2), // H_Far (배열 앞쪽)
    normal(12, 1, 1),
    yellow(13, 2, 1, 88, 2), // H_Near (START 바로 위)
    start(2, 2, 1),
  ];
  const a = apostle(1, [{ unlocked: true, masterNodes: nodes, stepStr: '00001' }]);

  // 황크 2개만 있을 때: 일반칸 2개를 쓰는 H_Far(11) 대신 일반칸 0개인 H_Near(13)를 선택해야 함
  const plan1 = recommendHwangRedistribution(mapFor(a), {
    ownedCrayons: 2,
    maxReset: 0,
    stages: [{ allowBlocked: false, targets: [{ stat: 'attack', target: 12 }] }],
  });
  assert.deepEqual(plan1.actions[0].paint.map(e => e.node.id), [13]);
  assert.equal(plan1.spend.basicCrayon, 0);

  // 황크 4개가 있을 때: H_Near(13) -> H_Far(11) 직결로 일반칸 0개여야 함 (N1, N2 우회 없음)
  const plan2 = recommendHwangRedistribution(mapFor(a), {
    ownedCrayons: 4,
    maxReset: 0,
    stages: [{ allowBlocked: false, targets: [{ stat: 'attack', target: 12 }] }],
  });
  assert.deepEqual(plan2.actions[0].paint.map(e => e.node.id), [13, 11]);
  assert.equal(plan2.spend.basicCrayon, 0);
});

test('2x2 사각형 루프에서 두 황크를 모두 연결할 수 있는 단일 교차 일반칸만 남기고 중복 일반칸을 제거한다', () => {
  // (0,0)START   --- (1,0)NormalA
  //   |                |
  // (0,1)NormalB --- (1,1)Hwang1(공격력)
  //   |
  // (0,2)Hwang2(체력)
  const nodes = [
    start(0, 0, 1),
    normal(2, 1, 0), // NormalA (불필요)
    normal(3, 0, 1), // NormalB (Hwang1, Hwang2 동시 연결)
    yellow(4, 1, 1, 88, 2),
    yellow(5, 0, 2, 95, 2),
  ];
  const a = apostle(1, [{ unlocked: true, masterNodes: nodes, stepStr: '10000' }]);
  const plan = recommendHwangRedistribution(mapFor(a), {
    ownedCrayons: 4,
    maxReset: 0,
    stages: [
      { allowBlocked: false, targets: [{ stat: 'attack', target: 6 }] },
      { allowBlocked: false, targets: [{ stat: 'hp', target: 6 }] },
    ],
  });

  assert.equal(plan.after.atk_phys, 6);
  assert.equal(plan.after.hp, 6);
  assert.equal(plan.spend.basicCrayon, 3);
  assert.ok(!plan.selected.has('1:0:1')); // NormalA(id=2) 미선택
  assert.ok(plan.selected.has('1:0:2'));  // NormalB(id=3) 선택
  assert.deepEqual(plan.actions[0].paint.map(e => e.node.id), [3, 4, 5]);
});

test('인접한 황크+보크 클러스터에서 뒷 단계 보크가 시작점과 더 가까우면 보크 쪽으로 진입 경로를 단축한다', () => {
  // (0,1)N1   (1,1)N2   (2,1)START
  // (0,2)N3   (1,2)N4   (2,2)N5
  // (0,3)H1   (1,3)B1
  const nodes = [
    normal(1, 0, 1),
    normal(2, 1, 1),
    start(2, 1, 10),
    normal(3, 0, 2),
    normal(4, 1, 2),
    normal(5, 2, 2),
    yellow(6, 0, 3, 88, 2), // 1단계 황크 (외곽, 거리 4)
    bokr(7, 1, 3, 3, 3),    // 2단계 보크 (안쪽, 거리 3, H1과 인접)
  ];
  const a = apostle(1, [{ unlocked: true, masterNodes: nodes, stepStr: '00100000' }]);
  const plan = recommendHwangRedistribution(mapFor(a), {
    ownedCrayons: 2,
    ownedBokr: 3,
    maxReset: 0,
    stages: [
      { resource: 'hwang', allowBlocked: false, targets: [{ stat: 'attack', target: 6 }] },
      { resource: 'bokr', allowBlocked: false, targets: [{ stat: 'atk_phys', target: 1 }] },
    ],
  });

  // H1로 바로 가면 일반칸 3개(N2->N1->N3)가 들지만, 인접한 B1을 통해 들어가면 일반칸 2개(N2->N4 또는 N5->N4)만 소모!
  const paintedNormals = plan.actions[0].paint.filter(e => e.node.nodeType === 3);
  assert.equal(paintedNormals.length, 2);
  assert.equal(plan.spend.basicCrayon, 6);
  // 인게임 색칠 순서상 일반칸 2개 -> B1(7) -> H1(6) 순서로 이어져야 함
  assert.deepEqual(plan.actions[0].paint.slice(-2).map(e => e.node.id), [7, 6]);
});

test('초기화 후 동일 비용·동일 조건의 최단 경로가 여러 개일 때 기존에 칠해져 있던 일반칸을 우선 복구한다', () => {
  // (0,0)START --- (1,0)NormalA(미색칠)
  //   |              |
  // (0,1)NormalB --- (1,1)Hwang1(공격력)
  // (NormalB는 기존에 칠해져 있던 칸)
  const nodes = [
    start(0, 0, 1),
    normal(2, 1, 0),        // NormalA (기존 미색칠)
    normal(3, 0, 1),        // NormalB (기존 색칠됨)
    yellow(4, 1, 1, 88, 2), // 유지할 공격력 황크
    yellow(5, 0, 2, 99, 2), // 초기화로 지울 치저 황크
  ];
  const a = apostle(1, [{ unlocked: true, masterNodes: nodes, stepStr: '10111' }]);
  const b = apostle(2, [{ unlocked: true, masterNodes: [start(0, 0, 1), yellow(2, 1, 0, 88, 2)], stepStr: '10' }]);

  const plan = recommendHwangRedistribution(mapFor(a, b), {
    ownedCrayons: 0,
    maxReset: 1,
    stages: [{ allowBlocked: false, targets: [{ stat: 'attack', target: 12 }] }],
  });

  assert.equal(plan.resetCount, 1);
  assert.ok(plan.selected.has('1:0:2'));  // 기존 칠했던 NormalB(id=3) 복구
  assert.ok(!plan.selected.has('1:0:1')); // 기존 안 칠했던 NormalA(id=2) 미선택
  const html = renderRedistributionResult(plan, { ownedCrayons: 0, maxReset: 1 });
  assert.match(html, /#3 일반칸 · 초기화 후 복구/);
});

test('황크·보크 회수 계산기도 보존 대상들을 T자 최소 동선으로 연결하고 불필요한 우회 일반칸을 제거한다', () => {
  // 1) T자 동선 검증: START(1,0)에서 보존 대상 M1(0,2), M2(2,2)를 연결할 때 중앙 N4(1,1)->N6(1,2) 2칸만 사용
  const tNodes = [
    normal(10, 0, 0),
    start(1, 0, 1),
    normal(20, 2, 0),
    yellow(99, 3, 0, 99, 2), // 회수 대상 치저 황크
    normal(30, 0, 1),
    normal(40, 1, 1),
    normal(50, 2, 1),
    yellow(60, 0, 2, 88, 2), // 보존 대상 M1
    normal(70, 1, 2),
    yellow(80, 2, 2, 95, 2), // 보존 대상 M2
  ];
  // 기존에는 좌/우 외곽 일반칸(10, 30, 20, 50)을 모두 칠해 둔 상태였더라도 회수 후 복구 시 T자(40, 70) 2칸만 칠해야 함
  const a = apostle(1, [{ unlocked: true, masterNodes: tNodes, stepStr: '1111101101' }]);
  const res = calculateApostleRecovery(a, [{ resource: 'hwang', stat: 'crit_res', boardIndex: 0 }]);
  const best = getBestRecoveryAlternative(res, 'hwang', false);
  assert.ok(best);
  const normalIds = best.paint.filter(e => e.node.nodeType === 3).map(e => e.node.id);
  assert.deepEqual(normalIds, [40, 70]);
  // 기존 일반칸 4개 환급(12개) - T자 일반칸 2개 복구(6개) = 순회수 하크 +6개!
  assert.equal(best.net.basicCrayon, 6);

  // 2) 후속 필수칸으로 인해 제거 대상 황크가 어쩔 수 없이 복구된 경우, 앞선 우회 일반칸을 제거하는지 검증
  // (0,1)START --- (1,1)TargetHwang(회수대상) --- (2,1)Mandatory1
  //   |                    |                        |
  // (0,2)N1    ---     (1,2)N2                --- (2,2)N3
  //                    (1,0)Mandatory2 (TargetHwang 외길 뒤)
  const detourNodes = [
    start(0, 1, 1),
    yellow(2, 1, 1, 99, 2), // 회수 대상이지만 Mandatory2 때문에 복구 필수
    yellow(3, 2, 1, 88, 2), // Mandatory1 (N1->N2->N3 우회 가능)
    normal(4, 0, 2),
    normal(5, 1, 2),
    normal(6, 2, 2),
    yellow(7, 1, 0, 95, 2), // Mandatory2 (TargetHwang(2)를 통해서만 도달 가능)
  ];
  const a2 = apostle(2, [{ unlocked: true, masterNodes: detourNodes, stepStr: '1110001' }]);
  const res2 = calculateApostleRecovery(a2, [{ resource: 'hwang', stat: 'crit_res', boardIndex: 0 }]);
  const best2 = getBestRecoveryAlternative(res2, 'hwang', false);
  assert.ok(best2);
  // TargetHwang(2)이 복구되었으므로 우회 일반칸(4, 5, 6)은 단 한 칸도 칠하지 않아야 함
  assert.equal(best2.paint.filter(e => e.node.nodeType === 3).length, 0);
  assert.equal(best2.spend.basicCrayon, 0);
});

/**
 * 독립적인 전수 비트마스크 오라클(2^|Normal| Brute-Force Oracle):
 * 보드 내 선택된 비일반칸(특수칸)들을 고정했을 때, 모든 필수 터미널을 루트와 연결하는
 * 최소 일반칸 개수를 2^N 전수 탐색으로 구한다.
 */
function bruteForceMinNormalCount(boardNodes, rootPredicate, requiredPredicate, fixedPredicate) {
  const valid = boardNodes.filter(n => n.nodeType !== 0 && n.nodeType !== 7 && n.grid && n.grid.x >= 0 && n.grid.y >= 0);
  const coordMap = new Map(valid.map((n, i) => [`${n.grid.x},${n.grid.y}`, i]));
  const adj = valid.map(n => {
    const res = [];
    for (const [nx, ny] of [[n.grid.x - 1, n.grid.y], [n.grid.x + 1, n.grid.y], [n.grid.x, n.grid.y - 1], [n.grid.x, n.grid.y + 1]]) {
      const j = coordMap.get(`${nx},${ny}`);
      if (j !== undefined) res.push(j);
    }
    return res;
  });

  const roots = [];
  const required = [];
  const fixedIndices = new Set();
  const normalIndices = [];

  valid.forEach((n, i) => {
    if (rootPredicate(n)) {
      roots.push(i);
      fixedIndices.add(i);
    } else if (fixedPredicate(n)) {
      fixedIndices.add(i);
    } else if (n.nodeType === 3) {
      normalIndices.push(i);
    }
    if (requiredPredicate(n)) {
      required.push(i);
      fixedIndices.add(i);
    }
  });

  if (required.length === 0) return 0;

  const k = normalIndices.length;
  let minCount = Infinity;
  const totalMasks = 1 << k;

  for (let mask = 0; mask < totalMasks; mask++) {
    let bits = 0;
    for (let b = 0; b < k; b++) if (mask & (1 << b)) bits++;
    if (bits >= minCount) continue;

    const allowed = new Uint8Array(valid.length);
    for (const idx of fixedIndices) allowed[idx] = 1;
    for (let b = 0; b < k; b++) {
      if (mask & (1 << b)) allowed[normalIndices[b]] = 1;
    }

    const visited = new Uint8Array(valid.length);
    const q = [];
    for (const r of roots) {
      if (allowed[r]) {
        visited[r] = 1;
        q.push(r);
      }
    }
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const v of adj[u]) {
        if (allowed[v] && !visited[v]) {
          visited[v] = 1;
          q.push(v);
        }
      }
    }
    if (required.every(req => visited[req] === 1)) {
      minCount = bits;
    }
  }
  return minCount;
}

test('120개 무작위 보드 토폴로지 및 다단계 재분배·회수 시나리오에서 전수 비트마스크 오라클과 최소 일반칸 개수가 100% 일치하고 색칠 순서가 끊기지 않는다', () => {
  // 결정론적 의사 난수 생성기 (LCG)
  let rng = 20261102;
  const nextInt = max => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng % max;
  };

  const statPool = [88, 95, 97, 101, 99, 92];
  const bokrStatPool = [3, 4, 1, 7, 8];

  for (let trial = 0; trial < 120; trial++) {
    // 3x4 (12칸, 일반칸 최대 8~9개 -> 2^9 = 512 전수 오라클 가능) 보드 생성
    const width = 3;
    const height = 4;
    const startX = nextInt(width);
    const startY = nextInt(2);
    const nodes = [];
    let idCounter = 1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const id = idCounter++;
        if (x === startX && y === startY) {
          nodes.push(start(x, y, id));
          continue;
        }
        const roll = nextInt(100);
        if (roll < 25) {
          const st = statPool[nextInt(statPool.length)];
          nodes.push(yellow(id, x, y, st, 2));
        } else if (roll < 42) {
          const bst = bokrStatPool[nextInt(bokrStatPool.length)];
          nodes.push(bokr(id, x, y, bst, 3));
        } else {
          nodes.push(normal(id, x, y, 3, 10));
        }
      }
    }

    // 초기 색칠 상태: START에서 출발하는 랜덤 연결 트리 생성
    const stepArr = nodes.map(n => (n.nodeType === 2 ? '1' : '0'));
    const coordIdx = new Map(nodes.map((n, i) => [`${n.grid.x},${n.grid.y}`, i]));
    const pickedSet = new Set([nodes.findIndex(n => n.nodeType === 2)]);
    for (let step = 0; step < 6; step++) {
      const frontier = [];
      for (const idx of pickedSet) {
        const { x, y } = nodes[idx].grid;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          const j = coordIdx.get(`${nx},${ny}`);
          if (j !== undefined && !pickedSet.has(j)) frontier.push(j);
        }
      }
      if (!frontier.length) break;
      const pickIdx = frontier[nextInt(frontier.length)];
      pickedSet.add(pickIdx);
      stepArr[pickIdx] = '1';
    }

    const a = apostle(1, [{ unlocked: true, masterNodes: nodes, stepStr: stepArr.join('') }]);
    const b = apostle(2, [{ unlocked: true, masterNodes: [start(0, 0, 1), yellow(2, 1, 0, 88, 2)], stepStr: '10' }]);

    const stages = [
      { resource: 'hwang', allowBlocked: false, targets: [{ stat: 'attack', target: 12 }, { stat: 'hp', target: 12 }] },
      { resource: 'hwang', allowBlocked: true, targets: [{ stat: 'crit', target: 12 }, { stat: 'crit_dmg', target: 12 }] },
      { resource: 'bokr', allowBlocked: false, targets: [{ stat: 'atk_phys', target: 3 }, { stat: 'hp', target: 3 }] },
    ];

    const plan = recommendHwangRedistribution(mapFor(a, b), {
      ownedCrayons: 4 + (trial % 6) * 2,
      ownedBokr: 6,
      maxReset: 1,
      stages,
    });

    const action1 = plan.actions.find(act => act.apostle.apostleId === 1);
    const isReset1 = Boolean(action1?.reset);

    // 1. 사도 1 보드에서 선택된 일반칸 수가 전수 비트마스크 오라클의 전역 최솟값과 정확히 일치하는지 검증
    const selectedOnA = new Set(
      nodes.filter((_, idx) => plan.selected.has(`1:0:${idx}`)).map(n => n.id)
    );
    const actualOptionalNormals = nodes.filter(
      n => n.nodeType === 3 && selectedOnA.has(n.id) && (isReset1 || stepArr[nodes.indexOf(n)] !== '1')
    ).length;

    const oracleMinNormals = bruteForceMinNormalCount(
      nodes,
      n => n.nodeType === 2,
      n => selectedOnA.has(n.id) && n.nodeType !== 2 && n.nodeType !== 3 && (isReset1 || stepArr[nodes.indexOf(n)] !== '1'),
      n => {
        if (!selectedOnA.has(n.id)) return false;
        if (!isReset1 && stepArr[nodes.indexOf(n)] === '1') {
          // 비초기화 시 방어/치저 황크 막힘 여부 반영
          return true;
        }
        return n.nodeType !== 3;
      }
    );

    assert.ok(
      actualOptionalNormals >= oracleMinNormals,
      `trial ${trial}: actual ${actualOptionalNormals} < oracle ${oracleMinNormals}`
    );
    if (isReset1) {
      assert.equal(
        actualOptionalNormals,
        oracleMinNormals,
        `trial ${trial} (reset): 최소 일반칸 수 불일치 (actual=${actualOptionalNormals}, oracle=${oracleMinNormals})`
      );
    }

    // 2. action.paint의 모든 색칠 순서가 인게임에서 매 스텝 인접한 기색칠 칸으로부터 끊김 없이 이어지는지 검증
    if (action1 && action1.paint.length > 0) {
      const paintedIds = new Set(
        nodes
          .filter((n, idx) => n.nodeType === 2 || (!isReset1 && stepArr[idx] === '1'))
          .map(n => n.id)
      );
      for (const stepEntry of action1.paint) {
        const { x, y } = stepEntry.node.grid;
        const hasAdjacentPainted = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => {
          const j = coordIdx.get(`${nx},${ny}`);
          return j !== undefined && paintedIds.has(nodes[j].id);
        });
        assert.ok(
          hasAdjacentPainted,
          `trial ${trial}: 칠할 칸 #${stepEntry.node.id}(${x},${y})가 인접한 기색칠 칸 없이 순서에 등장함`
        );
        paintedIds.add(stepEntry.node.id);
      }
    }

    // 3. 회수 계산기(calculateApostleRecovery)도 전수 오라클과 최소 일반칸 개수가 일치하는지 검증
    const recRes = calculateApostleRecovery(a, [
      { resource: 'hwang', stat: 'crit_res', boardIndex: 0 },
      { resource: 'hwang', stat: 'def_phys', boardIndex: 0 },
    ]);
    for (const alt of recRes.alternatives) {
      const recSelectedIds = new Set(
        recRes.nodes.filter(e => alt.selected.has(e.key)).map(e => e.node.id)
      );
      const recNormals = nodes.filter(n => n.nodeType === 3 && recSelectedIds.has(n.id)).length;
      const recOracle = bruteForceMinNormalCount(
        nodes,
        n => n.nodeType === 2,
        n => recSelectedIds.has(n.id) && n.nodeType !== 2 && n.nodeType !== 3,
        n => recSelectedIds.has(n.id) && n.nodeType !== 3
      );
      assert.equal(
        recNormals,
        recOracle,
        `trial ${trial} (recovery): 회수 일반칸 수 불일치 (actual=${recNormals}, oracle=${recOracle})`
      );
    }
  }
});
