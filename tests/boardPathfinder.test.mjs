import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findApostlePathToBokr,
  findShortestPathToBokr,
  getAdjacentGridOffsets,
} from '../src/domain/boardPathfinder.ts';

test('원본 보드의 상하좌우 연결만 허용하고 대각선은 연결하지 않는다', () => {
  assert.deepEqual(getAdjacentGridOffsets(2, 1), [
    { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 1, y: 1 }, { x: 3, y: 1 },
  ]);
  assert.equal(findShortestPathToBokr([
    { id: 1, nodeType: 2, grid: { x: 1, y: 1 } },
    { id: 2, nodeType: 4, grid: { x: 2, y: 2 } },
  ], '10', 2), null);
});

test('findShortestPathToBokr: 이미 색칠된 보크 노드는 추가 경로 비용 0 반환', () => {
  const nodes = [
    { id: 101, nodeType: 2, grid: { x: 0, y: 0 }, requireGold: 0, requireItems: [] },
    { id: 102, nodeType: 4, grid: { x: 1, y: 0 }, requireGold: 10000, requireItems: [{ item: 610003, value: 3 }] },
  ];
  // 102 노드가 색칠된 상태 (step: '11')
  const result = findShortestPathToBokr(nodes, '11', 102);

  assert.ok(result);
  assert.equal(result.isTargetPicked, true);
  assert.equal(result.pathCost.gold, 0);
  assert.equal(result.pathCost.basicCrayon, 0);
  assert.equal(result.targetNodeCost.gold, 10000);
  assert.equal(result.targetNodeCost.epicCrayon, 3);
  assert.equal(result.unpickedNormalCount, 0);
  assert.equal(result.totalCost.gold, 0);
  assert.equal(result.totalCost.epicCrayon, 0);
});

test('findShortestPathToBokr: 시작 타일에서 미색칠 일반칸을 거쳐 보크까지의 최단 경로 및 누적 비용 계산', () => {
  // 구조: Start(0,0) -> Normal(1,0) -> Bokr(2,0)
  const nodes = [
    { id: 1, nodeType: 2, grid: { x: 0, y: 0 }, requireGold: 0, requireItems: [] },
    { id: 2, nodeType: 3, grid: { x: 1, y: 0 }, requireGold: 5000, requireItems: [{ item: 610001, value: 3 }] },
    { id: 3, nodeType: 4, grid: { x: 2, y: 0 }, requireGold: 20000, requireItems: [{ item: 610003, value: 3 }] },
  ];

  // 시작 타일만 칠해진 상태 (step: '100')
  const result = findShortestPathToBokr(nodes, '100', 3);

  assert.ok(result);
  assert.equal(result.isTargetPicked, false);
  assert.deepEqual(result.pathNodeIds, [1, 2, 3]);
  assert.equal(result.unpickedNormalCount, 1);
  assert.equal(result.unpickedPathNodes.length, 1);
  assert.equal(result.unpickedPathNodes[0].id, 2);

  // 경로 소모 비용 (2번 일반 노드만)
  assert.equal(result.pathCost.gold, 5000);
  assert.equal(result.pathCost.basicCrayon, 3);
  assert.equal(result.pathCost.epicCrayon, 0);

  // 목표 보크 비용 (3번 노드)
  assert.equal(result.targetNodeCost.gold, 20000);
  assert.equal(result.targetNodeCost.epicCrayon, 3);

  // 총 소모 비용 (경로 + 목표)
  assert.equal(result.totalCost.gold, 25000);
  assert.equal(result.totalCost.basicCrayon, 3);
  assert.equal(result.totalCost.epicCrayon, 3);
});

test('findShortestPathToBokr: 이미 일부 칠해진 노드가 있다면 가장 가까운 칠해진 노드로부터 경로 계산', () => {
  // Start(0,0) -> N1(1,0) -> N2(2,0) -> Bokr(3,0)
  // N1(1,0)까지 칠해져 있다면 N2(2,0)만 경로 비용으로 계산되어야 함
  const nodes = [
    { id: 1, nodeType: 2, grid: { x: 0, y: 0 }, requireGold: 0, requireItems: [] },
    { id: 2, nodeType: 3, grid: { x: 1, y: 0 }, requireGold: 5000, requireItems: [{ item: 610001, value: 3 }] },
    { id: 3, nodeType: 3, grid: { x: 2, y: 0 }, requireGold: 8000, requireItems: [{ item: 610001, value: 3 }, { item: 610002, value: 3 }] },
    { id: 4, nodeType: 4, grid: { x: 3, y: 0 }, requireGold: 20000, requireItems: [{ item: 610003, value: 3 }] },
  ];

  // 1, 2번 칠해짐 (step: '1100')
  const result = findShortestPathToBokr(nodes, '1100', 4);

  assert.ok(result);
  assert.equal(result.isTargetPicked, false);
  // 경로 시작은 이미 칠해진 2번부터 출발
  assert.deepEqual(result.pathNodeIds, [2, 3, 4]);
  assert.equal(result.unpickedNormalCount, 1); // 3번만 미칠해짐

  assert.equal(result.pathCost.gold, 8000);
  assert.equal(result.pathCost.basicCrayon, 3);
  assert.equal(result.pathCost.averageCrayon, 3);
  assert.equal(result.targetNodeCost.epicCrayon, 3);
  assert.equal(result.totalCost.gold, 28000);
});

test('findShortestPathToBokr: 연결되지 않은 고립 노드는 null 반환', () => {
  const nodes = [
    { id: 1, nodeType: 2, grid: { x: 0, y: 0 }, requireGold: 0, requireItems: [] },
    { id: 99, nodeType: 4, grid: { x: 10, y: 10 }, requireGold: 20000, requireItems: [{ item: 610003, value: 3 }] },
  ];
  const result = findShortestPathToBokr(nodes, '10', 99);
  assert.equal(result, null);
});

test('숫자 식별자는 노드 ID로만 해석하고 배열 인덱스로 추정하지 않는다', () => {
  const nodes = [
    { id: 101, nodeType: 2, grid: { x: 1, y: 1 } },
    { id: 102, nodeType: 4, grid: { x: 2, y: 1 } },
  ];
  assert.equal(findShortestPathToBokr(nodes, '10', 1), null);
  assert.equal(findShortestPathToBokr(nodes, '10', 102).targetNode.id, 102);
});

test('황크를 통과하는 짧은 경로보다 일반칸을 우회하는 저렴한 경로를 선택한다', () => {
  const nodes = [
    { id: 10, nodeType: 2, grid: { x: 1, y: 1 } },
    { id: 11, nodeType: 5, grid: { x: 2, y: 1 }, requireItems: [{ item: 610004, value: 1 }] },
    { id: 12, nodeType: 4, grid: { x: 3, y: 1 }, requireItems: [{ item: 610003, value: 3 }], requireGold: 100 },
    { id: 13, nodeType: 3, grid: { x: 1, y: 2 }, requireGold: 10 },
    { id: 14, nodeType: 3, grid: { x: 2, y: 2 }, requireGold: 10 },
    { id: 15, nodeType: 3, grid: { x: 3, y: 2 }, requireGold: 10 },
  ];
  const result = findShortestPathToBokr(nodes, '100000', 12);
  assert.deepEqual(result.pathNodeIds, [10, 13, 14, 15, 12]);
  assert.equal(result.totalCost.ultraCrayon, 0);
  assert.equal(result.totalCost.gold, 130);
});

test('시작점 없는 보드를 임의로 열지 않고 빈칸을 통과하지 않는다', () => {
  assert.equal(findShortestPathToBokr([
    { id: 10, nodeType: 3, grid: { x: 1, y: 1 } },
    { id: 11, nodeType: 4, grid: { x: 2, y: 1 } },
  ], '', 11), null);
  assert.equal(findShortestPathToBokr([
    { id: 10, nodeType: 2, grid: { x: 1, y: 1 } },
    { id: 11, nodeType: 0, grid: { x: 2, y: 1 } },
    { id: 12, nodeType: 4, grid: { x: 3, y: 1 } },
  ], '100', 12), null);
});

test('비어 있는 후속 보드는 앞 보드의 활성 관문에서 이어지고 차수별 상태 문자열을 혼동하지 않는다', () => {
  const progress = { boards: [
    { masterNodes: [
      { id: 101, nodeType: 2, grid: { x: 1, y: 1 } },
      { id: 102, nodeType: 1, grid: { x: 1, y: 2 }, requireGold: 500000 },
    ], stepStr: '11' },
    { masterNodes: [
      { id: 201, nodeType: 3, grid: { x: 1, y: 1 }, requireGold: 5000 },
      { id: 202, nodeType: 1, grid: { x: 1, y: 2 }, requireGold: 1000000 },
    ], stepStr: '11' },
    { masterNodes: [
      { id: 301, nodeType: 3, grid: { x: 1, y: 1 }, requireGold: 5000, requireItems: [{ item: 610001, value: 3 }] },
      { id: 302, nodeType: 4, grid: { x: 1, y: 2 }, requireGold: 30000, requireItems: [{ item: 610003, value: 3 }] },
    ], stepStr: '' },
  ] };
  const result = findApostlePathToBokr(progress, 2, 302);
  assert.deepEqual(result.pathNodeIds, [202, 301, 302]);
  assert.deepEqual(result.pathSteps, [
    { boardIndex: 1, nodeIndex: 1, nodeId: 202 },
    { boardIndex: 2, nodeIndex: 0, nodeId: 301 },
    { boardIndex: 2, nodeIndex: 1, nodeId: 302 },
  ]);
  assert.equal(result.targetNode.grid.y, 2);
  assert.equal(result.totalCost.gold, 35000);
  assert.equal(result.totalCost.basicCrayon, 3);
  assert.deepEqual(result.gateRequirements, []);
  progress.boards[1].stepStr = '10';
  progress.boards[1].masterNodes[1].requireItems = [{ item: 310000, value: 5 }];
  const locked = findApostlePathToBokr(progress, 2, 302);
  assert.equal(locked.totalCost.gold, 1035000);
  assert.deepEqual(locked.gateRequirements, [{ boardLevel: 2, items: [{ item: 310000, value: 5 }] }]);
});
