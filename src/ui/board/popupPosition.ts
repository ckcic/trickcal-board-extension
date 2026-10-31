/** 버튼에 붙인 팝업의 왼쪽 좌표를 화면 여백 안으로 보정한다. */
export function getPopupLeft(anchorLeft: number, anchorWidth: number, popupWidth: number, viewportWidth: number): number {
  const margin = 16;
  const preferred = anchorLeft + anchorWidth / 2 > viewportWidth / 2
    ? anchorLeft + anchorWidth - popupWidth + 6
    : anchorLeft - 6;
  const left = Math.max(margin, Math.min(preferred, Math.max(margin, viewportWidth - margin - popupWidth)));
  return left - anchorLeft;
}

/** 화면 고정(position: fixed) 포털 툴팁의 왼쪽 좌표를 화면 여백 안으로 보정한다. */
export function getFixedTooltipLeft(anchorLeft: number, anchorWidth: number, tooltipWidth: number, viewportWidth: number): number {
  const margin = 12;
  const preferred = anchorLeft + anchorWidth / 2 > viewportWidth / 2
    ? anchorLeft + anchorWidth - tooltipWidth + 6
    : anchorLeft - 6;
  return Math.max(margin, Math.min(preferred, Math.max(margin, viewportWidth - margin - tooltipWidth)));
}
