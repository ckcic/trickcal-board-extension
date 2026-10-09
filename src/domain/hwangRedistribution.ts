/** 황크 재분배 베타: 관문·꽃잎을 유지하고 일반칸·보크 복구를 포함하는 탐욕적 추천 계산. */
import { getStatCategoryFromStatType, isHwangNode, NODE_TYPE, STAT_CATEGORIES, createEmptyCostSummary } from './boardProgress.ts';
import { extractNodeCost, findLinkedPetalNode, getApostleBoardLayout, sumCosts } from './boardPathfinder.ts';
import type { ApostleProgress, MasterBoardNode, ResourceCostSummary, StatCategory } from './types.ts';

export type HwangStats = Record<StatCategory, number>;
export interface RedistributionOptions {
  /** 이미 칠한 칸과 별개로, 아직 사용하지 않고 보유한 황크 수. */
  ownedCrayons: number;
  maxReset: number;
  priorities: Array<{ stat: StatCategory; target: number }>;
}
export interface RedistributionNode {
  key: string;
  apostleId: number;
  boardIndex: number;
  nodeIndex: number;
  node: MasterBoardNode;
  picked: boolean;
  cost: ResourceCostSummary;
  stats: HwangStats;
  position?: { x: number; y: number };
}
export interface RedistributionAction {
  apostle: ApostleProgress;
  reset: boolean;
  refund: ResourceCostSummary;
  spend: ResourceCostSummary;
  paint: RedistributionNode[];
  balance: number;
}
export interface RedistributionPlan {
  before: HwangStats;
  after: HwangStats;
  remaining: number;
  refund: ResourceCostSummary;
  spend: ResourceCostSummary;
  resetCount: number;
  actions: RedistributionAction[];
  nodes: RedistributionNode[];
  selected: Set<string>;
  notes: string[];
}

const emptyStats = (): HwangStats => Object.fromEntries(STAT_CATEGORIES.map(key => [key, 0])) as HwangStats;
const retained = (node: MasterBoardNode) => node.nodeType === NODE_TYPE.GATE || node.nodeType === NODE_TYPE.PETAL || node.nodeType === NODE_TYPE.START;
const hwang = (node: MasterBoardNode) => isHwangNode(node) || node.nodeType === NODE_TYPE.HWANG_EXT;

/** 이름·ID 별칭과 미보유·미해금 보드를 제외하고 실제로 칠한 황크 비용을 합산한다. */
export function getSpentHwangCrayons(progressMap: Map<string, ApostleProgress>): number {
  const apostles = new Map([...progressMap.values()].map(apostle => [apostle.apostleId, apostle]));
  let total = 0;
  for (const apostle of apostles.values()) {
    if (apostle.isOwned === false) continue;
    for (const board of apostle.boards) {
      if (!board.unlocked) continue;
      for (const [index, node] of (board.masterNodes || []).entries()) {
        if (board.stepStr?.[index] !== '1' || !hwang(node)) continue;
        total += extractNodeCost(node).ultraCrayon;
      }
    }
  }
  return total;
}

/** 황크의 백분율 스탯 코드는 0.1% 단위이다. 일반칸의 정수 스탯과 혼합하지 않는다. */
export function readHwangStats(node: MasterBoardNode): HwangStats {
  const result = emptyStats();
  if (!hwang(node)) return result;
  for (const stat of node.stats || []) {
    const category = getStatCategoryFromStatType(stat.statType);
    if (!category || ![88, 89, 92, 93, 95, 97, 99, 101, 103].includes(stat.statType) || !Number.isFinite(stat.statValue) || stat.statValue < 0) {
      throw new Error('황크 스탯 형식을 확인할 수 없습니다. 이 데이터에서는 베타 계산을 중단합니다.');
    }
    result[category] += stat.statValue / 10;
  }
  if (!Object.values(result).some(value => value > 0)) throw new Error('황크 스탯 수치가 누락되어 계산할 수 없습니다.');
  return result;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    const delta = a[i]! - b[i]!;
    if (Math.abs(delta) > 1e-8) return delta;
  }
  return 0;
}

/** 사도의 차수들을 연결해 경로를 구한다. 초기화하지 않은 칸은 기존 출발점으로 취급한다. */
function boardPaths(nodes: RedistributionNode[], reset: boolean, originalOnly = false): Map<string, string[]> {
  const valid = nodes.filter(entry => entry.position &&
    entry.node.nodeType !== 0 && (!originalOnly || entry.picked || entry.node.nodeType === NODE_TYPE.START) &&
    !(entry.node.nodeType === NODE_TYPE.GATE && !entry.picked) &&
    (entry.node.nodeType !== NODE_TYPE.HWANG_EXT || (() => {
      const board = nodes.filter(item => item.boardIndex === entry.boardIndex);
      const petal = findLinkedPetalNode(board.map(item => item.node), entry.node);
      return Boolean(petal && board.some(item => item.node === petal && item.picked));
    })()));
  const coordinates = new Map(valid.map(entry => [`${entry.position!.x},${entry.position!.y}`, entry]));
  const distance = new Map<string, number[]>();
  const previous = new Map<string, string>();
  const visited = new Set<string>();
  for (const entry of valid) {
    if ((entry.node.nodeType === NODE_TYPE.START && entry.boardIndex === 0) ||
        (entry.picked && (!reset || entry.node.nodeType === NODE_TYPE.GATE || entry.node.nodeType === NODE_TYPE.PETAL))) {
      distance.set(entry.key, [0, 0, 0, 0, 0]);
    }
  }
  while (true) {
    let current: RedistributionNode | undefined;
    for (const entry of valid) {
      if (visited.has(entry.key) || !distance.has(entry.key)) continue;
      if (!current || compare(distance.get(entry.key)!, distance.get(current.key)!) < 0) current = entry;
    }
    if (!current) break;
    visited.add(current.key);
    const { x, y } = current.position!;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const next = coordinates.get(`${nx},${ny}`);
      if (!next || visited.has(next.key)) continue;
      const free = next.node.nodeType === NODE_TYPE.START || (next.picked && (!reset || retained(next.node)));
      const cost = free ? createEmptyCostSummary() : next.cost;
      const weight = [cost.ultraCrayon, cost.epicCrayon, cost.averageCrayon, cost.basicCrayon, cost.gold]
        .map((value, index) => value + distance.get(current!.key)![index]!);
      if (!distance.has(next.key) || compare(weight, distance.get(next.key)!) < 0) {
        distance.set(next.key, weight);
        previous.set(next.key, current.key);
      }
    }
  }
  const paths = new Map<string, string[]>();
  for (const key of distance.keys()) {
    const path = [key];
    let cursor = key;
    while (previous.has(cursor)) { cursor = previous.get(cursor)!; path.unshift(cursor); }
    paths.set(key, path);
  }
  return paths;
}

/** 이름과 ID 별칭을 중복 집계하지 않으며 입력 데이터를 변경하지 않는다. */
export function recommendHwangRedistribution(progressMap: Map<string, ApostleProgress>, options: RedistributionOptions): RedistributionPlan {
  if (!Number.isSafeInteger(options.ownedCrayons) || options.ownedCrayons < 0 ||
      !Number.isSafeInteger(options.maxReset) || options.maxReset < 0 ||
      !options.priorities.length || new Set(options.priorities.map(item => item.stat)).size !== options.priorities.length ||
      options.priorities.some(item => !STAT_CATEGORIES.includes(item.stat) || !Number.isFinite(item.target) || item.target < 0 || item.target > 100000)) {
    throw new Error('황크 보유량·초기화 인원·스탯 목표 입력을 확인해 주세요.');
  }
  const apostles = [...new Map([...progressMap.values()].filter(item => item.isOwned !== false).map(item => [item.apostleId, item])).values()];
  const nodes: RedistributionNode[] = [];
  const groups: RedistributionNode[][] = [];
  for (const apostle of apostles) {
    const positions = new Map(getApostleBoardLayout(apostle).map(entry => [`${entry.boardIndex}:${entry.nodeIndex}`, { x: entry.x, y: entry.y }]));
    const group: RedistributionNode[] = [];
    apostle.boards.forEach((board, boardIndex) => {
      if (!board.unlocked) return;
      const boardNodes = (board.masterNodes || []).map((node, nodeIndex) => {
        const cost = extractNodeCost(node);
        if (Object.values(cost).some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('보드 재화 수치가 올바르지 않습니다.');
        if (hwang(node) && cost.ultraCrayon <= 0) throw new Error('황크칸 비용이 누락되어 계산할 수 없습니다.');
        return { key: `${apostle.apostleId}:${boardIndex}:${nodeIndex}`, apostleId: apostle.apostleId, boardIndex, nodeIndex,
          node, picked: board.stepStr?.[nodeIndex] === '1', cost, stats: readHwangStats(node), position: positions.get(`${boardIndex}:${nodeIndex}`) };
      });
      group.push(...boardNodes);
    });
    groups.push(group); nodes.push(...group);
  }
  const byKey = new Map(nodes.map(entry => [entry.key, entry]));
  const before = emptyStats();
  for (const entry of nodes.filter(item => item.picked)) for (const stat of STAT_CATEGORIES) before[stat] += entry.stats[stat];
  const ranking = apostles.map(apostle => ({ apostle, waste: nodes.filter(item => item.apostleId === apostle.apostleId && item.picked && hwang(item.node))
    .reduce((total, entry) => total + entry.cost.ultraCrayon * (options.priorities.some(target => target.target > before[target.stat] && entry.stats[target.stat] > 0) ? 0 : 1), 0) }))
    .filter(item => item.waste > 0).sort((a, b) => b.waste - a.waste || a.apostle.apostleId - b.apostle.apostleId);

  function run(resetIds: Set<number>): RedistributionPlan | null {
    const selected = new Set(nodes.filter(entry => entry.node.nodeType === NODE_TYPE.START ||
      (entry.picked && (!resetIds.has(entry.apostleId) || retained(entry.node)))).map(entry => entry.key));
    const initial = new Set(selected);
    const refund = nodes.filter(entry => entry.picked && resetIds.has(entry.apostleId) && !retained(entry.node))
      .reduce((total, entry) => sumCosts(total, entry.cost), createEmptyCostSummary());
    const paths = new Map<string, string[]>();
    const paintOrder: string[] = [];
    const addPath = (path: string[]) => { for (const key of path) if (!selected.has(key)) { selected.add(key); paintOrder.push(key); } };
    for (const group of groups) {
      const reset = resetIds.has(group[0]?.apostleId ?? -1);
      for (const [key, path] of boardPaths(group, reset)) paths.set(key, path);
      if (reset) {
        const restore = boardPaths(group, true, true);
        for (const entry of group.filter(item => item.picked && item.node.nodeType !== 0 && !retained(item.node) && !hwang(item.node))) {
          const path = restore.get(entry.key);
          if (!path) return null;
          addPath(path);
        }
      }
    }
    const after = emptyStats();
    for (const key of selected) for (const stat of STAT_CATEGORIES) after[stat] += byKey.get(key)!.stats[stat];
    let remaining = options.ownedCrayons + refund.ultraCrayon - paintOrder.reduce((total, key) => total + byKey.get(key)!.cost.ultraCrayon, 0);
    if (remaining < 0) return null;
    const candidates = nodes.filter(entry => hwang(entry.node) && paths.has(entry.key));
    while (true) {
      let best: { path: string[]; cost: number; gain: HwangStats; score: number[] } | undefined;
      for (const candidate of candidates) {
        if (selected.has(candidate.key)) continue;
        const path = paths.get(candidate.key)!.filter(key => !selected.has(key));
        const cost = path.reduce((total, key) => total + byKey.get(key)!.cost.ultraCrayon, 0);
        if (cost <= 0 || cost > remaining) continue;
        const gain = emptyStats();
        for (const key of path) for (const stat of STAT_CATEGORIES) gain[stat] += byKey.get(key)!.stats[stat];
        const score = options.priorities.map(target => Math.min(Math.max(0, target.target - after[target.stat]), gain[target.stat]) / cost);
        if (!score.some(value => value > 1e-8)) continue;
        score.push(-cost);
        if (!best || compare(score, best.score) > 0) best = { path, cost, gain, score };
      }
      if (!best) break;
      addPath(best.path); remaining -= best.cost;
      for (const stat of STAT_CATEGORIES) after[stat] += best.gain[stat];
    }
    const actions: RedistributionAction[] = [];
    for (const apostle of apostles) {
      const paint = paintOrder.map(key => byKey.get(key)!).filter(entry => entry.apostleId === apostle.apostleId && !initial.has(entry.key));
      const reset = resetIds.has(apostle.apostleId);
      if (!reset && !paint.length) continue;
      actions.push({ apostle, reset, paint, balance: 0,
        refund: reset ? nodes.filter(entry => entry.apostleId === apostle.apostleId && entry.picked && !retained(entry.node))
          .reduce((total, entry) => sumCosts(total, entry.cost), createEmptyCostSummary()) : createEmptyCostSummary(),
        spend: paint.reduce((total, entry) => sumCosts(total, entry.cost), createEmptyCostSummary()) });
    }
    // 초기화를 모두 먼저 진행하면 도중의 황크 잔고 부족을 피할 수 있다.
    actions.sort((a, b) => (b.refund.ultraCrayon - b.spend.ultraCrayon) - (a.refund.ultraCrayon - a.spend.ultraCrayon) || a.apostle.apostleId - b.apostle.apostleId);
    let balance = options.ownedCrayons + refund.ultraCrayon;
    for (const action of actions) { balance -= action.spend.ultraCrayon; action.balance = balance; }
    return { before, after, remaining, refund, spend: actions.reduce((total, action) => sumCosts(total, action.spend), createEmptyCostSummary()),
      resetCount: resetIds.size, actions, nodes, selected, notes: [] };
  }
  const baseline = run(new Set());
  if (!baseline) throw new Error('현재 보드에서 계산할 수 없습니다.');
  const trial = run(new Set(ranking.slice(0, options.maxReset).map(item => item.apostle.apostleId)));
  const objective = (plan: RedistributionPlan) => [...options.priorities.map(target => Math.min(target.target, plan.after[target.stat])), -plan.resetCount, plan.remaining];
  const result = trial && compare(objective(trial), objective(baseline)) > 0 ? trial : baseline;
  result.notes = ['우선순위에 따른 탐욕법 추천입니다. 최적해나 최소 초기화 인원은 보장하지 않습니다.',
    '목표 밖 황크가 많은 사도부터 초기화 후보를 골라 무초기화안과 비교합니다.'];
  if (!trial) result.notes.push('초기화 후보의 기존 칸 복구 경로를 검증하지 못해 초기화 없는 추천안을 표시합니다.');
  return result;
}
