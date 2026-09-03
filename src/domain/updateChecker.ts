/**
 * @file updateChecker.ts
 * @description GitHub Releases API를 통해 확장 프로그램의 최신 버전을 감지하고 업데이트 알림을 제공하는 모듈
 */

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseName: string;
}

const GITHUB_REPO = 'ckcic/trickcal-board-extension';
const CACHE_KEY = 'tcbe_update_check_cache';
const CACHE_TTL_MS = 1000 * 60 * 10; // 10분 캐시로 단축하여 신속한 업데이트 감지

/**
 * Semver 버전 비교 함수
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if v1 === v2
 */
export function compareSemver(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/i, '').trim();
  const clean2 = v2.replace(/^v/i, '').trim();

  const parts1 = clean1.split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = clean2.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * 최신 릴리스 정보 확인
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  try {
    // 1. 세션 캐시 확인
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          const hasUpdate = compareSemver(parsed.latestVersion, currentVersion) > 0;
          console.log(`[TCBE] 캐시된 업데이트 정보 사용: 현재 v${currentVersion} / 최신 v${parsed.latestVersion} (업데이트: ${hasUpdate})`);
          return {
            hasUpdate,
            currentVersion,
            latestVersion: parsed.latestVersion,
            releaseUrl: parsed.releaseUrl,
            releaseName: parsed.releaseName,
          };
        }
      } catch {
        // 캐시 파싱 에러 시 무시하고 새로 요청
      }
    }

    // 2. GitHub API 요청
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      console.warn('[TCBE] GitHub Releases API 응답 실패:', res.status, res.statusText);
      return null;
    }

    const data = await res.json();
    const tag = (data.tag_name || data.name || '').replace(/^v/i, '').trim();
    if (!tag) return null;

    const releaseUrl = data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`;
    const releaseName = data.name || `v${tag}`;

    // 캐시 저장
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        latestVersion: tag,
        releaseUrl,
        releaseName,
      })
    );

    const hasUpdate = compareSemver(tag, currentVersion) > 0;
    console.log(`[TCBE] GitHub 최신 릴리스 확인 완료: 현재 v${currentVersion} / 최신 v${tag} (신규 업데이트 존재: ${hasUpdate})`);

    return {
      hasUpdate,
      currentVersion,
      latestVersion: tag,
      releaseUrl,
      releaseName,
    };
  } catch (err) {
    console.debug('[TCBE] Update check failed silently:', err);
    return null;
  }
}
