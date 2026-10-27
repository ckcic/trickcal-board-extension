import type { RedistributionAction, RedistributionPlan } from '../../domain/hwangRedistribution.ts';
import { renderApostleAvatar } from '../common/apostlePortraits.ts';
import { matchesKoreanSearch } from '../../domain/koreanSearch.ts';
import { escapeHtml } from '../common/html.ts';

/** 목차는 검색 시 노드를 재생성하지 않고 기존 항목의 표시만 바꾼다. */
export function setupRedistributionToc(dialog: HTMLElement, getPortraitMap: () => Map<string | number, string>) {
  const renderTocApostles = (actions: RedistributionAction[]) => {
    const apostlesContainer = dialog.querySelector<HTMLElement>('[data-toc-apostles]');
    if (!apostlesContainer) return;
    if (!actions.length) {
      apostlesContainer.innerHTML = '<div style="color:#94a3b8;padding:8px 4px;text-align:center;">사도 없음</div>';
      return;
    }
    apostlesContainer.innerHTML = actions.map(action => {
      const badgeClass = action.reset ? 'tcbe-rd-toc-badge-reset' : 'tcbe-rd-toc-badge-add';
      const badgeText = action.reset ? '초기화' : '추가';
      const avatar = renderApostleAvatar(action.apostle.apostleId, action.apostle.name, getPortraitMap(), action.apostle.personality);
      return `<button type="button" class="tcbe-rd-toc-item tcbe-rd-toc-apostle-item" data-toc-target="tcbe-rd-map-${action.apostle.apostleId}" data-apostle-name="${escapeHtml(action.apostle.name)}">${avatar}<span class="tcbe-rd-toc-name" title="${escapeHtml(action.apostle.name)}">${escapeHtml(action.apostle.name)}</span><span class="tcbe-rd-toc-badge ${badgeClass}">${badgeText}</span></button>`;
    }).join('') + '<div class="tcbe-rd-toc-empty" style="color:#94a3b8;padding:8px 4px;text-align:center;display:none;">검색 결과 없음</div>';
  };

  const filterTocApostles = (query: string) => {
    const apostlesContainer = dialog.querySelector<HTMLElement>('[data-toc-apostles]');
    if (!apostlesContainer) return;
    const q = query.trim();
    const items = apostlesContainer.querySelectorAll<HTMLButtonElement>('.tcbe-rd-toc-apostle-item');
    const emptyEl = apostlesContainer.querySelector<HTMLElement>('.tcbe-rd-toc-empty');
    let visibleCount = 0;
    for (const item of items) {
      const name = item.dataset.apostleName || '';
      const visible = !q || matchesKoreanSearch(name, q);
      item.style.display = visible ? '' : 'none';
      if (visible) visibleCount++;
    }
    if (emptyEl) emptyEl.style.display = visibleCount === 0 ? '' : 'none';
  };

  const updateToc = (plan: RedistributionPlan) => {
    const tocContainer = dialog.querySelector<HTMLElement>('[data-toc-container]');
    const countEl = dialog.querySelector<HTMLElement>('[data-toc-count]');
    const searchInput = dialog.querySelector<HTMLInputElement>('[data-toc-search]');
    if (!tocContainer) return;
    const mobileTop = dialog.querySelector<HTMLElement>('[data-mobile-top-container]');
    if (mobileTop) mobileTop.hidden = !plan.actions.length;
    if (!plan.actions.length) {
      tocContainer.hidden = true;
      return;
    }
    if (countEl) countEl.textContent = `${plan.actions.length}명`;
    if (searchInput) searchInput.value = '';
    renderTocApostles(plan.actions);
    tocContainer.hidden = false;
  };

  dialog.querySelector<HTMLInputElement>('[data-toc-search]')?.addEventListener('input', event => {
    filterTocApostles((event.target as HTMLInputElement).value);
  });

  const resultContent = dialog.querySelector<HTMLElement>('.tcbe-rd-result-content') || dialog.querySelector<HTMLElement>('[data-result]');
  const scrollToTop = () => {
    // 좁은 화면에서는 목차와 본문을 감싼 컨테이너가 스크롤을 담당한다.
    const scrollContainer = window.matchMedia('(max-width: 960px)').matches
      ? dialog.querySelector<HTMLElement>('.tcbe-rd-result-container')
      : resultContent;
    scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  dialog.querySelector('[data-toc-top]')?.addEventListener('click', scrollToTop);
  dialog.querySelector('[data-mobile-top]')?.addEventListener('click', scrollToTop);
  dialog.querySelector('[data-toc-container]')?.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-toc-target]') : null;
    if (!button) return;
    const targetId = button.dataset.tocTarget;
    if (!targetId) return;
    const targetElement = dialog.querySelector<HTMLElement>(`#${targetId}`);
    if (targetElement) {
      if (targetElement instanceof HTMLDetailsElement) {
        targetElement.open = true;
      } else {
        const details = targetElement.closest<HTMLDetailsElement>('details');
        if (details) details.open = true;
      }
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  return updateToc;
}
