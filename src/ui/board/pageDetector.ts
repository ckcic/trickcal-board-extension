/** 페이지 판별에 필요한 DOM만 주입하여 브라우저 전역 없이도 검증한다. */
export function createPageDetector(
  doc: Pick<Document, 'querySelector' | 'querySelectorAll'>,
  location: Pick<Location, 'pathname'>,
  hasIntegratedSearch: () => boolean
) {
  let cachedNavigation: { pathname: string; isStatTab: boolean } | null = null;

  return {
    invalidate(): void { cachedNavigation = null; },
    isApostleTabActive(): boolean {
      const pathname = location.pathname;
      if (pathname !== '/board' && !pathname.startsWith('/board/')) {
        cachedNavigation = null;
        return false;
      }
      if (!cachedNavigation || cachedNavigation.pathname !== pathname) {
        const buttons = Array.from(doc.querySelectorAll<HTMLElement>('button, a, div[role="button"]'))
          .filter(element => !element.closest('#tcbe-filter-panel, .tcbe-badge-container, .tcbe-badge-row'));
        const prefixes = ['전체 HP', '전체 물리', '전체 마법', '전체 치명', '전체 치피', '전체 치저'];
        const isStatTab = buttons.some(element => {
          const text = element.textContent?.trim() || '';
          return text === '사도별' || prefixes.some(prefix => text.startsWith(prefix));
        });
        cachedNavigation = { pathname, isStatTab };
      }
      if (cachedNavigation.isStatTab) return false;
      // 검색창 이동·제거와 패널 통합 상태는 캐시하지 않고 매번 현재 DOM으로 확인한다.
      return Boolean(doc.querySelector('input[placeholder*="사도"]') || hasIntegratedSearch());
    },
  };
}
