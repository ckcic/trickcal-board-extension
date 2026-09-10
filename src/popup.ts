/** 팝업을 열 때만 활성 탭에 문자 아트를 요청한다. */
async function showArt(): Promise<void> {
  const status = document.getElementById('status');
  const art = document.getElementById('art');
  const title = document.getElementById('title');
  const frame = document.getElementById('art-frame');
  if (!status || !art || !frame) return;
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
    frame.hidden = false;
    art.style.transform = 'none';
    // 글꼴 크기를 바꾸지 않고 전체 줄 상자를 함께 축소해 줄 높이 반올림 오차를 피한다.
    const original = art.getBoundingClientRect();
    if (original.width > 0 && original.height > 0) {
      const scale = Math.min(1, 500 / original.width, 400 / original.height);
      const width = Math.ceil(original.width * scale);
      const height = Math.ceil(original.height * scale);
      art.style.transform = `scale(${scale})`;
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      document.body.style.width = `${Math.max(280, width + 60)}px`;
    }
    if (title) title.textContent = '찾았다!';
    status.textContent = '트릭컬 노트에 숨어 있던 작은 선물';
  } catch {
    status.textContent = '트릭컬 노트에서 열어 주세요. 이미 열려 있다면 페이지를 새로고침해 주세요.';
  }
}

void showArt();
