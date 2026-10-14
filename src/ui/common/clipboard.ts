/**
 * 클립보드 텍스트 복사 및 피드백 UI 표시 유틸리티
 */

/**
 * 텍스트를 클립보드에 복사하고, 지정된 요소에 완료 피드백 메시지를 표시합니다.
 */
export async function copyTextWithFeedback(
  text: string,
  statusElement: HTMLElement | null,
  successMessage = '✓ 복사되었습니다.',
  durationMs = 2500
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    if (statusElement) {
      statusElement.textContent = successMessage;
      setTimeout(() => {
        if (statusElement && statusElement.textContent === successMessage) {
          statusElement.textContent = '';
        }
      }, durationMs);
    }
    return true;
  } catch (err) {
    if (statusElement) {
      statusElement.textContent = '복사 실패 (권한 필요)';
    }
    return false;
  }
}
