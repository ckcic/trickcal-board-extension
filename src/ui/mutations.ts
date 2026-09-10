/** 확장 프로그램이 소유한 하위 DOM만 제외하고 원본 카드의 변경은 감지한다. */
function isExtensionNode(node: Node): boolean {
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  return Boolean(element?.closest('#tcbe-filter-panel, .tcbe-badge-row, .tcbe-badge-container, .tcbe-normal-badge-container, .tcbe-portal-tooltip'));
}

/** 하이라이트와 필터 클래스 변경으로 observer가 자기 자신을 반복 호출하지 않도록 한다. */
export function isSiteMutation(mutation: MutationRecord): boolean {
  if (isExtensionNode(mutation.target)) return false;
  if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
    const siteClasses = (value: string | null) => (value || '').split(/\s+/)
      .filter(name => name && !name.startsWith('tcbe-')).sort().join(' ');
    return siteClasses(mutation.oldValue) !== siteClasses((mutation.target as Element).getAttribute('class'));
  }
  if (mutation.type === 'childList') {
    return [...mutation.addedNodes, ...mutation.removedNodes].some(node => !isExtensionNode(node));
  }
  return true;
}

/** 변경 기록을 먼저 모아 같은 카드의 DOM 캐시를 배치당 한 번만 해제한다. */
export function collectChangedCards(mutations: MutationRecord[]): { cards: Set<HTMLElement>; fullRefresh: boolean; changed: boolean } {
  const cards = new Set<HTMLElement>();
  let fullRefresh = false;
  let hasSiteChanges = false;
  for (const mutation of mutations) {
    if (!isSiteMutation(mutation)) continue;
    hasSiteChanges = true;
    const element = mutation.target.nodeType === 1
      ? mutation.target as Element : mutation.target.parentElement;
    const card = element?.closest<HTMLElement>('[data-tcbe-apostle-name]');
    if (card) cards.add(card);
    else fullRefresh = true;
  }
  return { cards, fullRefresh, changed: hasSiteChanges };
}

/** 카드의 식별과 표시 캐시를 다시 검증할 수 있도록 해제한다. */
export function invalidateCardCaches(cards: Iterable<HTMLElement>): void {
  for (const card of cards) {
    card.removeAttribute('data-tcbe-visible-level');
    card.removeAttribute('data-tcbe-highlight-stat');
    card.removeAttribute('data-tcbe-apostle-name');
    card.removeAttribute('data-tcbe-apostle-id');
  }
}

/** 기존 호출부와 테스트에서 사용하는 일괄 무효화 진입점. */
export function invalidateChangedCards(mutations: MutationRecord[]): boolean {
  const changes = collectChangedCards(mutations);
  invalidateCardCaches(changes.cards);
  return changes.changed;
}
