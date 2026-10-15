/** 재분배 옵션·단계·노드·추천 결과의 공통 타입 */
import type { ApostleProgress, MasterBoardNode, ResourceCostSummary, StatCategory } from './types.ts';

export type HwangStats = Record<StatCategory, number>;
export type RedistributionStat = StatCategory | 'attack';
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
  /** 기존 일반칸 강제 복구 여부. 생략 시 false (최적화 모드: 목표 연결에 필요한 최소 일반칸만 색칠). */
  restoreNormal?: boolean;
  /** 소지 골드 (생략 시 소지량 고려 없이 필요량만 계산). */
  ownedGold?: number;
  /** 소지 만개 물뿌리개 (생략 시 0). */
  ownedWateringCan?: number;
  /** 소지 햇살구름 (10개당 만개 물뿌리개 1개 환산, 생략 시 0). */
  ownedClouds?: number;
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
  remainingGold?: number;
  remainingWateringCan?: number;
  refund: ResourceCostSummary;
  spend: ResourceCostSummary;
  resetCount: number;
  actions: RedistributionAction[];
  nodes: RedistributionNode[];
  selected: Set<string>;
  notes: string[];
  stageResults?: RedistributionStageResult[];
}
