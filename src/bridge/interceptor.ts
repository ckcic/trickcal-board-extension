/**
 * @file interceptor.ts
 * @description MAIN world(페이지 컨텍스트)에서 동작하며, fetch 및 XHR을 후킹하여 최신 보드 데이터를 가로챔
 */

(() => {
  // 중복 등록 방지 플래그
  const INTERCEPTOR_KEY = '__TCBE_INTERCEPTOR_INSTALLED__';
  if ((window as any)[INTERCEPTOR_KEY]) {
    return;
  }
  (window as any)[INTERCEPTOR_KEY] = true;

  const MESSAGE_TYPE = 'TCBE_BOARD_DATA_INTERCEPTED';

  /**
   * 페이로드가 트릭컬 보드 관련 데이터를 포함하고 있는지 판별
   */
  function containsTrickcalData(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const root = obj.payload && typeof obj.payload === 'object' ? obj.payload : obj;

    const hasApostles = Boolean(
      (root.user?.data?.apostle?.apostles && Array.isArray(root.user.data.apostle.apostles)) ||
      (root.apostle?.apostles && Array.isArray(root.apostle.apostles)) ||
      (root.apostles && Array.isArray(root.apostles))
    );

    const hasBoard = Boolean(root.data?.data?.board || root.board);
    const hasHeroInfo = Boolean(root.data?.data?.heroInfo || root.heroInfo);

    return hasApostles && hasBoard && hasHeroInfo;
  }

  /**
   * 가로챈 데이터를 isolated world의 콘텐츠 스크립트로 전달
   */
  function dispatchCapturedData(data: any) {
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
        .then((json) => {
          if (containsTrickcalData(json)) {
            dispatchCapturedData(json);
          }
        })
        .catch(() => {
          // JSON이 아닌 응답은 무시
        });
    } catch (e) {
      // 에러 발생 시에도 사이트의 통신을 방해하지 않음
    }
    return response;
  };

  // --- 2. XMLHttpRequest 가로채기 ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: any[]) {
    return originalOpen.apply(this, args as any);
  };

  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: any[]) {
    this.addEventListener('load', function () {
      try {
        if (this.responseType === '' || this.responseType === 'text' || this.responseType === 'json') {
          let responseData = this.response;
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
      } catch (e) {
        // 에러 무시
      }
    });
    return originalSend.apply(this, args as any);
  };
})();
