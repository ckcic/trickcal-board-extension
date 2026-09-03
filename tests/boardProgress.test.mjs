/**
 * @file boardProgress.test.mjs
 * @description 보드 진행도 및 스탯별/성격별 진행도 계산 단위 테스트
 */

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  calculateAllApostlesProgress,
  calculateApostleProgress,
  getStatCategoryFromStatType,
  isBokrNode,
  isHwangNode,
} from '../src/domain/boardProgress.ts';
import { parseTrickcalApiPayload } from '../src/domain/dataParser.ts';
import {
  mockHeroInfo,
  mockMasterBoard,
  mockText,
  mockUserApostles,
} from './fixtures/sanitizedData.mjs';

describe('보크/황크 노드 판별 테스트', () => {
  test('requireItems에 610003(상급 크레파스)이 있는 경우 보크 노드로 판별한다', () => {
    const node = { id: 1, nodeType: 4, requireItems: [{ item: 610003, value: 3 }] };
    assert.equal(isBokrNode(node), true);
    assert.equal(isHwangNode(node), false);
  });

  test('requireItems에 610004(최상급 크레파스)이 있는 경우 황크 노드로 판별한다', () => {
    const node = { id: 2, nodeType: 5, requireItems: [{ item: 610004, value: 2 }] };
    assert.equal(isHwangNode(node), true);
    assert.equal(isBokrNode(node), false);
  });

  test('requireItems가 비어있어도 nodeType fallback으로 올바르게 판별한다', () => {
    assert.equal(isBokrNode({ id: 3, nodeType: 4 }), true);
    assert.equal(isHwangNode({ id: 4, nodeType: 5 }), true);
    assert.equal(isBokrNode({ id: 5, nodeType: 3 }), false);
  });
});

describe('스탯 카테고리 매핑 테스트', () => {
  test('statType에 따른 스탯 카테고리를 정확히 식별한다', () => {
    assert.equal(getStatCategoryFromStatType(1), 'hp');
    assert.equal(getStatCategoryFromStatType(94), 'hp');
    assert.equal(getStatCategoryFromStatType(86), 'atk_phys');
    assert.equal(getStatCategoryFromStatType(87), 'atk_mag');
    assert.equal(getStatCategoryFromStatType(90), 'def_phys');
    assert.equal(getStatCategoryFromStatType(91), 'def_mag');
    assert.equal(getStatCategoryFromStatType(7), 'crit');
    assert.equal(getStatCategoryFromStatType(96), 'crit');
    assert.equal(getStatCategoryFromStatType(8), 'crit_dmg'); // 일반칸 치피
    assert.equal(getStatCategoryFromStatType(100), 'crit_dmg'); // 치피
    assert.equal(getStatCategoryFromStatType(9), 'crit_res'); // 일반칸 치저
    assert.equal(getStatCategoryFromStatType(98), 'crit_res'); // 치저
    assert.equal(getStatCategoryFromStatType(10), 'crit_dmg_res');
    assert.equal(getStatCategoryFromStatType(102), 'crit_dmg_res');
  });
});

describe('사도별 보크 및 스탯별 진행도 계산 테스트', () => {
  test('3차까지 열리고 step 문자열이 짧은 사도(10001)의 진행도를 정확히 계산한다', () => {
    const progress = calculateApostleProgress(
      mockUserApostles[0],
      mockMasterBoard,
      mockHeroInfo,
      mockText
    );

    assert.equal(progress.apostleId, 10001);
    assert.equal(progress.name, '테스트사도A');
    assert.equal(progress.personality, 0); // 순수
    assert.equal(progress.gradeDefault, 3);
    assert.equal(progress.unlockedBoardCount, 3);

    // 1차: 보크 total 2, picked 1, remaining 1
    assert.equal(progress.boards[0].bokr.total, 2);
    assert.equal(progress.boards[0].bokr.picked, 1);
    assert.equal(progress.boards[0].bokr.remaining, 1);

    // 2차: 보크 total 4, picked 1, remaining 3
    assert.equal(progress.boards[1].bokr.total, 4);
    assert.equal(progress.boards[1].bokr.picked, 1);
    assert.equal(progress.boards[1].bokr.remaining, 3);

    // 3차: 보크 total 3, picked 1, remaining 2
    assert.equal(progress.boards[2].bokr.total, 3);
    assert.equal(progress.boards[2].bokr.picked, 1);
    assert.equal(progress.boards[2].bokr.remaining, 2);

    // 합계: total 9, picked 3, remaining 6
    assert.equal(progress.bokr.allTotal, 9);
    assert.equal(progress.bokr.unlockedTotal, 9);
    assert.equal(progress.bokr.picked, 3);
    assert.equal(progress.bokr.remainingUnlocked, 6);
    assert.equal(progress.bokr.isCompleted, false);
  });

  test('2차까지만 열린 사도(10002)는 3차가 미해금이므로 1~3차 전체 완료가 아니다', () => {
    const progress = calculateApostleProgress(
      mockUserApostles[1],
      mockMasterBoard,
      mockHeroInfo,
      mockText
    );

    assert.equal(progress.unlockedBoardCount, 2);
    assert.equal(progress.bokr.unlockedTotal, 4);
    assert.equal(progress.bokr.picked, 3);
    assert.equal(progress.bokr.allTotal, 5);
    assert.equal(progress.bokr.remainingAll, 2);
    assert.equal(progress.bokr.isCompleted, false);
  });

  test('1,2,3차 모든 보드의 보크를 획득해야 isCompleted가 true이다', () => {
    const completeApostle = {
      apostleId: 10003,
      boardSteps: [
        { step: '11' }, // 1차 2개 모두 획득
        { step: '1' },  // 2차 1개 모두 획득
        { step: '1' },  // 3차 1개 모두 획득
      ],
    };

    const progress = calculateApostleProgress(
      completeApostle,
      mockMasterBoard,
      mockHeroInfo,
      mockText
    );

    assert.equal(progress.unlockedBoardCount, 3);
    assert.equal(progress.bokr.allTotal, 4);
    assert.equal(progress.bokr.picked, 4);
    assert.equal(progress.bokr.remainingAll, 0);
    assert.equal(progress.bokr.isCompleted, true);
  });
});

describe('API 페이로드 파서 테스트', () => {
  test('올바른 API 페이로드를 정상 파싱한다', () => {
    const rawPayload = {
      user: { data: { apostle: { apostles: mockUserApostles } } },
      data: { data: { board: mockMasterBoard, heroInfo: mockHeroInfo, text: mockText } },
    };

    const parsed = parseTrickcalApiPayload(rawPayload);
    assert.notEqual(parsed, null);
    assert.equal(parsed.apostles.length, 3);

    const map = calculateAllApostlesProgress(parsed);
    assert.equal(map.has('테스트사도A'), true);
    assert.equal(map.has('10001'), true);
  });

  test('구조가 유효하지 않은 페이로드는 null을 반환한다', () => {
    assert.equal(parseTrickcalApiPayload(null), null);
    assert.equal(parseTrickcalApiPayload({ invalid: true }), null);
  });
});
