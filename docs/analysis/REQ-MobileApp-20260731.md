# REQ-MobileApp-20260731 — ShopTalk 모바일 앱 (WebView 쇼핑 + 네이티브 채팅/푸시)

- 작성일: 2026-07-31
- 유형: 요구사항 분석 (REQ)
- 관련 문서: `docs/analysis/REQ-ChatWidget-Implementation-20260618.md`(FR 인벤토리),
  `docs/plan/PLN-Privacy-Control-Gap-20260731.md`(억제/옵트아웃 정책 D-1/D-4),
  `docs/plan/PLAN-Scenario-Handoff-Alert-20260707.md`(상담원 응답은 폴링 수신 FR-S4)

## 1. 배경 및 목표

Shopify 쇼핑몰(ivyusa)을 그대로 활용하되, 고객에게 다음을 **안정적으로** 제공하는
전용 모바일 앱(React Native)을 만든다.

1. **푸시 알림**: 주문 상태, 배송 상태, 회사 이벤트/공지 — 핵심 목표
2. **채팅**: 기존 ShopTalk 위젯과 동일한 상담 채팅을 네이티브 화면으로 제공
3. **쇼핑**: Shopify 스토어프론트를 WebView로 그대로 노출 (재구현 없음)

즉 개발 범위는 **푸시 + 채팅 중심**이고, 쇼핑몰 자체는 WebView 래핑이다.

## 2. AS-IS (코드베이스 현황)

### 2.1 채팅 전송 방식
- 위젯은 **REST + 5초 폴링** (`apps/widget/src/hooks/useChat.ts:16`, `after_id` 델타 커서).
  WebSocket/SSE는 리포 전체에 존재하지 않음.
- 공개(@Public) 엔드포인트: `POST /session/ensure|consent|language`,
  `POST /chat/scenario|message|escalate`, `GET /chat/conversation?after_id=`,
  `GET /notifications*`, `GET/POST /orders*` 등 — **모바일 앱이 그대로 재사용 가능**.
- 세션 토큰: opaque 문자열, `X-Session-Token` 헤더. **만료/회전 없음** (모바일 장기 설치 시 고려 필요).

### 2.2 고객 식별 (3단계)
- 익명 → `guest`(주문번호+이메일 조회) → `verified`(Shopify App Proxy `/apps/ivy/identity`가
  `logged_in_customer_id`를 검증하고 고객 바인딩 토큰 발급, `session.service.ts:104`).
- 위젯에서는 iframe `postMessage`로 토큰을 전달(`useEmbedIdentity.ts`) — **브라우저 전용 로직**.
  RN WebView에서는 `window.ReactNativeWebView.postMessage` 브리지로 대체 구현 필요.

### 2.3 Shopify 연동
- 웹훅 처리 존재: `orders/create|updated`, `fulfillments/create|update`
  (`shopify-order-webhook.controller.ts`), HMAC 검증 완비.
- 주문/배송 데이터 저장: `orders_cache`, `fulfillments`(tracking_number, carrier), `order_items`.
- 증분 동기화 스케줄러 존재(`scheduled-shopify-sync.service.ts`).
- ⚠️ `orders/*` 웹훅은 PCD(Protected Customer Data) 승인 전이라 설치 시 등록되지 않음 —
  현재는 **스케줄 동기화가 대신 커버**하므로 주문/배송 푸시는 동기화 주기만큼 지연될 수 있음.
- 테넌트에 `shop_domain` 컬럼 존재(스토어프론트 URL 파생 가능). 커스텀 도메인 컬럼은 없음.

### 2.4 알림 인프라
- `NotificationService`가 `EVENTS.NOTIFICATION` 구독 → `in_app` 행 항상 기록 후
  채널 팬아웃(`in_app|email|sms|web_push`). **외부 채널 발송은 전부 mock**
  (`notification.service.ts:76` — 로그+DB 행만).
- 발신처 3곳: 배송 상태 변경(`order.service.ts:204`), 리뷰, 재입고.
- 캠페인 모듈 존재: `POST /campaigns/:id/send` → 전 고객에 `category:'event'` 알림 팬아웃
  (`campaign.service.ts:84`). 콘솔 UI(`CampaignsPage.tsx`)도 있음.
- 억제 정책(`isSuppressed`): 고객 미연결 → fail-closed 차단; 명시 pref 우선;
  pref 없으면 거래성(`payment`,`shipping`)만 허용, **마케팅(`event`,`review`)은 기본 거부**.

### 2.5 인프라 갭 (푸시 구축 시 반드시 해결)
| # | 갭 | 근거 |
|---|---|---|
| G1 | 디바이스 토큰 저장소 없음 (FCM/APNs/Expo 의존성 전무) | grep 결과 없음 |
| G2 | 외부 발송 mock — 프로바이더 추상화/재시도/무효토큰 처리 없음 | `notification.service.ts:76-78` |
| G3 | RabbitMQ는 **발행만** 하고 소비자 0개 — 팬아웃은 in-process `setImmediate` | `event-bus.service.ts:57` |
| G4 | 알림 행 `tenant_id` NULL 가능성 — `setImmediate` 경로는 ALS 테넌트 컨텍스트 밖 | `notification.service.ts:91-102` |
| G5 | 마케팅 기본 거부 → 옵트인 흐름 없이는 이벤트 푸시 수신자 0명 | `notification.service.ts:127-133` |
| G6 | 캠페인 발송이 무배치 per-customer 루프, `scheduled_at` 미사용 | `campaign.service.ts:88-105` |
| G7 | 세션 토큰 무만료·무회전·평문 저장 | `session.entity.ts` |
| G8 | 알림/캠페인 본문은 모더레이션 미적용 (채팅 3경로는 적용됨) | `chat.service.ts:255` 등 |
| G9 | 멀티테넌트 환경에서 `/session/ensure`는 `shop_domain` 필수 (없으면 400) | `session.service.ts:94` |

## 3. TO-BE

### 3.1 모바일 앱 (`apps/mobile`, React Native)
- **탭 구조**: 쇼핑(WebView) / 채팅 / 주문 / 알림 / 설정
- 쇼핑 탭: `https://{tenant.shop_domain}` (또는 커스텀 도메인 설정값) WebView.
  스토어프론트 로그인 시 App Proxy 아이덴티티 브리지로 `verified` 세션 토큰 획득.
- 채팅 탭: 기존 @Public 채팅 API 재사용. 화면 활성 시 폴링, 백그라운드 시 푸시로 대체.
- 알림 탭: `GET /notifications` 재사용한 알림 센터 + 읽음 처리.
- 설정 탭: 언어(en/es/ko), 알림 카테고리별 수신 동의(옵트인/아웃), 개인정보(내보내기/삭제/opt-out).
- 푸시 탭 시 딥링크: 배송 알림 → 주문 상세, 상담원 응답 → 채팅, 이벤트 → 공지/WebView.

### 3.2 백엔드 푸시 모듈 (`apps/api/src/domain/push`)
- `device_tokens` 엔티티(테넌트/고객/플랫폼/토큰/locale/last_seen/revoked).
- `POST /push/register`, `POST /push/unregister` (@Public, 세션 토큰 인증).
- `push` 채널을 `NOTIFICATION_CHANNELS`/`EXTERNAL_CHANNELS`/types/prefs/privacy opt-out에 추가.
- 프로바이더 추상화(`PushProvider`) + 실제 발송(무효 토큰 정리, 재시도, 발송 로그).
- 상담원 응답 푸시: 신규 발신처 추가(고객이 폴링 중이 아닐 때).
- G4(tenant_id NULL) 수정 동반.

### 3.3 신뢰성 목표 ("안정적으로")
- 거래성 알림(주문/배송)은 **DB 기록(in_app) + 푸시** 이중화 — 푸시 유실 시에도 알림 센터에서 확인 가능.
- 발송 결과/실패 로깅, 무효 토큰 자동 revoke, 캠페인 대량 발송은 배치 처리.

## 4. 갭 분석 (AS-IS → TO-BE)

| 영역 | AS-IS | TO-BE | 신규/변경 |
|---|---|---|---|
| 앱 | 없음 | `apps/mobile` (RN/Expo) | 신규 |
| 푸시 발송 | mock | FCM/APNs 실발송 + 토큰 관리 | 신규 모듈 |
| 채팅 수신 | 5초 폴링(웹) | 폴링(포그라운드)+푸시(백그라운드) | 재사용+발신처 추가 |
| 이벤트 공지 | 캠페인→in_app만 실효 | 캠페인→푸시 채널 + 옵트인 UI | 채널 추가 |
| 주문/배송 알림 | in_app 행만 | 푸시 병행 | 채널 추가 |
| 아이덴티티 | iframe postMessage | RN WebView 브리지 | 신규(앱측) |

## 5. 사용자 흐름 (요약)

```
앱 설치 → 온보딩(언어 선택, 알림 권한 요청, 이벤트 알림 옵트인 선택)
  → /session/ensure(shop_domain) → 익명 세션
  → /push/register(디바이스 토큰)
쇼핑 탭에서 Shopify 로그인 → WebView 브리지가 /apps/ivy/identity 호출
  → verified 토큰 채택 → 토큰 재등록(고객 바인딩)
주문 → Shopify 웹훅/동기화 → 배송 상태 변경 → EVENTS.NOTIFICATION
  → in_app 행 + (pref 통과 시) 푸시 → 탭하면 주문 상세 딥링크
상담 → 채팅 탭(폴링) / 백그라운드 시 상담원 응답 푸시 → 채팅 딥링크
관리자 캠페인 발송 → 옵트인 고객에게 이벤트 푸시
```

## 6. 제약 및 리스크

| # | 리스크 | 대응 |
|---|---|---|
| R1 | **Apple 심사 4.2(최소 기능)** — 순수 WebView 래퍼는 반려 위험 | 네이티브 채팅/알림센터/주문조회/설정이 핵심 화면임을 강조; WebView는 쇼핑 탭 한정 |
| R2 | PCD 미승인으로 `orders/*` 웹훅 미등록 → 푸시 지연 | 동기화 주기 단축 검토 + PCD 승인 추진(기존 갭) |
| R3 | 마케팅 기본 거부(G5) | 온보딩 옵트인 UI가 `notification_prefs`를 명시 기록 |
| R4 | 세션 토큰 무만료(G7) | 모바일 보안 저장(Keychain/Keystore) + 서버 revoke 경로 추가(선택) |
| R5 | iOS 푸시는 Apple Developer 계정/APNs 키 필요 | 사전 준비물로 명시 (아래 §7) |
| R6 | CCPA/GDPR — 푸시는 새 연락 채널 | privacy opt-out(`privacy.service.ts:31`)에 push 포함, 삭제 시 토큰 삭제 |
| R7 | 알림 본문 모더레이션 미적용(G8) | 캠페인 본문 발송 전 moderate() 통과 추가(권장) |

## 7. 사전 준비물 (사용자 액션 필요)

1. Apple Developer Program 계정 + APNs 인증 키(.p8)
2. Firebase 프로젝트(FCM) — Android 필수, (Expo 경유 시에도 FCM 자격증명 필요)
3. Expo(EAS) 계정 — 빌드/배포 파이프라인 사용 시
4. Shopify PCD 승인 상태 확인(주문 웹훅 실시간성)

## 8. 결론

기존 백엔드는 재사용률이 매우 높다(채팅/주문/알림/캠페인 API 전부 존재). 신규 개발의
본질은 **(a) 실제 푸시 발송 파이프라인**(디바이스 토큰 + FCM/APNs + 채널 통합)과
**(b) RN 앱 셸**(WebView 브리지 + 채팅/알림 화면)이다. 상세 설계와 단계 계획은
`docs/plan/PLN-MobileApp-20260731.md` 참조.
