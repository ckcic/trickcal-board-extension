import { checkForUpdate } from '../../domain/updateChecker.ts';

/** 설치 버전보다 새 릴리스가 있을 때 필터 패널에 다운로드 링크를 표시한다. */
export async function showUpdateBadge(header: HTMLElement): Promise<void> {
  try {
    // 설치 버전을 읽지 못하면 이전 버전으로 추측하여 알림을 띄우지 않는다.
    const currentVersion = chrome.runtime?.getManifest?.()?.version;
    if (!currentVersion) return;
    const updateInfo = await checkForUpdate(currentVersion);
    if (!updateInfo?.hasUpdate) return;
    const slot = document.getElementById('tcbe-update-badge-slot') || header.querySelector('#tcbe-update-badge-slot');
    if (!slot) return;
    const link = document.createElement('a');
    link.href = 'https://github.com/ckcic/trickcal-board-extension/releases/latest';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'tcbe-update-badge';
    link.title = '새 버전 다운로드 페이지로 이동';
    link.textContent = '🚀 v' + updateInfo.latestVersion + ' 업데이트';
    link.addEventListener('click', event => event.stopPropagation());
    slot.replaceChildren(link);
  } catch {
    // 버전 조회 실패가 필터 패널 동작에 영향을 주지 않도록 무시한다.
  }
}
