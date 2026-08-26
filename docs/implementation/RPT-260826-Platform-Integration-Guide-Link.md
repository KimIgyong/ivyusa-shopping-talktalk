# RPT-260826 — 플랫폼 연동 가이드 링크 + /manual HTML 저장

- 요구사항: ① `/settings/platforms`에 연동 가이드 **버튼 링크**, ② 가이드를 **/manual HTML로 저장**.
  (사용자 요청으로 **ko/en/vi 3종** 동시 제작)
- 문서 체인: REQ-260826 → PLN-260826(승인) → 본 RPT.
- **배포 상태: PR #408 (`9e47044`) main 머지 + 스테이징 배포·검증 완료 (2026-08-26).**
- 스키마·API 변경 없음 — 마이그레이션 불필요(정적 파일 + 프런트 링크).

## 무엇이 바뀌었나

### /manual 저장 (S1·S2)
- `apps/web/public/manual/platform-integration.{ko,en,vi}.html` — 커머스 연동 자격증명
  발급 위치 가이드(5개 플랫폼 + 발급 화면 도식). 각 파일은 완전한 HTML 문서
  (`<meta charset="utf-8">`), 상단 **언어바(한국어/EN/VI) + "← 매뉴얼" 백링크**, 자기완결
  (외부 자산은 Google Fonts만). 접근: `/manual/platform-integration.{lang}.html`.
- `/manual` 카드뷰 `index.html`에 4번째 카드 추가 — 기존 언어 토글 JS(`data-doc`/`data-fmt`)와
  연동되어 언어 전환 시 해당 언어 HTML로 이동. i18n 문자열 c4t/c4d/c4a ko/en/vi 추가.

### 설정 플랫폼 버튼 (S3)
- **리팩터링 반영**: main이 `/settings/platforms`를 실제 라우트(`SettingsPlatformsPage.tsx`)로
  분리해둔 상태였음 → 그 페이지 헤더(부제 옆)에 **[연동 가이드]** 버튼(lucide `BookOpen`).
- 버튼은 `<a target="_blank" rel="noopener noreferrer" href="/manual/platform-integration.{lang}.html">`.
  UI 언어(`i18n.language`)가 ko/en/vi면 그 언어, 그 외 언어는 ko로 폴백. **정적 페이지라
  콘솔 인증과 무관하게 열림.**
- i18n `settings.integrationGuide` 6개 언어(en/ko/es/vi/ja/zh).

## 파일 (PR #408)
- 신규: `public/manual/platform-integration.{ko,en,vi}.html`
- 수정: `public/manual/index.html`(카드), `SettingsPlatformsPage.tsx`(버튼), settings locale 6종
- 문서: REQ/PLN

## 검증
- typecheck·build·i18n:check 그린.
- 로컬 E2E: 3종 200·charset 정상·도식 렌더·언어바 토글(EN↔VI) 확인; dev@ 로그인 →
  Platforms 탭 우상단 **[Integration guide]** 버튼 → **새 탭으로 `/manual/platform-integration.en.html`**
  (UI 언어 English 매칭) 오픈 확인.
- 스테이징(배포 직후): `/manual/platform-integration.{ko,en,vi}.html` 200, 한글 원문 정상,
  index에 카드 노출; 버튼 코드가 lazy 청크 `SettingsPlatformsPage-*.js`에 배포됨 확인
  (해당 페이지는 route-level code splitting이라 메인 번들이 아닌 별도 청크에 존재).

## 운영 메모 / 잔여
- **정본 관리**: 가이드 정본 md는 `docs/guide/GUIDE-260826-...ko.md`(PR #403). 원본 개정 시
  `public/manual/platform-integration.*.html` 사본을 **동반 갱신**(매뉴얼 사이트 원칙).
- claude.ai 아티팩트(`ac118d09-…`)는 세션 공유용으로 유지되나, **사이트 상주본은 이제
  /manual HTML**이 정본 진입점.
- en/vi는 초안 번역(기존 매뉴얼과 동일한 원어민 검수 대기 패턴) — 잔여 P2.
- 스테이징 버튼 육안은 테넌트 로그인 프리필 꼬임(브라우저가 go2joy로 리다이렉트·타 계정
  프리필)으로 대신 **배포 청크 정적 확인**으로 갈음(버튼 코드는 로컬에서 동일하게 E2E 검증).
- 예방 패턴: 외부/정적 진입점 링크는 **정적 /manual 페이지**로 두면 콘솔 인증·번들 상태와
  무관하게 항상 열린다(아티팩트 소유자 종속 회피). lazy 라우트 배포 확인은 메인 번들이
  아니라 **해당 청크**를 grep해야 한다.
