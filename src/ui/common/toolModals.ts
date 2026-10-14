type ToolModalId = 'redistribution' | 'recovery';
interface ToolModalEntry { close: () => void; }

const tools = new Map<ToolModalId, ToolModalEntry>();

/** 활성 도구를 등록하고 해당 인스턴스만 해제하는 함수를 반환한다. */
export function registerToolModal(id: ToolModalId, close: () => void): () => void {
  closeTool(id);
  const entry = { close };
  tools.set(id, entry);
  return () => {
    if (tools.get(id) === entry) tools.delete(id);
  };
}

/** 닫기 콜백 실행 전에 등록을 해제하여 중복 닫기와 재진입을 방지한다. */
export function closeTool(id: ToolModalId): void {
  const entry = tools.get(id);
  if (!entry) return;
  tools.delete(id);
  entry.close();
}

/** 호출 시 활성화된 도구만 닫으며 닫는 도중 새로 등록된 인스턴스는 보존한다. */
export function closeAllTools(): void {
  for (const [id, entry] of [...tools]) {
    if (tools.get(id) === entry) closeTool(id);
  }
}
