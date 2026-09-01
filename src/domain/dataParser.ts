/**
 * @file dataParser.ts
 * @description API 응답으로부터 필요한 사도/보드/마스터 데이터를 추출 및 검증하는 파서
 */

import type { ExtractedApiData, HeroInfo, MasterBoardNode, UserApostle } from './types.ts';

/**
 * 객체가 트릭컬 노트의 보드 데이터 구조를 충족하는지 검증
 * @param data 검증 대상 객체
 * @returns 추출된 데이터 또는 유효하지 않을 경우 null
 */
export function parseTrickcalApiPayload(data: unknown): ExtractedApiData | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const raw = data as Record<string, any>;

  // payload로 감싸져 있는 경우와 루트에 직접 배치된 경우 모두 대응
  const root = raw.payload && typeof raw.payload === 'object' ? raw.payload : raw;

  // 1. 사도 유저 데이터 탐색
  const apostles: UserApostle[] | undefined =
    root.user?.data?.apostle?.apostles ||
    root.apostle?.apostles ||
    root.apostles;

  // 2. 보드 마스터 데이터 탐색
  const board: Record<string, Record<string, MasterBoardNode[]>> | undefined =
    root.data?.data?.board ||
    root.board;

  // 3. 사도 마스터 정보(heroInfo) 탐색
  const heroInfo: Record<string, HeroInfo> | undefined =
    root.data?.data?.heroInfo ||
    root.heroInfo;

  // 4. 텍스트 사전 탐색
  const text: Record<string, string> | undefined =
    root.data?.data?.text ||
    root.text;

  // 필수 요소 존재 확인
  if (
    !Array.isArray(apostles) ||
    !board ||
    typeof board !== 'object' ||
    !heroInfo ||
    typeof heroInfo !== 'object' ||
    !text ||
    typeof text !== 'object'
  ) {
    return null;
  }

  return {
    apostles,
    board,
    heroInfo,
    text,
  };
}
