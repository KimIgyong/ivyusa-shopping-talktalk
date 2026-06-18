---
document_id: CHATWIDGET-POLICY-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
base_documents:
  - CHATWIDGET-REQDEF-2.0.0 (Requirements Definition)
  - CHATWIDGET-EVTSCN-2.0.0 (Event Scenario)
change_log:
  - version: 1.0.0
    date: 2026-06-15
    author: Project Team
    description: Initial policy definition — POL-001~POL-015 + common policies; rules frozen before functional definition
---

# IVY USA Chat & Support Widget — Policy Definition (정책 정의서)

Business policies and rules that constrain functional behavior, sequences, and data. Per the process standard, policies are frozen **before** the Functional Definition (FN). Each policy references requirement IDs (FR/NFR) and screen evidence (화면 NN). `[TBD]` items carry an owner/decision reference (A-x).
(기능 정의서 작성 전에 고정해야 하는 비즈니스 규칙. 각 정책은 FR/NFR과 화면 근거를 참조하며, 미결 항목은 [TBD]로 표시한다.)

---

## POL-001: Authentication & Order-Data Access (인증·주문데이터 접근)
- **Purpose (목적)**: Protect purchaser/order data; allow guest self-service for non-personal content.
- **Scope (적용 범위)**: All flows requiring order/purchaser info (order status, tracking, cancel/refund, orders panel, subscription).
- **Rules (규칙)**:
  - R1: Any request needing order/purchaser data → Auth Gate before fulfilling (FR-006).
  - R2: Allowed methods — Shopify account / social (Shopify-linked) / guest order lookup (order# + email) (FR-007~009).
  - R3: Guest order lookup grants **single-order scope** only; account login grants full customer scope.
  - R4: On success, bind session to customer/order scope; **never log raw credentials** (NFR-004).
  - R5: Guest lookup mismatch → max **5 retries / 15 min**, then offer agent.
- **Exceptions (예외)**: Consent not given → block order features and explain (POL-002). Auth canceled → return to menu with guest features only.
- **Refs**: FR-006~010 · 화면 10,11,57 · **Change log**: v1.0.0 initial.

## POL-002: Consent & Privacy — CCPA/CPRA + GDPR (동의·개인정보 — CCPA/CPRA + GDPR)
- **Purpose**: Comply with **CCPA/CPRA (US, primary for ivyusa.com)** and **GDPR (EU traffic)**, plus company standard `standards/amoeba_privacy_compliance_v2.md` (PIPA/PDPD where applicable); obtain consent/notice before processing personal data.
- **Scope**: All sessions; all PII processing, storage, and external notifications; integrations (Shopify/Klaviyo/Odoo/Google) as processors.
- **Rules**:
  - R1: Show privacy notice + consent at session start; provide **CCPA "Do Not Sell or Share My Personal Information"** + sensitive-PI limit links (FR-002, PRV-020~022).
  - R2: Consent declined → non-personal FAQ only; suppress PII logging; no order features.
  - R3: Provide opt-out for marketing channels; honor opt-out on every dispatch (FR-049).
  - R4: **Data-subject/consumer rights** — access/know, delete, correct, portability, processing-stop — via DSAR path; honor within legal SLA (GDPR 1mo / CCPA 45d) (PRV-010~017).
  - R5: Deletion/anonymization per retention (POL-003); reflect in backups.
  - R6: **Shopify GDPR mandatory webhooks** (`customers/data_request`, `customers/redact`, `shop/redact`) implemented (multitenancy doc).
  - R7: PII encrypted (AES-256-GCM), masked in logs/admin, access audited; never expose another customer's data; never log raw credentials (PRV-040, NFR-004).
  - R8: Processors under DPA; lawful cross-border transfer basis (PRV-030~032).
- **Exceptions**: Transactional in-app notifications remain allowed as service-essential (POL-007 R1).
- **Refs**: NFR-004 · FR-002,018,049 · standards/amoeba_privacy_compliance_v2.md (PRV-xxx) · 화면 14 · **Change log**: v1.1.0 — added GDPR/CCPA-CPRA rights, DSAR, Shopify GDPR webhooks, processor/cross-border.

## POL-003: Data Retention (데이터 보존)
- **Purpose**: Define how long data is kept and when purged.
- **Scope**: Conversation logs, notifications, order cache, reviews, affiliate records, PII.
- **Rules**:
  - R1: Conversation logs retained for curation/re-training; **retention period [TBD]** with client legal (A-6).
  - R2: On deletion request, remove/anonymize within the legally required window.
  - R3: Order cache is a non-authoritative mirror; source of truth = Shopify/Odoo.
  - R4: Logs exportable for curation (NFR-007); buffer+retry on logging failure.
- **Exceptions**: Legal hold overrides scheduled purge.
- **Refs**: NFR-004,007 · FR-018,019 · **Change log**: v1.0.0 initial. **Status**: retention period [TBD].

## POL-004: Cancellation & Refund (취소·환불)
- **Purpose**: Provide consistent, policy-driven cancel/refund guidance.
- **Scope**: Authenticated order context (POL-001).
- **Rules**:
  - R1: Provide cancel/refund guidance from KB policy docs (FR-012, FR-020).
  - R2: Within policy window → guided self-service steps.
  - R3: Beyond policy window or non-standard → explain policy and route to agent (FR-015).
  - R4: **Refund eligibility window value [TBD]** — confirm with client (default placeholder: per store policy).
- **Exceptions**: Damaged/incorrect item → route to agent regardless of window.
- **Refs**: FR-012,015,020 · 화면 12 ("My order arrived damaged!") · **Change log**: v1.0.0 initial.

## POL-005: Return & Exchange (반품·교환)
- **Purpose**: Standardize return/exchange eligibility communicated in chat.
- **Scope**: Product Help → 교환·반품 (FR-038).
- **Rules**:
  - R1: Return/exchange request allowed **within 7 days of receipt** (화면 60: "수령 후 7일 이내").
  - R2: Product must be **unopened/unused** ("미개봉 상태") to qualify.
  - R3: Out-of-window or opened → route to agent for manual handling.
- **Exceptions**: Defective product handled under warranty (POL-006).
- **Refs**: FR-012,038 · 화면 60 · **Change log**: v1.0.0 initial.

## POL-006: Warranty by Product Category (상품 카테고리별 보증)
- **Purpose**: Apply category-specific warranty terms.
- **Scope**: KB/RAG answers about warranty (FR-020).
- **Rules**:
  - R1: ELECTRONICS & HAIR Tools carry a category-specific warranty (화면 12: "Warranty Policy for ELECTRONICS & HAIR Tools").
  - R2: Warranty terms/duration sourced from KB policy docs; **exact terms [TBD]** with client.
  - R3: Non-warranty categories fall back to general return/refund policy (POL-004/005).
- **Exceptions**: Consumables excluded unless defective.
- **Refs**: FR-020 · 화면 12 · **Change log**: v1.0.0 initial. **Status**: terms [TBD].

## POL-007: Notification Channel & Opt-in/out (알림 채널·수신 동의)
- **Purpose**: Govern which notifications go to which channel and respect user preference.
- **Scope**: All notifications (transactional + marketing).
- **Rules**:
  - R1: **In-app notifications are always on** (service-essential, transactional) (FR-023).
  - R2: Email / SMS / Web Push are admin-configurable per event and **honor user opt-in/out** (FR-024,049).
  - R3: Marketing/event notifications require opt-in and target segment membership (POL-009/FR-040).
  - R4: Web Push via Service Worker (PWA); graceful fallback if unsupported/denied (NFR-005).
  - R5: CCPA opt-out suppresses all external channels (POL-002).
- **Exceptions**: Channel disabled by admin → skip silently.
- **Refs**: FR-023,024,040,049 · NFR-005 · 화면 08,12,34,49 · **Change log**: v1.0.0 initial.

## POL-008: Review Request (리뷰 요청)
- **Purpose**: Define when/how review requests are triggered.
- **Scope**: Delivered orders (FR-034).
- **Rules**:
  - R1: Auto-trigger review request **N days after delivery**; **N value [TBD]** (admin-configurable, A-9; 화면 18 "리뷰 N일 기준 결정").
  - R2: One review request per order item; suppress if opted out (POL-007).
  - R3: **Review storage target (Shopify vs internal) [TBD]** (A-9).
- **Exceptions**: Canceled/refunded orders excluded.
- **Refs**: FR-034 · 화면 19,28,57,64 · **Change log**: v1.0.0 initial. **Status**: N & storage [TBD].

## POL-009: Affiliate Program (제휴 프로그램)
- **Purpose**: Govern affiliate application, review, and commission.
- **Scope**: Affiliate flow (FR-035).
- **Rules**:
  - R1: Application via in-widget form; **review within 1–3 business days**, result by email (화면 62).
  - R2: Approved affiliates receive a personal link; **commission = 10% on sales via that link** (화면 62: "판매 시 10% 적립").
  - R3: **Settlement owner (internal vs external SaaS) [TBD]** (A-10).
  - R4: Duplicate application → show existing status.
- **Exceptions**: Rejected applicants may reapply per cool-down [TBD].
- **Refs**: FR-035 · 화면 62,65~69 · **Change log**: v1.0.0 initial. **Status**: settlement [TBD].

## POL-010: Restock & Subscription Notification (재입고·구독 알림)
- **Purpose**: Govern restock alerts and subscription-member benefits.
- **Scope**: FR-036, FR-037.
- **Rules**:
  - R1: Restock subscription captured per product; alert on inventory restock (source: Odoo/Shopify) (FR-036,042).
  - R2: Subscription view/cancel/change requires authentication (POL-001).
  - R3: Member-only coupons target the subscriber segment (POL-009/FR-040).
  - R4: **Inventory source scope (Odoo vs Shopify) [TBD]** (A-7).
- **Exceptions**: Opt-out suppresses external channels (POL-002/007).
- **Refs**: FR-036,037,040,042 · 화면 12,34,60 · **Change log**: v1.0.0 initial.

## POL-011: RAG Answering, Scope & Language (RAG 답변·범위·언어)
- **Purpose**: Govern AI answer quality, scope, and language handling.
- **Scope**: All RAG answers (FR-013).
- **Rules**:
  - R1: Answer only within learned scope; cite source category (FR-013).
  - R2: Confidence below threshold or out-of-scope → immediate agent escalation (FR-014).
  - R3: AI references **only designated, active Knowledge Sources** of the tenant (FR-065); Knowledge Store(게시판/자료실) primary, Google Drive supplements; duplicates → Knowledge Store wins (POL-013/FR-021); un-designated/inactive/other-tenant/external sources excluded (NFR-012).
  - R4: Answer language strategy **(A) EN-generate → translate vs (B) EN as-is — [TBD]**, recommend (A) (A-1, FR-027).
  - R5: Display persistent AI disclosure in chat UI (NFR-009).
- **Exceptions**: RAG timeout (> NFR-001) → apologize + offer agent.
- **Refs**: FR-013,014,020,021,027 · NFR-001,009 · 화면 14 · **Change log**: v1.0.0 initial.

## POL-012: Agent Escalation & Support Hours (에스컬레이션·상담 시간)
- **Purpose**: Govern human handoff and contact availability.
- **Scope**: FR-015~017, FR-039.
- **Rules**:
  - R1: Escalate on out-of-scope, low confidence, user request, or specific branches (FR-014,015).
  - R2: Handoff bundles full transcript + auth/order context + language (FR-016).
  - R3: Live chat available during business hours (**평일 10:00–18:00**, 화면 61); outside hours show offline message + email callback capture.
  - R4: No agent available → queue + wait message; capture callback.
  - R5: Phone (1588-0000) and email (help@ivy.com) shown per contact card; **values confirm with client**.
- **Exceptions**: Agent may transfer back to AI with preserved context.
- **Refs**: FR-015,016,017,039 · 화면 61 · **Change log**: v1.0.0 initial.

## POL-013: Knowledge Source Priority (지식원 우선순위)
- **Purpose**: Resolve duplicate-topic conflicts deterministically.
- **Scope**: RAG retrieval (FR-020,021).
- **Rules**:
  - R1: Knowledge Store is the authoritative primary source.
  - R2: Google Drive supplements gaps only; never overrides Knowledge Store on duplicates (A-3 resolved).
  - R3: Operator KB edits trigger re-embedding (FR-022).
- **Exceptions**: None.
- **Refs**: FR-020,021,022 · **Change log**: v1.0.0 initial.

## POL-014: Order Status Taxonomy (주문 상태 표준)
- **Purpose**: Standardize status labels across widget and admin.
- **Scope**: Order/delivery status display (FR-010,011,031).
- **Rules**:
  - R1: UI labels = **Confirmed / In Transit / Delivered / Review**; internal = paid / preparing / shipping / delivered (NFR-010).
  - R2: Maintain a single mapping table; apply consistently in widget and admin.
  - R3: Delivery stepper maps to: 발송준비 / 배송시작 / 배송중 / 배송완료 (화면 49).
- **Exceptions**: Canceled/refunded shown as distinct states.
- **Refs**: FR-010,011,031 · NFR-010 · 화면 01,08,49,57 · **Change log**: v1.0.0 initial.

## POL-015: Integration Health & Reliability (연동 상태·신뢰성)
- **Purpose**: Govern external integration behavior and failure handling.
- **Scope**: Shopify, Fulfillment, Klaviyo, Odoo, Google Drive (FR-041~043, FR-021).
- **Rules**:
  - R1: Order/fulfillment via Shopify Webhook + dedicated Fulfillment Webhook (NFR-006).
  - R2: On API/webhook failure → retry with backoff; persistent failure → alert admin + (where relevant) escalate to agent.
  - R3: Show connection status in admin (연결됨/오류) for each integration (화면 19,21).
  - R4: Marketing vs transactional split (Klaviyo vs internal Notifier) **[TBD]** (A-8).
- **Exceptions**: Klaviyo unavailable → defer/queue campaign.
- **Refs**: FR-041,042,043 · NFR-006 · 화면 19,21 · **Change log**: v1.0.0 initial.

---

## POL-018: Credentials & Password (자격증명·비밀번호)
- **Purpose**: Secure account credentials and onboarding.
- **Scope**: admin_users, users, invitations, integration_credentials.
- **Rules**:
  - R1: Passwords stored as **bcrypt hash** only; never plaintext (incl. seed FR-062).
  - R2: Seed/invited accounts **must change password on first login** (`must_change_password`).
  - R3: Temporary password (invitation) one-time, **expiry [TBD 72h]**, re-issuable (FR-063).
  - R4: Password complexity (length + alnum + special) [TBD]; 2FA recommended.
  - R5: Integration credentials encrypted at rest; secrets via secret manager/env in prod.
- **Exceptions**: None.
- **Refs**: FR-062, FR-063, FR-060 · NFR-004 · **Change log**: v1.0.0 initial.

## POL-019: Owner-based Visibility & Sharing (소유자 기반 가시성·공유 — AMB ACL 반영)

- **Purpose**: Adopt the company AMB Platform Access Control (`standards/amb-access-control-policy.md`, ACL-xxx) as a **visibility layer on top of** functional RBAC (POL-017). 기능 권한(직급×라벨)과 별개로 사용자 생성 작업물의 가시성/공유를 규정.
- **Scope**: User-generated work items — KB board posts/files, conversation notes, inquiries, reports, **AI-generated summaries** (live-chat queue & transactional records follow functional RBAC).
- **Rules** (maps to ACL):
  - R1 **Owner-first / default private** (ACL-010): 작업물은 기본 생성자(owner)에게만 노출.
  - R2 **Explicit sharing** (ACL-011): owner가 명시적으로 공유 시 타인 read(또는 상향 권한).
  - R3 **Hierarchical visibility** (ACL-012): 상위 직급(Master/Director/Manager)은 하위 유저 작업물에 **read+comment** 암묵 권한(차단 불가) — 테넌트 내 직급 계층(rank) 기준.
  - R4 **Comment authorization/visibility** (ACL-020/021): COMMENT 권한 이상만 코멘트; 코멘트는 상위 작업물 가시성 상속.
  - R5 **AI native** (ACL-030/031): AI 에이전트는 트리거/소유 유저와 **동일 접근 규칙**으로 동작; AI 생성물 소유권은 해당 유저. (지식 참조 범위는 FR-065와 결합 — 지정 소스만.)
  - R6 **Central access check** (ACL-050): 모든 모듈은 표준 접근 체크 API로 권한 판정.
  - R7 **Audit** (ACL-070): 접근/공유 이벤트 감사 기록(FR-061, `audit_logs`).
  - R8 **Tenant boundary**: 가시성은 테넌트(ent) 내부로 한정 — cross-tenant 불가(NFR-012).
- **Data model**: 대상 테이블에 `_visibility`(TENANT/TEAM/PRIVATE) 컬럼 + owner FK; 공유 매핑 테이블(`*_shares`). (코드 컨벤션 §4.3 visibility 패턴 준용.)
- **Enforcement**: MUST(시스템 강제) — owner/계층/공유 판정은 코드·DB 레벨 차단.
- **Refs**: standards/amb-access-control-policy.md (ACL-001~070) · POL-017, FR-056, FR-061, FR-065, NFR-012.

## POL-020: Outbound Response Moderation (응답 모더레이션)
- **Purpose**: Ensure only safe, compliant messages reach customers — from **both agents and AI**.
- **Scope**: All outbound customer-facing messages (agent console send, AI answers, AI auto-messages).
- **Rules**:
  - R1: Mandatory **non-bypassable moderation gate** before delivery (NFR-013).
  - R2: Filter by **word/phrase/regex AND context** (LLM/classifier) — banned words, profanity, defamation, discriminatory/abusive tone, unauthorized legal/medical/financial commitments, guarantees, PII leakage.
  - R3: Actions by severity — block / mask / warn(require edit) / rephrase. Agent: edit & resend; AI: safe-fallback or escalate.
  - R4: Per-tenant rule sets (Master/Director, SCR-105F) + global defaults (system admin); multilingual (en/es/ko).
  - R5: **Fail-safe** — on filter error/timeout, **do not deliver** (hold/block).
  - R6: All block/mask/warn events audited (`moderation_logs`, FR-061); PII masked in logs (POL-002).
- **Exceptions**: None — applies equally to AI and humans.
- **Refs**: FR-069, NFR-013 · FN-017,035,052 · POL-011, POL-002 · **Change log**: v1.0.0 initial.

## Common Policies (공통 정책)

| Area | Policy |
|------|--------|
| Roles & Permissions (권한) | Admin (full config), Operator (KB/notifications/curation), Agent (assigned conversations). Role-based access enforced across admin console (FR-025). |
| i18n (다국어 — 북미) | Customer primary = **English + Spanish (es-US/es-MX)**, KO internal/admin. Static UI = en/es/ko; **RAG served in ES too** (POL-011 R4/FR-027). Default `en` when unresolved; user-switchable (NFR-003). |
| Rate Limiting (요청 제한) | Per-session message rate limit to protect RAG/agent (threshold [TBD]); guest order-lookup retry per POL-001 R5. |
| Data Isolation (데이터 격리) | Per-customer scope; multi-tenancy per AmoebaTalk architecture if integrated (NFR-008). |
| Credentials (자격증명) | Never log raw credentials; secrets in env/secret store (NFR-004). |
| Audit (감사) | All config changes and escalations logged for traceability (FR-018). |

## Open Policy Decisions (미결 정책 — owners)

| # | Item | Ref | Status |
|---|------|-----|--------|
| A-1 | RAG answer-language (A vs B) | POL-011 | [TBD] — recommend (A) |
| A-6 | Conversation log retention period | POL-003 | [TBD] — client legal |
| A-7 | Restock inventory source (Odoo vs Shopify) | POL-010 | [TBD] |
| A-8 | Klaviyo vs internal Notifier split | POL-015 | [TBD] |
| A-9 | Review trigger N-day & storage target | POL-008 | [TBD] |
| A-10 | Affiliate settlement owner | POL-009 | [TBD] |
| — | Refund window value | POL-004 | [TBD] — client |
| — | Warranty terms/duration | POL-006 | [TBD] — client |
| — | Rate-limit thresholds | Common | [TBD] |

## Traceability (추적성)
Each POL constrains one or more FR/FN. Functional Definition (FN) must cite the POL it enforces; sequences and screens must reflect policy rules. POL → FN → SEQ/SCR → TC.
