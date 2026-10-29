/** 황크·보크 재분배 베타: 초기화 조합별 단계 배분과 추천 계산. */
import { searchResetSets } from './redistributionSearch.ts';
import { createEmptyCostSummary } from './boardProgress.ts';
import { NODE_TYPE, STAT_CATEGORIES } from './constants.ts';
import { sumCosts } from './boardPathfinder.ts';
import { emptyStats, retained, hwang, refundCost, compare, getHwangTargetValue } from './redistributionModel.ts';
import { boardPathOptions, boardPaths, prepareNodes, prepareScopes } from './redistributionPaths.ts';
import type { ProgressMap, ResourceCostSummary } from './types.ts';
import type { HwangStats, RedistributionStat, RedistributionStage,
  RedistributionOptions, RedistributionNode, RedistributionAction, RedistributionPlan } from './redistributionTypes.ts';

/** 기존 공개 진입점의 함수와 타입 import 경로를 유지한다. */
export type { HwangStats, RedistributionStat, RedistributionTarget, RedistributionStage, RedistributionStageResult,
  RedistributionOptions, RedistributionNode, RedistributionAction, RedistributionPlan } from './redistributionTypes.ts';
export { createExampleRedistributionStages } from './redistributionStages.ts';
export { getHwangTargetValue, getSpentHwangCrayons, getSpentBokrCrayons, readHwangStats, readBokrValues } from './redistributionModel.ts';
export { createRedistributionGoalPreview, getAttackPathAvailability } from './redistributionPaths.ts';

function getGroupSelectionMask(group: RedistributionNode[], selected: Set<string>): string {
  let mask = '';
  for (let i = 0; i < group.length; i++) mask += selected.has(group[i]!.key) ? '1' : '0';
  return mask;
}

/** 이름과 ID 별칭을 중복 집계하지 않으며 입력 데이터를 변경하지 않는다. */
export function* iterateHwangRedistribution(progressMap: ProgressMap, options: RedistributionOptions, checkpoints = false): Generator<{ limit: number; plan: RedistributionPlan; pending?: boolean }, RedistributionPlan> {
  const stages: RedistributionStage[] = options.stages ?? (options.priorities || []).map(target => ({ targets: [{ ...target }], allowBlocked: true }));
  const validStat = (stat: RedistributionStat) => stat === 'attack' || STAT_CATEGORIES.includes(stat);
  if (!Number.isSafeInteger(options.ownedCrayons) || options.ownedCrayons < 0 ||
      (options.searchMode !== undefined && !['fast', 'thorough'].includes(options.searchMode)) ||
      (options.ownedBokr !== undefined && (!Number.isSafeInteger(options.ownedBokr) || options.ownedBokr < 0)) ||
      (options.ownedGold !== undefined && (!Number.isSafeInteger(options.ownedGold) || options.ownedGold < 0)) ||
      (options.ownedWateringCan !== undefined && (!Number.isSafeInteger(options.ownedWateringCan) || options.ownedWateringCan < 0)) ||
      (options.ownedClouds !== undefined && (!Number.isSafeInteger(options.ownedClouds) || options.ownedClouds < 0)) ||
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
  // 1명만 다른 초기화 조합 사이에서는 변하지 않은 보드 상태를 재사용한다.
  const pathCache = new Map<string, Map<string, string[][]>>();
  type Move = { path: string[]; cost: ResourceCostSummary; gain: HwangStats; score: number[] };
  const groupById = new Map(groups.filter(group => group.length).map(group => [group[0]!.apostleId, group]));
  // 후보 평가(run)마다 반복되던 전체 노드 스캔을 피하기 위한 사전 계산 값들
  const refundByApostle = new Map<number, ResourceCostSummary>();
  for (const [apostleId, group] of groupById) refundByApostle.set(apostleId, group.filter(entry => entry.picked && !retained(entry.node))
    .reduce((total, entry) => sumCosts(total, refundCost(entry)), createEmptyCostSummary()));
  const originalSelected = new Set(nodes.filter(entry => (entry.node.nodeType === NODE_TYPE.START && entry.boardIndex === 0) || entry.picked).map(entry => entry.key));
  const originalStageStats = stages.map((stage, stageIndex) => {
    const original = emptyStats();
    for (const entry of nodes) if (entry.picked && scopes[stageIndex]!.keys.has(entry.key)) for (const stat of STAT_CATEGORIES)
      original[stat] += (stage.resource === 'bokr' ? entry.bokrStats : entry.stats)[stat];
    return original;
  });
  const moveCache = new Map<string, Move[]>();
  let cachedMoveCount = 0;
  const stagePathsFor = (group: RedistributionNode[], reset: boolean, selected: Set<string>, allowBlocked: boolean, allowGates = false) => {
    const key = `${group[0]?.apostleId}/${reset}/${allowBlocked}/${allowGates}/${getGroupSelectionMask(group, selected)}`;
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
    // 원본 색칠 집합을 복사한 뒤 초기화 대상 사도의 지워지는 칸만 제거한다.
    const selected = new Set(originalSelected);
    let refund = createEmptyCostSummary();
    for (const apostleId of resetIds) {
      for (const entry of groupById.get(apostleId) || []) if (entry.picked && !retained(entry.node) &&
        !(entry.node.nodeType === NODE_TYPE.START && entry.boardIndex === 0)) selected.delete(entry.key);
      const apostleRefund = refundByApostle.get(apostleId);
      if (apostleRefund) refund = sumCosts(refund, apostleRefund);
    }
    const initial = new Set(selected);
    const paintOrder: string[] = [];
    const addPath = (path: string[]) => { for (const key of path) if (!selected.has(key)) { selected.add(key); paintOrder.push(key); } };
    // 초기화된 사도는 클린 슬레이트 상태(시작칸 + 해금 관문/꽃잎)에서 출발하며,
    // 목표 달성에 필요한 최소 연결 경로만 단계별로 새로 색칠한다.
    // 사용자가 명시적으로 restoreNormal을 요청한 경우에만 기존 일반칸을 강제 복구한다.
    if (options.restoreNormal) {
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
        const signature = `${stageIndex}/${apostleId}/${resetIds.has(apostleId)}/${getGroupSelectionMask(groupById.get(apostleId)!, selected)}`;
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
              const ec = entry.cost;
              cost.basicCrayon += ec.basicCrayon;
              cost.averageCrayon += ec.averageCrayon;
              cost.epicCrayon += ec.epicCrayon;
              cost.ultraCrayon += ec.ultraCrayon;
              cost.wateringCan = (cost.wateringCan || 0) + (ec.wateringCan || 0);
              cost.gold += ec.gold;
              if (scopeKeys.has(key)) {
                const m = metric(entry);
                for (const stat of STAT_CATEGORIES) gain[stat] += m[stat];
              }
            }
            entries.push({ path, cost, gain, score: [] });
          }
        }
        movesByApostle.set(apostleId, entries);
        // 초기화 조합 사이의 경로 비용·스탯 합계를 재사용하되 캐시 크기를 제한한다.
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
        // 선택 직후에만 바뀌는 현재 값·충족률은 이동 후보마다 다시 계산하지 않는다.
        const currentValues = stage.targets.map(target => getHwangTargetValue(scopedStats, target.stat));
        const currentRatios = currentValues.map((value, index) => goals[index]! > 0 ? value / goals[index]! : 1);
        const gains: number[] = new Array(stage.targets.length);
        // 분기 탐색이 없는 일반 경로(대형 계정)는 전체 정렬 없이 최고 점수 후보만 선형으로 고른다.
        const linear = !branches && choices[trace.length] === undefined;
        let top: Move | undefined;
        for (const entries of movesByApostle.values()) {
          for (const move of entries) {
            const { cost, gain } = move;
            const targetCost = bokr ? cost.epicCrayon : cost.ultraCrayon;
            if (targetCost <= 0 || cost.ultraCrayon > remaining || cost.epicCrayon > remainingBokr) continue;
            // 임시 객체 할당 없이 목표별 유효 증가량을 계산한다.
            let ratio = Infinity, usefulCount = 0;
            for (let index = 0; index < stage.targets.length; index++) {
              const stat = stage.targets[index]!.stat;
              const value = currentValues[index]!;
              const improvedValue = stat === 'attack'
                ? Math.min(scopedStats.atk_phys + gain.atk_phys, scopedStats.atk_mag + gain.atk_mag)
                : scopedStats[stat] + gain[stat];
              const effective = Math.min(Math.max(0, goals[index]! - value), improvedValue - value);
              gains[index] = effective;
              if (effective > 1e-8) { usefulCount++; if (currentRatios[index]! < ratio) ratio = currentRatios[index]!; }
            }
            if (!usefulCount) continue;
            // 같은 단계에서는 목표 대비 가장 덜 찬 스탯을 먼저 채운다.
            let efficiencyGain = 0;
            for (let index = 0; index < stage.targets.length; index++) {
              if (gains[index]! > 1e-8 && Math.abs(currentRatios[index]! - ratio) < 1e-8) efficiencyGain += gains[index]!;
            }
            const efficiency = efficiencyGain / targetCost;
            // 황크 단계에서는 보크 소모를 최대한 배제(-cost.epicCrayon 우선)하고, 보크 단계에서는 보크 효율을 우선한다.
            const score = bokr
              ? [-ratio, efficiency, -cost.ultraCrayon, -cost.epicCrayon]
              : [-ratio, -cost.epicCrayon, efficiency, -cost.ultraCrayon];
            move.score = score;
            // 안정 정렬의 첫 원소와 같도록, 동점이면 먼저 등장한 후보를 유지한다.
            if (linear) { if (!top || compare(score, top.score) > 0) top = move; }
            else moves.push(move);
          }
        }
        let best: Move | undefined;
        let unique: Move[] = moves;
        if (linear) {
          if (!top) break;
          best = top;
        } else {
          moves.sort((a, b) => -compare(a.score, b.score));
          unique = moves;
          if (!unique.length) break;
          best = unique[choices[trace.length] ?? 0];
        }
        const choice = choices[trace.length] ?? 0;
        if (!best) return null;
        // 앞부분 선택을 분기한 뒤 각 대안을 끝까지 배분하여 최종 결과를 비교한다.
        if (branches && trace.length >= choices.length && trace.length < 8) {
          for (let i = 1; i < Math.min(3, unique.length); i++) branches.push([...trace, i]);
        }
        trace.push(choice);
        addPath(best.path);
        const affected = groupById.get(byKey.get(best.path.at(-1)!)!.apostleId)!;
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
      // 원본 합계는 사전 계산값을 쓰고, 최종 합계는 전체 노드 대신 선택 집합만 순회한다.
      const original = originalStageStats[stageIndex]!, final = emptyStats();
      for (const key of selected) if (keys.has(key)) {
        const entry = byKey.get(key)!;
        const metric = stage.resource === 'bokr' ? entry.bokrStats : entry.stats;
        for (const stat of STAT_CATEGORIES) final[stat] += metric[stat];
      }
      return { resource: stage.resource, boardIndex: stage.boardIndex, boardThrough: stage.boardThrough, allowBlocked: stage.allowBlocked, allowGates: stage.allowGates, targets: stage.targets.map((target, index) => ({ stat: target.stat,
        target: goals[index]!, all: target.target === null, before: getHwangTargetValue(original, target.stat), after: getHwangTargetValue(final, target.stat) })) };
    });
    const actions: RedistributionAction[] = [];
    // paintOrder를 한 번만 순회해 사도별로 묶는다 (기존: 사도 수 × paintOrder 반복).
    const paintByApostle = new Map<number, RedistributionNode[]>();
    for (const key of paintOrder) {
      if (initial.has(key)) continue;
      const entry = byKey.get(key)!;
      const list = paintByApostle.get(entry.apostleId);
      if (list) list.push(entry); else paintByApostle.set(entry.apostleId, [entry]);
    }
    for (const apostle of apostles) {
      const paint = paintByApostle.get(apostle.apostleId) || [];
      const reset = resetIds.has(apostle.apostleId);
      if (!reset && !paint.length) continue;
      actions.push({ apostle, reset, paint, balance: 0,
        refund: reset ? { ...(refundByApostle.get(apostle.apostleId) || createEmptyCostSummary()) } : createEmptyCostSummary(),
        spend: paint.reduce((total, entry) => sumCosts(total, entry.cost), createEmptyCostSummary()) });
    }
    // 초기화를 모두 먼저 진행하면 도중의 황크 잔고 부족을 피할 수 있다.
    actions.sort((a, b) => (b.refund.ultraCrayon - b.spend.ultraCrayon) - (a.refund.ultraCrayon - a.spend.ultraCrayon) || a.apostle.apostleId - b.apostle.apostleId);
    let balance = options.ownedCrayons + refund.ultraCrayon;
    for (const action of actions) { balance -= action.spend.ultraCrayon; action.balance = balance; }
    const totalSpend = actions.reduce((total, action) => sumCosts(total, action.spend), createEmptyCostSummary());
    const remainingGold = options.ownedGold !== undefined
      ? options.ownedGold + refund.gold - totalSpend.gold
      : undefined;
    const totalOwnedCans = (options.ownedWateringCan ?? 0) + Math.floor((options.ownedClouds ?? 0) / 10);
    const remainingWateringCan = (options.ownedWateringCan !== undefined || options.ownedClouds !== undefined)
      ? totalOwnedCans - (totalSpend.wateringCan || 0)
      : undefined;
    return { before, after, remaining, remainingBokr, remainingGold, remainingWateringCan, refund, spend: totalSpend,
      resetCount: resetIds.size, actions, nodes, selected, notes: [], stageResults };
  }
  const objective = (plan: RedistributionPlan) => [...plan.stageResults!.flatMap(stage =>
    [...stage.targets.map(target => target.target > 0 ? Math.min(1, target.after / target.target) : 1).sort((a, b) => a - b), stage.targets.reduce((sum, target) => sum + Math.min(target.target, target.after), 0)]), -plan.resetCount, plan.remaining, plan.remainingBokr ?? 0];
  function evaluate(resetIds: Set<number>): RedistributionPlan | null {
    // 큰 보드는 탐욕 배분을 사용하고 작은 문제에만 제한된 분기 탐색을 적용한다.
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

export function recommendHwangRedistribution(progressMap: ProgressMap, options: RedistributionOptions): RedistributionPlan {
  let result: RedistributionPlan | undefined;
  for (const point of iterateHwangRedistribution(progressMap, options)) result = point.plan;
  return result!;
}
