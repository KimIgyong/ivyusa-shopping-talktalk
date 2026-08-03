# TCR-MobileApp-20260731 — 모바일 앱 + 푸시 파이프라인 테스트

- 작성일: 2026-07-31
- 대상: PLN-MobileApp-20260731 M1(백엔드 푸시) + M2/M3(RN 앱) + M4 백엔드분(캠페인 배치·모더레이션, 딥링크 페이로드)
- 환경: 로컬 dev (MySQL :3316 / Redis :6389 / RabbitMQ :5682), API :3009 실부트

## 1. 단위 테스트 (Jest — `npm test --workspace=@ivy/api`)

### 1.1 신규 `push.service.spec.ts` (8 케이스)
| # | 케이스 | 결과 |
|---|---|---|
| U1 | register: 익명 세션 → 테넌트 바인딩 행 생성 | PASS |
| U2 | register: 재등록 시 upgraded customer로 재바인딩(업서트, 중복 없음) | PASS |
| U3 | register: 비정상 토큰 → E5006 BusinessException | PASS |
| U4 | register: 미존재 세션 토큰 → SESSION_NOT_FOUND | PASS |
| U5 | unregister: revoke + 멱등 | PASS |
| U6 | dispatch: 고객의 활성 디바이스당 1건 발송, data에 category/notificationId | PASS |
| U7 | dispatch: customer null → no-op (상류 fail-closed) | PASS |
| U8 | dispatch: DeviceNotRegistered 티켓 → 토큰 자동 revoke | PASS |

### 1.2 갱신 `notification.service.spec.ts` (9 케이스)
- push 채널이 EXTERNAL 채널로 편입된 억제 매트릭스 전면 재검증:
  fail-closed(익명), 마케팅 default-deny, 거래성 default-allow(push 포함),
  명시 pref 우선, 전체 옵트아웃, 재동의 복원 — ALL PASS
- 신규: `chat` 카테고리 거래성 취급(U-chat), `EVENTS.PUSH_DISPATCH` 발행 검증,
  **G4 수정 검증** — 생성 행 전부에 tenantId 스탬프 — PASS

### 1.3 갱신 `privacy.service.spec.ts`
- 옵트아웃 그리드가 4채널(push 포함)×5카테고리(chat 포함)=20행 업서트 — PASS

**전체 스위트: 28 suites / 269 tests ALL PASS** (기존 260 → +9)

## 2. 통합/스모크 (실제 API 부트 후 HTTP)

| # | 시나리오 | 기대 | 결과 |
|---|---|---|---|
| S1 | 엔티티 추가 후 실부트 | `Nest application successfully started` (교훈 A-1) | PASS |
| S2 | `sql/migration_push_notifications.sql` 로컬 MySQL 적용 | device_tokens 생성(멱등) | PASS |
| S3 | POST /push/register 토큰 헤더 없음 | 401 | PASS |
| S4 | POST /push/register 비정상 푸시 토큰 | 400 E5006 | PASS |
| S5 | POST /push/register 정상(익명) | 200, active:true, envelope 준수 | PASS |
| S6 | POST /push/unregister | 200 revoked:true | PASS |
| S7 | 세션→고객 바인딩 후 재등록 | device_tokens.customer_id 바인딩 | PASS |
| S8 | **E2E**: POST /webhooks/fulfillment(shipped) | in_app+외부채널 알림 행 생성, 전 행 tenant_id=1(G4), push 행 → PUSH_DISPATCH | PASS |
| S9 | S8 연장: ExpoPushProvider → **실제 Expo Push API 호출** | 가짜 토큰에 DeviceNotRegistered 티켓 수신 → 자동 revoke + `push dispatch … devices=1 sent=0` 로그 | PASS |

S8/S9 증적(로컬 DB):
```
id  tenant_id customer_id category channel  title            status_badge
43  1         2           shipping push     Shipping update  In Transit
39  1         2           shipping in_app   Shipping update  In Transit
device_tokens: ExponentPushToken[e2e-smoke] customer_id=2 revoked_at=2026-07-31 02:56:26
로그: push token revoked (ticket DeviceNotRegistered) / push dispatch notif=43 customer=2 devices=1 sent=0
```

## 3. 모바일 앱 검증

| # | 항목 | 결과 |
|---|---|---|
| M1 | `apps/mobile` `tsc --noEmit` (strict) | PASS (0 errors) |
| M2 | 모노레포 `npm run typecheck` / `npm run build` (8 tasks) | PASS |
| M3 | Metro 번들 검증 `expo export --platform android` | PASS (Hermes .hbc 3.42MB 생성 — expo-router/webview/react-query/i18n 전체 번들 성공) |
| M4 | i18n en/es/ko 3개 로케일 전 키 작성 | PASS (하드코딩 UI 텍스트 없음) |

## 4. 엣지 케이스 (단위/코드 경로로 커버)
- 익명 세션 push: 디바이스 등록은 허용, 발송은 fail-closed 억제 (U7 + 매트릭스)
- 마케팅(event) 푸시: pref 행 없으면 0건 발송 (default-deny) — 온보딩 옵트인이
  고객 바인딩 후 `notification_prefs` 기록 (앱 `adoptVerifiedToken` 경로)
- CCPA 옵트아웃: push 채널 포함 전 외부채널 차단 (1.3)
- DSAR 삭제/GDPR shop_redact: device_tokens 삭제 포함 (privacy.service 수정)
- 캠페인 본문 모더레이션 BLOCKED → 발송 전체 중단 + campaign.blocked 감사
- Expo 네트워크 오류: 티켓 실패로 수렴, 예외 전파 없음(알림 행이 폴백)

## 5. 미검증 항목 (실기기/외부 의존 — 후속)
| 항목 | 사유 | 계획 |
|---|---|---|
| 실기기 푸시 수신/딥링크 탭 | APNs 키·FCM/EAS projectId 미보유 (REQ §7 준비물) | EAS Build 후 TestFlight/내부테스트에서 M4 재검증 |
| WebView 아이덴티티 브리지 실동작 | Shopify 스토어 로그인 세션 필요 | 실기기 스모크에 포함 |
| iOS/Android 네이티브 빌드 | 로컬 Xcode/EAS 미실행 | EAS Build 파이프라인 구성 시 |
| Expo 영수증(15분 지연) 스윕 | 인메모리 버퍼 — 프로세스 수명 한정 | 운영 관찰 후 필요 시 영속화 |
| 스테이징 배포 검증 | 배포 전 단계 (RPT 참조) | migration 선적용 → 배포 → 401/404/502 체크 |
