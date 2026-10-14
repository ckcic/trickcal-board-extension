import { getAttackPathAvailability } from '../../domain/hwangRedistribution.ts';
import type { ProgressMap } from '../../domain/types.ts';
import { formatNumber } from '../common/format.ts';

/** 도움말을 처음 열 때만 범위를 계산하며 창을 닫으면 대기 작업을 취소한다. */
export function setupRedistributionSettingsTabs(dialog: HTMLElement, progressMap: ProgressMap): () => void {
  let availabilityLoaded = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const loadAvailability = () => {
    if (availabilityLoaded) return;
    const container = dialog.querySelector<HTMLElement>('[data-availability-container]');
    if (!container) return;
    availabilityLoaded = true;
    container.innerHTML = '<p style="color:#64748b;font-size:13px;margin:8px 0;">공격력 계산 범위를 분석하는 중...</p>';
    timer = setTimeout(() => {
      timer = null;
      const availability = getAttackPathAvailability(progressMap);
      container.innerHTML = `<div class="tcbe-rd-table-wrap"><table><thead><tr><th>관문 기준</th><th>막힌 경로 제외</th><th>막힌 경로 포함</th></tr></thead><tbody><tr><th>관문 개방 끔</th><td>${formatNumber(availability.current.unblocked)}% (${availability.current.unblocked / 6}칸)</td><td>${formatNumber(availability.current.all)}% (${availability.current.all / 6}칸)</td></tr><tr><th>관문 개방 켬 · 최대 범위</th><td>${formatNumber(availability.opened.unblocked)}% (${availability.opened.unblocked / 6}칸)</td><td>${formatNumber(availability.opened.all)}% (${availability.opened.all / 6}칸)</td></tr></tbody></table></div>`;
    }, 10);
  };

  const settingsTabs = [...dialog.querySelectorAll<HTMLButtonElement>('[data-settings-tab]')];
  const selectTab = (button: HTMLButtonElement) => {
    for (const item of settingsTabs) {
      const active = item === button;
      item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1;
      const panel = dialog.querySelector<HTMLElement>(`#${item.getAttribute('aria-controls')}`);
      if (panel) panel.hidden = !active;
    }
    if (button.dataset.settingsTab === 'help') {
      loadAvailability();
    }
  };
  for (const button of settingsTabs) {
    button.addEventListener('click', () => selectTab(button));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = settingsTabs[event.key === 'Home' ? 0 : event.key === 'End' ? settingsTabs.length - 1 : (settingsTabs.indexOf(button) + 1) % settingsTabs.length];
      if (next) { selectTab(next); next.focus(); }
    });
  }

  return () => { if (timer !== null) clearTimeout(timer); };
}
