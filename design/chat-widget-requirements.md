---
document_id: CHATWIDGET-REQ-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-13
updated: 2026-06-13
author: Project Team
reviewers: []
change_log:
  - version: 1.0.0
    date: 2026-06-13
    author: Project Team
    description: Initial draft — 1st-round requirements freeze for IVY USA chat widget
---

# IVY USA Chat & Customer Support Widget — Requirements Analysis (IVY USA 채팅·고객상담 위젯 요구사항 분석서)

## 1. Project Overview (프로젝트 개요)

- **Project**: IVY USA Chat & Customer Support Widget (IVY USA 채팅·상담 위젯)
- **Client**: IVY USA — https://www.ivyusa.com (operated on Shopify)
- **Platform**: Shopify storefront (Shopify 솔루션 운영 스토어)
- **Reference baseline**: Naver Shopping "Naver TalkTalk" feature set (네이버쇼핑 네이버톡 기능 기준)
- **Integration**: AmoebaTalk multi-channel platform (아메바톡 연동, 범위 미정 [TBD])
- **Version / Date**: v1.0.0 / 2026-06-13

### Background and Purpose (배경 및 목적)
The client currently runs an e-commerce store on Shopify (ivyusa.com) without the integrated chat/support capability that Naver TalkTalk provides on Naver Shopping. This project ports a Naver TalkTalk–equivalent experience onto Shopify: order-status notifications for logged-in users, product inquiry for guests, scenario-based guidance, RAG-based AI answering, and human-agent escalation, with all conversations logged for re-training.

(발주사는 Shopify 기반 스토어를 운영 중이나 네이버쇼핑의 네이버톡이 제공하는 통합 채팅/상담 기능이 없다. 본 프로젝트는 네이버톡 수준의 경험 — 로그인 사용자 주문상태 알림, 비로그인 상품문의, 시나리오 안내, RAG AI 답변, 사람 상담원 에스컬레이션 — 을 Shopify에 이식하고, 모든 대화를 재학습용으로 기록한다.)

### Expected Benefits (기대 효과)
- Reduced support load via scenario + RAG self-service (셀프서비스로 상담 부하 감소)
- Higher conversion through real-time product inquiry and order visibility (실시간 문의·주문 가시성으로 전환율 향상)
- Continuous quality improvement via conversation logging and re-training (대화 기록·재학습 기반 품질 향상)
- Unified customer journey insight through CJM (CJM 기반 고객 여정 인사이트)

## 2. Stakeholders (이해관계자)

| Role | Person/Team | Responsibility |
|------|-------------|----------------|
| Client / Product Owner | IVY USA | Requirement approval, content (FAQ/policy) ownership |
| Development Team | Amoeba (KR-VN) | Design, implementation, integration |
| Live Agents | IVY USA support staff | Human escalation handling via agent console |
| AmoebaTalk Platform | Amoeba | Messaging backend / agent infra (scope TBD) |
| Shopify | External | Storefront, Customer & Order APIs, Webhooks |

## 3. Requirements (요구사항 목록)

### Functional Requirements (기능 요구사항)

| ID | Requirement | Priority | Note |
|----|-------------|----------|------|
| FR-001 | Embed chat widget in Shopify storefront, EN/ES/KO UI (Shopify에 채팅 위젯 임베드, 영/스/한 UI) | P0 | i18n |
| FR-002 | Auto welcome message on first access; start session (최초 접근 시 자동 웰컴 메시지, 세션 시작) | P0 | |
| FR-003 | Scenario-based guidance with selectable buttons ("How can I help?" → 1. Delivery status 2. Cancel/Refund …) (버튼형 시나리오 안내) | P0 | |
| FR-004 | Scenario refinement from accumulated user patterns (사용자 패턴 분석 기반 시나리오 고도화) | P2 | 2nd phase |
| FR-005 | Guest (not logged in) can submit product inquiry & general FAQ (비로그인 상품문의·FAQ 가능) | P0 | |
| FR-006 | Auth gate: any request requiring purchaser/order info forces login (구매·주문 정보 요청 시 로그인 강제) | P0 | Core rule |
| FR-007 | Login via Shopify native account (Shopify 기본 계정 로그인) | P0 | Case 1 |
| FR-008 | Login via social login (Shopify Customer Account linked) (소셜 로그인) | P0 | Case 2 |
| FR-009 | Guest order lookup via order number + email verification (게스트 주문조회: 주문번호+이메일) | P0 | Case 3; treated as auth gate |
| FR-010 | Order status for logged-in users (paid/preparing/shipping/delivered) mapped from Shopify Order/Fulfillment (로그인 사용자 주문상태) | P0 | |
| FR-011 | Delivery tracking information (배송 추적 정보 제공) | P0 | |
| FR-012 | Cancel / Refund guidance (취소·환불 안내) | P0 | |
| FR-013 | Natural-language question answered by RAG AI within learned scope (자연어 질문 RAG AI 답변) | P0 | |
| FR-014 | Out-of-scope question → immediate human-agent escalation (학습 범위 이탈 시 즉시 상담원 호출) | P0 | |
| FR-015 | User-initiated agent request escalation (사용자 직접 상담원 요청) | P0 | |
| FR-016 | AI→agent handoff transfers full conversation context (핸드오프 시 전체 컨텍스트 전달) | P0 | |
| FR-017 | Self-built live-agent console (자체 상담원 콘솔 구축) | P0 | AmoebaTalk integration scope [TBD] |
| FR-018 | Log all conversations for re-training (모든 대화 기록·재학습용 저장) | P0 | |
| FR-019 | Re-training: phase 1 manual curation, phase 2 automation (1차 수동 큐레이션 / 2차 자동화) | P1 | P2 portion = phase 2 |
| FR-020 | RAG knowledge sources: FAQ, product info, policy docs (RAG 지식원: FAQ·상품정보·정책문서) | P0 | |
| FR-021 | Knowledge Store as primary source; Google Drive as secondary, synced (Knowledge Store 주 / Google Drive 보조 동기화) | P0 | KB-priority rule |
| FR-022 | Continuous knowledge update (operator adds/edits → re-embedding) (지식 지속 업데이트) | P0 | |
| FR-023 | Notification — in-app widget (default, always on) (인앱 위젯 알림 기본) | P0 | |
| FR-024 | Notification — Email / SMS / Web Push, admin-configurable toggles (이메일/SMS/웹푸시, 관리자 설정형) | P0 | Web Push = PWA |
| FR-025 | Admin console: notification settings, KB management, scenario management, i18n, CCPA policy (관리자 콘솔) | P0 | |
| FR-026 | CRM with Customer Journey Map (CJM) implementation (CRM·CJM 구현) | P0 | Awareness→Browse→Inquiry→Purchase→Delivery→Post |
| FR-027 | RAG answer-language handling: option (A) generate in EN → translate to UI language; option (B) serve EN as-is (RAG 답변 언어 처리) | P1 | Decision pending [TBD] |

### Non-Functional Requirements (비기능 요구사항)

| ID | Requirement | Criteria |
|----|-------------|----------|
| NFR-001 | RAG answer latency (RAG 응답 지연) | Target < 3s for typical query |
| NFR-002 | Widget load impact on storefront (위젯 로드 영향) | Async load, no blocking of storefront render |
| NFR-003 | i18n coverage (다국어 적용 범위) | Welcome, scenario buttons, alerts, agent console = EN/ES/KO static; RAG = EN base |
| NFR-004 | CCPA compliance (CCPA 준수) | Notice, opt-out, deletion request handling, retention policy |
| NFR-005 | Web Push delivery (웹푸시 전달) | Service Worker (PWA) based; graceful fallback if unsupported |
| NFR-006 | Availability of order data (주문 데이터 정합성) | Synced via Shopify Webhook on order/fulfillment events |
| NFR-007 | Conversation log integrity (대화 기록 무결성) | All sessions persisted, exportable for curation |
| NFR-008 | Multi-tenancy / isolation (멀티테넌시) | Per AmoebaTalk architecture (if integrated) |

## 4. Scope Definition (범위 정의)

### In-Scope (포함)
- Chat widget (EN/ES/KO UI) embedded in Shopify storefront
- Auth gate with 3 login cases (Shopify account / social / guest order lookup)
- Order status, delivery tracking, cancel/refund guidance for authenticated users
- Guest product inquiry & FAQ
- Scenario engine (button-based) + RAG AI answering (EN knowledge base)
- Human-agent escalation + self-built agent console
- Notification dispatcher (in-app default; Email/SMS/Web Push configurable)
- Knowledge Store (primary) + Google Drive (secondary) ingestion
- Conversation logging + manual curation (phase 1)
- CRM with CJM
- Admin console
- CCPA compliance baseline

### Out-of-Scope (제외 — 2차/별도)
- Automated re-training pipeline (자동 재학습 — 2차)
- Scenario auto-refinement from patterns (시나리오 자동 고도화 — 2차)
- Native mobile app (Web Push via PWA only; 네이티브 앱 없음)
- Multi-language RAG knowledge base (EN base only in phase 1)

### MVP vs Full (MVP 범위)
- **MVP (Phase 1)**: FR-001~003, 005~018, 020~026 + NFR baseline; manual re-training (FR-019 manual part)
- **Phase 2**: FR-004 (scenario auto-refinement), FR-019 (automated re-training)
- **Pending decision [TBD]**: FR-027 (RAG answer-language strategy), AmoebaTalk integration depth (FR-017)

## 5. Assumptions & Open Issues (가정 및 미결 사항)

| # | Item | Status |
|---|------|--------|
| A-1 | RAG answer-language strategy: (A) EN-generate + translate vs (B) EN as-is | [TBD] — recommend (A) |
| A-2 | AmoebaTalk integration depth: messaging backend only vs agent UI included | [TBD] |
| A-3 | Knowledge Store vs Google Drive duplicate-topic priority | Resolved — Knowledge Store always wins, GDrive supplements gaps |
| A-4 | Web Push depends on PWA delivery timeline | PWA "planned" — sequencing dependency |
| A-5 | Notification event→channel mapping table | To define in Design stage |
| A-6 | CCPA retention period (conversation logs) | To define with client legal |

## 6. System Component Map (시스템 구성도 — 개념)

```
[Shopify Storefront] ── Chat Widget (UI: EN/ES/KO, PWA Web Push)
        |
[Chat Orchestrator]
   |-- Auth Gate ── Shopify account / Social / Guest order lookup (order# + email)
   |-- Scenario Engine ── button scenarios (EN/ES/KO static i18n)
   |-- RAG Service ── EN knowledge base
   |      |-- Knowledge Store (primary)
   |      |-- Google Drive (secondary, synced)
   |      |-- Output translation → user UI language [FR-027, TBD]
   |-- Escalation → Live Agent Console (self-built; AmoebaTalk integration TBD)
   |-- Order Service ← Shopify Admin API / Webhook
   |-- Notification Dispatcher
   |      |-- In-app (default)
   |      |-- Email / SMS / Web Push (admin-configurable)
   |-- Conversation Log Store → (P1) manual curation / (P2) auto re-training
        |
[CRM + CJM Engine] ── Awareness → Browse → Inquiry → Purchase → Delivery → Post
        |
[Admin Console] ── Notifications / KB / Scenario / i18n / CCPA
```

## 7. Traceability Note (추적성)

Each FR feeds the next stages: FR → Requirements Definition → Functional Spec (FN) → Sequence / ERD → WBS (T) → Test Case (TC). IDs are kept consistent across all SDLC documents.

(각 FR은 다음 단계로 이어진다: FR → 요구사항 정의서 → 기능 정의서(FN) → 시퀀스/ERD → WBS(T) → 테스트케이스(TC). 모든 문서에서 ID 참조를 일관되게 유지한다.)
