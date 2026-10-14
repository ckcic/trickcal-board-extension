import { DIALOG_EXCLUSION_SELECTOR } from '../common/selectors.ts';
/**
 * @file cardDetector.ts
 * @description 트릭컬 노트 사도 카드 DOM 요소를 탐색하고, 텍스트/이미지로부터 사도 진행도 데이터를 매칭하는 모듈
 */


/**
 * 사도 이름 요소를 기준으로 최상위 사도 카드 컨테이너를 탐색
 */
export function findCardContainer(nameElement: Element): HTMLElement | null {
  // 모달 다이얼로그 내부 요소는 사도 카드 대상에서 제외
  if (nameElement.closest(DIALOG_EXCLUSION_SELECTOR)) {
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
    const parent: HTMLElement | null = curr.parentElement;
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
