/**
 * @file cardDetector.ts
 * @description 트릭컬 노트 사도 카드 DOM 요소를 탐색하고, 텍스트/이미지로부터 사도 진행도 데이터를 매칭하는 모듈
 */

import type { ApostleProgress } from '../domain/types.ts';

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

/**
 * 사도 이름 요소를 기준으로 최상위 사도 카드 컨테이너를 탐색
 */
export function findCardContainer(nameElement: Element): HTMLElement | null {
  // 모달 다이얼로그 내부 요소는 사도 카드 대상에서 제외
  if (nameElement.closest('[role="dialog"], [data-slot="dialog-content"], [data-slot="dialog-overlay"]')) {
    return null;
  }

  // 1. data-slot="card" 속성을 가진 컨테이너가 있으면 최우선 반환
  const slotCard = nameElement.closest('[data-slot="card"]');
  if (slotCard) {
    return slotCard as HTMLElement;
  }

  // 2. 사도 카드 특유의 클래스 조합 확인 (bg-dialog-background, text-card-foreground 등)
  const dialogCard = nameElement.closest('.bg-dialog-background, .text-card-foreground');
  if (dialogCard && !dialogCard.closest('[role="dialog"], [data-slot="dialog-content"]')) {
    return dialogCard as HTMLElement;
  }

  // 3. 상위 탐색 로직 (폴백)
  let curr: Element | null = nameElement;
  for (let i = 0; i < 8; i++) {
    if (!curr || curr === document.body) break;
    const parent = curr.parentElement;
    if (!parent) break;

    if (
      parent.tagName === 'DIV' &&
      !parent.closest('[role="dialog"], [data-slot="dialog-content"]') &&
      (parent.getAttribute('data-slot') === 'card' ||
        parent.classList.contains('rounded-xxl') ||
        parent.className.includes('card') ||
        parent.className.includes('item'))
    ) {
      return parent as HTMLElement;
    }
    curr = parent;
  }
  return null;
}
