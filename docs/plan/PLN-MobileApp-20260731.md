# PLN-MobileApp-20260731 — ShopTalk 모바일 앱 구현 계획

- 작성일: 2026-07-31
- 선행 문서: `docs/analysis/REQ-MobileApp-20260731.md`
- 상태: **사용자 승인 대기** (승인 전 구현 착수 금지)

## 1. 아키텍처 결정 (권고안)

| ID | 결정 | 권고 | 근거 / 대안 |
|---|---|---|---|
| D-1 | RN 프레임워크 | **Expo (managed) + EAS Build** | 개발 속도, OTA 업데이트(EAS Update), 네이티브 설정 최소화. 대안: bare RN — 네이티브 모듈 자유도는 높지만 현 요구(WebView+푸시)에 불필요 |
| D-2 | 푸시 발송 경로 | **expo-notifications + Expo Push Service** (서버는 Expo push token으로 발송, 영수증 확인) | 단일 API로 iOS/Android 커버, 발송 영수증 제공. 서버측 `PushProvider` 인터페이스로 추상화해 추후 FCM v1 직발송으로 교체 가능 |
| D-3 | 채팅 실시간성 | **1단계: 폴링(포그라운드) + 푸시(백그라운드)** — WS/SSE는 도입하지 않음 | 기존 API 무변경 재사용. 폴링 주기: 채팅 화면 활성 5s / 앱 포그라운드 30s / 백그라운드 0(푸시 의존) |
| D-4 | 이벤트 큐 | **1단계는 기존 in-process 팬아웃 유지**, RabbitMQ 소비자 도입은 후속(스케일 필요 시) | G3 해소는 대공사; 단일 API 인스턴스 스테이징에선 in-process로 충분. 캠페인 대량 발송만 chunk 배치 처리 |
| D-5 | 모노레포 배치 | `apps/mobile` (turbo 워크스페이스 등록, `@ivy/types` 재사용) | 타입 공유, 컨벤션 일관성 |
| D-6 | 앱측 API 인증 | 기존 opaque 세션 토큰을 **expo-secure-store**에 보관, `X-Session-Token` 헤더 | 서버 무변경. 토큰 revoke 경로는 M4에서 추가 |
| D-7 | 상담원 응답 푸시 카테고리 | 신규 카테고리 `chat` (거래성 취급 — pref 없으면 허용) | `payment/shipping`과 동급의 서비스 알림. enum 추가 필요 |
| D-8 | 캠페인 본문 모더레이션 | 발송 전 `ModerationService.moderate()` 통과 (G8 보완) | FR-069 정신과 정합; 차단 시 발송 중단+감사 로그 |

## 2. 단계별 계획 (M1 → M5)

### M1 — 백엔드 푸시 모듈 (API만, UI 영향 없음)
`apps/api/src/domain/push/` 신규:
- `entity/device-token.entity.ts` — `device_tokens`:
  `id, tenant_id, customer_id(null), session_id, platform(ios|android), token(uniq 512),
  provider('expo'), locale, app_version, last_seen_at, revoked_at, created_at, updated_at`
  (복합 인덱스 `(tenant_id, customer_id)`, nullable 컬럼 명시적 `type` — A-1 교훈 준수)
- `dto/request/register-push.request.ts` (snake_case) / `push.mapper.ts` / `push.controller.ts`
  - `POST /push/register`, `POST /push/unregister` — @Public + 세션 토큰; 토큰 upsert,
    verified 승격 시 customer_id 재바인딩
- `push-provider.interface.ts` + `expo-push.provider.ts` — 발송, 영수증 폴링, 무효 토큰 revoke
- `push-dispatch.service.ts` — `NotificationService` 외부 채널 팬아웃에 `push` 채널 연결
- 채널/카테고리 enum 확장: `push` 채널, `chat` 카테고리 →
  `notification.request.ts:4`, `notification.service.ts:20`, `packages/types/enum.types.ts:92`,
  widget `types.ts:127`, `privacy.service.ts:31`(opt-out 포함), 위젯 3개 locale
- **G4 수정**: `NotificationService.createRow`에 `tenantId` 명시 전달 (ALS 의존 제거)
- 상담원 응답 발신처: `agent.service.ts` 응답 저장 후 `EVENTS.NOTIFICATION(category:'chat')` 발행
- 에러코드: 다음 미사용 Exxxx 블록 할당 (push 모듈용)
- **Migration**: `sql/migration_push_notifications.sql` (device_tokens 생성 + prefs 카테고리 영향 확인) — 스테이징 `DB_SYNCHRONIZE=false`이므로 배포 전 수동 SQL 선적용 필수

### M2 — RN 앱 셸 (`apps/mobile`)
- Expo SDK + TypeScript + expo-router 탭 내비게이션, i18n(react-i18next, en/es/ko, 위젯 locale 이식)
- api-client (envelope 언랩, `X-Session-Token`, secure-store 토큰 보관)
- 온보딩: 언어 → 알림 권한 → 이벤트(마케팅) 옵트인 → `/session/ensure(shop_domain)` → `/push/register`
- 쇼핑 탭: `react-native-webview`로 스토어프론트; **아이덴티티 브리지** — injected JS가
  로그인 감지 시 `/apps/ivy/identity` 호출 → `ReactNativeWebView.postMessage`로 토큰 전달 →
  네이티브가 verified 토큰 채택(adopt-once) 후 푸시 토큰 재등록
- env: `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_SHOP_DOMAIN` (1테넌트=1앱 전제; G9 대응)

### M3 — 채팅 · 알림 · 설정 화면
- 채팅: `/chat/scenario|message|conversation(after_id)|escalate` 재사용, 시나리오 버튼/텍스트 입력,
  포그라운드 5s 폴링, AppState 따라 폴링 중지
- 알림 센터: `GET /notifications` + 읽음 처리 + unread 배지(앱 아이콘 배지 동기화)
- 주문 탭: `GET /orders`, `/orders/:id`, `/orders/:id/tracking` + guest-lookup 폼
- 설정: 언어, 카테고리별 알림 pref(`PUT /notifications/prefs`), 개인정보(export/delete/opt-out)
- **UX 피드백 규칙 준수**: 모든 저장/변경에 성공/실패 토스트(i18n)

### M4 — 푸시 E2E + 딥링크 + 신뢰성
- 배송 상태 변경 → 푸시 → 탭 → 주문 상세 딥링크 (`shoptalk://order/:id`)
- 상담원 응답 → 푸시 → 채팅 딥링크; 캠페인 발송 → 옵트인 고객 푸시
- 캠페인 팬아웃 chunk 배치(예: 500건 단위) + 발송 결과 카운트 기록 (G6 부분 해소)
- 캠페인 본문 모더레이션(D-8), 세션/토큰 revoke 엔드포인트(선택), 무효 토큰 정리 스케줄러
- 앱 언인스톨/토큰 갱신 시나리오 처리(영수증 기반 revoke)

### M5 — QA · 배포
- TCR 작성(`docs/test/TCR-MobileApp-…`): 단위(푸시 억제 매트릭스, 토큰 upsert, 브리지),
  통합(주문→푸시, 상담→푸시, 캠페인→옵트인만 수신), 엣지(옵트아웃, 삭제 고객, 무효 토큰)
- EAS Build → TestFlight / Play 내부 테스트; 스테이징 API 대상 스모크
- 스토어 심사 대응(R1: 네이티브 기능 중심 설명), RPT 작성

## 3. 와이어프레임 (UI 신규 — 필수)

### 3.1 탭 구조 + 쇼핑(WebView)
```
┌──────────────────────────────┐
│ ◄ ►  ivyusa.myshopify.com  ⟳ │  ← WebView 헤더(뒤로/새로고침)
│ ┌──────────────────────────┐ │
│ │                          │ │
│ │   Shopify Storefront     │ │
│ │      (WebView)           │ │
│ │                          │ │
│ └──────────────────────────┘ │
│──────────────────────────────│
│ 🛍 Shop │💬 Chat │📦 Orders │🔔 Alerts │⚙ Settings │
└──────────────────────────────┘
```

### 3.2 채팅
```
┌──────────────────────────────┐
│ ← IVY Support        (⋯)     │
│ ┌──────────────────────────┐ │
│ │ [AI] 무엇을 도와드릴까요? │ │
│ │  (버튼) 주문조회 배송 문의 │ │
│ │            [나] 배송 언제? │ │
│ │ [상담원] 내일 도착 예정입니… │ │
│ └──────────────────────────┘ │
│ [ 메시지 입력…          ][➤] │
└──────────────────────────────┘
```

### 3.3 알림 센터 + 온보딩 옵트인
```
┌───────────────────────────┐  ┌───────────────────────────┐
│ 🔔 Notifications   (모두읽음)│  │  알림 설정 (온보딩 3/3)    │
│ ● 배송 시작: 주문 #1024    │  │  주문/배송 알림   [필수 ON]│
│ ● 상담원 답변이 도착했어요  │  │  이벤트·혜택 알림 [ ] 동의 │
│ ○ 여름 세일 20% (이벤트)   │  │  ─────────────────────    │
│ ○ 리뷰를 남겨주세요        │  │      [ 시작하기 ]          │
└───────────────────────────┘  └───────────────────────────┘
```

### 3.4 설정
```
┌───────────────────────────┐
│ ⚙ Settings                │
│ 언어            English ▸ │
│ 알림 ─────────────────    │
│  주문/배송          [ON]  │
│  상담 답변          [ON]  │
│  이벤트/혜택        [OFF] │
│ 개인정보 ──────────────   │
│  내 데이터 내보내기     ▸ │
│  판매/공유 거부(opt-out)▸ │
│  데이터 삭제 요청       ▸ │
└───────────────────────────┘
```

## 4. 측면 영향 분석

| 영향 대상 | 내용 | 위험 |
|---|---|---|
| `packages/types` enum | `push` 채널·`chat` 카테고리 추가 — web/widget 재빌드 | 낮음(추가만) |
| 위젯 PreferencesPanel | 채널 목록에 push 노출 여부 결정 필요(웹에선 미지원 → 숨김 권장) | 낮음 |
| `NotificationService` | createRow 시그니처 변경(tenantId 명시) — 기존 3개 발신처 수정 | 중간(회귀 테스트) |
| `privacy` 모듈 | opt-out/삭제 시 device_tokens 정리 추가 | 중간(컴플라이언스) |
| `campaign.service` | 배치화 + 모더레이션 — 기존 콘솔 발송 UX 동일 | 낮음 |
| 스테이징 DB | `device_tokens` 수동 SQL 선적용 (`pre-deploy-check` 스킬 사용) | 규칙 준수 필수 |
| Shopify | 앱측 변경 없음 (App Proxy 기존 경로 재사용) | 없음 |

## 5. 산출물 및 순서

1. (승인 후) M1 → PR (Migration 섹션 포함) → 스테이징 SQL 선적용 → 배포 검증
2. M2+M3 → PR (apps/mobile 신규 — 서버 무영향)
3. M4 → PR → E2E 스모크
4. M5 → TCR/RPT 문서화 + 스토어 제출

사전 준비물(사용자): Apple Developer 계정/APNs 키, Firebase(FCM) 프로젝트, EAS 계정 —
REQ §7 참조. M1은 준비물 없이 착수 가능(Expo 발송은 M4 E2E 시점에 필요).
