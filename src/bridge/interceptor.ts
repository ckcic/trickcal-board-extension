import { parseTrickcalApiPayload } from '../domain/dataParser.ts';
import type { ExtractedApiData } from '../domain/types.ts';
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

  let latestData: ExtractedApiData | null = null;

  // 콘텐츠 스크립트가 늦게 준비되어도 메모리의 마지막 보드 데이터를 전달한다.
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source === window && event.origin === window.location.origin &&
        event.data?.type === 'TCBE_BOARD_DATA_REQUEST' &&
        event.data?.source === 'tcbe-content-bridge' && latestData) {
      dispatchCapturedData(latestData);
    }
  });

  /**
   * 가로챈 데이터를 isolated world의 콘텐츠 스크립트로 전달
   */
  function dispatchCapturedData(data: ExtractedApiData) {
    latestData = data;
    try {
      window.postMessage(
        {
          type: MESSAGE_TYPE,
          source: 'tcbe-main-interceptor',
          payload: data,
        },
        window.location.origin
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
          const parsed = parseTrickcalApiPayload(json);
          if (parsed) {
            dispatchCapturedData(parsed);
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
  const originalSend = XMLHttpRequest.prototype.send;
  const observedRequests = new WeakSet<XMLHttpRequest>();

  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    // XHR 인스턴스 재사용 시 리스너가 누적되지 않도록 한 번만 등록한다.
    if (!observedRequests.has(this)) {
      observedRequests.add(this);
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
            const parsed = parseTrickcalApiPayload(responseData);
            if (parsed) {
              dispatchCapturedData(parsed);
            }
          }
        } catch {
          // 에러 무시
        }
      });
    }
    return originalSend.call(this, body);
  };
})();
