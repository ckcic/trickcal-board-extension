/** MAIN에서 원본 타일의 식별자만 공유한다. 노드 데이터와 진행도는 복제하지 않는다. */
export const TILE_NODE_ID = 'data-tcbe-node-id';
export const TILE_BOARD_LEVEL = 'data-tcbe-node-board';
export const TILE_APOSTLE_ID = 'data-tcbe-node-apostle';

interface Fiber {
  return?: Fiber;
  alternate?: Fiber;
  memoizedProps?: Record<string, unknown>;
}

export interface TileIdentity {
  nodeId: number;
  boardLevel: number;
  apostleId: number;
}

/** 요약 타일의 순서 대신 해당 타일 컴포넌트의 검증된 노드 ID와 보드 차수를 읽는다. */
export function findTileIdentity(element: Element): TileIdentity | null {
  const key = Object.keys(element).find(name => name.startsWith('__reactFiber$'));
  if (!key) return null;
  let fiber = (element as unknown as Record<string, Fiber>)[key];
  // React가 같은 DOM을 재사용하면 연결된 Fiber가 이전 트리를 가리킬 수 있다.
  const propsKey = Object.keys(element).find(name => name.startsWith('__reactProps$'));
  const hostProps = propsKey ? (element as unknown as Record<string, unknown>)[propsKey] : undefined;
  if (hostProps && fiber?.alternate?.memoizedProps === hostProps) fiber = fiber.alternate;
  for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps;
    if (!props || !props.node || typeof props.node !== 'object') continue;
    const node = props.node as Record<string, unknown>;
    const apostleId = Number(props.heroUid);
    const boardLevel = props.nth;
    if (typeof node.id !== 'number' || !Number.isSafeInteger(node.id) ||
        typeof boardLevel !== 'number' || !Number.isInteger(boardLevel) || boardLevel < 1 || boardLevel > 3 ||
        !Number.isSafeInteger(apostleId) || apostleId <= 0) continue;
    return { nodeId: node.id, boardLevel, apostleId };
  }
  return null;
}

export function installTileIdentityBridge(): () => void {
  let frame: number | null = null;
  let observer: MutationObserver | null = null;
  const identify = (tile: HTMLElement) => {
    if (tile.closest('[role="dialog"], .tcbe-badge-row, .tcbe-normal-popup, #tcbe-bokr-modal-container')) return;
    const identity = findTileIdentity(tile);
    const entries = [
      [TILE_NODE_ID, identity?.nodeId],
      [TILE_BOARD_LEVEL, identity?.boardLevel],
      [TILE_APOSTLE_ID, identity?.apostleId],
    ] as const;
    for (const [attribute, value] of entries) {
      if (value === undefined) {
        if (tile.hasAttribute(attribute)) tile.removeAttribute(attribute);
      } else if (tile.getAttribute(attribute) !== String(value)) {
        tile.setAttribute(attribute, String(value));
      }
    }
  };
  const scan = () => {
    frame = null;
    const tiles = document.querySelectorAll<HTMLElement>('[data-slot="card"] div[class*="--img-board-rect"]');
    tiles.forEach(identify);
  };
  const schedule = () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(scan);
  };
  const observe = () => {
    observer = new MutationObserver(mutations => {
      // 확장 표시 클래스만 바뀐 경우에는 다시 탐색하지 않는다.
      const siteClasses = (value: string | null) => (value || '').split(/\s+/)
        .filter(name => name && !name.startsWith('tcbe-')).sort().join(' ');
      if (mutations.some(mutation => {
        const element = mutation.target.nodeType === 1 ? mutation.target as Element : mutation.target.parentElement;
        if (element?.closest('#tcbe-filter-panel, .tcbe-badge-row, #tcbe-bokr-modal-container')) return false;
        return mutation.type !== 'attributes' || siteClasses(mutation.oldValue) !== siteClasses(element?.getAttribute('class') ?? null);
      })) schedule();
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'],
      attributeOldValue: true,
    });
    scan();
  };
  // 클릭 직전에도 갱신하여 React의 DOM 재사용과 프레임 예약 사이의 경쟁을 방지한다.
  const onClick = (event: MouseEvent) => {
    const tile = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-slot="card"] div[class*="--img-board-rect"]') : null;
    if (tile) identify(tile);
  };
  document.addEventListener('click', onClick, true);
  const pause = () => {
    observer?.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  const resume = (event: PageTransitionEvent) => {
    if (event.persisted) observe();
  };
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', resume);
  if (document.documentElement) observe();
  else document.addEventListener('DOMContentLoaded', observe, { once: true });
  return () => {
    pause();
    document.removeEventListener('DOMContentLoaded', observe);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('pagehide', pause);
    window.removeEventListener('pageshow', resume);
  };
}
