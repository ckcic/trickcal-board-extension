/** 원본 검색의 이중 필터링을 피하고 확장의 검색 조건만 목록·집계에 적용한다. */
export function takeOverApostleSearch(original: HTMLInputElement): { input: HTMLInputElement; restore: () => void } {
  const input = original.cloneNode(false) as HTMLInputElement;
  input.setAttribute('data-tcbe-search', '');
  input.value = original.value;
  // 원본 React 검색 상태는 비워 두어 전체 사도를 가상 목록의 입력으로 유지한다.
  if (original.value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(original, '');
    else original.value = '';
    original.dispatchEvent(new Event('input', { bubbles: true }));
  }
  original.replaceWith(input);
  return { input, restore: () => input.replaceWith(original) };
}
