/** 확장에서 사용하는 Chrome 런타임 API의 최소 타입 */
declare const chrome: { runtime: { getURL(path: string): string; getManifest(): { version: string }; }; };
