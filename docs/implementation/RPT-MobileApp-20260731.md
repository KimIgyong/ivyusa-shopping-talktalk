# RPT-MobileApp-20260731 — 모바일 앱 + 푸시 파이프라인 구현 보고

- 작성일: 2026-07-31
- 근거 문서: `docs/analysis/REQ-MobileApp-20260731.md` → `docs/plan/PLN-MobileApp-20260731.md`
  (사용자 지시: "승인 없이 계획안대로 진행, 테스트 후 보고서 작성")
- 테스트 상세: `docs/test/TCR-MobileApp-20260731.md`

## 1. 무엇을 구현했나

### M1 — 백엔드 푸시 파이프라인 (`apps/api`)
- **push 도메인 모듈 신규** (27번째 모듈): `device_tokens` 엔티티,
  `POST /push/register`·`/push/unregister`(@Public, 세션 토큰 인증, 신규 에러코드 **E5006**),
  `PushProvider` 인터페이스 + `ExpoPushProvider`(HTTP 직호출, SDK 의존성 없음, 청크 100,
  티켓/영수증 처리, DeviceNotRegistered **자동 revoke**, 15분 주기 영수증 스윕).
- **채널/카테고리 확장**: 외부 채널 `push`, 거래성 카테고리 `chat`
  (`@ivy/types` enum + NotificationService + privacy 그리드 + widget 타입).
- **G4 수정**: `EVENTS.NOTIFICATION` 핸들러는 요청 ALS 밖(setImmediate)에서 실행되어
  `notifications.tenant_id`가 NULL로 저장되던 문제 — `NotifyInput.tenantId` 명시 전달로
  해결, 발신처 3곳(order/restock/review) 모두 갱신. E2E로 tenant_id=1 스탬프 확인.
- **디스패치 경로**: NotificationService가 억제 게이트(D-4: fail-closed·마케팅 default-deny)
  **통과 후** `EVENTS.PUSH_DISPATCH` 발행 → PushService가 고객의 활성 디바이스로 팬아웃.
  in_app 행은 항상 기록되므로 푸시 유실 시에도 알림 센터가 폴백(신뢰성 목표).
- **상담원 응답 푸시**: `AgentService.sendMessage` 저장 후 세션 언어(EN/ES/KO)로
  로컬라이즈된 **일반 문구만** 발송(잠금화면에 대화 내용 미노출), `channel:'push'`로
  email/sms 팬아웃 배제. 익명 세션은 폴링 전용(발송 안 함).
- **캠페인 보강(M4 백엔드분)**: 발송 전 제목/본문 `ModerationService.moderate()`
  (BLOCKED → 발송 중단 + `campaign.blocked` 감사, FR-069/G8 해소) + 50건 청크 팬아웃(G6 부분).
- **프라이버시 정합**: CCPA 옵트아웃 그리드에 push 채널·chat 카테고리 포함,
  DSAR 삭제·GDPR shop_redact 시 device_tokens 삭제 (R6).

### M2/M3 — 모바일 앱 (`apps/mobile`, 신규 워크스페이스)
- **Expo SDK 52** (React 18.3 — 모노레포 React 18과 정합) + expo-router 탭 5개:
  쇼핑(WebView) / 상담 / 주문 / 알림 / 설정. TypeScript strict, en/es/ko i18n(react-i18next),
  UX 규칙 준수(성공 자동닫힘·오류 수동닫힘 토스트).
- **쇼핑 탭**: `https://{EXPO_PUBLIC_SHOP_DOMAIN}` WebView + **아이덴티티 브리지** —
  페이지 로드마다 App Proxy `/apps/ivy/identity` 호출(스토어 동일 출처, Shopify 서명 신뢰),
  `authenticated`이면 customer-bound 토큰을 postMessage로 네이티브에 전달,
  출처 검증(스토어 origin) + adopt-once 후 세션 승격 → 푸시 토큰 재등록.
- **상담 탭**: 기존 @Public 채팅 API 재사용 — 동의 게이트(fail-closed, notice 버전 포함),
  시나리오 버튼(`/ai-config/scenario`), 포그라운드 5초 폴링(화면 이탈 시 중지),
  needsAuth/escalate 피드백. 백그라운드 수신은 chat 푸시가 담당.
- **주문 탭**: 목록/게스트 조회(주문번호+이메일)/상세/배송 스텝 트래킹.
- **알림 탭**: in_app 행만 필터한 알림 센터, 읽음 처리, 30초 unread 폴링 + 앱 아이콘 배지.
- **설정 탭**: 언어(서버 `/session/language` 동기화), 푸시 카테고리 토글 3그룹
  (주문·배송 / 상담 답변 / 이벤트·혜택 — 서버 default 반영), CCPA 옵트아웃 토글,
  DSAR 내보내기/삭제(파괴 작업은 Alert 확인).
- **온보딩**: 언어 → 알림 권한 → 마케팅 옵트인. 옵트인은 고객 바인딩 전이라 로컬 보관 후
  **아이덴티티 승격 시 `notification_prefs`에 기록** (G5 default-deny 해소 흐름).
- **푸시 수신**: 포그라운드 배너 + 탭 시 category 딥링크(chat→상담, shipping/payment→주문,
  기타→알림). 토큰은 expo-secure-store(Keychain/Keystore) 보관 (R4).

## 2. 파일 목록 (커밋 f199f6c → squash 0dc3b2c)

**API 신규**: `apps/api/src/domain/push/{entity/device-token.entity.ts, dto/request/push.request.ts, provider/push-provider.interface.ts, provider/expo-push.provider.ts, push.service.ts, push.controller.ts, push.mapper.ts, push.module.ts, push.service.spec.ts}`
**API 수정**: app.module.ts · notification.{service,response} · agent.service · campaign.{service,module} · order/restock/review.service · privacy.{service,module} · infrastructure.module(EVENTS.PUSH_DISPATCH) · error-code.constant(E5006)
**공유/위젯**: packages/types enum(push/chat) · apps/widget/src/lib/types.ts(NotifChannel)
**모바일 신규**: `apps/mobile/` 전체 27파일 (app/ 라우트 9, src/ lib·services·hooks·store·components·i18n 15, 설정 6 — package.json/app.json/babel/metro/tsconfig/.env.example)
**SQL/문서**: `sql/migration_push_notifications.sql`, `sql/01-schema.sql`(device_tokens 추가), SPEC.md(§4/6/7), REQ/PLN/TCR/RPT

## 3. 테스트 결과 (상세: TCR)
- Jest **28 suites / 269 tests ALL PASS** (+9: push 8, notification/privacy 갱신)
- 로컬 실부트(successfully started) + 스모크 S1-S9: 등록 401/E5006/등록/해지/재바인딩,
  **fulfillment 웹훅 → 알림 행(tenant_id 스탬프) → 실제 Expo Push API 호출 →
  DeviceNotRegistered 티켓 → 자동 revoke** 전 구간 E2E PASS
- 모노레포 typecheck/build 그린, `expo export --platform android` Metro/Hermes 번들 성공
- 미검증(실기기/외부 의존): 실기기 푸시 수신·딥링크, WebView 브리지 실동작, 네이티브 빌드
  → EAS Build/TestFlight 단계에서 검증 (TCR §5)

## 4. 배포 상태

| 항목 | 상태 |
|---|---|
| PR | **#49** (squash-merge → main `0dc3b2c`, 2026-07-31) |
| feature 커밋 | `f199f6c` (branch `KimIgyong/mobile-app`) |
| Migration — local dev | ✅ 적용 (device_tokens 검증) |
| Migration — **staging** | ✅ **코드 배포 전 선적용** (`ivy_mysql_staging`, SHOW TABLES 확인) |
| **staging 배포** | ✅ `deploy-staging.sh` (서버에서 실행) — 부트 로그 `successfully started`, 컨테이너 신규 기동(healthy), 신규 라우트 `POST /push/register` → **401**(=배포됨), `/health` 200 |
| staging 스모크 | ✅ session ensure → push register(active:true) → unregister(revoked:true) |
| production | — (호스트 미정, 기존 상태 유지) |

### 스테이징 환경 변수 (선택)
- `EXPO_PUSH_ACCESS_TOKEN` — 미설정 시에도 발송 동작(Expo enhanced security 미사용).
  설정 시 `docker/staging/.env.staging`에 추가 후 재배포.
- `PUSH_RECEIPT_SWEEP_MIN` — 영수증 스윕 주기(기본 15분, 0=비활성).

## 5. 잔여 작업 (후속)
1. **실기기 E2E (M4 마무리)**: Apple Developer/APNs 키, Firebase(FCM), EAS 계정 확보 →
   `eas build` → TestFlight/내부테스트에서 푸시 수신·딥링크·브리지 검증 (REQ §7 준비물)
2. **스토어 제출 (M5)**: 아이콘/스플래시 에셋, Expo SDK 최신( SDK 56+ ) 업그레이드 검토,
   Apple 4.2 대응 설명(네이티브 채팅/알림/주문 중심)
3. PCD(Protected Customer Data) 승인 → `orders/*` 웹훅 실시간화(현재 스케줄 동기화 지연)
4. 스케일 시: RabbitMQ 실소비자(G3), 영수증 버퍼 영속화, 캠페인 `scheduled_at` 워커
5. 세션 토큰 TTL/회전 정책(G7) — 별도 REQ 권장

## 6. 예방 패턴 (메모)
- 이벤트 버스 핸들러(setImmediate/큐 소비자)에서의 DB insert는 **ALS 기반 자동 스탬프가
  동작하지 않는다** — 테넌트 컨텍스트는 이벤트 페이로드에 명시적으로 실어라 (G4 재발 방지).
- 외부 푸시 프로바이더는 반드시 인터페이스 뒤에 두고, **전송 실패를 예외가 아닌 티켓으로**
  수렴시켜라 — 알림 행(in_app)이 유실 폴백이 된다.
