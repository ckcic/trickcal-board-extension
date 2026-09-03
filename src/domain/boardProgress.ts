/**
 * @file boardProgress.ts
 * @description 사도의 보드 진행도(상급 크레파스/최상급 크레파스 노드) 및 스탯별/성격별/성급별 진행도를 계산하는 순수 함수 모음
 */

import type {
  ApostleProgress,
  BoardNodeProgress,
  BoardProgress,
  ExtractedApiData,
  MasterBoardNode,
  NormalBoardProgress,
  NormalStatDetail,
  PersonalityMeta,
  PersonalityType,
  ResourceCostSummary,
  StatCategory,
  StatCountSummary,
  StatMeta,
  UserApostle,
} from './types.ts';

/** 하급 크레파스 아이템 ID */
export const BASIC_CRAYON_ITEM_ID = 610001;

/** 중급 크레파스 아이템 ID */
export const MID_CRAYON_ITEM_ID = 610002;

/** 상급 크레파스 (보라 크레파스 / 보크) 아이템 ID */
export const BOKR_ITEM_ID = 610003;

/** 최상급 크레파스 (황금 크레파스 / 황크) 아이템 ID */
export const HWANG_ITEM_ID = 610004;

/** 스탯 카테고리 정의 목록 */
export const STAT_CATEGORIES: StatCategory[] = [
  'hp',
  'atk_phys',
  'atk_mag',
  'def_phys',
  'def_mag',
  'crit',
  'crit_dmg',
  'crit_res',
  'crit_dmg_res',
];

/** 스탯 메타데이터 정의 (spriteIndex: Stat.webp의 0~8번에 대응, valuePerNode: 보크 1칸당 증가 수치) */
export const STAT_META_LIST: StatMeta[] = [
  { key: 'hp', nameKo: '체력', iconChar: '💚', color: '#22c55e', spriteIndex: 0, valuePerNode: 199 },
  { key: 'atk_phys', nameKo: '물공', iconChar: '⚔️', color: '#f97316', spriteIndex: 1, valuePerNode: 13 },
  { key: 'atk_mag', nameKo: '마공', iconChar: '🪄', color: '#38bdf8', spriteIndex: 2, valuePerNode: 13 },
  { key: 'def_phys', nameKo: '물방', iconChar: '🛡️', color: '#fb923c', spriteIndex: 3, valuePerNode: 20 },
  { key: 'def_mag', nameKo: '마방', iconChar: '🔮', color: '#a855f7', spriteIndex: 4, valuePerNode: 20 },
  { key: 'crit', nameKo: '치명', iconChar: '💥', color: '#f43f5e', spriteIndex: 5, valuePerNode: 15 },
  { key: 'crit_dmg', nameKo: '치피', iconChar: '🔥', color: '#ef4444', spriteIndex: 6, valuePerNode: 15 },
  { key: 'crit_res', nameKo: '치저', iconChar: '🔰', color: '#06b6d4', spriteIndex: 7, valuePerNode: 15 },
  { key: 'crit_dmg_res', nameKo: '치피저', iconChar: '🧱', color: '#ec4899', spriteIndex: 8, valuePerNode: 15 },
];

/** 성격(Personality) 메타데이터 정의 (spriteIndex: Common_UnitPersonality.webp의 0~5번에 대응) */
export const PERSONALITY_META_LIST: PersonalityMeta[] = [
  { id: 0, nameKo: '순수', spriteIndex: 0 },
  { id: 1, nameKo: '냉정', spriteIndex: 1 },
  { id: 2, nameKo: '광기', spriteIndex: 2 },
  { id: 3, nameKo: '활발', spriteIndex: 3 },
  { id: 4, nameKo: '우울', spriteIndex: 4 },
  { id: 5, nameKo: '공명', spriteIndex: 5 },
];

/**
 * statType 수치로부터 스탯 카테고리를 특정
 * (8/98: 치저, 9/100: 치피)
 */
export function getStatCategoryFromStatType(statType: number): StatCategory | null {
  switch (statType) {
    case 1:
    case 94:
    case 95:
      return 'hp';
    case 3:
    case 86:
    case 88:
      return 'atk_phys';
    case 4:
    case 87:
    case 89:
      return 'atk_mag';
    case 5:
    case 90:
    case 92:
      return 'def_phys';
    case 6:
    case 91:
    case 93:
      return 'def_mag';
    case 7:
    case 96:
    case 97:
      return 'crit';
    case 8:
    case 100:
    case 101:
      return 'crit_dmg'; // 치명타 피해량 (치피)
    case 9:
    case 98:
    case 99:
      return 'crit_res'; // 치명타 저항 (치저)
    case 10:
    case 102:
    case 103:
      return 'crit_dmg_res'; // 치명타 피해 저항 (치피저)
    default:
      return null;
  }
}

/**
 * 노드에 포함된 스탯 카테고리 목록 추출
 */
export function getNodeStatCategories(node: MasterBoardNode): StatCategory[] {
  const result = new Set<StatCategory>();
  if (node.stats && Array.isArray(node.stats)) {
    for (const s of node.stats) {
      const cat = getStatCategoryFromStatType(s.statType);
      if (cat) {
        result.add(cat);
      }
    }
  }
  return Array.from(result);
}

/** 빈 스탯 카운트 맵 생성 */
export function createEmptyStatCountMap(): Record<StatCategory, StatCountSummary> {
  return {
    hp: { total: 0, picked: 0, remaining: 0 },
    atk_phys: { total: 0, picked: 0, remaining: 0 },
    atk_mag: { total: 0, picked: 0, remaining: 0 },
    def_phys: { total: 0, picked: 0, remaining: 0 },
    def_mag: { total: 0, picked: 0, remaining: 0 },
    crit: { total: 0, picked: 0, remaining: 0 },
    crit_dmg: { total: 0, picked: 0, remaining: 0 },
    crit_res: { total: 0, picked: 0, remaining: 0 },
    crit_dmg_res: { total: 0, picked: 0, remaining: 0 },
  };
}

/**
 * 빈 일반칸 스탯 수치 집계 맵 생성
 */
export function createEmptyNormalStatMap(): Record<StatCategory, NormalStatDetail> {
  return {
    hp: { picked: 0, remaining: 0, total: 0, smallPicked: 0, smallTotal: 0, largePicked: 0, largeTotal: 0, smallUnitValue: 0, largeUnitValue: 0 },
    atk_phys: { picked: 0, remaining: 0, total: 0, smallPicked: 0, smallTotal: 0, largePicked: 0, largeTotal: 0, smallUnitValue: 0, largeUnitValue: 0 },
    atk_mag: { picked: 0, remaining: 0, total: 0, smallPicked: 0, smallTotal: 0, largePicked: 0, largeTotal: 0, smallUnitValue: 0, largeUnitValue: 0 },
    def_phys: { picked: 0, remaining: 0, total: 0, smallPicked: 0, smallTotal: 0, largePicked: 0, largeTotal: 0, smallUnitValue: 0, largeUnitValue: 0 },
    def_mag: { picked: 0, remaining: 0, total: 0, smallPicked: 0, smallTotal: 0, largePicked: 0, largeTotal: 0, smallUnitValue: 0, largeUnitValue: 0 },
    crit: { picked: 0, remaining: 0, total: 0, smallPicked: 0, smallTotal: 0, largePicked: 0, largeTotal: 0, smallUnitValue: 0, largeUnitValue: 0 },
    crit_dmg: { picked: 0, remaining: 0, total: 0, smallPicked: 0, smallTotal: 0, largePicked: 0, largeTotal: 0, smallUnitValue: 0, largeUnitValue: 0 },
    crit_res: { picked: 0, remaining: 0, total: 0, smallPicked: 0, smallTotal: 0, largePicked: 0, largeTotal: 0, smallUnitValue: 0, largeUnitValue: 0 },
    crit_dmg_res: { picked: 0, remaining: 0, total: 0, smallPicked: 0, smallTotal: 0, largePicked: 0, largeTotal: 0, smallUnitValue: 0, largeUnitValue: 0 },
  };
}

/**
 * 빈 재화(크레파스 4종 및 골드) 소모량 요약 객체 생성
 */
export function createEmptyCostSummary(): ResourceCostSummary {
  return {
    basicCrayon: 0,
    averageCrayon: 0,
    epicCrayon: 0,
    ultraCrayon: 0,
    gold: 0,
  };
}

/**
 * 노드의 필요 재화(크레파스 및 골드)를 대상 누적 객체에 합산
 */
export function addNodeCost(target: ResourceCostSummary, node: MasterBoardNode): void {
  if (node.requireGold && typeof node.requireGold === 'number') {
    target.gold += node.requireGold;
  }
  if (node.requireItems && Array.isArray(node.requireItems)) {
    for (const it of node.requireItems) {
      if (it.item === BASIC_CRAYON_ITEM_ID) target.basicCrayon += (it.value || 0);
      else if (it.item === MID_CRAYON_ITEM_ID) target.averageCrayon += (it.value || 0);
      else if (it.item === BOKR_ITEM_ID) target.epicCrayon += (it.value || 0);
      else if (it.item === HWANG_ITEM_ID) target.ultraCrayon += (it.value || 0);
    }
  }
}

/**
 * 노드가 '강화 일반칸(대형, 중급 크레파스 610002 소모)'인지 판별
 */
export function isLargeNormalNode(node: MasterBoardNode): boolean {
  if (node.requireItems && Array.isArray(node.requireItems)) {
    return node.requireItems.some((item) => item.item === MID_CRAYON_ITEM_ID);
  }
  return false;
}

/**
 * 노드가 '보크(상급 크레파스)' 노드인지 판별
 */
export function isBokrNode(node: MasterBoardNode): boolean {
  if (node.requireItems && Array.isArray(node.requireItems)) {
    if (node.requireItems.some((item) => item.item === BOKR_ITEM_ID)) {
      return true;
    }
  }
  return node.nodeType === 4;
}

/**
 * 노드가 '황크(최상급 크레파스)' 노드인지 판별
 */
export function isHwangNode(node: MasterBoardNode): boolean {
  if (node.requireItems && Array.isArray(node.requireItems)) {
    if (node.requireItems.some((item) => item.item === HWANG_ITEM_ID)) {
      return true;
    }
  }
  return node.nodeType === 5;
}

/**
 * 텍스트 테이블을 참조하여 사도의 실제 이름을 가져옴
 */
export function resolveApostleName(
  apostleId: number,
  heroInfoMap: ExtractedApiData['heroInfo'],
  textMap: ExtractedApiData['text']
): string {
  const hero = heroInfoMap[apostleId] || heroInfoMap[String(apostleId)];
  if (!hero || !hero.name) {
    return `사도_${apostleId}`;
  }
  return textMap[hero.name] || hero.name;
}

/**
 * 단일 사도의 보드 진행도(1,2,3차 전체 기준 완료 여부 포함)를 계산
 */
export function calculateApostleProgress(
  userApostle: UserApostle,
  masterBoardMap: ExtractedApiData['board'],
  heroInfoMap: ExtractedApiData['heroInfo'],
  textMap: ExtractedApiData['text']
): ApostleProgress {
  const apostleId = Number(userApostle.apostleId ?? userApostle.id);
  const apostleName = resolveApostleName(apostleId, heroInfoMap, textMap);
  const heroMaster = heroInfoMap[apostleId] || heroInfoMap[String(apostleId)] || { personality: 0, gradeDefault: 3 };
  const personality = (heroMaster.personality ?? 0) as PersonalityType;
  const gradeDefault = heroMaster.gradeDefault ?? 3;

  const heroBoards = masterBoardMap[apostleId] || masterBoardMap[String(apostleId)] || {};
  const boardSteps = userApostle.boardSteps || [];

  const boardKeys = Object.keys(heroBoards).sort((a, b) => Number(a) - Number(b));

  let bokrAllTotal = 0;
  let bokrUnlockedTotal = 0;
  let bokrPicked = 0;

  let hwangAllTotal = 0;
  let hwangUnlockedTotal = 0;
  let hwangPicked = 0;

  const apostleBokrByStat = createEmptyStatCountMap();
  const apostleHwangByStat = createEmptyStatCountMap();

  // 일반칸(nodeType: 3)의 사도 전체 집계
  const apostleNormalStats = createEmptyNormalStatMap();
  let apostleNormalTotalNodes = 0;
  let apostleNormalPickedNodes = 0;
  let apostleNormalRemainingNodes = 0;
  const apostleNormalSmall = { total: 0, picked: 0, remaining: 0 };
  const apostleNormalLarge = { total: 0, picked: 0, remaining: 0 };

  // 재화(크레파스 4종 및 골드) 사도 전체 소모량 집계
  const apostleNormalCost = {
    total: createEmptyCostSummary(),
    picked: createEmptyCostSummary(),
    remaining: createEmptyCostSummary(),
  };
  const apostleBokrCost = {
    total: createEmptyCostSummary(),
    picked: createEmptyCostSummary(),
    remaining: createEmptyCostSummary(),
  };

  const boards: BoardProgress[] = [];

  boardKeys.forEach((bKey, stepIndex) => {
    const boardIndexNum = Number(bKey);
    const nodes = heroBoards[bKey] || [];
    const isUnlocked = stepIndex < boardSteps.length;
    const stepEntry = isUnlocked ? boardSteps[stepIndex] : null;
    const stepStr = stepEntry && typeof stepEntry.step === 'string' ? stepEntry.step : '';

    let bTotalBokr = 0;
    let bPickedBokr = 0;
    let bTotalHwang = 0;
    let bPickedHwang = 0;

    // 해당 보드의 일반칸 집계
    const boardNormalStats = createEmptyNormalStatMap();
    let bTotalNormal = 0;
    let bPickedNormal = 0;
    let bRemainingNormal = 0;
    const bNormalSmall = { total: 0, picked: 0, remaining: 0 };
    const bNormalLarge = { total: 0, picked: 0, remaining: 0 };

    // 해당 보드의 재화 소모량 집계
    const bNormalCost = {
      total: createEmptyCostSummary(),
      picked: createEmptyCostSummary(),
      remaining: createEmptyCostSummary(),
    };
    const bBokrCost = {
      total: createEmptyCostSummary(),
      picked: createEmptyCostSummary(),
      remaining: createEmptyCostSummary(),
    };

    const boardBokrByStat = createEmptyStatCountMap();
    const boardHwangByStat = createEmptyStatCountMap();
    const boardNodes: BoardNodeProgress[] = [];

    nodes.forEach((node, nodeIdx) => {
      const isPicked = isUnlocked && nodeIdx < stepStr.length && stepStr[nodeIdx] === '1';
      const nodeStatCategories = getNodeStatCategories(node);
      const isBokr = isBokrNode(node);
      const isHwang = isHwangNode(node);
      const isLargeNormal = node.nodeType === 3 && isLargeNormalNode(node);

      boardNodes.push({
        nodeId: node.id,
        nodeIndex: nodeIdx,
        nodeType: node.nodeType,
        isBokr,
        isHwang,
        isLargeNormal,
        isPicked,
        stats: nodeStatCategories,
      });

      if (isBokr) {
        bTotalBokr++;
        bokrAllTotal++;
        if (isUnlocked) {
          bokrUnlockedTotal++;
          if (isPicked) {
            bPickedBokr++;
            bokrPicked++;
          }
        }

        // 상급칸 재화 소모량 누적
        addNodeCost(bBokrCost.total, node);
        addNodeCost(apostleBokrCost.total, node);
        if (isPicked) {
          addNodeCost(bBokrCost.picked, node);
          addNodeCost(apostleBokrCost.picked, node);
        } else {
          addNodeCost(bBokrCost.remaining, node);
          addNodeCost(apostleBokrCost.remaining, node);
        }

        for (const cat of nodeStatCategories) {
          boardBokrByStat[cat].total++;
          apostleBokrByStat[cat].total++;
          if (isPicked) {
            boardBokrByStat[cat].picked++;
            apostleBokrByStat[cat].picked++;
          }
        }
      } else if (isHwang) {
        bTotalHwang++;
        hwangAllTotal++;
        if (isUnlocked) {
          hwangUnlockedTotal++;
          if (isPicked) {
            bPickedHwang++;
            hwangPicked++;
          }
        }

        for (const cat of nodeStatCategories) {
          boardHwangByStat[cat].total++;
          apostleHwangByStat[cat].total++;
          if (isPicked) {
            boardHwangByStat[cat].picked++;
            apostleHwangByStat[cat].picked++;
          }
        }
      } else if (node.nodeType === 3) {
        // 일반칸(nodeType: 3)의 칸 수 및 스탯 수치 집계 (기본/강화 구분)
        bTotalNormal++;
        apostleNormalTotalNodes++;

        if (isLargeNormal) {
          bNormalLarge.total++;
          apostleNormalLarge.total++;
          if (isPicked) {
            bNormalLarge.picked++;
            apostleNormalLarge.picked++;
          } else {
            bNormalLarge.remaining++;
            apostleNormalLarge.remaining++;
          }
        } else {
          bNormalSmall.total++;
          apostleNormalSmall.total++;
          if (isPicked) {
            bNormalSmall.picked++;
            apostleNormalSmall.picked++;
          } else {
            bNormalSmall.remaining++;
            apostleNormalSmall.remaining++;
          }
        }

        if (isPicked) {
          bPickedNormal++;
          apostleNormalPickedNodes++;
        } else {
          bRemainingNormal++;
          apostleNormalRemainingNodes++;
        }

        // 일반칸 재화 소모량 누적
        addNodeCost(bNormalCost.total, node);
        addNodeCost(apostleNormalCost.total, node);
        if (isPicked) {
          addNodeCost(bNormalCost.picked, node);
          addNodeCost(apostleNormalCost.picked, node);
        } else {
          addNodeCost(bNormalCost.remaining, node);
          addNodeCost(apostleNormalCost.remaining, node);
        }

        if (node.stats && Array.isArray(node.stats)) {
          for (const s of node.stats) {
            const cat = getStatCategoryFromStatType(s.statType);
            if (cat) {
              const val = Number(s.statValue) || 0;
              boardNormalStats[cat].total += val;
              apostleNormalStats[cat].total += val;

              if (isLargeNormal) {
                boardNormalStats[cat].largeTotal++;
                apostleNormalStats[cat].largeTotal++;
                boardNormalStats[cat].largeUnitValue = val;
                apostleNormalStats[cat].largeUnitValue = val;
              } else {
                boardNormalStats[cat].smallTotal++;
                apostleNormalStats[cat].smallTotal++;
                boardNormalStats[cat].smallUnitValue = val;
                apostleNormalStats[cat].smallUnitValue = val;
              }

              if (isPicked) {
                boardNormalStats[cat].picked += val;
                apostleNormalStats[cat].picked += val;
                if (isLargeNormal) {
                  boardNormalStats[cat].largePicked++;
                  apostleNormalStats[cat].largePicked++;
                } else {
                  boardNormalStats[cat].smallPicked++;
                  apostleNormalStats[cat].smallPicked++;
                }
              } else {
                boardNormalStats[cat].remaining += val;
                apostleNormalStats[cat].remaining += val;
              }
            }
          }
        }
      }
    });

    for (const cat of STAT_CATEGORIES) {
      boardBokrByStat[cat].remaining = Math.max(0, boardBokrByStat[cat].total - boardBokrByStat[cat].picked);
      boardHwangByStat[cat].remaining = Math.max(0, boardHwangByStat[cat].total - boardHwangByStat[cat].picked);
    }

    boards.push({
      boardIndex: boardIndexNum,
      boardStepLevel: stepIndex + 1,
      unlocked: isUnlocked,
      nodes: boardNodes,
      bokr: {
        total: bTotalBokr,
        picked: bPickedBokr,
        remaining: Math.max(0, bTotalBokr - bPickedBokr),
        byStat: boardBokrByStat,
        cost: bBokrCost,
      },
      hwang: {
        total: bTotalHwang,
        picked: bPickedHwang,
        remaining: Math.max(0, bTotalHwang - bPickedHwang),
        byStat: boardHwangByStat,
      },
      normal: {
        totalNodes: bTotalNormal,
        pickedNodes: bPickedNormal,
        remainingNodes: bRemainingNormal,
        small: bNormalSmall,
        large: bNormalLarge,
        stats: boardNormalStats,
        cost: bNormalCost,
      },
    });
  });

  for (const cat of STAT_CATEGORIES) {
    apostleBokrByStat[cat].remaining = Math.max(0, apostleBokrByStat[cat].total - apostleBokrByStat[cat].picked);
    apostleHwangByStat[cat].remaining = Math.max(0, apostleHwangByStat[cat].total - apostleHwangByStat[cat].picked);
  }

  const bokrRemainingUnlocked = Math.max(0, bokrUnlockedTotal - bokrPicked);
  const bokrRemainingAll = Math.max(0, bokrAllTotal - bokrPicked);
  const hwangRemainingUnlocked = Math.max(0, hwangUnlockedTotal - hwangPicked);
  const hwangRemainingAll = Math.max(0, hwangAllTotal - hwangPicked);

  // 1, 2, 3차 모든 보크를 다 칠해야 완료
  const isBokrAllCompleted = bokrAllTotal > 0 && bokrPicked === bokrAllTotal;
  const isHwangAllCompleted = hwangAllTotal > 0 && hwangPicked === hwangAllTotal;

  return {
    apostleId,
    name: apostleName,
    personality,
    gradeDefault,
    unlockedBoardCount: boardSteps.length,
    boards,
    bokr: {
      allTotal: bokrAllTotal,
      unlockedTotal: bokrUnlockedTotal,
      picked: bokrPicked,
      remainingUnlocked: bokrRemainingUnlocked,
      remainingAll: bokrRemainingAll,
      isCompleted: isBokrAllCompleted,
      byStat: apostleBokrByStat,
      cost: apostleBokrCost,
    },
    hwang: {
      allTotal: hwangAllTotal,
      unlockedTotal: hwangUnlockedTotal,
      picked: hwangPicked,
      remainingUnlocked: hwangRemainingUnlocked,
      remainingAll: hwangRemainingAll,
      isCompleted: isHwangAllCompleted,
      byStat: apostleHwangByStat,
    },
    normal: {
      totalNodes: apostleNormalTotalNodes,
      pickedNodes: apostleNormalPickedNodes,
      remainingNodes: apostleNormalRemainingNodes,
      small: apostleNormalSmall,
      large: apostleNormalLarge,
      stats: apostleNormalStats,
      cost: apostleNormalCost,
    },
  };
}

/**
 * 모든 사도의 진행도 맵을 구축
 */
export function calculateAllApostlesProgress(
  apiData: ExtractedApiData
): Map<string, ApostleProgress> {
  const result = new Map<string, ApostleProgress>();

  for (const apostle of apiData.apostles) {
    const progress = calculateApostleProgress(
      apostle,
      apiData.board,
      apiData.heroInfo,
      apiData.text
    );
    result.set(progress.name, progress);
    result.set(String(progress.apostleId), progress);
  }

  return result;
}
