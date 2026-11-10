/** 원본 및 확장 다이얼로그 안의 요소를 카드 처리에서 제외하는 셀렉터 */
export const DIALOG_EXCLUSION_SELECTOR = 'dialog, [role="dialog"], [data-slot="dialog-content"], [data-slot="dialog-overlay"]';

/** 도구 모달의 목차 검색과 이미 통합된 검색은 원본 검색창 이동 대상에서 제외한다. */
export const SITE_APOSTLE_SEARCH_SELECTOR = `input[placeholder*="사도"]:not([data-tcbe-search]):not(:is(${DIALOG_EXCLUSION_SELECTOR}, #tcbe-filter-panel) *)`;
