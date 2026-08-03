# TCR — 위젯 로그인 리다이렉트/팝업 선택 + 로그인 시 주문 백필 (2026-08-04)

> 근거: `docs/plan/PLN-Widget-Login-Redirect-Orders-20260803.md` (승인 반영판)

## 1. 단위 테스트 (jest, apps/api)

| ID | 대상 | 케이스 | 결과 |
|---|---|---|---|
| U1 | `ShopifySyncService.syncOrdersForCustomer` | customer_id 필터로 페이지 fetch + upsert, 건수 반환 | PASS |
| U2 | 〃 | 동일 고객 TTL(10분) 내 재호출 → 0 반환, Admin API 미호출 | PASS |
| U3 | 〃 | 스토어 미연결(conn null) → 0 반환, Admin API 미호출 | PASS |
| U4 | `SessionMapper.toResponse` | 응답에 `widgetLoginMode` 포함(기존 스냅샷 갱신) | PASS |
| U5 | `SessionService.privacyNotice` | 테넌트 설정 없으면 `widgetLoginMode:'redirect'` 기본값 | PASS |

전체 스위트: **35 suites / 345 tests PASS** (`apps/api npx jest`).
`npm run typecheck`·`npm run build` 전체 통과, API 실부팅 확인(`Nest application successfully started`, dev DB).

## 2. 통합 시나리오 (스테이징 E2E — ambshop-dev.myshopify.com)

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| S1 | 비로그인 → 위젯 주문 탭 → Sign in 클릭 (redirect 모드 기본) | **현재 탭**이 shopify.com 호스티드 로그인으로 이동 → 로그인 → `return_to`로 스토어 복귀 → 위젯 자동 오픈(주문 탭) → Sign in 버튼 없음 + 주문내역 표시 |
| S2 | 이미 로그인 상태에서 아무 스토어 페이지 로드 | 위젯 열면 Sign in 없음 + 주문내역(과거 주문 포함 — 로그인 백필) |
| S3 | 콘솔 `/settings`에서 "팝업 창"으로 변경 후 저장 | 토스트 성공, 새 페이지 로드 후 Sign in 클릭 → 480×720 팝업(종전 동작) |
| S4 | Guest lookup(주문번호+이메일) | 회귀 없음 |
| S5 | 로그아웃 후 위젯 | AuthGate 재노출(authLost 경로) |
| S6 | `?shop_sign_in=true`(Sign in with Shop) 경유 로그인 | identity 인증 성립, S2와 동일 |
| S7 | 콘솔 저장 감사로그 | `audit_logs`에 `tenant.widget_settings_updated` 기록 |

## 3. 엣지 케이스

| ID | 케이스 | 처리 |
|---|---|---|
| E1 | sessionStorage 사용 불가(프라이버시 모드 등) | reopen 플래그만 미동작 — 로그인 자체는 정상, 위젯 수동 오픈 |
| E2 | 로그인 중단 후 브라우저 뒤로가기 | reopen 플래그 소거되어 위젯이 주문 탭으로 열림 → AuthGate 표시(정상) |
| E3 | 캐시된 구버전 embed.js + 신버전 위젯 | `mode` 무시 → 팝업(종전 동작)으로 안전 열화 |
| E4 | ensure 응답 전 Sign in 클릭 | store 기본값 `redirect`로 동작(요구사항 방향) |
| E5 | 복귀 직후 identity 대기 중 주문 탭 | AuthGate 대신 스피너(로그인 직후 로그인 화면 번쩍임 방지) |
| E6 | 백필 중 Admin API 403/오류 | fire-and-forget + debug 로그, 핸드셰이크 응답 영향 없음(웹훅이 이후 자가 치유) |
| E7 | 페이지 로드마다 identity → 백필 과호출 | 고객별 10분 TTL 가드 + 페이지 캡 2(100건) |
| E8 | PATCH widget-settings 잘못된 값 | `@IsIn('redirect','popup')` → 400 |

## 4. 실행 기록

- 2026-08-04: U1~U5 로컬 PASS. S1~S7은 스테이징 배포(마이그레이션 선적용) 후 실측 예정 — 결과는 RPT에 기록.
