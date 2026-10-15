/** 시작 칸·관문·꽃잎 경로 탐색과 단계별 목표 범위 구성 */
import { createEmptyCostSummary } from './boardProgress.ts';
import { NODE_TYPE, STAT_CATEGORIES } from './constants.ts';
import { extractNodeCost, findLinkedPetalNode, getApostleBoardLayout, sumCosts } from './boardPathfinder.ts';
import { emptyStats, retained, hwang, compare, readHwangStats, readBokrCounts, getHwangTargetValue } from './redistributionModel.ts';
import type { ProgressMap } from './types.ts';
import type { RedistributionNode, RedistributionStage, RedistributionStat } from './redistributionTypes.ts';

/** 1차 시작 칸에서 연결한다. 열린 관문도 그곳까지의 색칠 경로를 건너뛸 수 없다. */
export function boardPathOptions(nodes: RedistributionNode[], reset: boolean, originalOnly = false, selected?: Set<string>, allowBlocked = true, maxLabels = 1, allowGates = false): Map<string, string[][]> {
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
        // 두 재화 비용의 양 극단을 보존하고 중간 후보를 고르게 선택한다.
        survivors = Array.from({ length: maxLabels }, (_, i) => survivors[Math.round(i * (survivors.length - 1) / (maxLabels - 1))]!);
      }
      labels.set(next.key, survivors);
      if (survivors.includes(label)) queue.push(label);
    }
  }
  return new Map([...labels].map(([key, values]) => [key, values.map(label => label.path)]));
}

export function boardPaths(nodes: RedistributionNode[], reset: boolean, originalOnly = false, selected?: Set<string>, allowBlocked = true) {
  return new Map([...boardPathOptions(nodes, reset, originalOnly, selected, allowBlocked)].map(([key, paths]) => [key, paths[0]!]));
}

export function prepareNodes(progressMap: ProgressMap, includeLocked = false) {
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

export function prepareScopes(nodes: RedistributionNode[], groups: RedistributionNode[][], stages: RedistributionStage[]) {
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
export function createRedistributionGoalPreview(progressMap: ProgressMap) {
  const { nodes, groups } = prepareNodes(progressMap, true);
  const cache = new Map<string, number>();
  return (stage: RedistributionStage, stat: RedistributionStat): number => {
    const key = [stage.resource, stage.boardIndex, stage.boardThrough, stage.allowBlocked, stage.allowGates, stat].join(':');
    if (!cache.has(key)) cache.set(key, prepareScopes(nodes, groups, [{ ...stage, targets: [{ stat, target: null }] }])[0]!.goals[0]!);
    return cache.get(key)!;
  };
}

/** 현재 관문과 모든 관문 개방 가정의 차이. 추천 예산·작업에는 가정을 적용하지 않는다. */
export function getAttackPathAvailability(progressMap: ProgressMap) {
  const preview = createRedistributionGoalPreview(progressMap);
  const opened = new Map([...progressMap].map(([key, apostle]) => [key, { ...apostle, boards: apostle.boards.map(board => ({
    ...board, unlocked: true, stepStr: (board.masterNodes || []).map((node, index) => node.nodeType === NODE_TYPE.GATE ? '1' : board.stepStr?.[index] || '0').join(''),
  })) }]));
  const potential = createRedistributionGoalPreview(opened);
  const value = (read: typeof preview, allowBlocked: boolean) => read({ allowBlocked, targets: [] }, 'attack');
  return { current: { unblocked: value(preview, false), all: value(preview, true) },
    opened: { unblocked: value(potential, false), all: value(potential, true) } };
}
