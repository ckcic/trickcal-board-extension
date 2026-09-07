# 🎨 Trickcal Board Extension 개발 가이드 및 에이전트 하네스

이 문서는 트릭컬 노트 보드 확장 프로그램(`trickcal-board-extension`) 작업 시 AI 에이전트가 항상 최우선으로 준수해야 할 프로젝트 전용 룰 및 워크플로우 하네스입니다.

---

## 📌 1. 기본 원칙 (Core Rules)

1. **언어 및 주석 규칙**
   - **모든 코드 주석은 반드시 한국어로 작성**합니다.
   - 모든 응답, 작업 단위(Task), 구현 계획(Implementation Plan), 작업 요약(Walkthrough)은 **한국어**로 작성합니다.
2. **형상 관리 (VCS)**
   - 형상 관리 도구는 `svn`을 우선적으로 확인/사용하고, 없을 경우 `git`을 참조합니다.
3. **보안 및 개인정보 보호 (절대 준수)**
   - 사용자의 게임 데이터, 토큰, 계정 정보는 외부 서버로 전송하지 않으며 클라이언트 메모리 내에서만 처리합니다.

---

## 🧱 2. 아키텍처 및 계층별 책임 (Architecture)

프로젝트는 Chrome Extension Manifest V3 기반이며, 3개의 주요 레이어로 분리되어 있습니다:

```text
src/
├── bridge/      # ISOLATED world와 MAIN world 간 통신 (interceptor.ts, contentBridge.ts)
├── domain/      # 순수 비즈니스 로직, 데이터 파싱, 진척도 계산, 타입 정의
├── ui/          # DOM 하이라이팅, 필터 패널, 카드 뱃지 주입, 스타일 관리
└── content.ts   # 콘텐츠 스크립트 진입점 및 레이어 간 오케스트레이션
```

### 레이어별 구현 수칙:
1. **`src/domain/` (순수 로직 계층)**
   - DOM 조작이나 Chrome 확장 API(`chrome.*`)에 의존하지 않는 **순수 함수(Pure Function)** 형태로 작성합니다.
   - 보드 칸 수 계산, 스탯 증가량 산출 등 핵심 수식 변경 시 반드시 `tests/`의 단위 테스트를 함께 갱신하거나 추가해야 합니다.
2. **`src/bridge/` (네트워크 & 월드 격리 계층)**
   - `interceptor.ts`: 메인 페이지(MAIN world)의 `fetch`/`XMLHttpRequest`를 가로채어 필요한 보드 API 응답 데이터만 추출합니다.
   - `contentBridge.ts`: `window.postMessage`를 통해 안전하게 통신하며, 이벤트 리스너 메모리 누수 방지를 위해 이벤트 등록/해제 라이프사이클을 철저히 관리합니다.
3. **`src/ui/` (DOM & 렌더링 계층)**
   - 원본 웹사이트(`note.trickcal.com`)는 SPA이므로 DOM이 수시로 재렌더링됩니다. `MutationObserver`와 **Debounce(지연 실행)** 기법을 적극 활용하여 불필요한 반복 렌더링 및 프리징을 방지합니다.
   - 원본 웹사이트의 스타일과 충돌하지 않도록 네임스페이스 클래스명(예: `tc-badge`, `tc-filter-*`)을 사용합니다.
   - 에셋(스프라이트, 크레파스 이미지 등)은 `chrome.runtime.getURL`을 통해 안전하게 주입합니다.

---

## 🛠️ 3. 기술 스택 & 필수 검증 절차 (Verification)

- **언어 및 런타임**: TypeScript 5.x, Node.js (ES Module `"type": "module"`)
- **번들러**: `esbuild` (`scripts/build.mjs`)
- **테스트 러너**: Node.js 내장 테스트 러너 (`node --test`)

### 에이전트 필수 작업 루틴 (코드 수정 후 반드시 수행):
1. **타입 및 번들 검증**:
   - 코드 변경 후 반드시 `npm run build`를 실행하여 TypeScript 타입 오류나 번들링 에러가 없는지 검증합니다.
2. **단위 테스트 검증**:
   - `domain` 계산 로직 또는 파서 수정 시 `npm test`를 실행하여 기존 테스트(`tests/*.test.mjs`)가 깨지지 않았는지 확인합니다.

---

## 💡 4. 코딩 스타일 및 품질 지침

1. **타입 안전성 (Strict Typing)**
   - `any` 타입 사용을 엄격히 지양하고 `src/domain/types.ts`에 정의된 타입을 적극 재사용/확장합니다.
2. **DOM Null Safety**
   - DOM 요소를 탐색할 때는 원본 사이트의 구조 변경에 대비하여 항상 `null` 체크 및 옵셔널 체이닝(`?.`)을 적용하고, 실패 시 콘솔 에러로 웹페이지 작동이 중단되지 않도록 방어 코드를 작성합니다.
3. **스타일 격리**
   - `!important`의 남발을 지양하고 구체성 높은 셀렉터를 활용합니다.
   - 기존 페이지의 레이아웃(flex, grid, margin 등)을 망가뜨리지 않도록 절대 위치(`position: absolute/fixed`) 및 레이어 계층(`z-index`)을 신중히 설정합니다.

---

## 📚 5. 도메인 지식 & 레퍼런스 (References)

- **인게임 스탯 공식**: `references/stat_formula_reference.md`
  - 트릭컬 노트 원작자 및 유저 분석 기반 스탯 계산식 (기본스탯, 학년/성급 계수, 합연산(보크), 곱연산(황크), 버프 계산 순서 등) 정리
- **데이터 스키마 & 판별 규칙**: `references/data_schema_reference.md`
  - `data.json` 최상위 구조, 노드 판별 규칙(`requireItems` 610003/610004), `statType` 매핑 및 DOM 스프라이트 22구간 오프셋 정리


