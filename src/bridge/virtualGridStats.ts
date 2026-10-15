export interface VirtualGridStats {
  visible: number;
  total: number;
  key: string;
}

/** 현재 선택 키에 해당하는 정수 통계만 허용하며 원본 메시지 객체는 보관하지 않는다. */
export function parseVirtualGridStats(data: unknown, expectedKey: string): VirtualGridStats | null {
  if (!data || typeof data !== 'object' || !('type' in data) || data.type !== 'TCBE_GRID_STATS' ||
      !('source' in data) || data.source !== 'tcbe-main-interceptor' ||
      !('key' in data) || data.key !== expectedKey ||
      !('visible' in data) || typeof data.visible !== 'number' || !Number.isSafeInteger(data.visible) ||
      !('total' in data) || typeof data.total !== 'number' || !Number.isSafeInteger(data.total) ||
      data.visible < 0 || data.total < data.visible) return null;
  return { visible: data.visible, total: data.total, key: expectedKey };
}

/** 같은 윈도우·출처의 가상 목록 통계를 구독하고 해제 함수를 반환한다. */
export function listenForVirtualGridStats(
  getSelectionKey: () => string, callback: (stats: VirtualGridStats) => void, host: Window
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.source !== host || event.origin !== host.location.origin) return;
    const stats = parseVirtualGridStats(event.data, getSelectionKey());
    if (stats) callback(stats);
  };
  host.addEventListener('message', handler);
  return () => host.removeEventListener('message', handler);
}
