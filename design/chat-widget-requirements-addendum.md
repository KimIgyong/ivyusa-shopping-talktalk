---
document_id: CHATWIDGET-REQ-ADDENDUM-1.1.0
base_document: CHATWIDGET-REQ-1.0.0
version: 1.1.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
source: screens/ (Figma export, 71 frames — TalkTalk) + _contact_sheet.png
change_log:
  - version: 1.1.0
    date: 2026-06-15
    author: Project Team
    description: Gap extraction from design screens; adds FR-028~FR-050, NFR-009~NFR-011, scenario & component-map updates not covered in REQ v1.0.0
---

# IVY USA Chat & Support Widget — Requirements Addendum (요구사항 정의 추가반영서)

화면(`screens/`) 검토 결과, 기존 요구사항 분석서(CHATWIDGET-REQ-1.0.0, FR-001~027 / NFR-001~008)에 **누락된 기능·화면 요소**를 추출하여 추가반영한다. 신규 항목은 FR-028 / NFR-009 부터 부여하며, 기존 항목은 "갱신(Update)"으로 표시한다.
(After reviewing the design screens, items missing from REQ v1.0.0 are extracted and reflected here. New IDs start at FR-028 / NFR-009; existing items are marked "Update".)

---

## 1. Gap Summary (누락 항목 요약)

| # | Gap (누락) | 화면 근거 (Screen) | 처리 | ID |
|---|-----------|-------------------|------|----|
| 1 | 알림센터(Notification Center) 통합 위젯 구조 — Notifications / Chat / Orders 탭, 미읽음 배지, 설정 | 01, 08, 12, 14, 34, 53 | 신규 | FR-028 |
| 2 | 알림 인박스(영속 목록) + 카테고리 필터(전체/결제/배송/이벤트/리뷰) + 읽음 상태 | 08, 34, 48, 49 | 신규 | FR-029 |
| 3 | 위젯 내 주문 패널(결제내역/배송현황/문의하기 서브탭, 주문 이력) | 01 | 신규 | FR-030 |
| 4 | 시각적 배송 추적 스테퍼(발송준비→배송시작→배송중→배송완료) + 배송조회/Track | 49 | 신규 / FR-011 갱신 | FR-031 |
| 5 | 주문 상세 화면(품목·옵션·할인·합계·주소 + 품목별 문의하기) | 10, 11 | 신규 | FR-032 |
| 6 | 내 문의 내역(문의하기 서브탭, 미응답 배지) | 01 | 신규 | FR-033 |
| 7 | 리뷰 기능(N일 후 자동 리뷰 요청 알림, 리뷰 쓰기, Review 상태) | 28, 19, 57, 64 | 신규 | FR-034 |
| 8 | 제휴(Affiliate) 프로그램 — 신청·심사·수익(10% 적립) 플로우 | 62, 65~69 | 신규 | FR-035 |
| 9 | 재입고 알림(Back-in-stock) | 60 | 신규 | FR-036 |
| 10 | 구독 관리(Subscription) + 구독회원 쿠폰 | 12, 34 | 신규 | FR-037 |
| 11 | 제품 도움(Product Help) 구조화 서브메뉴(사용법/성분/교환·반품/재입고) | 60 | 신규 / FR-003·005 갱신 | FR-038 |
| 12 | 멀티채널 고객센터 안내 카드(전화/이메일/채팅 + 영업시간·연락처) | 61 | 신규 | FR-039 |
| 13 | 이벤트·프로모션·쿠폰 마케팅 알림 + 캠페인 타겟팅(세그먼트) | 23, 34, 70 | 신규 / FR-024 갱신 | FR-040 |
| 14 | Klaviyo 연동(캠페인·세그먼트) | 19, 21 | 신규 | FR-041 |
| 15 | Odoo 연동(ERP, JSON-RPC) | 19, 21 | 신규 | FR-042 |
| 16 | Fulfillment 연동(배송 상태 별도 웹훅) | 19, 21 | 신규 / NFR-006 갱신 | FR-043 |
| 17 | 관리자 모니터링 대시보드·분석(KPI, AI 처리현황, 미해결 패턴 Top N, 인기 질문) | 19, 21, 18 | 신규 / FR-025 갱신 | FR-044 |
| 18 | AI 상담 보조 브리핑(요약·고객정보·의도분석·키워드·감정온도·추천액션·개입/종료) | 27, 28 | 신규 / FR-016·017 갱신 | FR-045 |
| 19 | 상담 이력 관리(검색·열람) | 19 sidebar | 신규 | FR-046 |
| 20 | AI Setting / AI Chat Setting(봇 페르소나·Rules·Knowledge·시나리오 버튼 관리) | 25 sidebar | 신규 / FR-025 갱신 | FR-047 |
| 21 | 고객 관리 / 상품 관리 관리자 모듈 | 18, 25 sidebar | 신규 | FR-048 |
| 22 | 사용자 측 알림 설정(위젯 설정 ⚙ → 채널·카테고리 수신 동의) | 12, 14 (gear) | 신규 / FR-024 갱신 | FR-049 |
| 23 | 로그인 사용자 개인화 헤더(Hi, Kim·장바구니/알림 배지·프로필) | 01, 11 | 신규 | FR-050 |
| 24 | AI 응답 고지("This chat is AI-powered…") | 14 | 신규 | NFR-009 |
| 25 | 주문 상태 용어 정합(Confirmed/In Transit/Delivered vs paid/preparing/shipping/delivered) | 01, 08, 49, 57 | FR-010 갱신 | NFR-010 |
| 26 | 알림센터 영속/동기화 성능(탭 전환·필터·미읽음 카운트) | 01, 08, 12 | 신규 | NFR-011 |

---

## 2. New Functional Requirements (신규 기능 요구사항)

| ID | Requirement | Priority | Note / Screen |
|----|-------------|----------|---------------|
| FR-028 | 알림센터(Notification Center) 통합 위젯: 상단 탭(Notifications / Chat / Orders), 탭별 미읽음 배지, 우상단 설정(⚙) — 채팅과 알림을 하나의 패널에서 전환 (Unified Notification Center widget with tabbed nav, per-tab unread badges, settings gear) | P0 | 01,08,12,14,34,53 |
| FR-029 | 알림 인박스: 영속 알림 목록 + 카테고리 필터(전체/결제/배송/이벤트/리뷰), 날짜 그룹핑(오늘/어제/N월 전), 항목별 읽음·미읽음(점) 상태, 주문 상태 배지 (Persistent notification inbox with category filters, date grouping, read/unread state) | P0 | 08,34,48,49 |
| FR-030 | 위젯 내 주문 패널(Orders 탭): 서브탭 결제내역 / 배송현황 / 문의하기, 주문 이력 리스트(주문번호·상품·금액·일자·상태) (In-widget Orders panel with Payments / Shipping / Inquiries sub-tabs and order history) | P0 | 01 |
| FR-031 | 시각적 배송 추적 스테퍼: 발송준비→배송시작→배송중→배송완료 단계 표시, 상태 메시지, 배송조회/Track Order CTA (Visual delivery tracking stepper with step state and track CTA) | P0 | 49 — FR-011 확장 |
| FR-032 | 주문 상세 화면: 품목(이미지·옵션 색상/사이즈)·할인·소계·배송비·총액·연락처·청구지·배송지 표기, 품목/주문별 "문의하기" 진입 (Order detail view with line items, options, totals, addresses, per-order inquiry entry) | P0 | 10,11 |
| FR-033 | 내 문의 내역: Orders 탭의 "문의하기" 서브탭에서 과거 문의/응답 열람, 미응답 배지 (My inquiries history with unanswered badge) | P1 | 01 |
| FR-034 | 리뷰 기능: 배송완료 N일 후 자동 "리뷰 요청" 알림(관리자 트리거 설정), 알림/주문에서 "리뷰 쓰기" 진입, 주문 Review 상태 표기 (Review request: auto-triggered N days after delivery, write-review entry, Review status) | P1 | 19,28,57,64 |
| FR-035 | 제휴(Affiliate) 프로그램: 안내(신청서 제출→심사 1–3 영업일→활동 시작 & 수익, 전용 링크 공유 시 판매 10% 적립), CTA "지금 신청하기 / 더 알아보기", 시나리오 메뉴에 항목 추가 (Affiliate program flow + menu entry) | P1 | 62,65~69 |
| FR-036 | 재입고 알림(Back-in-stock): 품절 상품 재입고 시 알림 신청·발송 (Restock/back-in-stock notification request & dispatch) | P1 | 60 |
| FR-037 | 구독 관리(Subscription): 구독 조회·해지·변경 안내, 구독회원 전용 쿠폰/혜택 알림 (Subscription management guidance + member-only coupon notifications) | P1 | 12,34 |
| FR-038 | 제품 도움(Product Help) 구조화 서브메뉴: 제품 사용법 / 성분 문의 / 교환·반품 / 재입고 알림 / 처음으로 (Structured Product Help sub-menu) | P0 | 60 — FR-003·005 확장 |
| FR-039 | 멀티채널 고객센터 안내 카드: 전화 상담(번호·영업시간), 이메일 문의(주소·회신 SLA), 채팅 상담(지금 바로 연결) (Multi-channel contact-support card with hours & contacts) | P0 | 61 — FR-015 보완 |
| FR-040 | 이벤트·프로모션 알림 + 캠페인: 쿠폰/이벤트(예: BOGO) 콘텐츠 타입, 수동 발송, 타겟 세그먼트 지정, 관리자 Event Setting 및 Campaign Recipes 템플릿 (Marketing/event notifications + campaign targeting & recipes) | P1 | 23,34,70 — FR-024 확장 |
| FR-041 | Klaviyo 연동: 캠페인·세그먼트 연동(마케팅 알림 발송원), 연결 상태 표시 (Klaviyo integration — campaigns/segments) | P1 | 19,21 |
| FR-042 | Odoo 연동: ERP(JSON-RPC) 연동(상품/재고/주문 등 백오피스 데이터), 연결 상태 표시 (Odoo ERP integration via JSON-RPC) | P1 | 19,21 |
| FR-043 | Fulfillment 연동: 배송 상태(In Transit 등) 별도 웹훅 수신·매핑 (Fulfillment integration via dedicated webhook) | P0 | 19,21 — NFR-006 확장 |
| FR-044 | 관리자 모니터링 대시보드: 활성 채팅 세션(대기/AI/상담사), 오늘 발송 알림(성공/실패), AI 해결률, 플랫폼 연동 상태, AI 처리현황(총 대화·자동해결·인계·시간대별), 미해결 패턴 Top N, AI Chat 인기 질문 (Admin monitoring & analytics dashboard) | P0 | 19,21,18 — FR-025 확장 |
| FR-045 | AI 상담 보조 브리핑(상담원 콘솔): 대화 요약, 고객 정보(총 주문·이전 문의), 의도 분석, 키워드 태그, 감정 온도(sentiment), 추천 액션, AI↔상담원 개입/종료 토글 (AI agent-assist briefing in console) | P1 | 27,28 — FR-016·017 확장 |
| FR-046 | 상담 이력 관리: 과거 대화 검색·열람·필터(관리자) (Conversation history management in admin) | P0 | 19 sidebar |
| FR-047 | AI Setting / AI Chat Setting: 봇 페르소나, 응답 Rules, Knowledge(지식) 관리, 시나리오 버튼 구성 (AI behavior/knowledge/scenario configuration) | P0 | 25 sidebar — FR-025 확장 |
| FR-048 | 고객 관리 / 상품 관리 관리자 모듈: 고객 프로필·상품(재고/카탈로그) 관리 (Customer & Product management modules) | P1 | 18,25 sidebar |
| FR-049 | 사용자 알림 설정: 위젯 설정(⚙)에서 채널·카테고리별 수신 동의/거부, CCPA opt-out 연계 (User-side notification preference center) | P0 | 12,14 — FR-024·NFR-004 연계 |
| FR-050 | 로그인 사용자 개인화 헤더: "Hi, {name}", 장바구니/알림 배지, 프로필 — 세션 식별 후 표시 (Logged-in personalization header) | P1 | 01,11 |

## 3. New / Updated Non-Functional Requirements (신규·갱신 비기능 요구사항)

| ID | Requirement | Criteria |
|----|-------------|----------|
| NFR-009 | AI 응답 투명성 고지 (AI disclosure) | 채팅 입력부에 "This chat is AI-powered for faster assistance" 등 AI 응답 고지 상시 표기 (화면 14) |
| NFR-010 | 주문 상태 용어 표준화 (Order status taxonomy) | UI 표기(Confirmed / In Transit / Delivered / Review)와 FR-010 내부 상태(paid/preparing/shipping/delivered) 간 매핑 테이블 정의·일관 적용 |
| NFR-011 | 알림센터 성능·정합 (Notification Center performance) | 탭 전환·필터·미읽음 카운트 즉시 반영, 알림 영속 저장 및 세션 간 동기화 |

## 4. Updates to Existing Requirements (기존 요구사항 갱신)

- **FR-003 (시나리오 버튼)**: 시나리오 메뉴에 **제휴(Affiliate, FR-035)** 추가. 제품 문의는 **구조화 서브메뉴(FR-038)** 로 확장.
- **FR-010 (주문 상태)**: 화면 표기 상태값(Confirmed/In Transit/Delivered/Review)과 내부 상태 매핑 명시 (NFR-010).
- **FR-011 (배송 추적)**: 텍스트 정보 → **시각적 스테퍼 UI(FR-031)** 로 구체화.
- **FR-015 (상담원 요청)**: **멀티채널 고객센터 카드(FR-039)** 로 진입 경로 보강(전화/이메일/채팅).
- **FR-016·017 (핸드오프·콘솔)**: **AI 상담 보조 브리핑·감정분석·추천액션·개입/종료(FR-045)** 추가.
- **FR-023·024 (알림)**: **영속 인박스/필터(FR-029)**, **사용자 수신설정(FR-049)**, **이벤트·캠페인 타겟팅(FR-040)** 로 확장.
- **FR-025 (관리자 콘솔)**: **모니터링 대시보드(FR-044)**, **상담 이력(FR-046)**, **AI Setting(FR-047)**, **고객/상품 관리(FR-048)** 포함하도록 범위 확대.
- **NFR-006 (주문 데이터 정합)**: Shopify 외 **Fulfillment 웹훅(FR-043)** 별도 수신 경로 포함.

## 5. Integration & Component-Map Updates (연동·구성도 갱신)

기존 구성도는 Shopify·Google Drive·AmoebaTalk만 명시. 화면(19,21) 기준 다음 연동을 추가한다:

```
[Admin Console — IVY TalkTalk]
   |-- Monitoring/Overview (KPI, AI 처리현황, 미해결 패턴, 인기 질문)   [FR-044]
   |-- 실시간 채팅 + AI 상황 브리핑/감정분석/추천액션               [FR-045]
   |-- 상담 이력                                                  [FR-046]
   |-- 알림 발송 / Event Setting / Campaign Recipes (타겟 세그먼트)  [FR-040]
   |-- AI Setting / AI Chat Setting (Bot·Rules·Knowledge)         [FR-047]
   |-- 고객 관리 / 상품 관리                                       [FR-048]

[Integrations]
   |-- Shopify     REST API + Webhook (주문/고객)        [기존]
   |-- Fulfillment Webhook (배송 상태)                   [FR-043]
   |-- Klaviyo     Campaigns · Segments (마케팅 알림)     [FR-041]
   |-- Odoo        JSON-RPC (ERP: 상품·재고)             [FR-042]
   |-- Google Drive 동기화 (보조 지식원)                  [기존]
```

이해관계자 표에도 Klaviyo·Odoo·Fulfillment(외부 연동)를 추가 권장.

## 6. New Scenarios to Add to Event-Scenario Doc (이벤트 시나리오 추가 필요)

기존 시나리오(1~9)에 더해 다음 시나리오 신설 권장 (CHATWIDGET-EVTSCN):

- **S10 알림센터 탐색·필터·읽음처리** (FR-028, FR-029, NFR-011)
- **S11 위젯 주문 패널·주문상세·배송 추적** (FR-030, FR-031, FR-032)
- **S12 제휴(Affiliate) 신청·심사·적립** (FR-035)
- **S13 리뷰 요청·작성** (FR-034)
- **S14 재입고 알림 신청·발송 / 구독 관리** (FR-036, FR-037)
- **S15 멀티채널 고객센터 연결** (FR-039)
- **S16 이벤트·쿠폰 캠페인 발송(타겟 세그먼트)** (FR-040, FR-041)
- **S17 관리자 모니터링·AI 보조 상담** (FR-044, FR-045)

## 7. Open Issues Added (미결 사항 추가)

| # | Item | Status |
|---|------|--------|
| A-7 | Odoo 연동 범위(상품/재고만 vs 주문 동기화 포함) | [TBD] |
| A-8 | Klaviyo vs 자체 Notifier 역할 분담(마케팅=Klaviyo, 트랜잭션=자체?) | [TBD] |
| A-9 | 리뷰 요청 트리거 기준(N일) 및 리뷰 저장처(Shopify vs 자체) | [TBD] — 화면 19 "리뷰 N일 기준 결정" |
| A-10 | 제휴 적립/정산 처리 주체(자체 vs 외부 affiliate SaaS) | [TBD] |
| A-11 | 고객/상품 관리 모듈이 Odoo·Shopify 데이터의 표시(read)인지 편집(write)인지 | [TBD] |
| A-12 | 알림센터 Orders 탭과 채팅 "My Orders"의 데이터/권한 일관성 | [TBD] |

## 8. Traceability — Screen → Requirement (추적성)

| Screen(s) | 도출 요구사항 |
|-----------|--------------|
| 01,08,12,14,34,53 | FR-028, FR-029, FR-049, FR-050, NFR-009, NFR-011 |
| 01 (Orders 탭) | FR-030, FR-033 |
| 10,11 | FR-032 |
| 49 | FR-031 (FR-011) |
| 57~62,65~69 | FR-034, FR-035, FR-038, FR-039 |
| 60 | FR-036, FR-038 |
| 12,34 | FR-037, FR-040 |
| 19,21,18 | FR-040, FR-041, FR-042, FR-043, FR-044, FR-046, NFR-010 |
| 25,27,28 | FR-045, FR-047, FR-048 |
