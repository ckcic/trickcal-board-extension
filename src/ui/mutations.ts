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
