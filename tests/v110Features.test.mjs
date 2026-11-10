import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateGateAndPromotionExpense, findApostlePathToBokr, getApostleProofType } from '../src/domain/boardPathfinder.ts';
import { parseTrickcalApiPayload } from '../src/domain/dataParser.ts';
import { calculateAllApostlesProgress } from '../src/domain/boardProgress.ts';
import { DEFAULT_FILTER_STATE, matchesApostleFilter } from '../src/domain/filters.ts';
import { selectApostleIds } from '../src/domain/listSelection.ts';
import { aggregateBokrStats } from '../src/domain/statAggregates.ts';
import { recommendHwangRedistribution } from '../src/domain/hwangRedistribution.ts';
import { exportRedistributionPreset, parseRedistributionPreset } from '../src/domain/redistributionPreset.ts';
import { parseRedistributionSettings } from '../src/ui/redistribution/redistributionSettings.ts';
import { renderBokrPathCost } from '../src/ui/board/bokrModal.ts';
import { renderRedistributionResult } from '../src/ui/redistribution/redistributionResult.ts';

test('사도 증명서 분류는 1성 공동 증명서, 엘다인 증명서, 일반 사도 증명서를 구분한다', () => {
  assert.equal(getApostleProofType({ gradeDefault: 1, isEldain: false }), 'commonProof');
  assert.equal(getApostleProofType({ gradeDefault: 3, isEldain: true }), 'eldainProof');
  assert.equal(getApostleProofType({ gradeDefault: 3, isEldain: false }), 'proof');
  assert.equal(getApostleProofType({ gradeDefault: 2, isEldain: false }), 'proof');
});

test('관문 개방 및 성급 승급 비용 계산은 1·2번 관문 수수료와 부족 성급 승급 비용을 정확히 합산한다', () => {
  // 2성 보유 사도가 1번 관문(2차 보드=3성 필요)을 열 때: 관문 50만 골드 + 공동 증명서 5개, 2→3성 승급 10만 골드 + 사도 증명서 20개
  const gate1 = calculateGateAndPromotionExpense({ gradeDefault: 2, grade: 2, isEldain: false }, 0);
  assert.equal(gate1.opensBoardLevel, 2);
  assert.equal(gate1.gateGold, 500000);
  assert.equal(gate1.promotionGold, 100000);
  assert.deepEqual(gate1.proofCost, { commonProof: 5, proof: 20, eldainProof: 0 });
  assert.equal(gate1.promotions.length, 1);
  assert.deepEqual(gate1.promotions[0], { fromGrade: 2, toGrade: 3, gold: 100000, proofType: 'proof', proofCount: 20 });

  // 엘다인 3성 보유 사도가 2번 관문(3차 보드=4성 필요)을 열 때: 관문 100만 골드 + 엘다인 증명서 5개, 3→4성 승급 20만 골드 + 엘다인 증명서 25개
  const gate2 = calculateGateAndPromotionExpense({ gradeDefault: 3, grade: 3, isEldain: true }, 1);
  assert.equal(gate2.opensBoardLevel, 3);
  assert.equal(gate2.gateGold, 1000000);
  assert.equal(gate2.promotionGold, 200000);
  assert.deepEqual(gate2.proofCost, { commonProof: 0, proof: 0, eldainProof: 30 });
});

test('보크 경로 탐색과 모달 렌더링은 미개방 관문 통과 시 성급 승급 비용과 증명서를 반영한다', () => {
  const progress = {
    apostleId: 1,
    name: '가명사도',
    personality: 0,
    gradeDefault: 2,
    grade: 2,
    isEldain: false,
    unlockedBoardCount: 1,
    boards: [
      {
        boardStepLevel: 1,
        unlocked: true,
        stepStr: '10',
        masterNodes: [
          { id: 101, nodeType: 2, grid: { x: 1, y: 1 } },
          { id: 102, nodeType: 1, grid: { x: 1, y: 2 } },
        ],
      },
      {
        boardStepLevel: 2,
        unlocked: false,
        stepStr: '0',
        masterNodes: [
          { id: 201, nodeType: 4, grid: { x: 1, y: 1 }, requireGold: 30000, requireItems: [{ item: 610003, value: 3 }], stats: [{ statType: 1, statValue: 100 }] },
        ],
      },
    ],
  };

  const pathResult = findApostlePathToBokr(progress, 1, 201);
  assert.ok(pathResult);
  // 관문 기본 골드(500,000) + 2→3성 승급 골드(100,000) = 600,000
  assert.equal(pathResult.pathCost.gold, 600000);
  assert.equal(pathResult.totalCost.gold, 630000);
  assert.equal(pathResult.gateOpenDetails?.length, 1);

  const html = renderBokrPathCost(pathResult);
  assert.match(html, /1번 관문 오픈 필요/);
  assert.match(html, /★1 공동 교단 증명서 5개/);
  assert.match(html, /★2→★3 승급 필요/);
});

test('재분배 시뮬레이터는 관문 개방 허용 시 관문 수수료·승급 골드·증명서 합계를 결과에 집계한다', () => {
  const apostle = {
    apostleId: 10,
    name: '승급대상사도',
    personality: 0,
    gradeDefault: 2,
    grade: 2,
    isEldain: false,
    isOwned: true,
    unlockedBoardCount: 1,
    boards: [
      {
        boardStepLevel: 1,
        unlocked: true,
        stepStr: '10',
        masterNodes: [
          { id: 101, nodeType: 2, grid: { x: 1, y: 1 } },
          { id: 102, nodeType: 1, grid: { x: 1, y: 2 } },
        ],
      },
      {
        boardStepLevel: 2,
        unlocked: false,
        stepStr: '0',
        masterNodes: [
          { id: 201, nodeType: 5, grid: { x: 1, y: 1 }, requireGold: 50000, requireItems: [{ item: 610004, value: 2 }], stats: [{ statType: 88, statValue: 60 }, { statType: 89, statValue: 60 }] },
        ],
      },
    ],
  };
  const map = new Map([[apostle.name, apostle], [String(apostle.apostleId), apostle]]);
  const options = {
    ownedCrayons: 4,
    maxReset: 0,
    stages: [{ allowBlocked: true, allowGates: true, targets: [{ stat: 'attack', target: null }] }],
  };
  const plan = recommendHwangRedistribution(map, options);
  // 관문 50만 + 승급 10만 + 황크 5만 = 65만 골드
  assert.equal(plan.spend.gold, 650000);
  assert.deepEqual(plan.proofSpend, { commonProof: 5, proof: 20, eldainProof: 0 });
  assert.equal(plan.promotions?.length, 1);

  const html = renderRedistributionResult(plan, options);
  assert.match(html, /관문·성급 승급 증명서 합계/);
  assert.match(html, /성급 승급 대상 \(1명\)/);
  assert.match(html, /★2→★3/);
});

test('즐겨찾기·엘다인·종족 필터 및 즐겨찾기·종족 정렬이 정상 동작한다', () => {
  const raw = {
    apostles: [
      { apostleId: 1, grade: 3, isFavorite: false, boardSteps: [{ step: '1' }] },
      { apostleId: 2, grade: 4, isFavorite: true, boardSteps: [{ step: '1' }] },
    ],
    board: {
      '1': { '0': [{ id: 1, nodeType: 4, grid: { x: 1, y: 1 }, requireItems: [{ item: 610003, value: 2 }], stats: [{ statType: 1, statValue: 100 }] }] },
      '2': { '0': [{ id: 1, nodeType: 4, grid: { x: 1, y: 1 }, requireItems: [{ item: 610003, value: 2 }], stats: [{ statType: 1, statValue: 100 }] }] },
    },
    heroInfo: {
      '1': { name: 'NAME_1', personality: 0, tribe: 5, gradeDefault: 3, heroGroup: '' },
      '2': { name: 'NAME_2', personality: 1, tribe: 1, gradeDefault: 3, heroGroup: 'GROUP_ELDAIN' },
    },
    text: {
      NAME_1: '일반사도',
      NAME_2: '엘다인사도',
      GROUP_ELDAIN: '영원살이',
    },
  };
  const parsed = parseTrickcalApiPayload(raw);
  assert.ok(parsed);
  const map = calculateAllApostlesProgress(parsed);
  const a1 = map.get('1');
  const a2 = map.get('2');
  assert.equal(a1.isFavorite, false);
  assert.equal(a1.isEldain, false);
  assert.equal(a1.tribe, 5);
  assert.equal(a2.isFavorite, true);
  assert.equal(a2.isEldain, true);
  assert.equal(a2.tribe, 1);

  assert.equal(matchesApostleFilter(a1, { ...DEFAULT_FILTER_STATE, special: 'favorite' }), false);
  assert.equal(matchesApostleFilter(a2, { ...DEFAULT_FILTER_STATE, special: 'favorite' }), true);
  assert.equal(matchesApostleFilter(a1, { ...DEFAULT_FILTER_STATE, special: 'eldain' }), false);
  assert.equal(matchesApostleFilter(a2, { ...DEFAULT_FILTER_STATE, special: 'eldain' }), true);
  assert.equal(matchesApostleFilter(a1, { ...DEFAULT_FILTER_STATE, tribe: 5 }), true);
  assert.equal(matchesApostleFilter(a2, { ...DEFAULT_FILTER_STATE, tribe: 5 }), false);

  const favAgg = aggregateBokrStats(map, { ...DEFAULT_FILTER_STATE, special: 'favorite' });
  assert.equal(favAgg.hp.total, 1);
  const tribeAgg = aggregateBokrStats(map, { ...DEFAULT_FILTER_STATE, tribe: 1 });
  assert.equal(tribeAgg.hp.total, 1);

  assert.deepEqual(selectApostleIds(map, { ...DEFAULT_FILTER_STATE, sortBy: 'favorite_desc' }), [2, 1]);
  assert.deepEqual(selectApostleIds(map, { ...DEFAULT_FILTER_STATE, sortBy: 'favorite_asc' }), [1, 2]);
  assert.deepEqual(selectApostleIds(map, { ...DEFAULT_FILTER_STATE, sortBy: 'tribe_asc' }), [2, 1]);
  assert.deepEqual(selectApostleIds(map, { ...DEFAULT_FILTER_STATE, sortBy: 'tribe_desc' }), [1, 2]);
});

test('재분배 비율 배분(ratio) 모드와 재화 가치 환산(weighted) 모드가 정상 동작하고 프리셋에 보존된다', () => {
  const stages = [
    {
      allowBlocked: true,
      targets: [
        { stat: 'attack', target: null, mode: 'ratio', ratio: 1.5 },
        { stat: 'hp', target: null, mode: 'ratio', ratio: 1.0 },
      ],
    },
  ];
  const exported = exportRedistributionPreset(stages);
  const imported = parseRedistributionPreset(exported);
  assert.deepEqual(imported, stages);

  const apostle = {
    apostleId: 1,
    name: '비율테스트사도',
    personality: 0,
    gradeDefault: 3,
    isOwned: true,
    unlockedBoardCount: 1,
    boards: [
      {
        boardStepLevel: 1,
        unlocked: true,
        stepStr: '100',
        masterNodes: [
          { id: 101, nodeType: 2, grid: { x: 1, y: 1 } },
          { id: 102, nodeType: 5, grid: { x: 1, y: 2 }, requireGold: 10000, requireItems: [{ item: 610004, value: 2 }], stats: [{ statType: 88, statValue: 60 }, { statType: 89, statValue: 60 }] },
          { id: 103, nodeType: 5, grid: { x: 2, y: 1 }, requireGold: 10000, requireItems: [{ item: 610004, value: 2 }], stats: [{ statType: 95, statValue: 80 }] },
        ],
      },
    ],
  };
  const map = new Map([[apostle.name, apostle], [String(apostle.apostleId), apostle]]);
  const plan = recommendHwangRedistribution(map, {
    ownedCrayons: 4,
    maxReset: 0,
    costMode: 'weighted',
    resourceWeights: { ultraCrayon: 400, goldPer10k: 2 },
    stages,
  });
  assert.equal(plan.spend.ultraCrayon, 4);
  assert.equal(plan.stageResults?.[0]?.targets[0]?.mode, 'ratio');
  assert.equal(plan.stageResults?.[0]?.targets[0]?.ratio, 1.5);
});

test('재화별 엄격 우선순위(strict) 모드에서 보조 재화 우선순위 순서(resourcePriority) 변경 시 경로 선택과 설정 저장에 반영된다', () => {
  // 시작점(1,1)에서 목표 황크(2,2)로 가는 두 일반칸 우회로:
  // A경로(1,2): 하급 크레파스 2개 + 골드 50,000
  // B경로(2,1): 중급 크레파스 1개 + 골드 1,000
  const apostle = {
    apostleId: 1,
    name: '우선순위테스트사도',
    personality: 0,
    gradeDefault: 3,
    isOwned: true,
    unlockedBoardCount: 1,
    boards: [
      {
        boardStepLevel: 1,
        unlocked: true,
        stepStr: '1000',
        masterNodes: [
          { id: 101, nodeType: 2, grid: { x: 1, y: 1 } },
          { id: 102, nodeType: 3, grid: { x: 1, y: 2 }, requireGold: 50000, requireItems: [{ item: 610001, value: 2 }], stats: [{ statType: 1, statValue: 50 }] },
          { id: 103, nodeType: 3, grid: { x: 2, y: 1 }, requireGold: 1000, requireItems: [{ item: 610002, value: 1 }], stats: [{ statType: 1, statValue: 50 }] },
          { id: 104, nodeType: 5, grid: { x: 2, y: 2 }, requireGold: 10000, requireItems: [{ item: 610004, value: 2 }], stats: [{ statType: 88, statValue: 60 }, { statType: 89, statValue: 60 }] },
        ],
      },
    ],
  };
  const map = new Map([[apostle.name, apostle], [String(apostle.apostleId), apostle]]);
  const stages = [{ allowBlocked: true, targets: [{ stat: 'attack', target: null }] }];

  // 1) 기본 우선순위(중크 절약 > 하크 절약 > 골드 절약): 중크 0개인 A경로(102) 선택
  const defaultPlan = recommendHwangRedistribution(map, {
    ownedCrayons: 2,
    maxReset: 0,
    costMode: 'strict',
    stages,
  });
  assert.equal(defaultPlan.spend.averageCrayon, 0);
  assert.equal(defaultPlan.spend.basicCrayon, 2);
  assert.equal(defaultPlan.spend.gold, 60000);

  // 2) 골드를 1순위로 변경(['gold', 'wateringCan', 'averageCrayon', 'basicCrayon']): 골드가 1,000인 B경로(103) 선택
  const goldFirstPlan = recommendHwangRedistribution(map, {
    ownedCrayons: 2,
    maxReset: 0,
    costMode: 'strict',
    resourcePriority: ['gold', 'wateringCan', 'averageCrayon', 'basicCrayon'],
    stages,
  });
  assert.equal(goldFirstPlan.spend.averageCrayon, 1);
  assert.equal(goldFirstPlan.spend.basicCrayon, 0);
  assert.equal(goldFirstPlan.spend.gold, 11000);

  // 3) 설정 직렬화/파싱 검증
  const parsedSettings = parseRedistributionSettings(JSON.stringify({
    owned: 2,
    bokr: 0,
    reset: 0,
    searchMode: 'fast',
    costMode: 'strict',
    resourcePriority: ['gold', 'basicCrayon', 'averageCrayon', 'wateringCan'],
    stages,
  }));
  assert.deepEqual(parsedSettings?.resourcePriority, ['gold', 'basicCrayon', 'averageCrayon', 'wateringCan']);
});
