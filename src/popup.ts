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
    const text = `<!--${response.art}-->`;
    art.textContent = text;
    const lines = text.split(/\r?\n/);
    const longestLine = Math.max(...lines.map(line => line.length));
    // 문자 셀의 세로를 가로의 약 두 배로 유지하며 가로·세로 공간에 함께 맞춘다.
    const fontSize = Math.max(2, Math.min(9, 500 / (longestLine * 0.61), 430 / (lines.length * 1.22)));
    art.style.fontSize = `${fontSize}px`;
    art.hidden = false;
    // 글꼴별 실제 문자 폭을 측정해 고정 너비 때문에 남는 오른쪽 여백을 없앤다.
    const range = document.createRange();
    range.selectNodeContents(art);
    const textWidth = range.getBoundingClientRect().width;
    if (textWidth > 0) {
      document.body.style.width = `${Math.min(560, Math.max(280, Math.ceil(textWidth) + 60))}px`;
    }
    if (title) title.textContent = '찾았다!';
    status.textContent = '트릭컬 노트에 숨어 있던 작은 선물';
  } catch {
    status.textContent = '트릭컬 노트에서 열어 주세요. 이미 열려 있다면 페이지를 새로고침해 주세요.';
  }
}

void showArt();
