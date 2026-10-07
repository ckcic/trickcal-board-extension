/**
 * @file boardPathfinder.ts
 * @description 보드의 상하좌우 연결과 재화 우선순위에 따른 보크 경로·소모 비용 계산 순수 함수
 */

import {
  BASIC_CRAYON_ITEM_ID,
  BOKR_ITEM_ID,
  HWANG_ITEM_ID,
  MID_CRAYON_ITEM_ID,
  NODE_TYPE,
  WATERING_CAN_ITEM_ID,
} from './boardProgress.ts';
import type { ApostleProgress, MasterBoardNode, RequireItem, ResourceCostSummary } from './types.ts';

/**
 * 경로 탐색 결과 인터페이스
 */
export interface BokrPathResult {
  /** 경로에 포함된 원본 차수와 노드 인덱스 */
  pathSteps?: Array<{ boardIndex: number; nodeIndex: number; nodeId: number }>;
  /** 미해금 관문의 크레파스 외 추가 재화 */
  gateRequirements?: Array<{ boardLevel: number; items: RequireItem[] }>;
  /** 목표 노드 */
  targetNode: MasterBoardNode;
  /** 목표 노드가 이미 색칠되어 있는지 여부 */
  isTargetPicked: boolean;
  /** 최단 경로에 포함된 모든 노드 ID 목록 (시작점 -> 목표) */
  pathNodeIds: number[];
  /** 최단 경로에 포함된 보드 내 노드 인덱스 목록 */
  pathNodeIndices: number[];
  /** 경로 상에서 아직 색칠되지 않은 노드 목록 */
  unpickedPathNodes: MasterBoardNode[];
  /** 도달하기 위해 거쳐야 하는 미칠해진 일반칸 수 */
  unpickedNormalCount: number;
  /**
   * 경로를 뚫기 위해 소모되는 '추가 비용' (목표 보크 칸 자체의 비용 제외)
   */
  pathCost: ResourceCostSummary;
  /**
   * 목표 보크 칸 자체를 칠하는 데 필요한 비용
   */
  targetNodeCost: ResourceCostSummary;
  /**
   * 총 필요 비용 (경로 추가 비용 + 목표 보크 비용)
   */
  totalCost: ResourceCostSummary;
}

/** 위치 보드와 경로 탐색이 동일한 차수별 좌표를 사용한다. */
export function getApostleBoardLayout(progress: ApostleProgress, lastBoardIndex = progress.boards.length - 1) {
  const layout: Array<{ boardIndex: number; nodeIndex: number; nodeId: number; node: MasterBoardNode; x: number; y: number; picked: boolean }> = [];
  let offsetY = 0;
  progress.boards.slice(0, lastBoardIndex + 1).forEach((board, boardIndex) => {
    const validNodes = (board.masterNodes || []).map((node, nodeIndex) => ({ node, nodeIndex }))
      .filter(({ node }) => node.nodeType !== 0 && node.grid &&
        Number.isSafeInteger(node.grid.x) && Number.isSafeInteger(node.grid.y) && node.grid.x >= 0 && node.grid.y >= 0);
    for (const { node, nodeIndex } of validNodes) {
      layout.push({ boardIndex, nodeIndex, nodeId: node.id, node, x: node.grid!.x, y: node.grid!.y + offsetY,
        picked: board.unlocked !== false && board.stepStr?.[nodeIndex] === '1' });
    }
    if (validNodes.length) {
      const ys = validNodes.map(({ node }) => node.grid!.y);
      offsetY += Math.max(...ys) + (Math.min(...ys) === 0 ? 1 : 0);
    }
  });
  return layout;
}

/** 앞 보드 관문을 거쳐 목표 차수에 진입하며 노드 ID가 차수마다 같아도 구분한다. */
export function findApostlePathToBokr(progress: ApostleProgress, boardIndex: number, nodeId: number): BokrPathResult | null {
  if (!Number.isInteger(boardIndex) || boardIndex < 0 || boardIndex >= progress.boards.length) return null;
  const target = progress.boards[boardIndex]?.masterNodes?.find(node => node.id === nodeId);
  if (!target) return null;
  const layout = getApostleBoardLayout(progress, boardIndex);
  const targetIndex = layout.findIndex(entry => entry.boardIndex === boardIndex && entry.nodeId === nodeId);
  if (targetIndex < 0) return null;
  // 탐색 내부에서만 고유 인덱스를 사용하고 결과에는 원본 식별자를 돌려준다.
  const nodes = layout.map((entry, index) => ({ ...entry.node, id: index,
    nodeType: entry.boardIndex > 0 && entry.node.nodeType === NODE_TYPE.START ? NODE_TYPE.NORMAL : entry.node.nodeType,
    grid: { x: entry.x, y: entry.y } }));
  const result = findShortestPathToBokr(nodes, layout.map(entry => entry.picked ? '1' : '0').join(''), targetIndex);
  if (!result) return null;
  const pathSteps = result.pathNodeIndices.map(index => {
    const { boardIndex: level, nodeIndex, nodeId: id } = layout[index]!;
    return { boardIndex: level, nodeIndex, nodeId: id };
  });
  const gateRequirements = result.pathNodeIndices.filter(index => !layout[index]!.picked && nodes[index]?.nodeType === NODE_TYPE.GATE)
    .map(index => ({ boardLevel: layout[index]!.boardIndex + 1, items: layout[index]!.node.requireItems || [] }));
  const unpickedPathNodes = result.pathNodeIndices.slice(0, -1)
    .filter(index => !layout[index]!.picked && nodes[index]?.nodeType !== NODE_TYPE.START)
    .map(index => layout[index]!.node);
  return { ...result, targetNode: target, pathSteps, gateRequirements,
    pathNodeIds: pathSteps.map(step => step.nodeId), pathNodeIndices: pathSteps.map(step => step.nodeIndex),
    unpickedPathNodes, unpickedNormalCount: unpickedPathNodes.filter(node => node.nodeType === NODE_TYPE.NORMAL).length };
}

/** 원본 보드와 동일하게 상하좌우로만 연결한다. */
export function getAdjacentGridOffsets(x: number, y: number): Array<{ x: number; y: number }> {
  return [{ x, y: y - 1 }, { x, y: y + 1 }, { x: x - 1, y }, { x: x + 1, y }];
}

/**
 * 단일 노드의 소모 재화(크레파스 및 골드) 추출
 */
export function extractNodeCost(node: MasterBoardNode): ResourceCostSummary {
  const cost: ResourceCostSummary = {
    basicCrayon: 0,
    averageCrayon: 0,
    epicCrayon: 0,
    ultraCrayon: 0,
    wateringCan: 0,
    gold: node.requireGold || 0,
  };

  if (node.requireItems && Array.isArray(node.requireItems)) {
    for (const it of node.requireItems) {
      if (it.item === BASIC_CRAYON_ITEM_ID) cost.basicCrayon += (it.value || 0);
      else if (it.item === MID_CRAYON_ITEM_ID) cost.averageCrayon += (it.value || 0);
      else if (it.item === BOKR_ITEM_ID) cost.epicCrayon += (it.value || 0);
      else if (it.item === HWANG_ITEM_ID) cost.ultraCrayon += (it.value || 0);
      else if (it.item === WATERING_CAN_ITEM_ID) {
        cost.wateringCan = (cost.wateringCan || 0) + (it.value || 0);
      }
    }
  }

  return cost;
}

/**
 * 두 비용 객체 합산
 */
export function sumCosts(a: ResourceCostSummary, b: ResourceCostSummary): ResourceCostSummary {
  return {
    basicCrayon: a.basicCrayon + b.basicCrayon,
    averageCrayon: a.averageCrayon + b.averageCrayon,
    epicCrayon: a.epicCrayon + b.epicCrayon,
    ultraCrayon: a.ultraCrayon + b.ultraCrayon,
    wateringCan: (a.wateringCan || 0) + (b.wateringCan || 0),
    gold: a.gold + b.gold,
  };
}

/** 재화 우선순위는 관문, 물뿌리개, 황크, 보크, 골드, 경로 길이 순이다. */
type PathWeight = [number, number, number, number, number, number];
const zeroCost = (): ResourceCostSummary => ({
  basicCrayon: 0, averageCrayon: 0, epicCrayon: 0, ultraCrayon: 0, wateringCan: 0, gold: 0,
});
function compareWeight(a: PathWeight, b: PathWeight): number {
  for (let i = 0; i < a.length; i++) {
    const difference = a[i]! - b[i]!;
    if (difference) return difference;
  }
  return 0;
}

/**
 * 해당 보드 내부의 최소 재화 경로를 계산한다. 숫자 식별자는 항상 노드 ID이다.
 * 선행 보드의 관문 해금은 별도로 필요하며, 시작점을 임의의 첫 노드로 추정하지 않는다.
 */
export function findShortestPathToBokr(
  boardNodes: MasterBoardNode[],
  stepStr: string = '',
  targetIdentifier: number | { x: number; y: number }
): BokrPathResult | null {
  const targetIndex = boardNodes.findIndex(node => typeof targetIdentifier === 'number'
    ? node.id === targetIdentifier
    : node.grid?.x === targetIdentifier.x && node.grid?.y === targetIdentifier.y);
  const targetNode = boardNodes[targetIndex];
  if (!targetNode) return null;
  const picked = (index: number) => stepStr[index] === '1';
  const targetNodeCost = extractNodeCost(targetNode);
  if (picked(targetIndex)) return {
    targetNode, isTargetPicked: true, pathNodeIds: [targetNode.id], pathNodeIndices: [targetIndex],
    unpickedPathNodes: [], unpickedNormalCount: 0, pathCost: zeroCost(), targetNodeCost, totalCost: zeroCost(),
  };

  const coordinates = new Map<string, number>();
  const distances = new Map<number, PathWeight>();
  const previous = new Map<number, number>();
  const visited = new Set<number>();
  boardNodes.forEach((node, index) => {
    if (!node.grid || node.grid.x < 0 || node.grid.y < 0 || node.nodeType === 0) return;
    coordinates.set(`${node.grid.x},${node.grid.y}`, index);
    if (picked(index) || node.nodeType === NODE_TYPE.START) distances.set(index, [0, 0, 0, 0, 0, 0]);
  });

  // 보드 노드 수가 작으므로 선형 선택으로 다익스트라 탐색을 수행한다.
  while (true) {
    let current = -1;
    let currentWeight: PathWeight | undefined;
    for (const [index, weight] of distances) {
      if (!visited.has(index) && (!currentWeight || compareWeight(weight, currentWeight) < 0)) {
        current = index;
        currentWeight = weight;
      }
    }
    if (current < 0 || !currentWeight) return null;
    if (current === targetIndex) break;
    visited.add(current);
    const grid = boardNodes[current]?.grid;
    if (!grid) continue;
    for (const neighbor of getAdjacentGridOffsets(grid.x, grid.y)) {
      const index = coordinates.get(`${neighbor.x},${neighbor.y}`);
      if (index === undefined || visited.has(index)) continue;
      const node = boardNodes[index]!;
      const cost = picked(index) || node.nodeType === NODE_TYPE.START ? zeroCost() : extractNodeCost(node);
      const weight: PathWeight = [
        currentWeight[0] + (!picked(index) && node.nodeType === NODE_TYPE.GATE ? 1 : 0),
        currentWeight[1] + (cost.wateringCan || 0), currentWeight[2] + cost.ultraCrayon,
        currentWeight[3] + cost.epicCrayon, currentWeight[4] + cost.gold, currentWeight[5] + 1,
      ];
      const old = distances.get(index);
      if (!old || compareWeight(weight, old) < 0) {
        distances.set(index, weight);
        previous.set(index, current);
      }
    }
  }
  const pathNodeIndices = [targetIndex];
  let cursor = targetIndex;
  while (previous.has(cursor)) {
    cursor = previous.get(cursor)!;
    pathNodeIndices.unshift(cursor);
  }
  const unpickedPathNodes = pathNodeIndices.slice(0, -1)
    .filter(index => !picked(index) && boardNodes[index]?.nodeType !== NODE_TYPE.START)
    .map(index => boardNodes[index]!);
  const pathCost = unpickedPathNodes.reduce((cost, node) => sumCosts(cost, extractNodeCost(node)), zeroCost());
  return {
    targetNode, isTargetPicked: false,
    pathNodeIds: pathNodeIndices.map(index => boardNodes[index]!.id), pathNodeIndices,
    unpickedPathNodes,
    unpickedNormalCount: unpickedPathNodes.filter(node => node.nodeType === NODE_TYPE.NORMAL).length,
    pathCost, targetNodeCost, totalCost: sumCosts(pathCost, targetNodeCost),
  };
}
