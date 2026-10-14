import type { ApostleProgress } from './types.ts';

/**
 * 텍스트 또는 이미지 alt로부터 사도 진행도 데이터를 검색 (스킨명 괄호 접미사 지원)
 */
export function findProgressByName(
  nameToProgress: Map<string, ApostleProgress>,
  rawText: string
): ApostleProgress | undefined {
  if (!rawText) return undefined;
  const trimmed = rawText.trim();
  const normalized = trimmed.replace(/\s+/g, '');

  // 1. 완전 일치 (예: "다야(퓨어샤인)", "가비아", "마요(멋짐)")
  if (nameToProgress.has(trimmed)) {
    return nameToProgress.get(trimmed);
  }
  if (nameToProgress.has(normalized)) {
    return nameToProgress.get(normalized);
  }

  // 2. 괄호 안의 스킨명 제거 후 일치 (예: "우로스(사악)" -> "우로스")
  const withoutBracket = trimmed.replace(/\([^)]*\)/g, '').trim();
  const withoutBracketNorm = withoutBracket.replace(/\s+/g, '');
  if (withoutBracket && nameToProgress.has(withoutBracket)) {
    return nameToProgress.get(withoutBracket);
  }
  if (withoutBracketNorm && nameToProgress.has(withoutBracketNorm)) {
    return nameToProgress.get(withoutBracketNorm);
  }

  // 3. 괄호 앞부분만 추출
  const bracketIndex = trimmed.indexOf('(');
  if (bracketIndex > 0) {
    const baseName = trimmed.slice(0, bracketIndex).trim();
    if (nameToProgress.has(baseName)) {
      return nameToProgress.get(baseName);
    }
  }

  return undefined;
}
