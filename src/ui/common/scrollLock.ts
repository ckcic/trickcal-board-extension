/** 원본 모달처럼 카드 폭은 유지하고 오른쪽 고정 버튼은 스크롤바 변화에 따라 이동한다. */
export function lockPageScroll(): () => void {
  const root = document.documentElement;
  const body = document.body;
  const overflow = body.style.getPropertyValue('overflow');
  const overflowPriority = body.style.getPropertyPriority('overflow');
  const margin = body.style.getPropertyValue('margin-right');
  const marginPriority = body.style.getPropertyPriority('margin-right');
  // 기존 stable 여백이나 오버레이 스크롤바에는 보정을 중복 적용하지 않는다.
  const scrollbarWidth = getComputedStyle(root).scrollbarGutter.includes('stable')
    ? 0 : Math.max(0, window.innerWidth - root.clientWidth);
  if (scrollbarWidth > 0) {
    const marginRight = parseFloat(getComputedStyle(body).marginRight) || 0;
    body.style.setProperty('margin-right', `${marginRight + scrollbarWidth}px`, marginPriority);
  }
  body.style.setProperty('overflow', 'hidden', overflowPriority);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    // 스크롤바를 먼저 복원한 뒤 임시 여백을 해제한다.
    if (overflow) body.style.setProperty('overflow', overflow, overflowPriority);
    else body.style.removeProperty('overflow');
    if (scrollbarWidth > 0) {
      if (margin) body.style.setProperty('margin-right', margin, marginPriority);
      else body.style.removeProperty('margin-right');
    }
  };
}
