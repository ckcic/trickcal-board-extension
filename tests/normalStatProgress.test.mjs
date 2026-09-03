/**
 * @file normalStatProgress.test.mjs
 * @description 일반칸(nodeType: 3)의 진행도 및 획득/미획득/총 스탯, 기본/강화 일반칸 분리 집계 및 재화 소모량 단위 테스트
 */

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { calculateApostleProgress, isLargeNormalNode } from '../src/domain/boardProgress.ts';
import { formatGold } from '../src/ui/boardEnhancer.ts';

describe('일반칸(nodeType 3)의 진행도 및 스탯 집계 테스트', () => {
  // 테스트용 목 데이터:
  // 1차 보드:
  // - 101: 기본 일반칸 (하급 크레파스 3개, 골드 5,000), 체력 +300
  // - 102: 강화 일반칸 (하급 9개, 중급 3개, 골드 10,000), 물공 +50
  // - 103: 상급칸 (하급 18개, 중급 6개, 상급 3개, 골드 30,000)
  // 2차 보드:
  // - 201: 강화 일반칸 (하급 18개, 중급 6개, 골드 20,000), 체력 +995
  const mockMasterBoard = {
    10001: {
      0: [
        {
          id: 101,
          nodeType: 3,
          stats: [{ statType: 1, statValue: 300 }],
          requireItems: [{ item: 610001, value: 3 }],
          requireGold: 5000,
        },
        {
          id: 102,
          nodeType: 3,
          stats: [{ statType: 86, statValue: 50 }],
          requireItems: [{ item: 610001, value: 9 }, { item: 610002, value: 3 }],
          requireGold: 10000,
        },
        {
          id: 103,
          nodeType: 4, // 보크칸
          stats: [{ statType: 1, statValue: 100 }],
          requireItems: [
            { item: 610001, value: 18 },
            { item: 610002, value: 6 },
            { item: 610003, value: 3 },
          ],
          requireGold: 30000,
        },
      ],
      1: [
        {
          id: 201,
          nodeType: 3,
          stats: [{ statType: 1, statValue: 995 }],
          requireItems: [{ item: 610001, value: 18 }, { item: 610002, value: 6 }],
          requireGold: 20000,
        },
      ],
    },
  };

  const mockHeroInfo = {
    10001: { name: '엘피', personality: 0, gradeDefault: 3 },
  };

  const mockText = {
    엘피: '엘피',
  };

  test('강화 일반칸(중급 크레파스 소모) 판별이 정상 동작한다', () => {
    assert.equal(isLargeNormalNode(mockMasterBoard[10001][0][0]), false);
    assert.equal(isLargeNormalNode(mockMasterBoard[10001][0][1]), true);
    assert.equal(isLargeNormalNode(mockMasterBoard[10001][1][0]), true);
  });

  test('기본/강화 일반칸 분리 집계 및 스탯 수치가 올바르게 계산된다', () => {
    const userApostle = {
      apostleId: 10001,
      // 1차 보드: 101번(기본) 획득('1'), 102번(강화) 미획득('0'), 103번(보크) 미획득('0')
      // 2차 보드: 201번(강화) 획득('1')
      boardSteps: [{ step: '100' }, { step: '1' }],
    };

    const progress = calculateApostleProgress(
      userApostle,
      mockMasterBoard,
      mockHeroInfo,
      mockText
    );

    // 1차 보드 일반칸 전체 및 기본/강화 검증
    const b0Normal = progress.boards[0].normal;
    assert.equal(b0Normal.totalNodes, 2);
    assert.equal(b0Normal.pickedNodes, 1);
    assert.equal(b0Normal.remainingNodes, 1);

    // 1차 보드 기본(소형) 일반칸 (총 1개 중 1개 획득)
    assert.equal(b0Normal.small.total, 1);
    assert.equal(b0Normal.small.picked, 1);
    assert.equal(b0Normal.small.remaining, 0);

    // 1차 보드 강화(대형) 일반칸 (총 1개 중 0개 획득, 1개 잔여)
    assert.equal(b0Normal.large.total, 1);
    assert.equal(b0Normal.large.picked, 0);
    assert.equal(b0Normal.large.remaining, 1);

    // 1차 보드 체력 스탯
    assert.equal(b0Normal.stats.hp.picked, 300);
    assert.equal(b0Normal.stats.hp.total, 300);
    assert.equal(b0Normal.stats.hp.smallPicked, 1);
    assert.equal(b0Normal.stats.hp.smallTotal, 1);
    assert.equal(b0Normal.stats.hp.largePicked, 0);
    assert.equal(b0Normal.stats.hp.largeTotal, 0);
    assert.equal(b0Normal.stats.hp.smallUnitValue, 300);

    // 2차 보드 일반칸 (강화 1개 중 1개 획득)
    const b1Normal = progress.boards[1].normal;
    assert.equal(b1Normal.small.total, 0);
    assert.equal(b1Normal.large.total, 1);
    assert.equal(b1Normal.large.picked, 1);
    assert.equal(b1Normal.large.remaining, 0);

    // 사도 전체 집계 (총 3개 중 기본 1개 획득/1개 총, 강화 1개 획득/2개 총)
    const allNormal = progress.normal;
    assert.equal(allNormal.totalNodes, 3);
    assert.equal(allNormal.pickedNodes, 2);
    assert.equal(allNormal.remainingNodes, 1);

    assert.equal(allNormal.small.total, 1);
    assert.equal(allNormal.small.picked, 1);
    assert.equal(allNormal.small.remaining, 0);

    assert.equal(allNormal.large.total, 2);
    assert.equal(allNormal.large.picked, 1);
    assert.equal(allNormal.large.remaining, 1);

    // 체력 스탯 (기본 300 획득 + 강화 995 획득 = 총 1,295)
    assert.equal(allNormal.stats.hp.picked, 1295);
    assert.equal(allNormal.stats.hp.total, 1295);
    assert.equal(allNormal.stats.hp.smallPicked, 1);
    assert.equal(allNormal.stats.hp.largePicked, 1);

    // 일반칸 소모 재화(크레파스 및 골드) 검증:
    // 1차 일반칸 잔여: 102번 노드 (하급 9개, 중급 3개, 골드 10,000)
    assert.equal(b0Normal.cost.remaining.basicCrayon, 9);
    assert.equal(b0Normal.cost.remaining.averageCrayon, 3);
    assert.equal(b0Normal.cost.remaining.gold, 10000);

    // 1차 일반칸 기소모(picked): 101번 노드 (하급 3개, 골드 5,000)
    assert.equal(b0Normal.cost.picked.basicCrayon, 3);
    assert.equal(b0Normal.cost.picked.averageCrayon, 0);
    assert.equal(b0Normal.cost.picked.gold, 5000);

    // 상급칸 소모 재화 검증:
    // 1차 상급칸 잔여: 103번 노드 (하급 18개, 중급 6개, 상급 3개, 골드 30,000)
    const b0Bokr = progress.boards[0].bokr;
    assert.equal(b0Bokr.cost.remaining.basicCrayon, 18);
    assert.equal(b0Bokr.cost.remaining.averageCrayon, 6);
    assert.equal(b0Bokr.cost.remaining.epicCrayon, 3);
    assert.equal(b0Bokr.cost.remaining.gold, 30000);
  });

  test('formatGold가 트릭컬 노트 스타일의 k 단위로 올바르게 포맷팅된다', () => {
    assert.equal(formatGold(0), '0k');
    assert.equal(formatGold(500), '500');
    assert.equal(formatGold(5000), '5k');
    assert.equal(formatGold(10000), '10k');
    assert.equal(formatGold(300000), '300k');
    assert.equal(formatGold(910000), '910k');
    assert.equal(formatGold(2560000), '2,560k');
  });
});
