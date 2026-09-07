/**
 * @file interceptor.ts
 * @description MAIN world(페이지 컨텍스트)에서 동작하며, fetch 및 XHR을 후킹하여 최신 보드 데이터를 가로챔
 */

// MAIN world 전역 객체에 인터셉터 플래그를 안전하게 설정하기 위한 타입 확장
declare global {
  interface Window {
    __TCBE_INTERCEPTOR_INSTALLED__?: boolean;
  }
}

(() => {
  // 중복 등록 방지 플래그
  if (window.__TCBE_INTERCEPTOR_INSTALLED__) {
    return;
  }
  window.__TCBE_INTERCEPTOR_INSTALLED__ = true;

  const MESSAGE_TYPE = 'TCBE_BOARD_DATA_INTERCEPTED';

  /**
   * 페이로드가 트릭컬 보드 관련 데이터를 포함하고 있는지 판별
   */
  function containsTrickcalData(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;

    // unknown → Record 안전 캐스팅 (구조 불확실한 외부 API 응답)
    const record = obj as Record<string, unknown>;
    const payloadVal = record.payload;
    const root = (payloadVal && typeof payloadVal === 'object' ? payloadVal : record) as Record<string, unknown>;

    // 깊은 탐색을 위한 안전한 접근 헬퍼
    const dig = (base: unknown, ...keys: string[]): unknown => {
      let current: unknown = base;
      for (const key of keys) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[key];
      }
      return current;
    };

    const hasApostles = Boolean(
      Array.isArray(dig(root, 'user', 'data', 'apostle', 'apostles')) ||
      Array.isArray(dig(root, 'apostle', 'apostles')) ||
      Array.isArray(dig(root, 'apostles'))
    );

    const hasBoard = Boolean(dig(root, 'data', 'data', 'board') || dig(root, 'board'));
    const hasHeroInfo = Boolean(dig(root, 'data', 'data', 'heroInfo') || dig(root, 'heroInfo'));

    return hasApostles && hasBoard && hasHeroInfo;
  }

  /**
   * 가로챈 데이터를 isolated world의 콘텐츠 스크립트로 전달
   */
  function dispatchCapturedData(data: unknown) {
    try {
      window.postMessage(
        {
          type: MESSAGE_TYPE,
          source: 'tcbe-main-interceptor',
          payload: data,
        },
        '*'
      );
    } catch (err) {
      console.error('[TCBE] postMessage failed:', err);
    }
  }

  // --- 1. window.fetch 가로채기 ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args: Parameters<typeof fetch>) {
    const response = await originalFetch.apply(this, args);
    try {
      // 응답 스트림을 소비하지 않도록 복제(clone)하여 분석
      const cloned = response.clone();
      cloned
        .json()
        .then((json: unknown) => {
          if (containsTrickcalData(json)) {
            dispatchCapturedData(json);
          }
        })
        .catch(() => {
          // JSON이 아닌 응답은 무시
        });
    } catch {
      // 에러 발생 시에도 사이트의 통신을 방해하지 않음
    }
    return response;
  };

  // --- 2. XMLHttpRequest 가로채기 ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ) {
    return originalOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
  };

  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener('load', function () {
      try {
        if (this.responseType === '' || this.responseType === 'text' || this.responseType === 'json') {
          let responseData: unknown = this.response;
          if (typeof responseData === 'string') {
            try {
              responseData = JSON.parse(responseData);
            } catch {
              return;
            }
          }
          if (containsTrickcalData(responseData)) {
            dispatchCapturedData(responseData);
          }
        }
      } catch {
        // 에러 무시
      }
    });
    return originalSend.call(this, body);
  };
})();
