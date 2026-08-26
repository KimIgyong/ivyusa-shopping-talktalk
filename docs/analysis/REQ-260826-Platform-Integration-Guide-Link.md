# REQ-260826 — 플랫폼 연동 가이드 링크(설정 버튼) + /manual HTML 저장

- 요청일: 2026-08-26
- 요청 원문:
  1. 앞서 만든 아티팩트(커머스 연동 자격증명 가이드)를 `/settings/platforms` 플랫폼 연동
     페이지에 **가이드 버튼으로 링크 제공**.
  2. 해당 가이드를 **`/manual` HTML로 저장**한다.

## AS-IS

- 아티팩트: `커머스 연동 자격증명`(claude.ai 아티팩트, 이번 세션 생성) — Shopify·Cafe24·
  WooCommerce·Odoo·Haravan 자격증명 발급 위치 + 발급 화면 도식. 정본 마크다운은
  `docs/guide/GUIDE-260826-Ecommerce-Integration-Credentials.ko.md`(PR #403). **콘솔·사이트
  어디에도 링크되어 있지 않음.**
- `/settings/platforms`(= 설정 페이지 `/settings`의 "연동 쇼핑몰" 섹션, `SettingsPage.tsx`):
  Shopify/Cafe24/Woo/Odoo/Haravan 타일이 있으나 **자격증명을 어디서 얻는지 안내 링크 없음**.
- `/manual` 카드뷰 사이트(`apps/web/public/manual/index.html` + `{doc}.{lang}.{html|md}`,
  ko/en/vi 토글, nginx 서빙, 슬러그 `manual` 예약): 매뉴얼 3권(quick-setup·knowledge-ai·
  user-manual). 연동 자격증명 가이드는 여기에 없음.

## 갭

| # | 갭 | 필요 작업 |
|---|---|---|
| G1 | 아티팩트가 사이트에 상주하지 않음(공유 링크는 claude.ai, 소유자 종속) | 가이드 HTML을 `public/manual`에 독립 파일로 저장 → `/manual/...html` 로 상시 접근 |
| G2 | 플랫폼 페이지에 안내 진입점 없음 | "연동 쇼핑몰" 섹션 헤더에 가이드 버튼(새 탭) |
| G3 | /manual 랜딩에서 발견 불가 | manual index.html에 카드 1장 추가(선택, 발견성) |

## 제약

- 아티팩트 HTML은 게시 래퍼가 doctype/head를 자동 부여하므로, `/manual` 독립 파일용으로는
  **완전한 HTML 문서(`<meta charset="utf-8">` 필수)** 로 감싸야 함(charset 누락 시 한글 깨짐).
- 가이드 콘텐츠는 현재 **한국어 단독**. en/vi 번역은 잔여(기존 매뉴얼과 동일한 원어민 검수 대기 패턴).
- i18n: 새 버튼 라벨은 6개 언어(`npm run i18n:check`).
- 스키마·API 변경 없음(정적 파일 + 프런트 링크). 마이그레이션 불필요.
