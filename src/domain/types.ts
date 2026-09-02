/**
 * @file types.ts
 * @description 트릭컬 노트의 사도 보드 및 스탯별/성격별/성급별 진행도 관련 타입 정의
 */

/** 스탯 카테고리 정의 */
export type StatCategory =
  | 'hp'           // 체력
  | 'atk_phys'    // 물리 공격력
  | 'atk_mag'     // 마법 공격력
  | 'def_phys'    // 물리 방어력
  | 'def_mag'     // 마법 방어력
  | 'crit'        // 치명타
  | 'crit_dmg'    // 치명타 피해량
  | 'crit_res'    // 치명타 저항
  | 'crit_dmg_res'; // 치명타 피해 저항

/** 성격(Personality) 정의 */
export type PersonalityType = 0 | 1 | 2 | 3 | 4 | 5;

/** 태생 성급 정의 (1성, 2성, 3성) */
export type GradeFilterTarget = 'all' | 1 | 2 | 3;

/** 성격 표시 메타 정보 */
export interface PersonalityMeta {
  id: PersonalityType;
  nameKo: string;
  spriteIndex: number;
}

/** 스탯 표시 메타 정보 */
export interface StatMeta {
  key: StatCategory;
  nameKo: string;
  iconChar: string;
  color: string;
  spriteIndex: number;
  valuePerNode: number; // 1칸당 증가 수치 (체력: 199, 물마공: 13, 물마방: 20, 치명/치피/치저/치피저: 15)
}

/** 보드 노드의 요구 아이템 정보 */
export interface RequireItem {
  item: number;
  value: number;
}

/** 보드 노드의 스탯 정보 */
export interface NodeStat {
  statType: number;
  statValue: number;
}

/** 보드 상의 단일 노드 정보 */
export interface MasterBoardNode {
  nodeType: number;
  id: number;
  grid?: { x: number; y: number };
  requireGold?: number;
  stats?: NodeStat[];
  requireItems?: RequireItem[];
}

/** 사도 마스터 정보 */
export interface HeroInfo {
  gradeDefault: number;
  specialGrade: number;
  attackType: number;
  rangeType: number;
  section: number;
  job: number;
  personality: number; // 0: 순수, 1: 냉정, 2: 광기, 3: 활발, 4: 우울, 5: 공명
  tribe: number;
  keyColor?: string;
  name: string;
  desc?: string;
  icon?: string;
  title?: string;
}

/** 유저 사도 데이터 내의 스텝 정보 */
export interface UserBoardStep {
  step: string;
}

/** 유저 사도 데이터 */
export interface UserApostle {
  apostleId?: number;
  id?: number;
  level?: number;
  rank?: number;
  grade?: number;
  boardSteps?: UserBoardStep[];
  [key: string]: unknown;
}

/** 원본 API 응답에서 추출하는 페이로드 구조 */
export interface ExtractedApiData {
  apostles: UserApostle[];
  board: Record<string, Record<string, MasterBoardNode[]>>;
  heroInfo: Record<string, HeroInfo>;
  text: Record<string, string>;
}

/** 스탯별 개수 카운트 */
export interface StatCountSummary {
  total: number;
  picked: number;
  remaining: number;
}

/** 개별 보드 노드 진행 상태 */
export interface BoardNodeProgress {
  nodeId: number;
  nodeIndex: number;
  nodeType: number;
  isBokr: boolean;
  isHwang: boolean;
  isPicked: boolean;
  stats: StatCategory[];
}

/** 단일 보드(1차/2차/3차) 진행도 집계 */
export interface BoardProgress {
  boardIndex: number;
  boardStepLevel: number;
  unlocked: boolean;
  nodes: BoardNodeProgress[];
  bokr: {
    total: number;
    picked: number;
    remaining: number;
    byStat: Record<StatCategory, StatCountSummary>;
  };
  hwang: {
    total: number;
    picked: number;
    remaining: number;
    byStat: Record<StatCategory, StatCountSummary>;
  };
}

/** 사도 전체 진행도 집계 */
export interface ApostleProgress {
  apostleId: number;
  name: string;
  personality: PersonalityType;
  gradeDefault: number; // 태생 성급 (1, 2, 3)
  unlockedBoardCount: number;
  boards: BoardProgress[];
  bokr: {
    allTotal: number;
    unlockedTotal: number;
    picked: number;
    remainingUnlocked: number;
    remainingAll: number; // 전체 1,2,3차 보크 중 남은 개수
    isCompleted: boolean; // 1,2,3차 모든 보크 획득 시 true
    byStat: Record<StatCategory, StatCountSummary>;
  };
  hwang: {
    allTotal: number;
    unlockedTotal: number;
    picked: number;
    remainingUnlocked: number;
    remainingAll: number;
    isCompleted: boolean;
    byStat: Record<StatCategory, StatCountSummary>;
  };
}

/** 사도 카드 정렬 옵션 (asc/desc 양방향 토글 지원) */
export type SortOption =
  | 'name_asc'          // 이름순 오름차순 (가나다순)
  | 'name_desc'         // 이름순 내림차순 (하파타순)
  | 'unlocked_desc'     // 보드 해금 많은 순 (3관 -> 1관)
  | 'unlocked_asc'      // 보드 해금 적은 순 (1관 -> 3관)
  | 'grade_desc'        // 초기 성급 높은 순 (3성 -> 1성)
  | 'grade_asc'         // 초기 성급 낮은 순 (1성 -> 3성)
  | 'personality_asc'   // 성격 순 (순수 -> 냉정 -> 광기 -> 활발 -> 우울 -> 공명)
  | 'personality_desc'; // 성격 역순 (공명 -> 우울 -> 활발 -> 광기 -> 냉정 -> 순수)

export type UnlockedTierFilter = 'all' | 1 | 2 | 3; // 사도별 해금된 보드 관문 (1차, 2차, 3차)

export interface FilterState {
  status: BokrFilterStatus;
  boardLevel: BoardFilterLevel;
  statCategory: StatFilterTarget;
  personality: PersonalityFilterTarget;
  grade: GradeFilterTarget;          // 초기 성급 필터 ('all' | 1 | 2 | 3)
  unlockedTier: UnlockedTierFilter;  // 해금 관문 필터 ('all' | 1 | 2 | 3)
  sortBy: SortOption;                // 정렬 옵션
}
