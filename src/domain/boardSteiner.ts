/**
 * @file boardSteiner.ts
 * @description 보드 내 목표 노드(황크·보크·관문)들을 시작점과 연결하는 최소 비용 일반칸 슈타이너 트리(Steiner Tree, T자 동선) 및 불필요 일반칸 제거 순수 함수
 */

import { NODE_TYPE } from './constants.ts';
import { findLinkedPetalNode } from './boardPathfinder.ts';
import { hwang } from './redistributionModel.ts';
import type { MasterBoardNode, ResourceCostSummary } from './types.ts';

export interface SteinerBoardNode {
  key: string;
  boardIndex: number;
  nodeIndex: number;
  node: MasterBoardNode;
  picked: boolean;
  cost: ResourceCostSummary;
  position?: { x: number; y: number };
}

/**
 * 일반칸 슈타이너 트리 비교 비용 벡터:
 * [중급 크레파스, 하급 크레파스, 골드, 일반칸 개수, 미색칠 신규칸 개수, -중심교차로 점수]
 */
type SteinerCost = [number, number, number, number, number, number];

const ZERO_COST: SteinerCost = [0, 0, 0, 0, 0, 0];

function compareSteinerCost(a: SteinerCost, b: SteinerCost): number {
  for (let i = 0; i < 6; i++) {
    const diff = a[i]! - b[i]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

function addSteinerCost(a: SteinerCost, b: SteinerCost): SteinerCost {
  return [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
    a[3] + b[3],
    a[4] + b[4],
    a[5] + b[5],
  ];
}

function mergeSteinerCost(a: SteinerCost, b: SteinerCost, common: SteinerCost): SteinerCost {
  return [
    a[0] + b[0] - common[0],
    a[1] + b[1] - common[1],
    a[2] + b[2] - common[2],
    a[3] + b[3] - common[3],
    a[4] + b[4] - common[4],
    a[5] + b[5] - common[5],
  ];
}

/**
 * 주어진 허용 마스크(allowedMask) 안에서 rootIndices로부터 모든 targetIndices가 연결되는지 BFS로 확인한다.
 */
function areTerminalsConnected(
  rootIndices: number[],
  targetIndices: number[],
  allowedMask: Uint8Array,
  adj: number[][]
): boolean {
  if (targetIndices.length === 0) return true;
  if (rootIndices.length === 0) return false;
  const visited = new Uint8Array(allowedMask.length);
  const queue: number[] = [];
  for (const r of rootIndices) {
    if (allowedMask[r] && !visited[r]) {
      visited[r] = 1;
      queue.push(r);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!;
    for (const v of adj[u]!) {
      if (allowedMask[v] && !visited[v]) {
        visited[v] = 1;
        queue.push(v);
      }
    }
  }
  for (const t of targetIndices) {
    if (!visited[t]) return false;
  }
  return true;
}

/**
 * 단일 보드 차수에서 고정 노드(root + 선택된 황크/보크/관문)들을 모두 연결하는
 * 최소 비용 일반칸 집합(Exact Node-Weighted Steiner Tree)을 Dreyfus-Wagner 알고리즘으로 계산한다.
 */
function solveBoardNormalSteiner<T extends SteinerBoardNode>(
  rootEntries: T[],
  fixedEntries: T[],
  requiredKeys: Set<string>,
  optionalNormals: T[],
  selected: Set<string>,
  allBoardEntries: T[],
  normalPriority: readonly ('averageCrayon' | 'basicCrayon' | 'gold')[] = ['averageCrayon', 'basicCrayon', 'gold']
): T[] {
  if (requiredKeys.size === 0) return [];
  const currentSelectedNormals = optionalNormals.filter(e => selected.has(e.key));
  if (rootEntries.length === 0) return currentSelectedNormals;

  // 보드 내 좌표 기반 중심성(인접 특수칸 수 및 격자 차수) 계산용 맵
  const boardCoordMap = new Map<string, T>();
  for (const entry of allBoardEntries) {
    if (entry.position) boardCoordMap.set(`${entry.position.x},${entry.position.y}`, entry);
  }
  const calcCentrality = (entry: T): number => {
    const { x, y } = entry.position!;
    let specialNeighbors = 0;
    let degree = 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      const nb = boardCoordMap.get(`${nx},${ny}`);
      if (!nb) continue;
      degree++;
      if (nb.node.nodeType !== NODE_TYPE.NORMAL) specialNeighbors++;
    }
    return specialNeighbors * 4 + degree;
  };

  // 전체 그래프 노드 구성: [rootEntries + fixedEntries (중복 제거), ...optionalNormals]
  const fixedMap = new Map<string, T>();
  for (const e of rootEntries) fixedMap.set(e.key, e);
  for (const e of fixedEntries) fixedMap.set(e.key, e);
  const uniqueFixed = [...fixedMap.values()];
  const fixedCount = uniqueFixed.length;
  const allNodes: T[] = [...uniqueFixed, ...optionalNormals];
  const totalCount = allNodes.length;

  const rootKeySet = new Set(rootEntries.map(e => e.key));
  const coordToIndex = new Map<string, number>();
  for (let i = 0; i < totalCount; i++) {
    const pos = allNodes[i]!.position!;
    coordToIndex.set(`${allNodes[i]!.boardIndex}:${pos.x},${pos.y}`, i);
  }

  // 격자 인접 리스트 구축 (이전 차수 관문 root와 현재 차수 진입칸 연결 포함)
  const adj: number[][] = Array.from({ length: totalCount }, () => []);
  for (let i = 0; i < totalCount; i++) {
    const a = allNodes[i]!;
    const { x, y } = a.position!;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      for (const bIdx of [a.boardIndex, a.boardIndex - 1, a.boardIndex + 1]) {
        const j = coordToIndex.get(`${bIdx}:${nx},${ny}`);
        if (j === undefined || j <= i) continue;
        const b = allNodes[j]!;
        if (a.boardIndex !== b.boardIndex) {
          const lower = a.boardIndex < b.boardIndex ? a : b;
          if (lower.node.nodeType !== NODE_TYPE.GATE || !rootKeySet.has(lower.key)) continue;
        }
        adj[i]!.push(j);
        adj[j]!.push(i);
      }
    }
  }

  const rootIndices: number[] = [];
  const targetIndices: number[] = [];
  for (let i = 0; i < fixedCount; i++) {
    const key = uniqueFixed[i]!.key;
    if (rootKeySet.has(key)) rootIndices.push(i);
    if (requiredKeys.has(key)) targetIndices.push(i);
  }

  // 고정 노드만으로 이미 모든 필수 터미널이 루트와 연결되어 있다면 일반칸 0개 반환
  const fixedOnlyMask = new Uint8Array(totalCount);
  for (let i = 0; i < fixedCount; i++) fixedOnlyMask[i] = 1;
  if (areTerminalsConnected(rootIndices, targetIndices, fixedOnlyMask, adj)) {
    return [];
  }

  // 고정 노드들의 연결 요소(Connected Component) 수축
  const fixedCompId = new Int32Array(fixedCount).fill(-1);
  let compCount = 0;
  // 0번 컴포넌트: rootIndices와 연결된 모든 고정 노드
  const bfsQueue: number[] = [];
  for (const r of rootIndices) {
    if (fixedCompId[r]! < 0) {
      fixedCompId[r] = 0;
      bfsQueue.push(r);
    }
  }
  for (let head = 0; head < bfsQueue.length; head++) {
    const u = bfsQueue[head]!;
    for (const v of adj[u]!) {
      if (v < fixedCount && fixedCompId[v]! < 0) {
        fixedCompId[v] = 0;
        bfsQueue.push(v);
      }
    }
  }
  compCount = 1;

  // 나머지 고정 노드 연결 요소들 중 requiredKeys를 포함하는 요소를 터미널 컴포넌트 1..k-1로 지정
  const nonTermFixedIndices: number[] = [];
  for (let i = 0; i < fixedCount; i++) {
    if (fixedCompId[i]! >= 0) continue;
    const compNodes: number[] = [i];
    fixedCompId[i] = -2;
    let hasRequired = requiredKeys.has(uniqueFixed[i]!.key);
    for (let head = 0; head < compNodes.length; head++) {
      const u = compNodes[head]!;
      for (const v of adj[u]!) {
        if (v < fixedCount && fixedCompId[v] === -1) {
          fixedCompId[v] = -2;
          compNodes.push(v);
          if (requiredKeys.has(uniqueFixed[v]!.key)) hasRequired = true;
        }
      }
    }
    if (hasRequired) {
      const cid = compCount++;
      for (const u of compNodes) fixedCompId[u] = cid;
    } else {
      for (const u of compNodes) {
        fixedCompId[u] = -3;
        nonTermFixedIndices.push(u);
      }
    }
  }

  const numTerm = compCount - 1;
  if (numTerm <= 0) return [];

  // 수축 그래프 노드 매핑:
  // 0 .. compCount-1: 터미널 컴포넌트 슈퍼노드 (0은 루트)
  // compCount .. V-1: 비터미널 고정 노드 및 optionalNormals
  const oldToContracted = new Int32Array(totalCount).fill(-1);
  for (let i = 0; i < fixedCount; i++) {
    if (fixedCompId[i]! >= 0) oldToContracted[i] = fixedCompId[i]!;
  }
  let cV = compCount;
  const contractedToOld = new Int32Array(totalCount);
  contractedToOld.fill(-1);
  for (const idx of nonTermFixedIndices) {
    oldToContracted[idx] = cV;
    contractedToOld[cV] = idx;
    cV++;
  }
  for (let i = fixedCount; i < totalCount; i++) {
    oldToContracted[i] = cV;
    contractedToOld[cV] = i;
    cV++;
  }

  const cAdjSets = Array.from({ length: cV }, () => new Set<number>());
  for (let u = 0; u < totalCount; u++) {
    const cu = oldToContracted[u]!;
    for (const v of adj[u]!) {
      const cv = oldToContracted[v]!;
      if (cu !== cv) {
        cAdjSets[cu]!.add(cv);
        cAdjSets[cv]!.add(cu);
      }
    }
  }
  const cAdj = cAdjSets.map(s => [...s]);

  const nodeCosts: SteinerCost[] = new Array(cV);
  for (let cv = 0; cv < cV; cv++) {
    const oldIdx = contractedToOld[cv]!;
    if (oldIdx < fixedCount) {
      nodeCosts[cv] = ZERO_COST;
    } else {
      const entry = allNodes[oldIdx]!;
      const k0 = normalPriority[0] ?? 'averageCrayon';
      const k1 = normalPriority[1] ?? 'basicCrayon';
      const k2 = normalPriority[2] ?? 'gold';
      nodeCosts[cv] = [
        entry.cost[k0],
        entry.cost[k1],
        entry.cost[k2],
        1,
        entry.picked ? 0 : 1,
        -calcCentrality(entry),
      ];
    }
  }

  let candidateNormalIndices: number[] | null = null;

  // 터미널 수가 10개 이하이면 Dreyfus-Wagner 알고리즘으로 전역 최적 슈타이너 트리를 정확히 구한다.
  if (numTerm <= 10) {
    const maskCount = 1 << numTerm;
    const dp: Array<Array<SteinerCost | undefined>> = Array.from({ length: maskCount }, () => new Array(cV));
    type ParentInfo =
      | { kind: 'leaf' }
      | { kind: 'split'; leftMask: number; rightMask: number }
      | { kind: 'step'; prevMask: number; prevNode: number };
    const parent: Array<Array<ParentInfo | undefined>> = Array.from({ length: maskCount }, () => new Array(cV));

    for (let t = 1; t < compCount; t++) {
      const bit = 1 << (t - 1);
      dp[bit]![t] = ZERO_COST;
      parent[bit]![t] = { kind: 'leaf' };
    }

    const visited = new Uint8Array(cV);
    for (let mask = 1; mask < maskCount; mask++) {
      const dpMask = dp[mask]!;
      const parentMask = parent[mask]!;

      // 1. Submask 병합 (T자 교차로 분기점 형성)
      if ((mask & (mask - 1)) !== 0) {
        for (let sub = (mask - 1) & mask; sub > (mask ^ sub); sub = (sub - 1) & mask) {
          const other = mask ^ sub;
          const dpSub = dp[sub]!;
          const dpOther = dp[other]!;
          for (let v = 0; v < cV; v++) {
            const a = dpSub[v];
            const b = dpOther[v];
            if (!a || !b) continue;
            const merged = mergeSteinerCost(a, b, nodeCosts[v]!);
            if (!dpMask[v] || compareSteinerCost(merged, dpMask[v]!) < 0) {
              dpMask[v] = merged;
              parentMask[v] = { kind: 'split', leftMask: sub, rightMask: other };
            }
          }
        }
      }

      // 2. 고정 mask에 대한 다익스트라 전파
      visited.fill(0);
      while (true) {
        let bestU = -1;
        let bestCost: SteinerCost | undefined;
        for (let u = 0; u < cV; u++) {
          if (!visited[u] && dpMask[u] && (!bestCost || compareSteinerCost(dpMask[u]!, bestCost) < 0)) {
            bestU = u;
            bestCost = dpMask[u]!;
          }
        }
        if (bestU < 0 || !bestCost) break;
        visited[bestU] = 1;

        for (const w of cAdj[bestU]!) {
          const nextCost = addSteinerCost(bestCost, nodeCosts[w]!);
          if (!dpMask[w] || compareSteinerCost(nextCost, dpMask[w]!) < 0) {
            dpMask[w] = nextCost;
            parentMask[w] = { kind: 'step', prevMask: mask, prevNode: bestU };
          }
          if (w >= 1 && w < compCount) {
            const nextMask = mask | (1 << (w - 1));
            if (nextMask !== mask) {
              const dpNext = dp[nextMask]!;
              if (!dpNext[w] || compareSteinerCost(nextCost, dpNext[w]!) < 0) {
                dpNext[w] = nextCost;
                parent[nextMask]![w] = { kind: 'step', prevMask: mask, prevNode: bestU };
              }
            }
          }
        }
      }
    }

    const fullMask = maskCount - 1;
    if (dp[fullMask]![0]) {
      const chosenOldIndices = new Set<number>();
      const stack: Array<[number, number]> = [[fullMask, 0]];
      const seenStates = new Set<number>();
      while (stack.length > 0) {
        const [m, u] = stack.pop()!;
        const stateKey = m * cV + u;
        if (seenStates.has(stateKey)) continue;
        seenStates.add(stateKey);
        const oldIdx = contractedToOld[u]!;
        if (oldIdx >= fixedCount) chosenOldIndices.add(oldIdx);
        const p = parent[m]![u];
        if (!p || p.kind === 'leaf') continue;
        if (p.kind === 'split') {
          stack.push([p.leftMask, u], [p.rightMask, u]);
        } else {
          stack.push([p.prevMask, p.prevNode]);
        }
      }
      candidateNormalIndices = [...chosenOldIndices];
    }
  }

  // 기본 후보가 없으면 현재 선택된 일반칸에서 시작
  if (!candidateNormalIndices) {
    candidateNormalIndices = [];
    for (let i = fixedCount; i < totalCount; i++) {
      if (selected.has(allNodes[i]!.key)) candidateNormalIndices.push(i);
    }
  }

  // 불필요한 일반칸 가지치기 (비선호 칸부터 제거 가능 여부 확인)
  candidateNormalIndices.sort((a, b) => -compareSteinerCost(nodeCosts[oldToContracted[a]!]!, nodeCosts[oldToContracted[b]!]!));
  const activeMask = new Uint8Array(totalCount);
  for (let i = 0; i < fixedCount; i++) activeMask[i] = 1;
  for (const idx of candidateNormalIndices) activeMask[idx] = 1;

  if (!areTerminalsConnected(rootIndices, targetIndices, activeMask, adj)) {
    return currentSelectedNormals;
  }

  for (const idx of candidateNormalIndices) {
    activeMask[idx] = 0;
    if (!areTerminalsConnected(rootIndices, targetIndices, activeMask, adj)) {
      activeMask[idx] = 1;
    }
  }

  const finalNormals: T[] = [];
  let finalCost: SteinerCost = ZERO_COST;
  for (let i = fixedCount; i < totalCount; i++) {
    if (activeMask[i]) {
      finalNormals.push(allNodes[i]!);
      finalCost = addSteinerCost(finalCost, nodeCosts[oldToContracted[i]!]!);
    }
  }

  // 기존에 선택된 일반칸 집합의 비용과 비교하여 연결성이 유지되고 비용이 개선(또는 동등)될 때만 교체
  const currentMask = new Uint8Array(totalCount);
  for (let i = 0; i < fixedCount; i++) currentMask[i] = 1;
  let currentCost: SteinerCost = ZERO_COST;
  for (let i = fixedCount; i < totalCount; i++) {
    if (selected.has(allNodes[i]!.key)) {
      currentMask[i] = 1;
      currentCost = addSteinerCost(currentCost, nodeCosts[oldToContracted[i]!]!);
    }
  }

  if (areTerminalsConnected(rootIndices, targetIndices, currentMask, adj) &&
      compareSteinerCost(finalCost, currentCost) > 0) {
    return currentSelectedNormals;
  }

  return finalNormals;
}

/**
 * 사도의 전체 보드(1~3차)에 대해 선택된 목표 노드(황크·보크·관문)는 그대로 보존하면서
 * 이를 연결하는 일반칸들을 최소 슈타이너 트리(T자 동선)로 최적화하고 불필요한 우회 일반칸을 제거한다.
 */
export function optimizeApostleNormalTiles<T extends SteinerBoardNode>(
  group: T[],
  reset: boolean,
  selected: Set<string>,
  restoreNormal = false,
  normalPriority: readonly ('averageCrayon' | 'basicCrayon' | 'gold')[] = ['averageCrayon', 'basicCrayon', 'gold']
): boolean {
  if (!group.length) return false;
  let maxBoard = 0;
  for (const entry of group) {
    if (entry.boardIndex > maxBoard) maxBoard = entry.boardIndex;
  }

  let changed = false;
  const needsGateFromBoard = new Set<number>();

  for (let b = maxBoard; b >= 0; b--) {
    const boardEntries = group.filter(
      e => e.boardIndex === b && e.position && e.node.nodeType !== 0 && e.node.nodeType !== NODE_TYPE.PETAL
    );
    if (!boardEntries.length) continue;

    const isOptionalNormal = (entry: T): boolean =>
      entry.node.nodeType === NODE_TYPE.NORMAL && (reset ? !restoreNormal || !entry.picked : !entry.picked);

    const requiredKeys = new Set<string>();
    for (const entry of boardEntries) {
      if (!selected.has(entry.key)) continue;
      if (reset) {
        if (hwang(entry.node) || entry.node.nodeType === NODE_TYPE.BOKR) {
          requiredKeys.add(entry.key);
        } else if (entry.node.nodeType === NODE_TYPE.GATE && (!entry.picked || needsGateFromBoard.has(b))) {
          requiredKeys.add(entry.key);
        } else if (restoreNormal && entry.picked && entry.node.nodeType === NODE_TYPE.NORMAL) {
          requiredKeys.add(entry.key);
        }
      } else {
        if (!entry.picked && entry.node.nodeType !== NODE_TYPE.NORMAL) {
          requiredKeys.add(entry.key);
        } else if (entry.node.nodeType === NODE_TYPE.GATE && needsGateFromBoard.has(b)) {
          requiredKeys.add(entry.key);
        }
      }
    }

    const optionalNormals = boardEntries.filter(isOptionalNormal);
    if (requiredKeys.size === 0) {
      for (const norm of optionalNormals) {
        if (selected.delete(norm.key)) changed = true;
      }
      continue;
    }

    if (b > 0) needsGateFromBoard.add(b - 1);

    const rootEntries =
      b === 0
        ? boardEntries.filter(e => e.node.nodeType === NODE_TYPE.START)
        : group.filter(
            e =>
              e.boardIndex === b - 1 &&
              e.position &&
              e.node.nodeType === NODE_TYPE.GATE &&
              selected.has(e.key)
          );
    if (!rootEntries.length) continue;

    const allFixed = boardEntries.filter(
      e => !isOptionalNormal(e) && (selected.has(e.key) || e.node.nodeType === NODE_TYPE.START)
    );

    // 비초기화(!reset) 사도에서 기존에 칠해진 방어력·치저 황크를 거치지 않고 연결된 경우,
    // 막힌 경로 제외(allowBlocked=false) 조건을 보존하기 위해 해당 방어력·치저 황크는 고정 브리지에서 제외한다.
    let fixedEntries = allFixed;
    if (!reset) {
      const isBlockedPickedHwang = (e: T) =>
        e.picked &&
        !requiredKeys.has(e.key) &&
        hwang(e.node) &&
        (e.node.stats || []).some(s => [92, 93, 99].includes(s.statType));
      if (allFixed.some(isBlockedPickedHwang)) {
        const withoutBlocked = allFixed.filter(e => !isBlockedPickedHwang(e));
        const testNodes = [...rootEntries, ...withoutBlocked, ...optionalNormals.filter(e => selected.has(e.key))];
        const keySet = new Set(testNodes.map(e => e.key));
        const testFixed = withoutBlocked.filter(e => keySet.has(e.key));
        if (testFixed.length === withoutBlocked.length) {
          // 차단 황크 없이도 현재 선택 일반칸들로 필수 터미널이 연결되는지 확인
          const solvedWithoutBlocked = solveBoardNormalSteiner(
            rootEntries,
            withoutBlocked,
            requiredKeys,
            optionalNormals,
            selected,
            boardEntries,
            normalPriority
          );
          const verifySet = new Set([
            ...rootEntries.map(e => e.key),
            ...withoutBlocked.map(e => e.key),
            ...solvedWithoutBlocked.map(e => e.key),
          ]);
          const coordMap = new Map<string, T>();
          for (const e of [...rootEntries, ...withoutBlocked, ...solvedWithoutBlocked]) {
            coordMap.set(`${e.boardIndex}:${e.position!.x},${e.position!.y}`, e);
          }
          const visited = new Set<string>(rootEntries.map(e => e.key));
          const q = [...rootEntries];
          for (let h = 0; h < q.length; h++) {
            const cur = q[h]!;
            const { x, y } = cur.position!;
            for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
              for (const bIdx of [cur.boardIndex, cur.boardIndex + 1]) {
                const nxt = coordMap.get(`${bIdx}:${nx},${ny}`);
                if (nxt && verifySet.has(nxt.key) && !visited.has(nxt.key)) {
                  visited.add(nxt.key);
                  q.push(nxt);
                }
              }
            }
          }
          if ([...requiredKeys].every(k => visited.has(k))) {
            fixedEntries = withoutBlocked;
          }
        }
      }
    }

    const optimalNormals = solveBoardNormalSteiner(
      rootEntries,
      fixedEntries,
      requiredKeys,
      optionalNormals,
      selected,
      boardEntries,
      normalPriority
    );
    const optimalKeySet = new Set(optimalNormals.map(e => e.key));
    for (const norm of optionalNormals) {
      const shouldSelect = optimalKeySet.has(norm.key);
      if (shouldSelect && !selected.has(norm.key)) {
        selected.add(norm.key);
        changed = true;
      } else if (!shouldSelect && selected.has(norm.key)) {
        selected.delete(norm.key);
        changed = true;
      }
    }
  }

  return changed;
}

/**
 * 최적화된 selected 집합으로부터 1차 시작점부터 끊김 없이 이어지는 실제 인게임 색칠 순서를 재구성한다.
 * 기존 단계별 목표 선택 순서(rawOrder)를 최대한 보존하며, 확장 황크 직전에 선행 꽃잎을 배치한다.
 */
export function buildOptimalPaintOrder<T extends SteinerBoardNode>(
  group: T[],
  selected: Set<string>,
  initial: Set<string>,
  rawOrder: T[]
): T[] {
  const neededKeys = new Set<string>();
  for (const entry of group) {
    if (selected.has(entry.key) && !initial.has(entry.key)) {
      neededKeys.add(entry.key);
    }
  }
  if (neededKeys.size === 0) return [];

  // 꽃잎 매핑 구축 (확장 황크 -> 연결된 꽃잎)
  const linkedPetals = new Map<string, T>();
  for (const entry of group) {
    if (entry.node.nodeType !== NODE_TYPE.HWANG_EXT) continue;
    const board = group.filter(item => item.boardIndex === entry.boardIndex);
    const petal = findLinkedPetalNode(board.map(item => item.node), entry.node);
    const linked = petal ? board.find(item => item.node === petal) : undefined;
    if (linked) linkedPetals.set(entry.key, linked);
  }

  // 격자 인접 그래프 구축 (selected에 포함된 그리드 노드만 대상)
  const gridSelected = group.filter(
    e => selected.has(e.key) && e.position && e.node.nodeType !== 0 && e.node.nodeType !== NODE_TYPE.PETAL
  );
  const byCoord = new Map<string, T>();
  for (const e of gridSelected) {
    byCoord.set(`${e.boardIndex}:${e.position!.x},${e.position!.y}`, e);
  }
  const neighborsOf = (entry: T): T[] => {
    const res: T[] = [];
    const { x, y } = entry.position!;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      const same = byCoord.get(`${entry.boardIndex}:${nx},${ny}`);
      if (same) res.push(same);
      if (entry.node.nodeType === NODE_TYPE.GATE) {
        const nextBoard = byCoord.get(`${entry.boardIndex + 1}:${nx},${ny}`);
        if (nextBoard) res.push(nextBoard);
      }
      const prevGate = byCoord.get(`${entry.boardIndex - 1}:${nx},${ny}`);
      if (prevGate && prevGate.node.nodeType === NODE_TYPE.GATE) res.push(prevGate);
    }
    return res;
  };

  // 1차 시작점에서부터 현재 활성화된(initial 또는 이미 paint에 추가된) 연결 영역 추적
  const activeKeys = new Set<string>();
  for (const e of group) {
    if (initial.has(e.key) && selected.has(e.key)) activeKeys.add(e.key);
  }
  const connected = new Set<string>();
  const expandQueue: T[] = [];
  for (const e of gridSelected) {
    if (e.boardIndex === 0 && e.node.nodeType === NODE_TYPE.START) {
      connected.add(e.key);
      expandQueue.push(e);
    }
  }
  const expandConnected = () => {
    while (expandQueue.length > 0) {
      const cur = expandQueue.shift()!;
      for (const nb of neighborsOf(cur)) {
        if (activeKeys.has(nb.key) && !connected.has(nb.key)) {
          connected.add(nb.key);
          expandQueue.push(nb);
        }
      }
    }
  };
  expandConnected();

  // 기존 rawOrder가 이미 neededKeys와 정확히 일치하고 매 단계가 연결되어 있는지 빠르게 검증
  let rawIsValid = rawOrder.length === neededKeys.size && rawOrder.every(e => neededKeys.has(e.key));
  if (rawIsValid) {
    const testActive = new Set(activeKeys);
    const testConn = new Set(connected);
    const testQ: T[] = [];
    const advanceTest = () => {
      while (testQ.length > 0) {
        const cur = testQ.shift()!;
        for (const nb of neighborsOf(cur)) {
          if (testActive.has(nb.key) && !testConn.has(nb.key)) {
            testConn.add(nb.key);
            testQ.push(nb);
          }
        }
      }
    };
    for (const step of rawOrder) {
      if (step.node.nodeType === NODE_TYPE.PETAL) {
        testActive.add(step.key);
        continue;
      }
      const petal = linkedPetals.get(step.key);
      if (petal && neededKeys.has(petal.key) && !testActive.has(petal.key)) {
        rawIsValid = false;
        break;
      }
      const isAdj = neighborsOf(step).some(nb => testConn.has(nb.key));
      if (!isAdj && !testConn.has(step.key)) {
        rawIsValid = false;
        break;
      }
      testActive.add(step.key);
      testConn.add(step.key);
      testQ.push(step);
      advanceTest();
    }
    if (rawIsValid) return rawOrder;
  }

  // 목표 순서 추출: rawOrder의 비일반칸(또는 강제 복구 일반칸) 순서를 우선하고 남은 필요한 칸들을 뒤에 배치
  const orderedTargets: T[] = [];
  const seenTargets = new Set<string>();
  for (const e of rawOrder) {
    if (selected.has(e.key) && e.node.nodeType !== NODE_TYPE.PETAL && e.node.nodeType !== NODE_TYPE.NORMAL && !seenTargets.has(e.key)) {
      seenTargets.add(e.key);
      orderedTargets.push(e);
    }
  }
  for (const e of rawOrder) {
    if (selected.has(e.key) && e.node.nodeType !== NODE_TYPE.PETAL && !seenTargets.has(e.key)) {
      seenTargets.add(e.key);
      orderedTargets.push(e);
    }
  }
  for (const e of gridSelected) {
    if (neededKeys.has(e.key) && !seenTargets.has(e.key)) {
      seenTargets.add(e.key);
      orderedTargets.push(e);
    }
  }

  const paint: T[] = [];
  const paintedSet = new Set<string>();

  const markPainted = (entry: T) => {
    if (entry.node.nodeType === NODE_TYPE.HWANG_EXT) {
      const petal = linkedPetals.get(entry.key);
      if (petal && neededKeys.has(petal.key) && !paintedSet.has(petal.key)) {
        paintedSet.add(petal.key);
        activeKeys.add(petal.key);
        paint.push(petal);
      }
    }
    if (neededKeys.has(entry.key) && !paintedSet.has(entry.key)) {
      paintedSet.add(entry.key);
      paint.push(entry);
    }
    activeKeys.add(entry.key);
    if (!connected.has(entry.key)) {
      connected.add(entry.key);
      expandQueue.push(entry);
      expandConnected();
    }
  };

  for (const target of orderedTargets) {
    if (connected.has(target.key)) {
      markPainted(target);
      continue;
    }
    // connected 집합에서 target까지 selected 내부 최단 경로 탐색
    // (다른 미도달 특수 타겟을 불필요하게 먼저 밟지 않도록 일반칸 가중치 1, 미도달 특수칸 가중치 50 부여)
    const dist = new Map<string, number>();
    const prev = new Map<string, T>();
    const visited = new Set<string>();
    const pq: Array<{ node: T; d: number }> = [];
    for (const e of gridSelected) {
      if (connected.has(e.key)) {
        dist.set(e.key, 0);
        pq.push({ node: e, d: 0 });
      }
    }
    while (pq.length > 0) {
      let bestIdx = 0;
      for (let i = 1; i < pq.length; i++) {
        if (pq[i]!.d < pq[bestIdx]!.d) bestIdx = i;
      }
      const { node: u, d } = pq.splice(bestIdx, 1)[0]!;
      if (visited.has(u.key)) continue;
      visited.add(u.key);
      if (u.key === target.key) break;
      for (const nb of neighborsOf(u)) {
        if (visited.has(nb.key)) continue;
        const stepCost =
          activeKeys.has(nb.key)
            ? 0
            : nb.key === target.key || nb.node.nodeType === NODE_TYPE.NORMAL
              ? 1
              : 50;
        const nd = d + stepCost;
        if (nd < (dist.get(nb.key) ?? Infinity)) {
          dist.set(nb.key, nd);
          prev.set(nb.key, u);
          pq.push({ node: nb, d: nd });
        }
      }
    }

    const path: T[] = [];
    let cur: T | undefined = target;
    while (cur && !connected.has(cur.key)) {
      path.push(cur);
      cur = prev.get(cur.key);
    }
    path.reverse();
    for (const step of path) {
      markPainted(step);
    }
  }

  return paint;
}
