/** 확장에서 사용하는 Chrome 런타임 API의 최소 타입 */
declare const chrome: {
  runtime: {
    id: string;
    getURL(path: string): string;
    getManifest(): { version: string };
    onMessage: {
      addListener(listener: (message: unknown, sender: { id?: string }, sendResponse: (response: unknown) => void) => void): void;
    };
  };
  tabs: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?: number }>>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
};
