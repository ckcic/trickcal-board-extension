/** 버튼에 붙인 팝업의 왼쪽 좌표를 화면 여백 안으로 보정한다. */
export function getPopupLeft(anchorLeft: number, anchorWidth: number, popupWidth: number, viewportWidth: number): number {
  const margin = 16;
  const preferred = anchorLeft + anchorWidth / 2 > viewportWidth / 2
    ? anchorLeft + anchorWidth - popupWidth + 6
    : anchorLeft - 6;
  const left = Math.max(margin, Math.min(preferred, viewportWidth - margin - popupWidth));
  return left - anchorLeft;
}
