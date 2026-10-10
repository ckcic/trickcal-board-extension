/**
 * @file koreanSearch.ts
 * @description 한글 초성 및 완성형 혼합 검색을 위한 순수 함수 유틸리티
 */

/** 한글 유니코드 초성 19자 목록 */
export const KOREAN_CHOSUNG_LIST: readonly string[] = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

/** 정규식 특수문자 이스케이프 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 사용자 검색어를 한글 초성 지원 정규식으로 변환합니다.
 * 예:
 * - 'ㅇㄹㅍ' -> /[ㅇ아-잏][ㄹ라-맇][ㅍ파-핗]/i (에르핀 매칭)
 * - '에ㄹ'   -> /에[ㄹ라-맇]/i (에르핀 매칭)
 * - 'comi'  -> /comi/i
 */
export function makeKoreanSearchRegex(query: string): RegExp {
  const trimmed = query.trim();
  if (!trimmed) {
    return /(?:)/;
  }

  let pattern = '';
  for (const char of trimmed) {
    const chosungIndex = KOREAN_CHOSUNG_LIST.indexOf(char);
    if (chosungIndex >= 0) {
      // 해당 초성으로 시작하는 한글 음절 범위: [초성, 가~깋]
      const start = String.fromCharCode(0xac00 + chosungIndex * 588);
      const end = String.fromCharCode(0xac00 + (chosungIndex + 1) * 588 - 1);
      pattern += `[${char}${start}-${end}]`;
    } else {
      pattern += escapeRegex(char);
    }
  }

  return new RegExp(pattern, 'i');
}

/**
 * 대상 텍스트가 검색어(초성 또는 일반 텍스트)와 일치하는지 판별합니다.
 */
export function matchesKoreanSearch(targetText: string, query: string): boolean {
  if (!query.trim()) return true;
  const regex = makeKoreanSearchRegex(query);
  return regex.test(targetText);
}
