/** 황크·보크 재분배 베타: 관문·꽃잎 유지, 일반칸 복구, 초기화 조합 및 제한 탐색 추천 계산. */
import { searchResetSets } from './redistributionSearch.ts';
import { getNodeStatCategories, getStatCategoryFromStatType, isHwangNode, NODE_TYPE, STAT_CATEGORIES, STAT_META_LIST, createEmptyCostSummary } from './boardProgress.ts';
import { extractNodeCost, findLinkedPetalNode, getApostleBoardLayout, sumCosts } from './boardPathfinder.ts';
import type { ApostleProgress, MasterBoardNode, ResourceCostSummary, StatCategory } from './types.ts';

export type HwangStats = Record<StatCategory, number>;
export type RedistributionStat = StatCategory | 'attack';
/** 공격력은 물공·마공을 더하지 않고 함께 확보한 백분율로 비교한다. */
export const getHwangTargetValue = (stats: HwangStats, stat: RedistributionStat): number =>
  stat === 'attack' ? Math.min(stats.atk_phys, stats.atk_mag) : stats[stat];
export interface RedistributionTarget {
  stat: RedistributionStat;
  /** null은 해당 단계에서 접근 가능한 칸 전부. 숫자는 누적 백분율 목표. */
  target: number | null;
}
export interface RedistributionStage {
  /** 생략 시 기존 황크 단계. 보크 목표는 백분율 대신 누적 칸 수이다. */
  resource?: 'hwang' | 'bokr';
  /** 보크 목표의 차수. 생략하면 전체 차수(기존 호출 호환). */
  boardIndex?: number;
  /** 보크 누적 범위: 0=1차, 1=1~2차, 2=1~3차. boardIndex와 함께 지정하지 않는다. */
  boardThrough?: number;
  targets: RedistributionTarget[];
  allowBlocked: boolean;
  /** 잠긴 보드와 닫힌 관문을 개방 비용을 포함해 탐색한다. */
  allowGates?: boolean;
}
export interface RedistributionStageResult {
  resource?: 'hwang' | 'bokr';
  boardIndex?: number;
  boardThrough?: number;
  allowBlocked: boolean;
  allowGates?: boolean;
  targets: Array<{ stat: RedistributionStat; target: number; all: boolean; before: number; after: number }>;
}
/** 참고 이미지의 순서는 수정 가능한 예시이며, 전부 목표는 계정 보드로 계산한다. */
export function createExampleRedistributionStages(): RedistributionStage[] {
  return [
    { allowBlocked: false, targets: [{ stat: 'attack', target: null }] },
    { allowBlocked: false, targets: [{ stat: 'crit', target: 500 }, { stat: 'crit_dmg', target: 500 }, { stat: 'crit_dmg_res', target: 500 }] },
    { allowBlocked: false, targets: [{ stat: 'hp', target: 1500 }] },
    { allowBlocked: false, targets: [{ stat: 'crit', target: 700 }, { stat: 'crit_dmg', target: 700 }] },
    { allowBlocked: true, targets: [{ stat: 'attack', target: null }] },
    { allowBlocked: false, targets: [{ stat: 'hp', target: 2000 }, { stat: 'crit', target: 900 }, { stat: 'crit_dmg', target: 900 }] },
    { allowBlocked: true, targets: [{ stat: 'hp', target: 2000 }, { stat: 'crit', target: 900 }, { stat: 'crit_dmg', target: 900 }, { stat: 'crit_dmg_res', target: 500 }] },
  ];
}
export interface RedistributionOptions {
  /** 빠른 탐색은 큰 계정의 조합 비교 수를 제한한다. 생략 시 기존 상세 탐색. */
  searchMode?: 'fast' | 'thorough';
  /** 이미 칠한 칸과 별개로, 아직 사용하지 않고 보유한 황크 수. */
  ownedCrayons: number;
  /** 미사용 보유 보크. 생략 시 0. 보유량+환급분 안에서 필요한 최소 경로를 사용한다. */
  ownedBokr?: number;
  maxReset: number;
  priorities?: Array<{ stat: RedistributionStat; target: number }>;
  stages?: RedistributionStage[];
}
export interface RedistributionNode {
  key: string;
  apostleId: number;
  boardIndex: number;
  nodeIndex: number;
  node: MasterBoardNode;
  picked: boolean;
  boardUnlocked?: boolean;
  cost: ResourceCostSummary;
  stats: HwangStats;
  bokrStats: HwangStats;
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
  remainingBokr?: number;
  refund: ResourceCostSummary;
  spend: ResourceCostSummary;
  resetCount: number;
  actions: RedistributionAction[];
  nodes: RedistributionNode[];
  selected: Set<string>;
  notes: string[];
  stageResults?: RedistributionStageResult[];
}

const emptyStats = (): HwangStats => Object.fromEntries(STAT_CATEGORIES.map(key => [key, 0])) as HwangStats;
const retained = (node: MasterBoardNode) => node.nodeType === NODE_TYPE.GATE || node.nodeType === NODE_TYPE.PETAL || node.nodeType === NODE_TYPE.START;
const hwang = (node: MasterBoardNode) => isHwangNode(node) || node.nodeType === NODE_TYPE.HWANG_EXT;

/** 초기화 환급은 크레파스 4종과 골드만 해당한다. 물뿌리개는 환급하지 않는다. */
function refundCost(entry: RedistributionNode): ResourceCostSummary {
  return { ...entry.cost, wateringCan: 0 };
}

/** 이름·ID 별칭과 미보유·미해금 보드를 제외하고 실제로 칠한 황크 비용을 합산한다. */
export function getSpentHwangCrayons(progressMap: Map<string, ApostleProgress>): number {
  return getSpentCrayons(progressMap, 'hwang');
}

export function getSpentBokrCrayons(progressMap: Map<string, ApostleProgress>): number {
  return getSpentCrayons(progressMap, 'bokr');
}

function getSpentCrayons(progressMap: Map<string, ApostleProgress>, resource: 'hwang' | 'bokr'): number {
  const apostles = new Map([...progressMap.values()].map(apostle => [apostle.apostleId, apostle]));
  let total = 0;
  for (const apostle of apostles.values()) {
    if (apostle.isOwned === false) continue;
    for (const board of apostle.boards) {
      if (!board.unlocked) continue;
      for (const [index, node] of (board.masterNodes || []).entries()) {
        if (board.stepStr?.[index] !== '1' || (resource === 'hwang' ? !hwang(node) : node.nodeType !== NODE_TYPE.BOKR)) continue;
        total += extractNodeCost(node)[resource === 'hwang' ? 'ultraCrayon' : 'epicCrayon'];
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

/** 보크는 물공·마공을 구분한 스탯별 칸 수로 목표를 설정한다. */
export function readBokrCounts(node: MasterBoardNode): HwangStats {
  const result = emptyStats();
  if (node.nodeType === NODE_TYPE.BOKR) for (const stat of getNodeStatCategories(node)) result[stat] = 1;
  return result;
}

/** 기존 보크 모달과 같은 원본 수치 우선, 메타데이터 대체 규칙. 백분율이 아닌 정수 스탯. */
export function readBokrValues(node: MasterBoardNode): HwangStats {
  const result = emptyStats();
  if (node.nodeType === NODE_TYPE.BOKR) for (const stat of getNodeStatCategories(node)) {
    result[stat] = node.stats?.find(value => getStatCategoryFromStatType(value.statType) === stat)?.statValue
      ?? STAT_META_LIST.find(meta => meta.key === stat)!.valuePerNode!;
  }
  return result;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    const delta = a[i]! - b[i]!;
    if (Math.abs(delta) > 1e-8) return delta;
  }
  return 0;
}

/** 1차 시작 칸에서 연결한다. 열린 관문도 그곳까지의 색칠 경로를 건너뛸 수 없다. */
function boardPathOptions(nodes: RedistributionNode[], reset: boolean, originalOnly = false, selected?: Set<string>, allowBlocked = true, maxLabels = 1, allowGates = false): Map<string, string[][]> {
  const linkedPetals = new Map<string, RedistributionNode>();
  for (const entry of nodes.filter(item => item.node.nodeType === NODE_TYPE.HWANG_EXT)) {
    const board = nodes.filter(item => item.boardIndex === entry.boardIndex);
    const petal = findLinkedPetalNode(board.map(item => item.node), entry.node);
    const linked = board.find(item => item.node === petal);
    if (linked) linkedPetals.set(entry.key, linked);
  }
  const valid = nodes.filter(entry => entry.position &&
    (allowGates || entry.boardUnlocked !== false) &&
    // 색칠 여부와 무관하게 방어력·치저 황크만 차단한다. 같은 스탯 보크는 통과한다.
    (allowBlocked || !hwang(entry.node) ||
      !(['def_phys', 'def_mag', 'crit_res'] as const).some(stat => entry.stats[stat] > 0)) &&
    entry.node.nodeType !== 0 && (!originalOnly || entry.picked || entry.node.nodeType === NODE_TYPE.START) &&
    !(entry.node.nodeType === NODE_TYPE.GATE && !entry.picked && !selected?.has(entry.key) && !allowGates) &&
    (entry.node.nodeType !== NODE_TYPE.HWANG_EXT || linkedPetals.has(entry.key)));
  const coordinates = new Map(valid.map(entry => [`${entry.position!.x},${entry.position!.y}`, entry]));
  type Label = { key: string; weight: number[]; path: string[] };
  const labels = new Map<string, Label[]>();
  const queue: Label[] = [];
  const dominates = (a: Label, b: Label) => maxLabels === 1 ? compare(a.weight, b.weight) <= 0 :
    a.weight[0]! <= b.weight[0]! && a.weight[1]! <= b.weight[1]! &&
    (a.weight[0]! < b.weight[0]! || a.weight[1]! < b.weight[1]! || compare(a.weight, b.weight) <= 0);
  for (const entry of valid) if (entry.node.nodeType === NODE_TYPE.START && entry.boardIndex === 0) {
    const label = { key: entry.key, weight: [0, 0, 0, 0, 0, 0], path: [entry.key] };
    labels.set(entry.key, [label]); queue.push(label);
  }
  const byKey = new Map(valid.map(entry => [entry.key, entry]));
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    if (!labels.get(current.key)?.includes(current)) continue;
    const { x, y } = byKey.get(current.key)!.position!;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const next = coordinates.get(`${nx},${ny}`);
      if (!next || current.path.includes(next.key)) continue;
      const currentEntry = byKey.get(current.key)!;
      if (currentEntry.boardIndex !== next.boardIndex &&
        (Math.abs(currentEntry.boardIndex - next.boardIndex) !== 1 ||
          (currentEntry.boardIndex < next.boardIndex ? currentEntry : next).node.nodeType !== NODE_TYPE.GATE)) continue;
      const free = selected?.has(next.key) || next.node.nodeType === NODE_TYPE.START || (next.picked && (!reset || retained(next.node)));
      let cost = free ? createEmptyCostSummary() : next.cost;
      const petal = linkedPetals.get(next.key);
      const needsPetal = petal && !petal.picked && !selected?.has(petal.key) && !current.path.includes(petal.key);
      if (needsPetal) cost = sumCosts(cost, petal.cost);
      const weight = [cost.ultraCrayon, cost.epicCrayon, cost.averageCrayon, cost.basicCrayon, cost.wateringCan || 0, cost.gold]
        .map((value, index) => value + current.weight[index]!);
      const label = { key: next.key, weight, path: [...current.path, ...(needsPetal ? [petal.key] : []), next.key] };
      const existing = labels.get(next.key) || [];
      if (existing.some(other => dominates(other, label))) continue;
      let survivors = [...existing.filter(other => !dominates(label, other)), label].sort((a, b) => compare(a.weight, b.weight));
      if (survivors.length > maxLabels) {
        // Preserve both resource extremes, then evenly sample the frontier.
        survivors = Array.from({ length: maxLabels }, (_, i) => survivors[Math.round(i * (survivors.length - 1) / (maxLabels - 1))]!);
      }
      labels.set(next.key, survivors);
      if (survivors.includes(label)) queue.push(label);
    }
  }
  return new Map([...labels].map(([key, values]) => [key, values.map(label => label.path)]));
}

function boardPaths(nodes: RedistributionNode[], reset: boolean, originalOnly = false, selected?: Set<string>, allowBlocked = true) {
  return new Map([...boardPathOptions(nodes, reset, originalOnly, selected, allowBlocked)].map(([key, paths]) => [key, paths[0]!]));
}

function prepareNodes(progressMap: Map<string, ApostleProgress>, includeLocked = false) {
  const apostles = [...new Map([...progressMap.values()].filter(item => item.isOwned !== false).map(item => [item.apostleId, item])).values()];
  const nodes: RedistributionNode[] = [];
  const groups: RedistributionNode[][] = [];
  for (const apostle of apostles) {
    const positions = new Map(getApostleBoardLayout(apostle).map(entry => [`${entry.boardIndex}:${entry.nodeIndex}`, { x: entry.x, y: entry.y }]));
    const group: RedistributionNode[] = [];
    apostle.boards.forEach((board, boardIndex) => {
      if (!board.unlocked && !includeLocked) return;
      const boardNodes = (board.masterNodes || []).map((node, nodeIndex) => {
        const cost = node.nodeType === NODE_TYPE.START ? createEmptyCostSummary() : extractNodeCost(node);
        if (Object.values(cost).some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('보드 재화 수치가 올바르지 않습니다.');
        if (hwang(node) && cost.ultraCrayon <= 0) throw new Error('황크칸 비용이 누락되어 계산할 수 없습니다.');
        return { key: `${apostle.apostleId}:${boardIndex}:${nodeIndex}`, apostleId: apostle.apostleId, boardIndex, nodeIndex,
          node, boardUnlocked: board.unlocked, picked: (boardIndex === 0 && node.nodeType === NODE_TYPE.START) || (board.unlocked && board.stepStr?.[nodeIndex] === '1'), cost, stats: readHwangStats(node), bokrStats: readBokrCounts(node), position: positions.get(`${boardIndex}:${nodeIndex}`) };
      });
      group.push(...boardNodes);
    });
    groups.push(group); nodes.push(...group);
  }
  return { apostles, nodes, groups };
}

function prepareScopes(nodes: RedistributionNode[], groups: RedistributionNode[][], stages: RedistributionStage[]) {
  const original = new Set(nodes.filter(entry => entry.picked).map(entry => entry.key));
  const cache = new Map<string, Set<string>>();
  return stages.map(stage => {
    const scopeKey = `${stage.allowBlocked}/${!!stage.allowGates}`;
    if (!cache.has(scopeKey)) cache.set(scopeKey, new Set(groups.flatMap(group =>
      [...boardPathOptions(group, false, false, original, stage.allowBlocked, 1, stage.allowGates).keys()])));
    const keys = new Set(nodes.filter(entry => cache.get(scopeKey)!.has(entry.key) &&
      (stage.resource !== 'bokr' || (stage.boardThrough !== undefined ? entry.boardIndex <= stage.boardThrough : stage.boardIndex === undefined || entry.boardIndex === stage.boardIndex))).map(entry => entry.key));
    const available = emptyStats();
    for (const entry of nodes) if (keys.has(entry.key)) for (const stat of STAT_CATEGORIES)
      available[stat] += (stage.resource === 'bokr' ? entry.bokrStats : entry.stats)[stat];
    return { keys, goals: stage.targets.map(target => target.target ?? getHwangTargetValue(available, target.stat)) };
  });
}

/** 입력 미리보기와 모든 초기화 후보에 같은 접근 범위·전부 목표를 적용한다. 예산 적용 전이다. */
export function createRedistributionGoalPreview(progressMap: Map<string, ApostleProgress>) {
  const { nodes, groups } = prepareNodes(progressMap, true);
  const cache = new Map<string, number>();
  return (stage: RedistributionStage, stat: RedistributionStat): number => {
    const key = [stage.resource, stage.boardIndex, stage.boardThrough, stage.allowBlocked, stage.allowGates, stat].join(':');
    if (!cache.has(key)) cache.set(key, prepareScopes(nodes, groups, [{ ...stage, targets: [{ stat, target: null }] }])[0]!.goals[0]!);
    return cache.get(key)!;
  };
}

/** 현재 관문과 모든 관문 개방 가정의 차이. 추천 예산·작업에는 가정을 적용하지 않는다. */
export function getAttackPathAvailability(progressMap: Map<string, ApostleProgress>) {
  const preview = createRedistributionGoalPreview(progressMap);
  const opened = new Map([...progressMap].map(([key, apostle]) => [key, { ...apostle, boards: apostle.boards.map(board => ({
    ...board, unlocked: true, stepStr: (board.masterNodes || []).map((node, index) => node.nodeType === NODE_TYPE.GATE ? '1' : board.stepStr?.[index] || '0').join(''),
  })) }]));
  const potential = createRedistributionGoalPreview(opened);
  const value = (read: typeof preview, allowBlocked: boolean) => read({ allowBlocked, targets: [] }, 'attack');
  return { current: { unblocked: value(preview, false), all: value(preview, true) },
    opened: { unblocked: value(potential, false), all: value(potential, true) } };
}

/** 이름과 ID 별칭을 중복 집계하지 않으며 입력 데이터를 변경하지 않는다. */
export function* iterateHwangRedistribution(progressMap: Map<string, ApostleProgress>, options: RedistributionOptions, checkpoints = false): Generator<{ limit: number; plan: RedistributionPlan; pending?: boolean }, RedistributionPlan> {
  const stages: RedistributionStage[] = options.stages ?? (options.priorities || []).map(target => ({ targets: [{ ...target }], allowBlocked: true }));
  const validStat = (stat: RedistributionStat) => stat === 'attack' || STAT_CATEGORIES.includes(stat);
  if (!Number.isSafeInteger(options.ownedCrayons) || options.ownedCrayons < 0 ||
      (options.searchMode !== undefined && !['fast', 'thorough'].includes(options.searchMode)) ||
      (options.ownedBokr !== undefined && (!Number.isSafeInteger(options.ownedBokr) || options.ownedBokr < 0)) ||
      !Number.isSafeInteger(options.maxReset) || options.maxReset < 0 ||
      !stages.length || stages.length > 30 ||
      (!options.stages && new Set(options.priorities?.map(item => item.stat)).size !== options.priorities?.length) ||
      stages.some(stage => typeof stage.allowBlocked !== 'boolean' || !stage.targets.length || stage.targets.length > 10 ||
        (stage.allowGates !== undefined && typeof stage.allowGates !== 'boolean') ||
        (stage.resource !== undefined && !['hwang', 'bokr'].includes(stage.resource)) ||
        (stage.resource === 'bokr' && stage.targets.some(target => target.stat === 'attack' || (target.target !== null && !Number.isSafeInteger(target.target)))) ||
        (stage.boardIndex !== undefined && (stage.resource !== 'bokr' || ![0, 1, 2].includes(stage.boardIndex))) ||
        (stage.boardThrough !== undefined && (stage.resource !== 'bokr' || ![0, 1, 2].includes(stage.boardThrough) || stage.boardIndex !== undefined)) ||
        new Set(stage.targets.map(item => item.stat)).size !== stage.targets.length ||
        (stage.targets.some(item => item.stat === 'attack') && stage.targets.some(item => item.stat === 'atk_phys' || item.stat === 'atk_mag')) ||
        stage.targets.some(item => !validStat(item.stat) || (item.target !== null && (!Number.isFinite(item.target) || item.target < 0 || item.target > 100000))))) {
    throw new Error('황크 보유량·초기화 인원·단계별 스탯 목표 입력을 확인해 주세요. 같은 단계의 스탯은 중복할 수 없습니다.');
  }
  const targets = stages.filter(stage => stage.resource !== 'bokr').flatMap(stage => stage.targets);
  const { apostles, nodes, groups } = prepareNodes(progressMap, stages.some(stage => stage.allowGates));
  const scopes = prepareScopes(nodes, groups, stages);
  const byKey = new Map(nodes.map(entry => [entry.key, entry]));
  // Many trials differ in only one apostle. Reuse unchanged board states across trials.
  const pathCache = new Map<string, Map<string, string[][]>>();
  type Move = { path: string[]; cost: ResourceCostSummary; gain: HwangStats; score: number[] };
  const groupById = new Map(groups.filter(group => group.length).map(group => [group[0]!.apostleId, group]));
  const moveCache = new Map<string, Move[]>();
  let cachedMoveCount = 0;
  const stagePathsFor = (group: RedistributionNode[], reset: boolean, selected: Set<string>, allowBlocked: boolean, allowGates = false) => {
    const key = `${group[0]?.apostleId}/${reset}/${allowBlocked}/${allowGates}/${group.map(entry => selected.has(entry.key) ? '1' : '0').join('')}`;
    const cached = pathCache.get(key);
    if (cached) { pathCache.delete(key); pathCache.set(key, cached); return cached; }
    const paths = boardPathOptions(group, reset, false, selected, allowBlocked, 8, allowGates);
    if (pathCache.size >= 1024) pathCache.delete(pathCache.keys().next().value!);
    pathCache.set(key, paths); return paths;
  };
  const before = emptyStats();
  for (const entry of nodes.filter(item => item.picked)) for (const stat of STAT_CATEGORIES) before[stat] += entry.stats[stat];
  const ranking = apostles.map(apostle => ({ apostle, waste: nodes.filter(item => item.apostleId === apostle.apostleId && item.picked && hwang(item.node))
    .reduce((total, entry) => total + entry.cost.ultraCrayon * (targets.some(target => (target.target === null || target.target > getHwangTargetValue(before, target.stat)) && getHwangTargetValue(entry.stats, target.stat) > 0) ? 0 : 1), 0) }))
    .filter(item => nodes.some(entry => entry.apostleId === item.apostle.apostleId && entry.picked && !retained(entry.node) && (entry.cost.ultraCrayon > 0 || entry.cost.epicCrayon > 0))).sort((a, b) => b.waste - a.waste || a.apostle.apostleId - b.apostle.apostleId);

  function run(resetIds: Set<number>, choices: number[] = [], branches?: number[][]): RedistributionPlan | null {
    const trace: number[] = [];
    const selected = new Set(nodes.filter(entry => (entry.node.nodeType === NODE_TYPE.START && entry.boardIndex === 0) ||
      (entry.picked && (!resetIds.has(entry.apostleId) || retained(entry.node)))).map(entry => entry.key));
    const initial = new Set(selected);
    const refund = nodes.filter(entry => entry.picked && resetIds.has(entry.apostleId) && !retained(entry.node))
      .reduce((total, entry) => sumCosts(total, refundCost(entry)), createEmptyCostSummary());
    const paintOrder: string[] = [];
    const addPath = (path: string[]) => { for (const key of path) if (!selected.has(key)) { selected.add(key); paintOrder.push(key); } };
    for (const group of groups) {
      const reset = resetIds.has(group[0]?.apostleId ?? -1);
      if (reset) {
        const restore = boardPaths(group, true, true);
        for (const entry of group.filter(item => item.picked && item.node.nodeType === NODE_TYPE.NORMAL)) {
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
    let remainingBokr = (options.ownedBokr ?? 0) + refund.epicCrayon - paintOrder.reduce((total, key) => total + byKey.get(key)!.cost.epicCrayon, 0);
    if (remainingBokr < 0) return null;
    for (const [stageIndex, stage] of stages.entries()) {
      const bokr = stage.resource === 'bokr';
      const metric = (entry: RedistributionNode) => bokr ? entry.bokrStats : entry.stats;
      const { keys: scopeKeys, goals } = scopes[stageIndex]!;
      const scopedStats = emptyStats();
      for (const key of selected) if (scopeKeys.has(key)) for (const stat of STAT_CATEGORIES) scopedStats[stat] += metric(byKey.get(key)!)[stat];
      if (stage.targets.every((target, index) => getHwangTargetValue(scopedStats, target.stat) >= goals[index]!)) continue;
      // 앞 단계에서 칠한 공유 경로의 비용은 제외하되, 시작 칸과의 연결은 유지한다.
      const stagePaths = new Map<string, string[][]>();
      for (const group of groups) for (const [key, path] of stagePathsFor(group, resetIds.has(group[0]?.apostleId ?? -1), selected,
        stage.allowBlocked, stage.allowGates)) stagePaths.set(key, path);
      const candidates = nodes.filter(entry => !selected.has(entry.key) && (bokr ? entry.node.nodeType === NODE_TYPE.BOKR : hwang(entry.node)) && scopeKeys.has(entry.key) && stagePaths.has(entry.key) &&
        stage.targets.some(target => target.stat === 'attack' ? metric(entry).atk_phys > 0 || metric(entry).atk_mag > 0 : metric(entry)[target.stat] > 0));
      const movesByApostle = new Map<number, Move[]>();
      const candidatesByApostle = new Map<number, RedistributionNode[]>();
      for (const candidate of candidates) {
        if (!candidatesByApostle.has(candidate.apostleId)) candidatesByApostle.set(candidate.apostleId, []);
        candidatesByApostle.get(candidate.apostleId)!.push(candidate);
      }
      const refreshMoves = (apostleId: number) => {
        const signature = `${stageIndex}/${apostleId}/${resetIds.has(apostleId)}/${groupById.get(apostleId)!.map(entry => selected.has(entry.key) ? '1' : '0').join('')}`;
        const cached = moveCache.get(signature);
        if (cached) {
          moveCache.delete(signature); moveCache.set(signature, cached);
          movesByApostle.set(apostleId, cached); return;
        }
        const entries: Move[] = [];
        const seen = new Set<string>();
        for (const candidate of candidatesByApostle.get(apostleId) || []) {
          if (selected.has(candidate.key)) continue;
          for (const alternative of stagePaths.get(candidate.key) || []) {
            const path = alternative.filter(key => !selected.has(key));
            const signature = path.join('|');
            if (seen.has(signature)) continue;
            seen.add(signature);
            const cost = createEmptyCostSummary(), gain = emptyStats();
            for (const key of path) {
              const entry = byKey.get(key)!;
              for (const resource of Object.keys(cost) as Array<keyof ResourceCostSummary>) cost[resource] = (cost[resource] || 0) + (entry.cost[resource] || 0);
              if (scopeKeys.has(key)) for (const stat of STAT_CATEGORIES) gain[stat] += metric(entry)[stat];
            }
            entries.push({ path, cost, gain, score: [] });
          }
        }
        movesByApostle.set(apostleId, entries);
        // Reuse path cost/stat sums across reset combinations without unbounded retention.
        if (entries.length <= 20000) {
          while (moveCache.size && (cachedMoveCount + entries.length > 20000 || moveCache.size >= 2048)) {
            const first = moveCache.keys().next().value!;
            cachedMoveCount -= moveCache.get(first)!.length; moveCache.delete(first);
          }
          moveCache.set(signature, entries); cachedMoveCount += entries.length;
        }
      };
      for (const id of new Set(candidates.map(entry => entry.apostleId))) refreshMoves(id);
      while (true) {
        const moves: Move[] = [];
        for (const entries of movesByApostle.values()) {
          for (const move of entries) {
            const { path, cost, gain } = move;
            const targetCost = bokr ? cost.epicCrayon : cost.ultraCrayon;
            if (targetCost <= 0 || cost.ultraCrayon > remaining || cost.epicCrayon > remainingBokr) continue;
            const improved = { ...scopedStats };
            for (const stat of STAT_CATEGORIES) improved[stat] += gain[stat];
            const useful = stage.targets.map((target, index) => {
              const value = getHwangTargetValue(scopedStats, target.stat);
              const increase = getHwangTargetValue(improved, target.stat) - value;
              return { ratio: goals[index]! > 0 ? value / goals[index]! : 1,
                gain: Math.min(Math.max(0, goals[index]! - value), increase) };
            }).filter(item => item.gain > 1e-8);
            if (!useful.length) continue;
            // 같은 단계에서는 목표 대비 가장 덜 찬 스탯을 먼저 채운다.
            const ratio = Math.min(...useful.map(item => item.ratio));
            const efficiency = useful.filter(item => Math.abs(item.ratio - ratio) < 1e-8).reduce((sum, item) => sum + item.gain, 0) / targetCost;
            const score = [-ratio, efficiency, -cost.epicCrayon, -cost.ultraCrayon];
            move.score = score;
            moves.push(move);
          }
        }
        moves.sort((a, b) => -compare(a.score, b.score));
        const unique = moves;
        if (!unique.length) break;
        const choice = choices[trace.length] ?? 0;
        const best = unique[choice];
        if (!best) return null;
        // Branch on early decisions, then finish each alternative to compare final outcomes.
        if (branches && trace.length >= choices.length && trace.length < 8) {
          for (let i = 1; i < Math.min(3, unique.length); i++) branches.push([...trace, i]);
        }
        trace.push(choice);
        addPath(best.path);
        const affected = groups.find(group => group[0]?.apostleId === byKey.get(best.path.at(-1)!)!.apostleId)!;
        for (const [key, path] of stagePathsFor(affected, resetIds.has(affected[0]!.apostleId), selected, stage.allowBlocked, stage.allowGates)) stagePaths.set(key, path);
        refreshMoves(affected[0]!.apostleId);
        remaining -= best.cost.ultraCrayon; remainingBokr -= best.cost.epicCrayon;
        for (const stat of STAT_CATEGORIES) {
          for (const key of best.path) after[stat] += byKey.get(key)!.stats[stat];
          scopedStats[stat] += best.gain[stat];
        }
      }
    }
    const stageResults = stages.map((stage, stageIndex) => {
      const { keys, goals } = scopes[stageIndex]!;
      const original = emptyStats(), final = emptyStats();
      for (const entry of nodes) if (keys.has(entry.key)) for (const stat of STAT_CATEGORIES) {
        const metric = stage.resource === 'bokr' ? entry.bokrStats : entry.stats;
        if (entry.picked) original[stat] += metric[stat];
        if (selected.has(entry.key)) final[stat] += metric[stat];
      }
      return { resource: stage.resource, boardIndex: stage.boardIndex, boardThrough: stage.boardThrough, allowBlocked: stage.allowBlocked, allowGates: stage.allowGates, targets: stage.targets.map((target, index) => ({ stat: target.stat,
        target: goals[index]!, all: target.target === null, before: getHwangTargetValue(original, target.stat), after: getHwangTargetValue(final, target.stat) })) };
    });
    const actions: RedistributionAction[] = [];
    for (const apostle of apostles) {
      const paint = paintOrder.map(key => byKey.get(key)!).filter(entry => entry.apostleId === apostle.apostleId && !initial.has(entry.key));
      const reset = resetIds.has(apostle.apostleId);
      if (!reset && !paint.length) continue;
      actions.push({ apostle, reset, paint, balance: 0,
        refund: reset ? nodes.filter(entry => entry.apostleId === apostle.apostleId && entry.picked && !retained(entry.node))
          .reduce((total, entry) => sumCosts(total, refundCost(entry)), createEmptyCostSummary()) : createEmptyCostSummary(),
        spend: paint.reduce((total, entry) => sumCosts(total, entry.cost), createEmptyCostSummary()) });
    }
    // 초기화를 모두 먼저 진행하면 도중의 황크 잔고 부족을 피할 수 있다.
    actions.sort((a, b) => (b.refund.ultraCrayon - b.spend.ultraCrayon) - (a.refund.ultraCrayon - a.spend.ultraCrayon) || a.apostle.apostleId - b.apostle.apostleId);
    let balance = options.ownedCrayons + refund.ultraCrayon;
    for (const action of actions) { balance -= action.spend.ultraCrayon; action.balance = balance; }
    return { before, after, remaining, remainingBokr, refund, spend: actions.reduce((total, action) => sumCosts(total, action.spend), createEmptyCostSummary()),
      resetCount: resetIds.size, actions, nodes, selected, notes: [], stageResults };
  }
  const objective = (plan: RedistributionPlan) => [...plan.stageResults!.flatMap(stage =>
    [...stage.targets.map(target => target.target > 0 ? Math.min(1, target.after / target.target) : 1).sort((a, b) => a - b), stage.targets.reduce((sum, target) => sum + Math.min(target.target, target.after), 0)]), -plan.resetCount, plan.remaining, plan.remainingBokr ?? 0];
  function evaluate(resetIds: Set<number>): RedistributionPlan | null {
    // Larger boards use the cheap rollout; bounded lookahead is reserved for small problems.
    if (nodes.length > 24) return run(resetIds);
    const branches: number[][] = [];
    let best = run(resetIds, [], branches);
    if (!best) return null;
    const queue = branches.map(choices => ({ choices, score: objective(best!) }));
    const seen = new Set<string>();
    for (let count = 0; count < 12 && queue.length; count++) {
      queue.sort((a, b) => -compare(a.score, b.score) || a.choices.length - b.choices.length);
      const { choices } = queue.shift()!;
      const next: number[][] = [];
      const plan = run(resetIds, choices, next);
      if (!plan) continue;
      const score = objective(plan);
      if (compare(score, objective(best)) > 0) best = plan;
      for (const branch of next) {
        const key = branch.join(',');
        if (!seen.has(key)) { seen.add(key); queue.push({ choices: branch, score }); }
      }
    }
    return best;
  }
  let result: RedistributionPlan | undefined;
  for (const point of searchResetSets(ranking.map(item => item.apostle.apostleId), Math.min(options.maxReset, apostles.length), evaluate, objective, compare, checkpoints, options.searchMode === 'fast')) {
    result = { ...point.best, notes: [
      ranking.length <= 8 ? '초기화 후보 8명 이하: 인원 상한 내 모든 초기화 조합을 비교합니다.' : options.searchMode === 'fast' ? '빠른 탐색: 인원 상한별 최대 3개 초기화 조합을 비교합니다. 상세 탐색보다 좋은 조합을 놓칠 수 있습니다.' :
        '초기화 조합 빔 탐색: 모든 1인 후보와 이후 단계별 최대 26개 후보(빔 폭 3)를 비교합니다.',
      '경로별 황크·보크 대체 비용을 최대 8개 비교합니다. 전체 노드 24개 이하에서는 배분 선택도 최대 12회 추가 탐색합니다. 그 이상은 단계별 탐욕 배분이며 전역 최적해나 최소 초기화 인원은 보장하지 않습니다.',
    ] };
    yield { limit: point.limit, plan: result, ...(point.pending ? { pending: true } : {}) };
  }
  return result!;
}

export function recommendHwangRedistribution(progressMap: Map<string, ApostleProgress>, options: RedistributionOptions): RedistributionPlan {
  let result: RedistributionPlan | undefined;
  for (const point of iterateHwangRedistribution(progressMap, options)) result = point.plan;
  return result!;
}
