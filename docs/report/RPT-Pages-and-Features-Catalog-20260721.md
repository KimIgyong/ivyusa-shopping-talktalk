# RPT — Pages & Features Catalog

- **문서 ID**: RPT-Pages-and-Features-Catalog-20260721
- **작성일**: 2026-07-21
- **대상**: IVY USA Chat & Support Widget (쇼핑톡) — 전체 앱 페이지·기능 인벤토리
- **범위**: `apps/web` (관리 콘솔), `apps/widget` (고객 위젯), `apps/api` (NestJS 백엔드)

모노레포 3앱. 인증 액터 2종: `user`(테넌트 스태프), `admin`(플랫폼). 프론트는 React,
백엔드는 NestJS + MySQL. 이 문서는 GA4 분석 래퍼(§4)를 얹기 위한 페이지·기능 기준선입니다.

---

## 1. apps/web — 관리 콘솔 (React)

라우터 `apps/web/src/router/AppRouter.tsx`. 보호 트리 2개가 `AppLayout` 공유: 테넌트 콘솔
`/` (`actorType=user`), 플랫폼 관리 `/admin` (`actorType=admin`). 로그인은 eager, 나머지
페이지는 lazy 코드 스플릿(PERF-13). 미지정 경로는 `/`로 리다이렉트.

### 인증 (공개)
- **`/login`** — 테넌트 사용자 / 시스템 관리자 로그인 토글, 이메일·비밀번호, 성공 시 `/` 또는 `/admin`. `ChangePasswordModal`.

### 테넌트 콘솔 (`/`, user)

| 경로 | 페이지 | 목적 | 핵심 기능 |
|---|---|---|---|
| `/` | DashboardPage | 테넌트 KPI 홈 | KPI 카드 6종(Active Chats·Today's Notifications·AI Resolution Rate·Unresolved Top-N·Total Conversations·Total Orders, 각 링크), Popular Questions, Integration Status, Recent Orders 표 |
| `/live-chat` | LiveChatPage | 상담원 콘솔/실시간 채팅 | 3컬럼(세션 목록·메시지 스레드·컨텍스트). Accept/Take-over, End, 모더레이션 답장(422=차단 토스트), AI Briefing, 고객 카드+최근 주문, Match/Create Customer 모달, `?c=` 딥링크, EscalationAlarm(폴링 모달) |
| `/history` | HistoryPage | 대화 이력 | 필터(status·escalated), 페이지네이션 표(id·고객·상태·메시지수·시작), 행 클릭 상세 모달 |
| `/ai-setting` | AiSettingsPage | AI/봇 설정 | Persona, Response Rules, Scenario Buttons(라벨·액션·enabled·정렬), AI Functions(함수별 엔진·temperature·max_tokens), Moderation Rules(패턴·액션·설명) |
| `/knowledge` | KnowledgePage | 지식베이스/RAG | Sources 표+추가 모달(url/file/faq/manual), Documents 표+추가 모달(title/source/content) |
| `/customers` | CustomersPage | 고객 디렉터리 | 이메일 검색(정확 일치·PRV-M6), 페이지네이션 표(이름·이메일·tier·주문수·총구매·생성), Edit Tier 모달 |
| `/orders` | OrdersPage | 주문 목록 | 페이지네이션 표(주문#·상태·금액·아이템수·날짜) |
| `/campaigns` | CampaignsPage | 마케팅 캠페인 | 표+행별 Send, New Campaign 모달(name·channel·message) |
| `/users` | UsersPage | 테넌트 스태프 | 표(이메일·rank·job-label·상태), Invite 모달(임시 비번 발급+복사), Issue Temp Password, Edit(rank/labels/status) |
| `/settings` | SettingsPage | 연동·설치 | Shopify 카드(도메인·토큰·Save/Test/Sync/Register Webhooks), Install Guide(embed.js 스니펫 탭), e-commerce IntegrationCard(cafe24/woocommerce/odoo/haravan), Credentials 표 |

### 플랫폼 관리 (`/admin`, admin)

| 경로 | 페이지 | 목적 | 핵심 기능 |
|---|---|---|---|
| `/admin` | AdminOverviewPage | 플랫폼 개요 | KPI 카드(Total Tenants 등), Integration Status |
| `/admin/tenants` | TenantsPage | 테넌트 관리 | 표(name·slug·plan·status·user수), Suspend/Activate, New Tenant 모달 |
| `/admin/ai-engines` | AiEnginesPage | AI 엔진 레지스트리 | 표(name·provider·model·enabled·apiKey마스킹), Add/Edit/Enable-Disable |
| `/admin/audit` | AuditPage | 감사 로그 | 읽기전용 페이지네이션 표(time·actor·action·target·ip) |

---

## 2. apps/widget — 고객 위젯 (React)

진입 `apps/widget/src/App.tsx`. 데모 Storefront + Widget 렌더, `?embed=1`이면 위젯만(스토어
iframe 임베드). `Ga4Provider`로 래핑(§4). i18n en/es/ko.

### 셸
- **Widget** — 플로팅 런처(미확인 배지), 패널 open/close, `ivy:resize` 전달, 세션/신원/구매 시그널 마운트, GA4 open/close.
- **WidgetPanel** — 패널 다이얼로그(모바일 시트/데스크톱 카드), 헤더(LanguageSwitcher·Settings·닫기), 하단 TabBar.
- **TabBar** — Notifications(배지)/Chat/Orders, GA4 tabView.

### 화면·패널 (고객이 할 수 있는 것)

**Chat 탭** — AI 고지 배너, 웰컴, 메시지 스레드, **ConsentBanner**(CCPA Accept/Decline → GA4 동의 게이팅), **ScenarioMenu**(delivery_status·my_orders·contact_support·affiliate·cancel_refund·product_help·message + Product Help 하위메뉴), 퀵리플라이 칩(agent_connect 등), 인라인 카드(AuthGate·ContactCard·AffiliateCard), 자유 입력→AI 답변, 주문탭에서 큐된 질문 자동 전송. **AuthGate**=스토어 로그인 또는 비회원 조회(주문#+이메일→세션 바인딩).

**Orders 탭** — 미인증 시 AuthGate. 서브탭 Payments/Shipping/Inquiries. 주문 목록→**OrderDetailView**(총액·품목·**Track** 배송 스테퍼·**Ask** 질문 큐잉·배송완료 시 **ReviewForm** 별점). GA4 orderView/trackingView.

**Notifications 탭** — 필터 칩(all/payment/shipping/event/review), 날짜 그룹 목록, 미확인 점, 클릭 시 읽음.

**Settings/Preferences** — 알림 선호 매트릭스(채널×카테고리), **Privacy**: Do Not Sell/Share 옵트아웃, Export my data(JSON), Delete my data(2단계) — 검증된 Shopify 세션 필요.

### 훅·서비스·세션
- 훅: useChat, useScenario, useOrders, useNotifications, usePrivacy, useSession, useEmbedIdentity, usePurchaseSignal.
- 서비스: session/chat/scenario/order(비회원 조회 포함)/notification/privacy/misc.
- 세션/신원: `ensureSession(token, lang, shop)`가 `?shop=`로 테넌트 바인딩; `useEmbedIdentity`가 App-Proxy 검증 토큰(`ivy:session`)을 https 부모에서 1회 채택. Store(Zustand): sessionToken·authenticated·activeTab·panelOpen·**consent**·language·pendingChatMessage.

---

## 3. apps/api — NestJS 도메인 모듈

- **affiliate** — 제휴 신청/상태, 관리자 승인.
- **agent** — 상담원 콘솔: 에스컬레이션 알림, 세션 큐, 대화+AI 브리핑, accept/end, 모더레이션 메시지, 고객 링크/생성, 프로필·일일통계.
- **ai-engine** — AI 엔진 레지스트리 + 테넌트 AI 설정(persona/rules/scenario) + 함수별 엔진.
- **analytics** — 대시보드 KPI + 대화 이력 검색(§4).
- **audit** — 감사 로그.
- **auth** — 로그인/refresh(회전)/change-password/logout, 로그인 레이트리밋.
- **campaign** — 캠페인 생성/발송(옵트아웃 존중).
- **chat** — 시나리오 스크립트, 메시지→AI/RAG, 델타 조회, escalate; rag/scenario 서비스.
- **cjm** — 고객 여정 이벤트 로그(§4).
- **customer** — 고객 디렉터리(PII 암호화·PRV-M6).
- **health** — liveness/readiness.
- **inquiry** — 문의 open/list, 관리자 답변.
- **integration** — 연동 상태(last_sync_at).
- **knowledge** — 지식 소스 + RAG 문서(FULLTEXT·PERF-2).
- **moderation** — 콘텐츠 필터 규칙 + 메시지 모더레이션(비우회).
- **notification** — 알림 목록·미확인수·선호·읽음(Redis 캐시).
- **order** — 주문 캐시/조회 + Shopify(비회원 조회, 상세·추적, 증분 동기화·웹훅).
- **privacy** — DSAR(export/erase), CCPA 옵트아웃, 보존 퍼지, Shopify GDPR 웹훅.
- **restock** — 재입고 알림 구독.
- **review** — 상품 리뷰.
- **session** — 위젯 세션 생성/재개, CCPA 동의, 언어.
- **shopify-oauth** — Shopify OAuth begin/callback.
- **shopify-proxy** — App-Proxy로 로그인 고객→세션 토큰.
- **subscription** — 구독 목록/취소.
- **tenant** — 테넌트 + 연동 크리덴셜, Shopify 설정, e-commerce 연동.
- **user** — 테넌트 사용자(초대/임시비번/rank/labels) + job labels.

**여정 관련 엔드포인트**: session(create/consent/language), chat(scenario/message/messages?after_id/escalate), orders(lookup/list/:id/:id/tracking), notifications(list/unread-count/preferences), privacy(export/erase/opt-out).

---

## 4. 고객 여정 / 분석

### 백엔드 CJM — `domain/cjm/`
이벤트 버스 `EVENTS.CJM` 구독 → append-only `cjm_events`(tenantId·sessionId·customerId·
stage·eventType·payload·createdAt). 스테이지: **Awareness/Browse/Inquiry/Purchase/Delivery/Post**.
`GET /cjm/events`(ANALYTICS_READ, stage·customer 필터).

### 백엔드 analytics — `domain/analytics/`
`GET /analytics/dashboard`(KPI: activeChats·todayNotifications·aiResolutionRate·popularQuestions·
unresolvedTopN·totalConversations·totalOrders, 30s Redis 캐시, 테넌트 스코프) + `GET /analytics/conversations`(이력 검색). 웹 Dashboard/History가 소비. **웹에는 클라이언트 GA 없음** — 백엔드 KPI만.

### 프론트 GA4 / UTM (위젯 전용) — `apps/widget/src/lib/analytics/`
이번 작업으로 추가한 GA4 전환·UTM 래퍼. 상세는 `docs/guide/GA4-Analytics-Integration.md`.
- `ga4.ts` — 동의 인지 gtag 래퍼(Consent Mode v2, ID 없으면 no-op, 사전동의 큐).
- `events.ts` — 이벤트 어휘 + 퍼널(awareness→engagement→consideration→intent→purchase, 백엔드 CJM과 정렬).
- `utm.ts` — UTM 캡처 + GA4 채널 그룹핑 + first/last-touch.
- `Ga4Provider.tsx` / `useAnalytics()` — 타입드 API, 마운트 시 노출 이벤트, 구매 중복 제거.
- `hooks/usePurchaseSignal.ts` — embed.js의 `ivy:purchase`(Shopify 주문완료)로 결제 전환 발화.
- 발화 지점: App(컨텍스트·동의), ChatTab, AuthGate, OrderDetail, TabBar, Widget. Storefront: `public/embed.js`.

**요약**: 백엔드는 6단계 CJM 이벤트 스트림 + 대시보드 KPI를 이미 보유. 위젯에는 이번에 UTM
출처 세분화 + Consent-Mode-v2 퍼널 + 스토어프론트 결제 전환 브리지를 갖춘 GA4 래퍼를 추가.
