/**
 * @file contentBridge.ts
 * @description isolated world 측에서 메인 월드의 postMessage를 수신하여 파싱 후 콜백에 전달하는 브릿지
 */

import { parseTrickcalApiPayload } from '../domain/dataParser.ts';
import type { ExtractedApiData } from '../domain/types.ts';

export type OnDataReceivedCallback = (data: ExtractedApiData) => void;

/**
 * 메인 월드로부터 가로챈 데이터 메시지를 구독
 */
export function listenForBoardData(callback: OnDataReceivedCallback): () => void {
  const handler = (event: MessageEvent) => {
    // 동일 윈도우의 메시지만 수신
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (
      data &&
      typeof data === 'object' &&
      data.type === 'TCBE_BOARD_DATA_INTERCEPTED' &&
      data.source === 'tcbe-main-interceptor' &&
      data.payload
    ) {
      const parsed = parseTrickcalApiPayload(data.payload);
      if (parsed) {
        callback(parsed);
      }
    }
  };

  window.addEventListener('message', handler);

  return () => {
    window.removeEventListener('message', handler);
  };
}
