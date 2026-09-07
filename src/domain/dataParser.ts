/**
 * @file dataParser.ts
 * @description API 응답으로부터 필요한 사도/보드/마스터 데이터를 추출 및 검증하는 파서
 */

import type { ExtractedApiData, HeroInfo, MasterBoardNode, UserApostle } from './types.ts';

/** 외부 응답의 배열과 객체, 숫자를 구분하여 계산 중 예외를 차단한다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function isNode(value: unknown): boolean {
  if (!isRecord(value) || !isNumber(value.id) || !isNumber(value.nodeType)) return false;
  if (value.requireGold !== undefined && !isNumber(value.requireGold)) return false;
  if (value.stats !== undefined && (!Array.isArray(value.stats) || !value.stats.every(
    stat => isRecord(stat) && isNumber(stat.statType) && isNumber(stat.statValue)))) return false;
  return value.requireItems === undefined || (Array.isArray(value.requireItems) && value.requireItems.every(
    item => isRecord(item) && isNumber(item.item) && isNumber(item.value)));
}

/**
 * 객체가 트릭컬 노트의 보드 데이터 구조를 충족하는지 검증
 * @param data 검증 대상 객체
 * @returns 추출된 데이터 또는 유효하지 않을 경우 null
 */
export function parseTrickcalApiPayload(data: unknown): ExtractedApiData | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const raw = data as Record<string, unknown>;

  // payload로 감싸져 있는 경우와 루트에 직접 배치된 경우 모두 대응
  const payloadVal = raw.payload;
  const root = (payloadVal && typeof payloadVal === 'object' ? payloadVal : raw) as Record<string, unknown>;

  // unknown 타입의 깊은 속성 접근 헬퍼
  const dig = (base: unknown, ...keys: string[]): unknown => {
    let current: unknown = base;
    for (const key of keys) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  };

  // 1. 사도 유저 데이터 탐색
  const apostles = (
    dig(root, 'user', 'data', 'apostle', 'apostles') ||
    dig(root, 'apostle', 'apostles') ||
    dig(root, 'apostles')
  ) as UserApostle[] | undefined;

  // 2. 보드 마스터 데이터 탐색
  const board = (
    dig(root, 'data', 'data', 'board') ||
    dig(root, 'board')
  ) as Record<string, Record<string, MasterBoardNode[]>> | undefined;

  // 3. 사도 마스터 정보(heroInfo) 탐색
  const heroInfo = (
    dig(root, 'data', 'data', 'heroInfo') ||
    dig(root, 'heroInfo')
  ) as Record<string, HeroInfo> | undefined;

  // 4. 텍스트 사전 탐색
  const text = (
    dig(root, 'data', 'data', 'text') ||
    dig(root, 'text')
  ) as Record<string, string> | undefined;

  // 필수 요소 존재 확인
  if (
    !Array.isArray(apostles) ||
    !board ||
    !isRecord(board) ||
    !heroInfo ||
    !isRecord(heroInfo) ||
    !text ||
    !isRecord(text)
  ) {
    return null;
  }

  // 필요한 중첩 구조도 검증하여 잘못된 응답이 기존 진행도를 덮어쓰지 않게 한다.
  if (!apostles.every(apostle => isRecord(apostle) && isNumber(apostle.apostleId ?? apostle.id) &&
      (apostle.boardSteps === undefined || (Array.isArray(apostle.boardSteps) &&
        apostle.boardSteps.every(step => isRecord(step) && typeof step.step === 'string')))) ||
      !Object.values(board).every(levels => (isRecord(levels) || Array.isArray(levels)) && Object.values(levels).every(
        nodes => Array.isArray(nodes) && nodes.every(isNode))) ||
      !Object.values(heroInfo).every(hero => isRecord(hero) && typeof hero.name === 'string' &&
        isNumber(hero.gradeDefault) && isNumber(hero.personality)) ||
      !Object.values(text).every(value => typeof value === 'string')) return null;

  return {
    // 계정 부가 필드는 월드 간 메시지나 마지막 응답 캐시에 보관하지 않는다.
    apostles: apostles.map(apostle => ({
      apostleId: apostle.apostleId ?? apostle.id,
      boardSteps: apostle.boardSteps?.map(({ step }) => ({ step })),
    })),
    board,
    heroInfo,
    text,
  };
}
