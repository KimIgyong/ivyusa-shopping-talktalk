# REQ-260808-Marketing-Integrations-Klaviyo-Yotpo

ShopTalk 연동설정 페이지에 **Klaviyo·Yotpo 연동 설정 기능** 추가 — 요구사항 분석.

- 작성일: 2026-08-08 · 원 요구: "shoptalk은 Klaviyo, Yotpo와도 연동이 되어야 하므로 연동설정 페이지에 설정 기능 추가"
- 배경: RPT-260808-Shopify-Promotion-Tools 조사 — Klaviyo(이메일/SMS 표준)·Yotpo(리뷰+로열티 통합)는 IVY USA급 Shopify 몰의 표준 스택.

## 1. AS-IS
- 연동설정 페이지(/settings)에 **제네릭 연동 프레임 완비**: 프로바이더 레지스트리
  (`ECOMMERCE_PROVIDERS` 4종: cafe24/woocommerce/odoo/haravan) + 필드 스키마(`INTEGRATION_FIELDS`,
  secret 필드 write-only 마스킹) + 저장(AES-256-GCM `integration_credentials`) +
  **연결 테스트**(`ecommerce-probe.util` — 프로바이더별 실 API 프로브, 상태 기록) +
  타일 UI(`ProviderTile`+`IntegrationConfigModal`).
- API: `GET/PUT /tenants/me/integrations/:provider` + `POST .../test`
  (capability `INTEGRATION_CREDENTIALS_MANAGE`).
- **Klaviyo·Yotpo는 레지스트리에 없음** — 자격증명 저장·검증 불가.
- 참고: 웹은 `@ivy/types` 미의존이라 레지스트리를 `apps/web/.../integration-providers.ts`에
  **미러**로 유지(KEEP IN SYNC 규칙).

## 2. TO-BE (FR)
- **FR-1**: 연동설정 페이지에 **"마케팅 연동" 섹션** 신설(스토어 연동과 구분), Klaviyo·Yotpo 타일 2개.
- **FR-2 Klaviyo**: Private API Key(secret, required) 저장 + 연결 테스트
  (`GET https://a.klaviyo.com/api/accounts/`, `Authorization: Klaviyo-API-Key {key}` + `revision` 헤더 → 200=connected).
- **FR-3 Yotpo**: App(Store) Key(비밀 아님, required) + Secret Key(secret, required) 저장 + 연결 테스트
  (`POST https://api.yotpo.com/oauth/token` client_credentials → access_token 수신=connected).
- **FR-4**: 기존 제네릭 플로우 재사용 — 저장 암호화·secret 마스킹·상태 기록·감사 동일 적용.
- **FR-5**: i18n(en/es/ko) 필드 라벨·타일 설명, 저장/테스트 토스트(기존 규칙).

## 3. 범위 (중요)
- **이번 범위 = 설정(자격증명 + 연결검증)까지.** 실 데이터 플로우(Klaviyo 이벤트/프로필 push,
  세그먼트 연동, Yotpo 리뷰 인입/로열티 조회)는 **후속 REQ**로 분리 — 어느 방향의 플로우를 원하는지
  (예: ShopTalk 캠페인→Klaviyo 이벤트, Yotpo 리뷰→위젯 노출) 별도 결정 필요.

## 4. 갭/제약
- 스키마 변경 **불필요**(integration_credentials가 provider 문자열 키 — 행 추가만).
- 서버 허용 리스트(`ECOMMERCE_PROVIDERS` 검사)에 마케팅 프로바이더 포함 필요.
- Klaviyo API는 `revision` 날짜 헤더 필수. Yotpo는 utoken(oauth) 방식.
- ShopTalk 자체 리뷰 도메인과 Yotpo 리뷰는 별개 축 — 데이터 플로우 설계 시 중복 정의 필요(후속).
