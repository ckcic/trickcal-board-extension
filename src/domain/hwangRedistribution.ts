/** 황크·보크 재분배 베타: 초기화 조합별 단계 배분과 추천 계산. */
import { searchResetSets, FAST_SINGLETONS, FAST_PROPOSALS, THOROUGH_PROPOSALS } from './redistributionSearch.ts';
import { createEmptyCostSummary } from './boardProgress.ts';
import { DEFAULT_GROWTH_RATIOS, DEFAULT_RESOURCE_PRIORITY, DEFAULT_RESOURCE_WEIGHTS, NODE_TYPE, STAT_CATEGORIES, normalizeResourcePriority, type AuxiliaryResourceKey, type ResourceWeightConfig } from './constants.ts';
import { sumCosts } from './boardPathfinder.ts';
import { buildOptimalPaintOrder, optimizeApostleNormalTiles } from './boardSteiner.ts';
import { emptyStats, retained, hwang, refundCost, compare, getHwangTargetValue } from './redistributionModel.ts';
import { boardPathOptions, boardPaths, prepareNodes, prepareScopes } from './redistributionPaths.ts';
import type { ApostleProgress, ProgressMap, PromotionStep, ProofCostSummary, ResourceCostSummary } from './types.ts';
import type { HwangStats, RedistributionStat, RedistributionStage,
  RedistributionOptions, RedistributionNode, RedistributionAction, RedistributionPlan } from './redistributionTypes.ts';

/** 기존 공개 진입점의 함수와 타입 import 경로를 유지한다. */
export type { HwangStats, RedistributionStat, RedistributionTarget, RedistributionTargetMode, RedistributionCostMode, RedistributionStage, RedistributionStageResult,
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
      (options.costMode !== undefined && !['strict', 'weighted'].includes(options.costMode)) ||
      (options.resourcePriority !== undefined && (!Array.isArray(options.resourcePriority) || options.resourcePriority.some(k => !DEFAULT_RESOURCE_PRIORITY.includes(k as AuxiliaryResourceKey)))) ||
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
        (stage.resource === 'bokr' && stage.targets.some(target => target.stat === 'attack' || (target.target !== null && target.mode !== 'ratio' && !Number.isSafeInteger(target.target)))) ||
        (stage.boardIndex !== undefined && (stage.resource !== 'bokr' || ![0, 1, 2].includes(stage.boardIndex))) ||
        (stage.boardThrough !== undefined && (stage.resource !== 'bokr' || ![0, 1, 2].includes(stage.boardThrough) || stage.boardIndex !== undefined)) ||
        new Set(stage.targets.map(item => item.stat)).size !== stage.targets.length ||
        (stage.targets.some(item => item.stat === 'attack') && stage.targets.some(item => item.stat === 'atk_phys' || item.stat === 'atk_mag')) ||
        stage.targets.some(item => !validStat(item.stat) ||
          (item.mode !== undefined && !['value', 'all', 'ratio'].includes(item.mode)) ||
          (item.ratio !== undefined && (!Number.isFinite(item.ratio) || item.ratio <= 0 || item.ratio > 1000)) ||
          (item.target !== null && (!Number.isFinite(item.target) || item.target < 0 || item.target > 100000))))) {
    throw new Error('황크 보유량·초기화 인원·단계별 스탯 목표 입력을 확인해 주세요. 같은 단계의 스탯은 중복할 수 없습니다.');
  }
  const useWeightedCost = options.costMode === 'weighted';
  const priority = normalizeResourcePriority(options.resourcePriority);
  const [p0, p1, p2, p3] = priority as [AuxiliaryResourceKey, AuxiliaryResourceKey, AuxiliaryResourceKey, AuxiliaryResourceKey];
  const readAux = (cost: ResourceCostSummary, key: AuxiliaryResourceKey) => key === 'wateringCan' ? (cost.wateringCan || 0) : cost[key];
  const hasCustomPriority = options.resourcePriority !== undefined && priority.some((k, idx) => k !== DEFAULT_RESOURCE_PRIORITY[idx]);
  const normalPriority = priority.filter((k): k is 'averageCrayon' | 'basicCrayon' | 'gold' => k !== 'wateringCan');
  const weights: ResourceWeightConfig = { ...DEFAULT_RESOURCE_WEIGHTS, ...(options.resourceWeights || {}) };
  const { apostles, nodes, groups } = prepareNodes(progressMap, stages.some(stage => stage.allowGates));
  const scopes = prepareScopes(nodes, groups, stages);
  const byKey = new Map(nodes.map(entry => [entry.key, entry]));
  // 1명만 다른 초기화 조합 사이에서는 변하지 않은 보드 상태를 재사용한다.
  const pathCache = new Map<string, Map<string, string[][]>>();
  type Move = {
    path: string[];
    cost: ResourceCostSummary;
    proofCost: ProofCostSummary;
    gain: HwangStats;
    weightedValue: number;
    aux0: number;
    aux1: number;
    aux2: number;
    aux3: number;
    score: number[];
  };
  const groupById = new Map(groups.filter(group => group.length).map(group => [group[0]!.apostleId, group]));
  // 단계별 유효 후보 노드를 사도별로 사전 그룹화하여 후보 평가(run)마다 전체 노드를 재스캔하지 않는다.
  const stageCandidatesByApostle = stages.map((stage, stageIndex) => {
    const bokr = stage.resource === 'bokr';
    const scopeKeys = scopes[stageIndex]!.keys;
    const byApostle = new Map<number, RedistributionNode[]>();
    for (const entry of nodes) {
      if (!(bokr ? entry.node.nodeType === NODE_TYPE.BOKR : hwang(entry.node)) || !scopeKeys.has(entry.key)) continue;
      const m = bokr ? entry.bokrStats : entry.stats;
      if (!stage.targets.some(target => target.stat === 'attack' ? m.atk_phys > 0 || m.atk_mag > 0 : m[target.stat] > 0)) continue;
      const list = byApostle.get(entry.apostleId);
      if (list) list.push(entry);
      else byApostle.set(entry.apostleId, [entry]);
    }
    return byApostle;
  });
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
  const steinerCache = new Map<string, string>();
  const optimizeNormalsFor = (group: RedistributionNode[], reset: boolean, selected: Set<string>) => {
    if (!group.length) return;
    const mask = getGroupSelectionMask(group, selected);
    const cacheKey = `${group[0]!.apostleId}/${reset}/${Boolean(options.restoreNormal)}/${normalPriority.join(',')}/${mask}`;
    const cachedMask = steinerCache.get(cacheKey);
    if (cachedMask !== undefined) {
      if (cachedMask !== mask) {
        for (let i = 0; i < group.length; i++) {
          if (cachedMask[i] === '1') selected.add(group[i]!.key);
          else selected.delete(group[i]!.key);
        }
      }
      return;
    }
    optimizeApostleNormalTiles(group, reset, selected, Boolean(options.restoreNormal), normalPriority);
    const afterMask = getGroupSelectionMask(group, selected);
    if (steinerCache.size >= 2048) steinerCache.delete(steinerCache.keys().next().value!);
    steinerCache.set(cacheKey, afterMask);
  };
  const stagePathsFor = (group: RedistributionNode[], reset: boolean, selected: Set<string>, allowBlocked: boolean, allowGates = false) => {
    const key = `${group[0]?.apostleId}/${reset}/${allowBlocked}/${allowGates}/${hasCustomPriority ? priority.join(',') : 'default'}/${getGroupSelectionMask(group, selected)}`;
    const cached = pathCache.get(key);
    if (cached) { pathCache.delete(key); pathCache.set(key, cached); return cached; }
    const paths = boardPathOptions(group, reset, false, selected, allowBlocked, 8, allowGates, hasCustomPriority ? priority : undefined);
    if (pathCache.size >= 1024) pathCache.delete(pathCache.keys().next().value!);
    pathCache.set(key, paths); return paths;
  };
  const before = emptyStats();
  for (const entry of nodes.filter(item => item.picked)) for (const stat of STAT_CATEGORIES) before[stat] += entry.stats[stat];
  // 초기화 후보 순위: 목적함수는 단계 순서의 사전식 비교이므로, 아직 미달인 첫 단계까지의 스탯만 "보호"하고
  // 그 외 스탯의 황크·보크는 회수해 앞 단계에 재투자할 수 있는 낭비분으로 본다.
  // (이전 방식은 모든 단계 목표를 보호해 후순위 단계용 황크를 낭비로 보지 못하고, 동점 시 사도 ID 순으로만 정렬했다.)
  const firstUnmet = stages.findIndex((stage, stageIndex) => stage.targets.some((target, index) =>
    target.target === null || getHwangTargetValue(originalStageStats[stageIndex]!, target.stat) < scopes[stageIndex]!.goals[index]!));
  const protectedStages = stages.slice(0, firstUnmet < 0 ? stages.length : firstUnmet + 1).map((stage, stageIndex) => ({ stage, stageIndex }));
  const isProtected = (entry: RedistributionNode, resource: 'hwang' | 'bokr') => protectedStages.some(({ stage, stageIndex }) =>
    (stage.resource === 'bokr' ? 'bokr' : 'hwang') === resource && scopes[stageIndex]!.keys.has(entry.key) && stage.targets.some(target => {
      const metric = resource === 'bokr' ? entry.bokrStats : entry.stats;
      return target.stat === 'attack' ? metric.atk_phys > 0 || metric.atk_mag > 0 : metric[target.stat] > 0;
    }));
  const priorityResource = stages[firstUnmet < 0 ? 0 : firstUnmet]!.resource === 'bokr' ? 'bokr' : 'hwang';
  const ranking = apostles.map(apostle => {
    let wasteUltra = 0, wasteEpic = 0, refundUltra = 0, refundEpic = 0;
    for (const entry of groupById.get(apostle.apostleId) || []) {
      if (!entry.picked || retained(entry.node)) continue;
      refundUltra += entry.cost.ultraCrayon; refundEpic += entry.cost.epicCrayon;
      if (hwang(entry.node) && !isProtected(entry, 'hwang')) wasteUltra += entry.cost.ultraCrayon;
      if (entry.node.nodeType === NODE_TYPE.BOKR && !isProtected(entry, 'bokr')) wasteEpic += entry.cost.epicCrayon;
    }
    // 우선 단계 재화의 낭비분 → 다른 재화 낭비분 → 총 환급량 순으로 비교한다.
    const score = priorityResource === 'bokr' ? [wasteEpic, wasteUltra, refundEpic, refundUltra] : [wasteUltra, wasteEpic, refundUltra, refundEpic];
    return { apostle, score, refundable: refundUltra > 0 || refundEpic > 0 };
  }).filter(item => item.refundable).sort((a, b) => -compare(a.score, b.score) || a.apostle.apostleId - b.apostle.apostleId);

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
      const candidatesByApostle = stageCandidatesByApostle[stageIndex]!;
      const movesByApostle = new Map<number, Move[]>();
      const refreshMoves = (apostleId: number) => {
        const apostleGroup = groupById.get(apostleId);
        if (!apostleGroup) return;
        const isReset = resetIds.has(apostleId);
        const signature = `${stageIndex}/${apostleId}/${isReset}/${getGroupSelectionMask(apostleGroup, selected)}`;
        const cached = moveCache.get(signature);
        if (cached) {
          moveCache.delete(signature); moveCache.set(signature, cached);
          movesByApostle.set(apostleId, cached); return;
        }
        // 캐시 미스 시에만 해당 사도의 보드 경로를 계산하여 불필요한 전체 사도 경로 조회 및 Map 복사를 생략한다.
        const apostlePaths = stagePathsFor(apostleGroup, isReset, selected, stage.allowBlocked, stage.allowGates);
        const entries: Move[] = [];
        const seen = new Set<string>();
        for (const candidate of candidatesByApostle.get(apostleId) || []) {
          if (selected.has(candidate.key)) continue;
          for (const alternative of apostlePaths.get(candidate.key) || []) {
            const path = alternative.filter(key => !selected.has(key));
            const pathSig = path.join('|');
            if (seen.has(pathSig)) continue;
            seen.add(pathSig);
            const cost = createEmptyCostSummary(), gain = emptyStats();
            const proofCost: ProofCostSummary = { commonProof: 0, proof: 0, eldainProof: 0 };
            for (const key of path) {
              const entry = byKey.get(key)!;
              const ec = entry.cost;
              cost.basicCrayon += ec.basicCrayon;
              cost.averageCrayon += ec.averageCrayon;
              cost.epicCrayon += ec.epicCrayon;
              cost.ultraCrayon += ec.ultraCrayon;
              cost.wateringCan = (cost.wateringCan || 0) + (ec.wateringCan || 0);
              cost.gold += ec.gold;
              if (entry.gateProofs) {
                proofCost.commonProof += entry.gateProofs.commonProof;
                proofCost.proof += entry.gateProofs.proof;
                proofCost.eldainProof += entry.gateProofs.eldainProof;
              }
              if (scopeKeys.has(key)) {
                const m = metric(entry);
                for (const stat of STAT_CATEGORIES) gain[stat] += m[stat];
              }
            }
            const targetCost = Math.max(1, bokr ? cost.epicCrayon : cost.ultraCrayon);
            const weightedValue = useWeightedCost
              ? cost.ultraCrayon * weights.ultraCrayon +
                cost.epicCrayon * weights.epicCrayon +
                (cost.wateringCan || 0) * weights.wateringCan +
                cost.averageCrayon * weights.averageCrayon +
                cost.basicCrayon * weights.basicCrayon +
                (cost.gold / 10000) * weights.goldPer10k +
                proofCost.commonProof * weights.commonProof +
                proofCost.proof * weights.proof +
                proofCost.eldainProof * weights.eldainProof
              : 0;
            const scale = hasCustomPriority ? targetCost : 1;
            entries.push({
              path,
              cost,
              proofCost,
              gain,
              weightedValue,
              aux0: -readAux(cost, p0) / scale,
              aux1: -readAux(cost, p1) / scale,
              aux2: -readAux(cost, p2) / scale,
              aux3: -readAux(cost, p3) / scale,
              score: [],
            });
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
      for (const [id, apostleCandidates] of candidatesByApostle) {
        if (apostleCandidates.some(entry => !selected.has(entry.key))) refreshMoves(id);
      }
      const hasRatioTarget = stage.targets.some(t => t.mode === 'ratio' || (t.ratio !== undefined && t.ratio > 0));
      const maxRatioBaseline = hasRatioTarget
        ? Math.max(1, ...stage.targets.map((target, index) => {
            const r = target.mode === 'ratio' || (target.ratio !== undefined && target.ratio > 0)
              ? (target.ratio ?? DEFAULT_GROWTH_RATIOS[target.stat] ?? 1)
              : 0;
            return r > 0 ? goals[index]! / r : 0;
          }))
        : 1;
      while (true) {
        const moves: Move[] = [];
        // 선택 직후에만 바뀌는 현재 값·충족률은 이동 후보마다 다시 계산하지 않는다.
        const currentValues = stage.targets.map(target => getHwangTargetValue(scopedStats, target.stat));
        const currentRatios = currentValues.map((value, index) => {
          const target = stage.targets[index]!;
          if (target.mode === 'ratio' || (target.ratio !== undefined && target.ratio > 0)) {
            const r = Math.max(0.01, target.ratio ?? DEFAULT_GROWTH_RATIOS[target.stat] ?? 1);
            return (value / r) / maxRatioBaseline;
          }
          return goals[index]! > 0 ? value / goals[index]! : 1;
        });
        const gains: number[] = new Array(stage.targets.length);
        // 분기 탐색이 없는 일반 경로(대형 계정)는 전체 정렬 없이 최고 점수 후보만 선형으로 고른다.
        const linear = !branches && choices[trace.length] === undefined;
        let top: Move | undefined;
        for (const entries of movesByApostle.values()) {
          for (const move of entries) {
            const { cost, gain, weightedValue, aux0, aux1, aux2, aux3 } = move;
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
            let score: number[];
            if (useWeightedCost) {
              const weightedEff = efficiencyGain / Math.max(1e-8, weightedValue);
              score = bokr
                ? [-ratio, weightedEff, -weightedValue, -cost.ultraCrayon, -cost.epicCrayon, -move.path.length]
                : [-ratio, -cost.epicCrayon, weightedEff, -weightedValue, -cost.ultraCrayon, -move.path.length];
            } else {
              const efficiency = efficiencyGain / targetCost;
              if (hasCustomPriority) {
                score = bokr
                  ? [-ratio, efficiency, -cost.ultraCrayon, aux0, aux1, aux2, aux3, -cost.epicCrayon, -move.path.length]
                  : [-ratio, -cost.epicCrayon, efficiency, aux0, aux1, aux2, aux3, -cost.ultraCrayon, -move.path.length];
              } else {
                score = bokr
                  ? [-ratio, efficiency, -cost.ultraCrayon, -cost.epicCrayon, aux0, aux1, aux2, aux3, -move.path.length]
                  : [-ratio, -cost.epicCrayon, efficiency, -cost.ultraCrayon, aux0, aux1, aux2, aux3, -move.path.length];
              }
            }
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
        const affectedId = byKey.get(best.path.at(-1)!)!.apostleId;
        const affected = groupById.get(affectedId)!;
        optimizeNormalsFor(affected, resetIds.has(affectedId), selected);
        refreshMoves(affectedId);
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
      return {
        resource: stage.resource,
        boardIndex: stage.boardIndex,
        boardThrough: stage.boardThrough,
        allowBlocked: stage.allowBlocked,
        allowGates: stage.allowGates,
        targets: stage.targets.map((target, index) => ({
          stat: target.stat,
          target: goals[index]!,
          all: target.mode === 'all' || target.target === null,
          ...(target.mode ? { mode: target.mode } : {}),
          ...(target.ratio !== undefined ? { ratio: target.ratio } : {}),
          before: getHwangTargetValue(original, target.stat),
          after: getHwangTargetValue(final, target.stat),
        })),
      };
    });
    const actions: RedistributionAction[] = [];
    // paintOrder를 한 번만 순회해 사도별로 묶은 뒤, 슈타이너 트리 최적화 결과를 반영해 연결 순서를 확정한다.
    const paintByApostle = new Map<number, RedistributionNode[]>();
    for (const key of paintOrder) {
      if (initial.has(key)) continue;
      const entry = byKey.get(key)!;
      const list = paintByApostle.get(entry.apostleId);
      if (list) list.push(entry); else paintByApostle.set(entry.apostleId, [entry]);
    }
    for (const apostle of apostles) {
      const rawPaint = paintByApostle.get(apostle.apostleId) || [];
      const reset = resetIds.has(apostle.apostleId);
      if (!reset && !rawPaint.length) continue;
      const group = groupById.get(apostle.apostleId) || [];
      optimizeNormalsFor(group, reset, selected);
      const paint = buildOptimalPaintOrder(group, selected, initial, rawPaint);
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
    const proofSpend: ProofCostSummary = { commonProof: 0, proof: 0, eldainProof: 0 };
    const promotions: Array<{ apostle: ApostleProgress; steps: PromotionStep[] }> = [];
    for (const action of actions) {
      const apostleSteps: PromotionStep[] = [];
      for (const entry of action.paint) {
        if (entry.gateProofs) {
          proofSpend.commonProof += entry.gateProofs.commonProof;
          proofSpend.proof += entry.gateProofs.proof;
          proofSpend.eldainProof += entry.gateProofs.eldainProof;
        }
        if (entry.promotions) {
          apostleSteps.push(...entry.promotions);
        }
      }
      if (apostleSteps.length > 0) {
        promotions.push({ apostle: action.apostle, steps: apostleSteps });
      }
    }
    const remainingGold = options.ownedGold !== undefined
      ? options.ownedGold + refund.gold - totalSpend.gold
      : undefined;
    const totalOwnedCans = (options.ownedWateringCan ?? 0) + Math.floor((options.ownedClouds ?? 0) / 10);
    const remainingWateringCan = (options.ownedWateringCan !== undefined || options.ownedClouds !== undefined)
      ? totalOwnedCans - (totalSpend.wateringCan || 0)
      : undefined;
    return { before, after, remaining, remainingBokr, remainingGold, remainingWateringCan, refund, spend: totalSpend,
      ...(proofSpend.commonProof + proofSpend.proof + proofSpend.eldainProof > 0 ? { proofSpend } : {}),
      ...(promotions.length > 0 ? { promotions } : {}),
      resetCount: resetIds.size, actions, nodes, selected, notes: [], stageResults };
  }
  const planAuxScore = (plan: RedistributionPlan): number[] => {
    if (useWeightedCost) {
      const netSpend =
        (plan.spend.ultraCrayon - plan.refund.ultraCrayon) * weights.ultraCrayon +
        (plan.spend.epicCrayon - plan.refund.epicCrayon) * weights.epicCrayon +
        (plan.spend.wateringCan || 0) * weights.wateringCan +
        (plan.spend.averageCrayon - plan.refund.averageCrayon) * weights.averageCrayon +
        (plan.spend.basicCrayon - plan.refund.basicCrayon) * weights.basicCrayon +
        ((plan.spend.gold - plan.refund.gold) / 10000) * weights.goldPer10k +
        (plan.proofSpend?.commonProof || 0) * weights.commonProof +
        (plan.proofSpend?.proof || 0) * weights.proof +
        (plan.proofSpend?.eldainProof || 0) * weights.eldainProof;
      return [-netSpend];
    }
    if (!hasCustomPriority) return [];
    return priority.map(k => k === 'wateringCan' ? -(plan.spend.wateringCan || 0) : plan.refund[k] - plan.spend[k]);
  };
  const objective = (plan: RedistributionPlan) => [...plan.stageResults!.flatMap(stage =>
    [...stage.targets.map(target => target.target > 0 ? Math.min(1, target.after / target.target) : 1).sort((a, b) => a - b), stage.targets.reduce((sum, target) => sum + Math.min(target.target, target.after), 0)]), -plan.resetCount, plan.remaining, plan.remainingBokr ?? 0, ...planAuxScore(plan)];
  function evaluate(resetIds: Set<number>): RedistributionPlan | null {
    // 큰 보드는 탐욕 배분을 사용하고 작은 문제에만 제한된 분기 탐색을 적용한다.
    if (nodes.length > 24) return run(resetIds);
    const branches: number[][] = [];
    let best = run(resetIds, [], branches);
    if (!best) return null;
    let bestScore = objective(best);
    const queue = branches.map(choices => ({ choices, score: bestScore }));
    const seen = new Set<string>();
    for (let count = 0; count < 12 && queue.length; count++) {
      queue.sort((a, b) => -compare(a.score, b.score) || a.choices.length - b.choices.length);
      const { choices } = queue.shift()!;
      const next: number[][] = [];
      const plan = run(resetIds, choices, next);
      if (!plan) continue;
      const score = objective(plan);
      if (compare(score, bestScore) > 0) { best = plan; bestScore = score; }
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
      ranking.length <= 8 ? '초기화 후보 8명 이하: 인원 상한 내 모든 초기화 조합을 비교합니다.' : options.searchMode === 'fast' ? '빠른 탐색: 낭비 황크·보크 순위 상위 ' + FAST_SINGLETONS + '명을 1인 평가한 뒤, 인원 상한별 최대 ' + FAST_PROPOSALS + '개 조합을 비교합니다. 상세 탐색보다 좋은 조합을 놓칠 수 있습니다.' :
        '초기화 조합 빔 탐색: 빠른 탐색 경로를 포함하고, 모든 1인 후보를 평가해 실제 효과 순으로 재정렬한 뒤 단계별 최대 ' + THOROUGH_PROPOSALS + '개 조합(빔 폭 3)을 추가 비교합니다.',
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
