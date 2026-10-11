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
const stats = (): HwangStats => Object.fromEntries(STAT_CATEGORIES.map(key => [key, 0])) as HwangStats;
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
function weight(cost: ResourceCostSummary, priority: RecoveryResource): number[] {
  return [priority === 'hwang' ? cost.ultraCrayon : cost.epicCrayon,
    priority === 'hwang' ? cost.epicCrayon : cost.ultraCrayon,
    cost.wateringCan || 0, cost.gold, cost.averageCrayon, cost.basicCrayon];
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
  return new Set(nodes.filter(entry => entry.picked && !entry.retained && selections.some(selection =>
    entry.boardIndex === selection.boardIndex && (selection.resource === 'hwang' ? yellow(entry) : entry.node.nodeType === NODE_TYPE.BOKR) &&
    getNodeStatCategories(entry.node).includes(selection.stat))).map(entry => entry.key));
}

/** 기존 유지 칸도 독립 출발점으로 삼지 않고 1차 시작점에서 연결한다. */
function solve(nodes: RecoveryNode[], targets: Set<string>, forbiddenNewHwang: Set<string>, flowering: boolean, priority: RecoveryResource, allowNewBokr: boolean): RecoveryAlternative | null {
  const byKey = new Map(nodes.map(entry => [entry.key, entry]));
  const petals = new Map<string, RecoveryNode>();
  for (const entry of nodes.filter(item => item.node.nodeType === NODE_TYPE.HWANG_EXT)) {
    const board = nodes.filter(item => item.boardIndex === entry.boardIndex);
    const petal = findLinkedPetalNode(board.map(item => item.node), entry.node);
    const linked = board.find(item => item.node === petal);
    if (linked) petals.set(entry.key, linked);
  }
  const valid = nodes.filter(entry => entry.position && entry.node.nodeType !== 0 &&
    !forbiddenNewHwang.has(entry.key) &&
    !(entry.node.nodeType === NODE_TYPE.GATE && !entry.picked) &&
    !(entry.node.nodeType === NODE_TYPE.BOKR && !entry.picked && !allowNewBokr) &&
    (entry.node.nodeType !== NODE_TYPE.HWANG_EXT || (petals.has(entry.key) && (flowering || petals.get(entry.key)!.picked))));
  const coords = new Map(valid.map(entry => [`${entry.position!.x},${entry.position!.y}`, entry]));
  const adjacent = new Map(valid.map(entry => {
    const { x, y } = entry.position!;
    return [entry.key, [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].flatMap(([nx, ny]) => {
      const next = coords.get(`${nx},${ny}`);
      if (!next) return [];
      if (next.boardIndex !== entry.boardIndex && (Math.abs(next.boardIndex - entry.boardIndex) !== 1 ||
        (next.boardIndex > entry.boardIndex ? entry : next).node.nodeType !== NODE_TYPE.GATE)) return [];
      return [next];
    })];
  }));
  const roots = valid.filter(entry => entry.boardIndex === 0 && entry.node.nodeType === NODE_TYPE.START);
  const selected = new Set(nodes.filter(entry => entry.picked && entry.retained).map(entry => entry.key));
  const mandatory = new Set(nodes.filter(entry => entry.picked && !entry.retained && !targets.has(entry.key) &&
    (yellow(entry) || entry.node.nodeType === NODE_TYPE.BOKR)).map(entry => entry.key));
  const paint: RecoveryNode[] = [];
  while ([...mandatory].some(key => !selected.has(key))) {
    type Label = { key: string; cost: ResourceCostSummary; path: string[]; score: number[] };
    const labels = new Map<string, Label>();
    const pending: Label[] = [];
    for (const root of roots) {
      const label = { key: root.key, cost: createEmptyCostSummary(), path: [root.key], score: Array(7).fill(0) as number[] };
      labels.set(root.key, label); pending.push(label);
    }
    let chosen: Label | undefined;
    while (pending.length) {
      pending.sort((a, b) => compare(b.score, a.score));
      const current = pending.pop()!;
      if (labels.get(current.key) !== current) continue;
      if (mandatory.has(current.key) && !selected.has(current.key)) { chosen = current; break; }
      for (const next of adjacent.get(current.key) || []) {
        if (current.path.includes(next.key)) continue;
        const petal = petals.get(next.key);
        const additions = [...(petal && !selected.has(petal.key) && !current.path.includes(petal.key) ? [petal] : []), next]
          .filter(entry => !selected.has(entry.key));
        const cost = additions.reduce((total, entry) => sumCosts(total, entry.cost), current.cost);
        const path = [...current.path, ...additions.filter(entry => entry !== next).map(entry => entry.key), next.key];
        // 새 보크는 제한 없는 대안에서도 필요한 최소 개수를 먼저 비교한다.
        const newBokr = path.filter(key => { const n = byKey.get(key)!; return n.node.nodeType === NODE_TYPE.BOKR && !n.picked && !selected.has(key); }).length;
        const score = [newBokr, ...weight(cost, priority)];
        const old = labels.get(next.key);
        if (old && compare(old.score, score) <= 0) continue;
        const label = { key: next.key, cost, path, score };
        labels.set(next.key, label); pending.push(label);
      }
    }
    if (!chosen) return null;
    for (const key of chosen.path) if (!selected.has(key)) { selected.add(key); paint.push(byKey.get(key)!); }
  }
  const refund = nodes.filter(entry => entry.picked && !entry.retained).reduce((total, entry) => sumCosts(total, { ...entry.cost, wateringCan: 0 }), createEmptyCostSummary());
  const spend = paint.reduce((total, entry) => sumCosts(total, entry.cost), createEmptyCostSummary());
  const hwangDelta = stats(), bokrDelta = stats();
  for (const entry of nodes) {
    const delta = Number(selected.has(entry.key)) - Number(entry.picked);
    if (!delta) continue;
    const h = readHwangStats(entry.node), b = readBokrValues(entry.node);
    for (const stat of STAT_CATEGORIES) { hwangDelta[stat] += delta * h[stat]; bokrDelta[stat] += delta * b[stat]; }
  }
  return { flowering, priority, selected, paint, refund, spend, net: subtractRecoveryCost(refund, spend), hwangDelta, bokrDelta,
    repaintedTargets: [...targets].filter(key => selected.has(key)), usedNewBokr: paint.some(entry => !entry.picked && entry.node.nodeType === NODE_TYPE.BOKR) };
}

export function calculateApostleRecovery(apostle: ApostleProgress, selections: RecoverySelection[], compareFlowering = true): RecoveryResult {
  const nodes = getRecoveryNodes(apostle);
  const targets = getRecoveryTargets(nodes, selections);
  // 회수하려는 황크 스탯을 새 만개칸으로 다시 늘리지 않는다.
  // 새 일반 황크를 찍어서 보크만 아끼는 우회도 회수 계획에서는 제외한다.
  const forbiddenNewHwang = new Set(nodes.filter(entry => !entry.picked && yellow(entry) &&
    (entry.node.nodeType !== NODE_TYPE.HWANG_EXT || selections.some(selection => selection.resource === 'hwang' &&
      selection.boardIndex === entry.boardIndex && getNodeStatCategories(entry.node).includes(selection.stat))))
    .map(entry => entry.key));
  const result: RecoveryResult = { apostle, nodes, targets, alternatives: [] };
  if (!targets.size) return result;
  for (const flowering of compareFlowering ? [false, true] : [false]) for (const priority of ['hwang', 'bokr'] as const) {
    const plan = solve(nodes, targets, forbiddenNewHwang, flowering, priority, false) || solve(nodes, targets, forbiddenNewHwang, flowering, priority, true);
    if (plan) result.alternatives.push(plan);
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
