/** 원본 가상 목록의 입력을 필터링하여 빈 슬롯 없이 사이트의 카드/클릭 동작을 유지한다. */
type Stream = (action: number, value?: unknown) => unknown;
type GridItem = [string | number, unknown];
interface GridSystem {
  data: Stream;
  totalCount: Stream;
  gridState: Stream;
  propsReady: Stream;
}
interface Fiber {
  return?: Fiber;
  memoizedProps?: { value?: unknown };
}
export interface GridSelection {
  active: boolean;
  ids: number[];
  key: string;
}

function isGridSystem(value: unknown): value is GridSystem {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return ['data', 'totalCount', 'gridState', 'propsReady'].every(key => typeof record[key] === 'function');
}
function isGridData(value: unknown): value is GridItem[] {
  return Array.isArray(value) && value.every(item => Array.isArray(item) && item.length === 2 &&
    Number.isFinite(Number(item[0])) && (Array.isArray(item[1]) || (item[1] !== null && typeof item[1] === 'object')));
}

/** React 내부 연결은 현재 사이트의 Virtuoso 스트림 구조를 검증한 경우에만 사용한다. */
export function findVirtualGridSystem(element: Element): GridSystem | null {
  const key = Object.keys(element).find(name => name.startsWith('__reactFiber$'));
  if (!key) return null;
  let fiber = (element as unknown as Record<string, Fiber>)[key];
  for (let depth = 0; fiber && depth < 80; depth++, fiber = fiber.return) {
    const value = fiber.memoizedProps?.value;
    try {
      if (isGridSystem(value) && isGridData(value.data(4))) return value;
    } catch { return null; }
  }
  return null;
}

export class VirtualGridAdapter {
  private source: GridItem[];
  private selection: GridSelection = { active: false, ids: [], key: '' };
  private outputs = new WeakSet<object>();
  private unsubscribe: (() => void) | null = null;
  private queued = false;
  private lastResult: GridItem[] | null = null;
  private publishing = false;
  private system: GridSystem;
  private report: (visible: number, total: number, key: string) => void;

  constructor(system: GridSystem, report: (visible: number, total: number, key: string) => void) {
    this.system = system;
    this.report = report;
    const source = system.data(4);
    if (!isGridData(source)) throw new Error('가상 목록 데이터 형식 변경');
    this.source = source;
    const unsubscribe = system.data(1, (value: unknown) => {
      if (this.publishing || !isGridData(value) || this.outputs.has(value)) return;
      this.source = value;
      // 사이트가 propsReady를 닫고 원본 totalCount까지 설정한 뒤 다시 적용한다.
      if (!this.queued) {
        this.queued = true;
        queueMicrotask(() => { this.queued = false; if (this.unsubscribe) this.apply(); });
      }
    });
    if (typeof unsubscribe === 'function') this.unsubscribe = unsubscribe as () => void;
  }

  update(selection: GridSelection) { this.selection = selection; this.apply(); }

  private apply() {
    const { active, ids, key } = this.selection;
    const rank = new Map(ids.map((id, index) => [id, index]));
    const result = active ? this.source.filter(item => rank.has(Number(item[0])))
      .sort((a, b) => rank.get(Number(a[0]))! - rank.get(Number(b[0]))!) : this.source;
    const same = this.lastResult?.length === result.length && result.every((item, i) => item === this.lastResult?.[i]);
    // 사이트 재렌더링으로 원본 입력이 다시 들어온 경우도 반드시 복원한다.
    if (!same || this.system.data(4) !== this.lastResult) {
      if (result !== this.source) this.outputs.add(result);
      this.lastResult = result;
      this.publishing = true;
      try {
        this.system.propsReady(0, false);
        this.system.data(0, result);
        this.system.totalCount(0, result.length);
        this.system.propsReady(0, true);
      } finally { this.publishing = false; }
    }
    this.report(result.length, this.source.length, key);
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.selection = { active: false, ids: [], key: '' };
    this.apply();
  }
}

export function installVirtualGridBridge() {
  let selection: GridSelection = { active: false, ids: [], key: '' };
  let currentElement: Element | null = null;
  let adapter: VirtualGridAdapter | null = null;
  const report = (visible: number, total: number, key: string) => window.postMessage({
    type: 'TCBE_GRID_STATS', source: 'tcbe-main-interceptor', visible, total, key,
  }, window.location.origin);
  const connect = () => {
    if (currentElement?.isConnected && adapter) return;
    const element = document.querySelector('[data-testid="virtuoso-item-list"]:has(.virtuoso-grid-item [data-slot="card"])');
    if (element === currentElement && adapter) return;
    if (currentElement && !currentElement.isConnected) { adapter?.dispose(); adapter = null; currentElement = null; }
    if (!element) return;
    const system = findVirtualGridSystem(element);
    if (!system) return;
    adapter?.dispose();
    currentElement = element;
    adapter = new VirtualGridAdapter(system, report);
    adapter.update(selection);
  };
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (event.source !== window || event.origin !== window.location.origin ||
        data?.type !== 'TCBE_GRID_FILTER' || data.source !== 'tcbe-content-bridge' ||
        typeof data.active !== 'boolean' || typeof data.key !== 'string' || !Array.isArray(data.ids) ||
        !data.ids.every((id: unknown) => typeof id === 'number' && Number.isSafeInteger(id))) return;
    selection = { active: data.active, ids: data.ids, key: data.key };
    connect();
    adapter?.update(selection);
  });
  // 사이트의 목록 마운트만 관찰하고 타일·배지 변경은 연결을 다시 만들지 않는다.
  const observe = () => {
    new MutationObserver(connect).observe(document.documentElement, { childList: true, subtree: true });
    connect();
  };
  if (document.documentElement) observe();
  else document.addEventListener('DOMContentLoaded', observe, { once: true });
}
