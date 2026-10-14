/** API 텍스트를 HTML 템플릿에 넣을 때 태그와 속성으로 해석되지 않도록 한다. */
export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
