/** 기존 황크·보크를 보존하면서 선택한 칸의 회수 및 만개 우회를 비교한다. */
import { createEmptyCostSummary, getNodeStatCategories, isHwangNode, NODE_TYPE, STAT_CATEGORIES } from './boardProgress.ts';
import { extractNodeCost, findLinkedPetalNode, getApostleBoardLayout, sumCosts } from './boardPathfinder.ts';
import { readBokrValues, readHwangStats, type HwangStats } from './hwangRedistribution.ts';
import type { ApostleProgress, ResourceCostSummary, StatCategory } from './types.ts';

export type RecoveryResource = 'hwang' | 'bokr';
export interface RecoverySelection { resource: RecoveryResource; boardIndex: number; stat: StatCategory }
export interface RecoveryNode {
  key: string; boardIndex: number; nodeIndex: number;
  node: NonNullable<ApostleProgress['boards'][number]['masterNodes']>[number];
  picked: boolean; retained: boolean; cost: ResourceCostSummary;
  position?: { x: number; y: number };
}
export interface RecoveryAlternative {
  flowering: boolean; priority: RecoveryResource; selected: Set<string>; paint: RecoveryNode[];
  refund: ResourceCostSummary; spend: ResourceCostSummary; net: ResourceCostSummary;
  hwangDelta: HwangStats; bokrDelta: HwangStats; repaintedTargets: string[];
  usedNewBokr: boolean;
}
export interface RecoveryResult {
  apostle: ApostleProgress; nodes: RecoveryNode[]; targets: Set<string>;
  alternatives: RecoveryAlternative[]; error?: string;
}
const yellow = (entry: RecoveryNode) => isHwangNode(entry.node) || entry.node.nodeType === NODE_TYPE.HWANG_EXT;
const stats = (): HwangStats => ({
  hp: 0, atk_phys: 0, atk_mag: 0, def_phys: 0, def_mag: 0,
  crit: 0, crit_dmg: 0, crit_res: 0, crit_dmg_res: 0,
});
const costKeys = ['ultraCrayon', 'epicCrayon', 'averageCrayon', 'basicCrayon', 'wateringCan', 'gold'] as const;
export function subtractRecoveryCost(a: ResourceCostSummary, b: ResourceCostSummary): ResourceCostSummary {
  const result = createEmptyCostSummary();
  for (const key of costKeys) result[key] = (a[key] || 0) - (b[key] || 0);
  return result;
}
function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}
export function getRecoveryNodes(apostle: ApostleProgress): RecoveryNode[] {
  const layout = new Map(getApostleBoardLayout(apostle).map(entry => [`${entry.boardIndex}:${entry.nodeIndex}`, { x: entry.x, y: entry.y }]));
  return apostle.boards.flatMap((board, boardIndex) => !board.unlocked ? [] : (board.masterNodes || []).map((node, nodeIndex) => {
    const retained = [NODE_TYPE.START, NODE_TYPE.GATE, NODE_TYPE.PETAL].some(type => type === node.nodeType);
    const picked = (boardIndex === 0 && node.nodeType === NODE_TYPE.START) || board.stepStr?.[nodeIndex] === '1';
    const cost = node.nodeType === NODE_TYPE.START ? createEmptyCostSummary() : extractNodeCost(node);
    if (costKeys.some(key => !Number.isSafeInteger(cost[key] ?? 0) || (cost[key] ?? 0) < 0)) throw new Error('재화 비용이 올바르지 않습니다.');
    if ((isHwangNode(node) || node.nodeType === NODE_TYPE.HWANG_EXT) && cost.ultraCrayon <= 0) throw new Error('황크 비용이 누락되었습니다.');
    return { key: `${boardIndex}:${nodeIndex}`, boardIndex, nodeIndex, node, retained, picked, cost, position: layout.get(`${boardIndex}:${nodeIndex}`) };
  }));
}
export function getRecoveryTargets(nodes: RecoveryNode[], selections: RecoverySelection[]): Set<string> {
  if (!selections.length) return new Set();
  const result = new Set<string>();
  for (const entry of nodes) {
    if (!entry.picked || entry.retained) continue;
    const isYellow = yellow(entry);
    const isBokr = entry.node.nodeType === NODE_TYPE.BOKR;
    if (!isYellow && !isBokr) continue;
    const categories = getNodeStatCategories(entry.node);
    if (selections.some(selection => entry.boardIndex === selection.boardIndex &&
      (selection.resource === 'hwang' ? isYellow : isBokr) && categories.includes(selection.stat))) {
      result.add(entry.key);
    }
  }
  return result;
}

interface RecoveryGraph {
  adjacent: Array<number[] | undefined>;
  roots: number[];
}

interface RecoverySharedContext {
  petalsByIdx: Int32Array;
  retainedIndices: number[];
  mandatoryMask: Uint8Array;
  mandatoryCount: number;
  refund: ResourceCostSummary;
  nodeHwang: Array<HwangStats | undefined>;
  nodeBokr: Array<HwangStats | undefined>;
}

type PathLabel = { idx: number; petalIdx: number; prev: PathLabel | undefined; score: number[] };

function hasInPath(label: PathLabel | undefined, targetIdx: number): boolean {
  for (let cur = label; cur; cur = cur.prev) {
    if (cur.idx === targetIdx || cur.petalIdx === targetIdx) return true;
  }
  return false;
}

function buildRecoveryGraph(
  nodes: RecoveryNode[],
  forbiddenNewHwang: Set<string>,
  petalsByIdx: Int32Array,
  flowering: boolean,
  allowNewBokr: boolean
): RecoveryGraph {
  const validIndices: number[] = [];
  const coords = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    const entry = nodes[i]!;
    if (!entry.position || entry.node.nodeType === 0 || forbiddenNewHwang.has(entry.key)) continue;
    if (entry.node.nodeType === NODE_TYPE.GATE && !entry.picked) continue;
    if (entry.node.nodeType === NODE_TYPE.BOKR && !entry.picked && !allowNewBokr) continue;
    if (entry.node.nodeType === NODE_TYPE.HWANG_EXT) {
      const petalIdx = petalsByIdx[i]!;
      if (petalIdx < 0 || (!flowering && !nodes[petalIdx]!.picked)) continue;
    }
    validIndices.push(i);
    coords.set(`${entry.position.x},${entry.position.y}`, i);
  }
  const adjacent = new Array<number[] | undefined>(nodes.length);
  const roots: number[] = [];
  for (const i of validIndices) {
    const entry = nodes[i]!;
    if (entry.boardIndex === 0 && entry.node.nodeType === NODE_TYPE.START) roots.push(i);
    const { x, y } = entry.position!;
    const neighbors: number[] = [];
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      const nextIdx = coords.get(`${nx},${ny}`);
      if (nextIdx === undefined) continue;
      const next = nodes[nextIdx]!;
      if (next.boardIndex !== entry.boardIndex && (Math.abs(next.boardIndex - entry.boardIndex) !== 1 ||
        (next.boardIndex > entry.boardIndex ? entry : next).node.nodeType !== NODE_TYPE.GATE)) continue;
      neighbors.push(nextIdx);
    }
    adjacent[i] = neighbors;
  }
  return { adjacent, roots };
}

/** 기존 유지 칸도 독립 출발점으로 삼지 않고 1차 시작점에서 연결한다. */
function solve(
  nodes: RecoveryNode[],
  targets: Set<string>,
  graph: RecoveryGraph,
  flowering: boolean,
  priority: RecoveryResource,
  shared: RecoverySharedContext
): RecoveryAlternative | null {
  const { petalsByIdx, retainedIndices, mandatoryMask, mandatoryCount, refund, nodeHwang, nodeBokr } = shared;
  const { adjacent, roots } = graph;
  const nLen = nodes.length;
  const selectedMask = new Uint8Array(nLen);
  for (const idx of retainedIndices) selectedMask[idx] = 1;
  let remainingMandatory = mandatoryCount;
  const paint: RecoveryNode[] = [];
  const hwangFirst = priority === 'hwang';
  const zeroScore = [0, 0, 0, 0, 0, 0, 0];
  const labels = new Array<PathLabel | undefined>(nLen);

  while (remainingMandatory > 0) {
    labels.fill(undefined);
    const pending: PathLabel[] = [];
    for (const rootIdx of roots) {
      const label: PathLabel = { idx: rootIdx, petalIdx: -1, prev: undefined, score: zeroScore };
      labels[rootIdx] = label;
      pending.push(label);
    }
    let chosen: PathLabel | undefined;
    while (pending.length) {
      let bestIdx = 0;
      for (let i = 1; i < pending.length; i++) {
        if (compare(pending[i]!.score, pending[bestIdx]!.score) <= 0) bestIdx = i;
      }
      const current = bestIdx === pending.length - 1 ? pending.pop()! : pending.splice(bestIdx, 1)[0]!;
      if (mandatoryMask[current.idx] && !selectedMask[current.idx]) { chosen = current; break; }
      const cs = current.score;
      const neighbors = adjacent[current.idx];
      if (!neighbors) continue;
      for (let k = 0; k < neighbors.length; k++) {
        const nextIdx = neighbors[k]!;
        const next = nodes[nextIdx]!;
        const petalIdx = petalsByIdx[nextIdx]!;
        const addPetal = petalIdx >= 0 && !selectedMask[petalIdx] && !hasInPath(current, petalIdx);
        const addNext = !selectedMask[nextIdx];
        let score = cs;
        if (addPetal || addNext) {
          const pCost = addPetal ? nodes[petalIdx]!.cost : undefined;
          const nCost = addNext ? next.cost : undefined;
          const ultra = (hwangFirst ? cs[1]! : cs[2]!) + (pCost ? pCost.ultraCrayon : 0) + (nCost ? nCost.ultraCrayon : 0);
          const epic = (hwangFirst ? cs[2]! : cs[1]!) + (pCost ? pCost.epicCrayon : 0) + (nCost ? nCost.epicCrayon : 0);
          const water = cs[3]! + (pCost ? pCost.wateringCan || 0 : 0) + (nCost ? nCost.wateringCan || 0 : 0);
          const gold = cs[4]! + (pCost ? pCost.gold : 0) + (nCost ? nCost.gold : 0);
          const avg = cs[5]! + (pCost ? pCost.averageCrayon : 0) + (nCost ? nCost.averageCrayon : 0);
          const basic = cs[6]! + (pCost ? pCost.basicCrayon : 0) + (nCost ? nCost.basicCrayon : 0);
          // 새 보크는 제한 없는 대안에서도 필요한 최소 개수를 먼저 비교한다.
          const newBokr = cs[0]! + (addNext && !next.picked && next.node.nodeType === NODE_TYPE.BOKR ? 1 : 0);
          score = hwangFirst
            ? [newBokr, ultra, epic, water, gold, avg, basic]
            : [newBokr, epic, ultra, water, gold, avg, basic];
        }
        const old = labels[nextIdx];
        if (old) {
          if (compare(old.score, score) <= 0) continue;
          const oldPos = pending.indexOf(old);
          if (oldPos >= 0) pending.splice(oldPos, 1);
        }
        const label: PathLabel = { idx: nextIdx, petalIdx: addPetal ? petalIdx : -1, prev: current, score };
        labels[nextIdx] = label;
        pending.push(label);
      }
    }
    if (!chosen) return null;
    const pathIndices: number[] = [];
    for (let cur: PathLabel | undefined = chosen; cur; cur = cur.prev) {
      pathIndices.push(cur.idx);
      if (cur.petalIdx >= 0) pathIndices.push(cur.petalIdx);
    }
    for (let i = pathIndices.length - 1; i >= 0; i--) {
      const idx = pathIndices[i]!;
      if (!selectedMask[idx]) {
        selectedMask[idx] = 1;
        paint.push(nodes[idx]!);
        if (mandatoryMask[idx]) remainingMandatory--;
      }
    }
  }
  const selected = new Set<string>();
  const spend = paint.reduce((total, entry) => sumCosts(total, entry.cost), createEmptyCostSummary());
  const hwangDelta = stats(), bokrDelta = stats();
  for (let i = 0; i < nLen; i++) {
    const entry = nodes[i]!;
    if (selectedMask[i]) selected.add(entry.key);
    const delta = selectedMask[i]! - Number(entry.picked);
    if (!delta) continue;
    const h = (nodeHwang[i] ??= readHwangStats(entry.node));
    const b = (nodeBokr[i] ??= readBokrValues(entry.node));
    for (const stat of STAT_CATEGORIES) { hwangDelta[stat] += delta * h[stat]; bokrDelta[stat] += delta * b[stat]; }
  }
  return { flowering, priority, selected, paint, refund: { ...refund }, spend, net: subtractRecoveryCost(refund, spend), hwangDelta, bokrDelta,
    repaintedTargets: [...targets].filter(key => selected.has(key)), usedNewBokr: paint.some(entry => !entry.picked && entry.node.nodeType === NODE_TYPE.BOKR) };
}

export function calculateApostleRecovery(
  apostle: ApostleProgress,
  selections: RecoverySelection[],
  compareFlowering = true,
  precomputedNodes?: RecoveryNode[]
): RecoveryResult {
  const nodes = precomputedNodes ?? getRecoveryNodes(apostle);
  const targets = getRecoveryTargets(nodes, selections);
  // 회수하려는 황크 스탯을 새 만개칸으로 다시 늘리지 않는다.
  // 새 일반 황크를 찍어서 보크만 아끼는 우회도 회수 계획에서는 제외한다.
  const forbiddenNewHwang = new Set(nodes.filter(entry => !entry.picked && yellow(entry) &&
    (entry.node.nodeType !== NODE_TYPE.HWANG_EXT || selections.some(selection => selection.resource === 'hwang' &&
      selection.boardIndex === entry.boardIndex && getNodeStatCategories(entry.node).includes(selection.stat))))
    .map(entry => entry.key));
  const result: RecoveryResult = { apostle, nodes, targets, alternatives: [] };
  if (!targets.size) return result;

  const nLen = nodes.length;
  const petalsByIdx = new Int32Array(nLen).fill(-1);
  for (let i = 0; i < nLen; i++) {
    const entry = nodes[i]!;
    if (entry.node.nodeType !== NODE_TYPE.HWANG_EXT) continue;
    const board = nodes.filter(item => item.boardIndex === entry.boardIndex);
    const petal = findLinkedPetalNode(board.map(item => item.node), entry.node);
    if (petal) petalsByIdx[i] = nodes.findIndex(item => item.boardIndex === entry.boardIndex && item.node === petal);
  }
  const retainedIndices: number[] = [];
  const mandatoryMask = new Uint8Array(nLen);
  let mandatoryCount = 0;
  let refund = createEmptyCostSummary();
  for (let i = 0; i < nLen; i++) {
    const entry = nodes[i]!;
    if (!entry.picked) continue;
    if (entry.retained) retainedIndices.push(i);
    else {
      refund = sumCosts(refund, { ...entry.cost, wateringCan: 0 });
      if (!targets.has(entry.key) && (yellow(entry) || entry.node.nodeType === NODE_TYPE.BOKR)) {
        mandatoryMask[i] = 1;
        mandatoryCount++;
      }
    }
  }
  const shared: RecoverySharedContext = {
    petalsByIdx, retainedIndices, mandatoryMask, mandatoryCount, refund,
    nodeHwang: new Array<HwangStats | undefined>(nLen),
    nodeBokr: new Array<HwangStats | undefined>(nLen),
  };
  const hasClosedFloweringCandidate = nodes.some((entry, i) =>
    entry.position && entry.node.nodeType === NODE_TYPE.HWANG_EXT && !forbiddenNewHwang.has(entry.key) &&
    petalsByIdx[i]! >= 0 && !nodes[petalsByIdx[i]!]!.picked
  );

  for (const flowering of compareFlowering ? [false, true] : [false]) {
    if (flowering && !hasClosedFloweringCandidate) {
      for (const priority of ['hwang', 'bokr'] as const) {
        const basePlan = result.alternatives.find(p => !p.flowering && p.priority === priority);
        if (basePlan) {
          result.alternatives.push({
            ...basePlan,
            flowering: true,
            selected: new Set(basePlan.selected),
            paint: [...basePlan.paint],
            refund: { ...basePlan.refund },
            spend: { ...basePlan.spend },
            net: { ...basePlan.net },
            hwangDelta: { ...basePlan.hwangDelta },
            bokrDelta: { ...basePlan.bokrDelta },
            repaintedTargets: [...basePlan.repaintedTargets],
          });
        }
      }
      continue;
    }
    const graphStrict = buildRecoveryGraph(nodes, forbiddenNewHwang, petalsByIdx, flowering, false);
    let graphRelaxed: RecoveryGraph | undefined;
    for (const priority of ['hwang', 'bokr'] as const) {
      const plan = solve(nodes, targets, graphStrict, flowering, priority, shared)
        || solve(nodes, targets, (graphRelaxed ??= buildRecoveryGraph(nodes, forbiddenNewHwang, petalsByIdx, flowering, true)), flowering, priority, shared);
      if (plan) result.alternatives.push(plan);
    }
  }
  if (!result.alternatives.length) result.error = '보존 대상을 연결할 계획을 찾지 못했습니다. 원본 연결·좌표·선행 꽃잎 데이터를 확인하세요.';
  return result;
}

export function getBestRecoveryAlternative(result: RecoveryResult, priority: RecoveryResource, flowering: boolean): RecoveryAlternative | undefined {
  const main = priority === 'hwang' ? 'ultraCrayon' : 'epicCrayon';
  const other = priority === 'hwang' ? 'epicCrayon' : 'ultraCrayon';
  return result.alternatives.filter(plan => plan.flowering === flowering).sort((a, b) =>
    b.net[main] - a.net[main] || b.net[other] - a.net[other] || (a.spend.wateringCan || 0) - (b.spend.wateringCan || 0) || a.spend.gold - b.spend.gold)[0];
}
