/** 팝업을 열 때만 활성 탭에 문자 아트를 요청한다. */
async function showArt(): Promise<void> {
  const status = document.getElementById('status');
  const art = document.getElementById('art');
  const title = document.getElementById('title');
  if (!status || !art) return;
  if (title) title.textContent = '숨은 그림';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('활성 탭 없음');
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'TCBE_READ_COMMENT_ART' });
    if (!response || typeof response !== 'object' || !('art' in response) ||
        typeof response.art !== 'string' || !response.art || response.art.length > 100_000) {
      status.textContent = '아직 숨어 있는 그림을 찾지 못했어요.';
      return;
    }
    // 페이지에서 읽은 문자열은 HTML로 해석하지 않는다.
    art.textContent = response.art;
    const longestLine = Math.max(...response.art.split(/\r?\n/).map(line => line.length));
    art.style.fontSize = `${Math.max(2, Math.min(9, 540 / (longestLine * 0.61)))}px`;
    art.hidden = false;
    if (title) title.textContent = '찾았다!';
    status.textContent = '트릭컬 노트에 숨어 있던 작은 선물';
  } catch {
    status.textContent = '트릭컬 노트에서 열어 주세요. 이미 열려 있다면 페이지를 새로고침해 주세요.';
  }
}

void showArt();
