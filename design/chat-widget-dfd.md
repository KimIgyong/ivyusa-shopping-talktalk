---
document_id: CHATWIDGET-DFD-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
base_documents:
  - CHATWIDGET-FUNCDEF-1.0.0 (Functional Definition)
  - CHATWIDGET-SEQ-1.0.0 (Sequence Diagrams)
change_log:
  - version: 1.0.0
    date: 2026-06-15
    author: Project Team
    description: Data Flow Diagrams (Level 0 context + Level 1 processes) across all integrations
---

# IVY USA Chat & Support Widget — Data Flow Diagram (데이터플로우 다이어그램)

Data movement among external entities, processes, and data stores. Notation: External entity (사각형), Process (둥근/원), Data store (저장소). Each data store maps to ERD tables (DFD store → TBL).
(외부 엔터티 ↔ 프로세스 ↔ 데이터 저장소 간 데이터 흐름. 각 저장소는 ERD 테이블과 매핑된다.)

---

## DFD Level 0 — Context Diagram (컨텍스트)

```mermaid
flowchart LR
    USER([User / Member])
    ADMIN([Operator / Admin / Agent])
    SHOP[Shopify]
    FULF[Fulfillment]
    KLAV[Klaviyo]
    ODOO[Odoo ERP]
    GDRIVE[Google Drive]

    SYS((IVY Chat & Support<br/>Widget System))

    USER -->|questions, auth, orders, reviews, prefs| SYS
    SYS -->|answers, status, notifications, tracking| USER
    ADMIN -->|config, campaigns, agent replies| SYS
    SYS -->|dashboards, briefings, history| ADMIN

    SHOP <-->|orders, customers, webhooks| SYS
    FULF -->|shipping status webhooks| SYS
    KLAV <-->|segments, campaigns| SYS
    ODOO <-->|products, inventory JSON-RPC| SYS
    GDRIVE -->|KB documents sync| SYS
```

---

## DFD Level 1 — Main Processes (주요 프로세스)

```mermaid
flowchart TB
    USER([User / Member])
    ADMIN([Operator / Admin / Agent])
    SHOP[Shopify]
    FULF[Fulfillment]
    KLAV[Klaviyo]
    ODOO[Odoo]
    GDRIVE[Google Drive]

    P1((P1 Session & Auth))
    P2((P2 Chat & RAG))
    P3((P3 Order & Tracking))
    P4((P4 Notification))
    P5((P5 Escalation & Agent))
    P6((P6 Admin & Analytics))
    P7((P7 Integration Sync))
    P8((P8 Logging & CJM))

    DS1[(sessions / customers)]
    DS2[(conversations / messages)]
    DS3[(orders_cache / order_items / fulfillments)]
    DS4[(notifications / notification_prefs)]
    DS5[(reviews / affiliates / restock / subscriptions)]
    DS6[(kb_documents)]
    DS7[(campaigns / cjm_events / integration_status)]

    USER -->|open, login, order#+email| P1
    P1 <--> DS1
    P1 <-->|verify| SHOP

    USER -->|question| P2
    P2 <--> DS2
    P2 <-->|retrieve| DS6
    P2 -->|low conf/out-scope| P5

    USER -->|order request, review, restock| P3
    P3 <--> DS3
    P3 <--> DS5
    P3 <-->|orders| SHOP
    P3 <-->|inventory| ODOO

    FULF -->|status webhook| P4
    SHOP -->|order webhook| P4
    P4 <--> DS4
    P4 -->|in-app/email/SMS/push| USER
    P4 -->|read prefs| DS4

    USER -->|talk to agent| P5
    ADMIN -->|reply, intervene| P5
    P5 <--> DS2

    ADMIN -->|config, campaign| P6
    P6 <--> DS7
    P6 <-->|segments| KLAV
    P6 -->|KB edits| DS6
    P6 -->|read metrics| DS2
    P6 -->|read dispatch| DS4

    GDRIVE -->|sync| P7
    ODOO -->|products/inventory| P7
    P7 --> DS6
    P7 --> DS7

    P1 --> P8
    P2 --> P8
    P3 --> P8
    P4 --> P8
    P5 --> P8
    P8 <--> DS7
    P8 -->|logs/journey| DS2
```

---

## Data Store ↔ ERD Mapping (저장소-테이블 매핑)

| DFD Store | ERD Tables |
|-----------|-----------|
| DS1 sessions / customers | `sessions`, `customers` |
| DS2 conversations / messages | `conversations`, `messages`, `inquiries` |
| DS3 orders | `orders_cache`, `order_items`, `fulfillments` |
| DS4 notifications | `notifications`, `notification_prefs` |
| DS5 feature records | `reviews`, `affiliates`, `restock_subscriptions`, `subscriptions` |
| DS6 knowledge | `kb_documents` |
| DS7 ops/meta | `campaigns`, `cjm_events`, `integration_status`, `agents` |

## Key Data Flows (주요 흐름 요약)
- **Inbound transactional**: Shopify/Fulfillment webhooks → P4 → notifications store → user (in-app + opted-in channels).
- **Inbound knowledge**: Google Drive + operator KB → P7/P6 → kb_documents → P2 RAG retrieval.
- **Inbound marketing**: Klaviyo segments → P6 campaign → P4 dispatch (opt-out filtered).
- **Cross-cutting**: every process emits to P8 (logging + CJM) for analytics (P6) and re-training.
- **Auth boundary**: P1 binds scope; P3 personal-data flows require it (POL-001).
