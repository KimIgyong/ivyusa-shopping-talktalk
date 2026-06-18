---
document_id: CHATWIDGET-SEQ-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
base_documents:
  - CHATWIDGET-FUNCDEF-1.0.0 (Functional Definition)
  - CHATWIDGET-EVTSCN-2.0.0 (Event Scenario)
change_log:
  - version: 1.0.0
    date: 2026-06-15
    author: Project Team
    description: Sequence diagrams for key flows (SEQ-01~SEQ-09) using AmoebaTalk stack participants
---

# IVY USA Chat & Support Widget — Sequence Diagrams (시퀀스 다이어그램)

Technical flows for key functions. Participants use the real stack: **React Widget**, **Next.js Backend** (Chat Orchestrator), **MySQL**, **RabbitMQ**, **Redis**, and external services (Shopify, Fulfillment, Klaviyo, Odoo, Google Drive). Each diagram references FN/FR and the event scenario (S-NN).
(핵심 기능의 기술 흐름. participant는 실제 스택을 사용한다.)

---

## SEQ-01: First Access, Welcome & Session (S1 — FN-001, FN-006~008)

```mermaid
sequenceDiagram
    actor User
    participant W as React Widget
    participant BE as Next.js Backend
    participant R as Redis
    participant DB as MySQL
    participant MQ as RabbitMQ

    User->>W: Open storefront / click launcher
    W->>BE: GET /session (storeLocale, token?)
    BE->>R: Lookup session by token
    alt No active session
        BE->>DB: INSERT session (language, consent=pending)
        BE->>R: Cache session
        BE->>MQ: publish cjm.session_start (Awareness)
    else Existing session
        R-->>BE: Session context
    end
    BE-->>W: session, uiLanguage
    W-->>User: CCPA notice + welcome + AI disclosure
    W-->>User: Scenario menu (Delivery/Cancel/Product Help/Contact/Affiliate)
```

---

## SEQ-02: Auth Gate (S4 — FN-011~014)

```mermaid
sequenceDiagram
    actor User
    participant W as React Widget
    participant BE as Next.js Backend
    participant SH as Shopify API
    participant DB as MySQL
    participant R as Redis

    User->>W: Request needing order data
    W->>BE: POST /auth/required
    BE-->>W: Present methods (account/social/guest)
    alt Shopify / Social login
        User->>W: Select login
        W->>SH: OAuth / Customer Account auth
        SH-->>BE: customerId + token
    else Guest order lookup
        User->>W: order# + email
        W->>BE: POST /auth/guest-lookup
        BE->>SH: Verify order#+email
        SH-->>BE: match / mismatch
    end
    alt Success
        BE->>R: Bind customer/order scope to session
        BE->>DB: UPDATE cjm identity link
        BE-->>W: Authenticated, scope bound
    else Mismatch (retry<5/15min)
        BE-->>W: Verification failed → retry / offer agent
    end
```

---

## SEQ-03: Natural-Language RAG Answering (S5 — FN-015~018)

```mermaid
sequenceDiagram
    actor User
    participant W as React Widget
    participant BE as Next.js Backend
    participant RAG as RAG Service
    participant KS as Knowledge Store
    participant GD as Google Drive
    participant DB as MySQL

    User->>W: Free-text question
    W->>BE: POST /chat/message
    BE->>RAG: classify intent + scope check
    alt Needs order data
        RAG-->>BE: requiresAuth
        BE-->>W: Trigger Auth Gate (SEQ-02)
    else In scope
        RAG->>KS: retrieve (primary)
        alt Gap
            RAG->>GD: supplement (secondary)
        end
        RAG->>RAG: generate (EN) + language strategy
        RAG-->>BE: answer + citation + confidence
        alt confidence < threshold OR timeout>3s
            BE-->>W: Apologize + offer agent (SEQ-06)
        else
            BE-->>W: Answer (UI language) + source
        end
    end
    BE->>DB: log Q/A + retrieval trace
```

---

## SEQ-04: Order Status & Delivery Tracking (S6, S11 — FN-019, FN-020)

```mermaid
sequenceDiagram
    actor Member
    participant W as React Widget
    participant BE as Next.js Backend
    participant SH as Shopify API
    participant FF as Fulfillment
    participant DB as MySQL

    Member->>W: Request order status
    W->>BE: GET /orders/{id} (authed)
    BE->>SH: Fetch order
    BE->>FF: Fetch fulfillment status
    SH-->>BE: order + items
    FF-->>BE: fulfillment status
    BE->>BE: map internal→UI (POL-014)
    BE->>DB: upsert orders_cache
    BE-->>W: status + items
    W-->>Member: Status + delivery stepper (발송준비→배송완료) + Track
```

---

## SEQ-05: Notification Dispatch via Webhook (S8 — FN-025~027)

```mermaid
sequenceDiagram
    participant SH as Shopify
    participant FF as Fulfillment
    participant BE as Next.js Backend
    participant MQ as RabbitMQ
    participant N as Notifier
    participant SW as Service Worker (PWA)
    participant DB as MySQL
    actor User

    SH->>BE: Webhook order/fulfillment change
    FF->>BE: Webhook shipping status
    BE->>BE: validate signature + map status
    BE->>MQ: publish notification.event
    MQ->>N: consume event
    N->>DB: read channel mapping + user prefs
    N->>User: in-app notification (always on)
    alt External enabled & opted-in
        N->>User: Email / SMS
        N->>SW: Web Push
        SW-->>User: Push (fallback if unsupported)
    end
    N->>DB: log dispatch + cjm update
```

---

## SEQ-06: Escalation & Agent Console with AI Assist (S7, S17 — FN-034, FN-035, FN-037)

```mermaid
sequenceDiagram
    actor User
    participant W as React Widget
    participant BE as Next.js Backend
    participant MQ as RabbitMQ
    participant AC as Agent Console
    participant AI as AI Assist
    actor Agent
    participant DB as MySQL

    User->>W: Out-of-scope / "Talk to agent"
    W->>BE: POST /escalate
    BE->>DB: mark conversation escalated
    BE->>MQ: publish handoff (transcript+scope+lang)
    MQ->>AC: deliver to console queue
    BE->>AI: request briefing
    AI-->>AC: summary, intent, sentiment, recommended action
    Agent->>AC: Accept ("개입 중")
    AC-->>User: Agent joins (user UI language)
    Agent->>AC: Resolve / End ("종료")
    AC->>DB: log transcript + cjm + flag curation
```

---

## SEQ-07: Review Request & Writing (S13 — FN-028, FN-029)

```mermaid
sequenceDiagram
    participant SCH as Scheduler
    participant BE as Next.js Backend
    participant N as Notifier
    participant DB as MySQL
    actor Member
    participant W as React Widget

    SCH->>BE: Delivered + N days elapsed
    BE->>N: create review-request notification
    N->>Member: notification (리뷰 filter)
    Member->>W: Tap 리뷰 쓰기
    W->>BE: GET review form (orderItem)
    Member->>W: Submit rating + text
    W->>BE: POST /reviews
    BE->>DB: store review + mark order Review done
    BE->>BE: cjm Post stage
    BE-->>W: confirmation
```

---

## SEQ-08: Affiliate Application (S12 — FN-030, FN-031)

```mermaid
sequenceDiagram
    actor User
    participant W as React Widget
    participant BE as Next.js Backend
    participant DB as MySQL
    actor Operator
    participant ML as Email

    User->>W: "How to become an Affiliate?"
    W-->>User: Program info + CTAs
    User->>W: 지금 신청하기 (form)
    W->>BE: POST /affiliate/apply
    BE->>DB: store application (status=pending)
    BE->>MQ: cjm event
    Operator->>BE: Review (approve/reject)
    BE->>DB: update status; generate link if approved
    BE->>ML: send result email (1–3 business days)
```

---

## SEQ-09: Event/Coupon Campaign Dispatch (S16 — FN-042)

```mermaid
sequenceDiagram
    actor Operator
    participant AD as Admin (React)
    participant BE as Next.js Backend
    participant KL as Klaviyo
    participant MQ as RabbitMQ
    participant N as Notifier
    participant DB as MySQL
    actor Member

    Operator->>AD: Build campaign (recipe + offer)
    AD->>BE: POST /campaign (segmentRef)
    BE->>KL: fetch target segment
    KL-->>BE: segment members
    BE->>MQ: publish campaign.dispatch
    MQ->>N: consume
    N->>DB: filter opted-out (POL-007)
    N->>Member: event notification (이벤트 filter)
    N->>DB: log result + cjm
```

---

## Notes (참고)
- Widget = React (customer-facing); Admin = React; Backend = Next.js Chat Orchestrator; async via RabbitMQ; session/cache via Redis.
- Auth Gate (SEQ-02) is a reusable sub-flow invoked wherever order/purchaser data is needed.
- Next: these flows map to ERD tables (SEQ → TBL) and DFD processes (SEQ → DFD).
