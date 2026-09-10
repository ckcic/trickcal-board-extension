/** 문서 최상위 주석 중 여러 줄의 문자 아트 후보만 고른다. */
export function selectCommentArt(comments: string[]): string | null {
  let selected: string | null = null;
  for (const comment of comments) {
    if (comment.length > 100_000) continue;
    const text = comment.replace(/^\r?\n/, '').trimEnd();
    const lines = text.split(/\r?\n/);
    if (lines.filter(line => line.trim().length >= 20).length < 8) continue;
    if (!selected || text.length > selected.length) selected = text;
  }
  return selected;
}

/** 클릭할 때 현재 DOM에서 읽으므로 사이트 갱신 후의 아트도 반영한다. */
export function readCommentArt(): string | null {
  return selectCommentArt(Array.from(document.childNodes)
    .filter(node => node.nodeType === Node.COMMENT_NODE)
    .map(node => node.textContent || ''));
}
