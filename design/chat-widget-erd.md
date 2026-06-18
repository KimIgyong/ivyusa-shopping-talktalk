---
document_id: CHATWIDGET-ERD-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
base_documents:
  - CHATWIDGET-FUNCDEF-1.0.0 (Functional Definition)
  - CHATWIDGET-DFD-1.0.0 (Data Flow Diagram)
sql: chat-widget-schema.sql
change_log:
  - version: 1.0.0
    date: 2026-06-15
    author: Project Team
    description: ERD + table definitions; DDL in chat-widget-schema.sql (MySQL)
---

# IVY USA Chat & Support Widget — ERD (엔터티 관계도)

Database schema (MySQL). DDL is generated separately as `chat-widget-schema.sql`. All identifiers in English; timestamps `created_at`/`updated_at` standard.
(MySQL 스키마. DDL은 별도 SQL 파일로 생성한다.)

---

## ER Diagram (관계도)

```mermaid
erDiagram
    customers ||--o{ sessions : has
    customers ||--o{ orders_cache : places
    customers ||--o{ notifications : receives
    customers ||--o{ notification_prefs : sets
    customers ||--o{ reviews : writes
    customers ||--o| affiliates : applies
    customers ||--o{ restock_subscriptions : subscribes
    customers ||--o{ subscriptions : owns
    sessions ||--o{ conversations : contains
    conversations ||--o{ messages : has
    conversations ||--o{ inquiries : raises
    agents ||--o{ conversations : handles
    orders_cache ||--o{ order_items : includes
    orders_cache ||--o{ fulfillments : ships
    orders_cache ||--o{ inquiries : about
    order_items ||--o{ reviews : reviewed_by
    sessions ||--o{ cjm_events : emits

    customers {
        bigint id PK
        varchar shopify_customer_id
        varchar email
        varchar name
        datetime created_at
    }
    sessions {
        bigint id PK
        varchar session_token
        bigint customer_id FK
        varchar language
        varchar consent_state
        datetime created_at
    }
    conversations {
        bigint id PK
        bigint session_id FK
        varchar channel
        varchar status
        tinyint escalated
        bigint agent_id FK
        datetime created_at
        datetime ended_at
    }
    messages {
        bigint id PK
        bigint conversation_id FK
        varchar sender_type
        text body
        varchar lang
        json retrieval_trace
        datetime created_at
    }
    orders_cache {
        bigint id PK
        varchar shopify_order_id
        bigint customer_id FK
        varchar order_number
        varchar status_internal
        varchar status_ui
        decimal total
        varchar currency
        datetime updated_at
    }
    order_items {
        bigint id PK
        bigint order_id FK
        varchar product_id
        varchar title
        varchar option_text
        int qty
        decimal price
    }
    fulfillments {
        bigint id PK
        bigint order_id FK
        varchar status
        varchar tracking_number
        varchar carrier
        datetime updated_at
    }
    notifications {
        bigint id PK
        bigint customer_id FK
        bigint session_id FK
        varchar category
        varchar title
        text body
        varchar status_badge
        varchar channel
        datetime read_at
        datetime created_at
    }
    notification_prefs {
        bigint id PK
        bigint customer_id FK
        varchar channel
        varchar category
        tinyint enabled
    }
    reviews {
        bigint id PK
        bigint order_item_id FK
        bigint customer_id FK
        tinyint rating
        text body
        varchar status
        datetime created_at
    }
    affiliates {
        bigint id PK
        bigint customer_id FK
        varchar status
        varchar link_code
        decimal commission_rate
        datetime applied_at
        datetime reviewed_at
    }
    restock_subscriptions {
        bigint id PK
        bigint customer_id FK
        varchar product_id
        varchar channel
        datetime created_at
        datetime notified_at
    }
    subscriptions {
        bigint id PK
        bigint customer_id FK
        varchar shopify_subscription_id
        varchar status
        varchar plan
        datetime next_billing
    }
    inquiries {
        bigint id PK
        bigint conversation_id FK
        bigint order_id FK
        bigint customer_id FK
        varchar status
        datetime created_at
    }
    kb_documents {
        bigint id PK
        varchar source
        varchar category
        varchar title
        longtext content
        varchar embedding_ref
        datetime updated_at
    }
    campaigns {
        bigint id PK
        varchar name
        varchar segment_ref
        json content
        varchar status
        datetime scheduled_at
        datetime sent_at
    }
    cjm_events {
        bigint id PK
        bigint session_id FK
        bigint customer_id FK
        varchar stage
        varchar event_type
        json payload
        datetime created_at
    }
    agents {
        bigint id PK
        varchar name
        varchar email
        varchar role
        varchar status
    }
    integration_status {
        bigint id PK
        varchar name
        varchar status
        datetime last_sync_at
        varchar detail
    }
```

---

## Table Definitions (테이블 정의 — 요약)

| Table | Purpose | Key FKs | FN/FR |
|-------|---------|---------|-------|
| customers | Customer identity cache | shopify_customer_id | FN-014, FR-007 |
| sessions | Visitor sessions, language, consent | customer_id | FN-006, FR-001/002 |
| conversations | Chat conversations, status, escalation | session_id, agent_id | FN-035, FR-017 |
| messages | Conversation turns + retrieval trace | conversation_id | FN-046, FR-018 |
| orders_cache | Non-authoritative order mirror | customer_id | FN-019, FR-010 |
| order_items | Order line items + options | order_id | FN-023, FR-032 |
| fulfillments | Shipping status + tracking | order_id | FN-020, FR-011/043 |
| notifications | Notification inbox records | customer_id, session_id | FN-003/025, FR-029 |
| notification_prefs | Per-channel/category opt-in | customer_id | FN-004, FR-049 |
| reviews | Product reviews | order_item_id, customer_id | FN-029, FR-034 |
| affiliates | Affiliate applications + link | customer_id | FN-030, FR-035 |
| restock_subscriptions | Back-in-stock subscriptions | customer_id | FN-032, FR-036 |
| subscriptions | Product subscriptions | customer_id | FN-033, FR-037 |
| inquiries | My-inquiries records | conversation_id, order_id | FN-024, FR-033 |
| kb_documents | Knowledge base (KS + GDrive) | - | FN-016/045, FR-020/021 |
| campaigns | Marketing/event campaigns | - | FN-042, FR-040 |
| cjm_events | Customer journey events | session_id, customer_id | FN-047, FR-026 |
| agents | Live agents | - | FN-035, FR-017 |
| integration_status | Integration health | - | FN-038, FR-041/042/043 |

## Tenancy & RBAC Tables (테넌시·권한 — CHATWIDGET-RBAC)

Multi-tenant & access-control extension. **All tenant data tables add `tenant_id`** (sessions, conversations, messages, orders_cache, notifications, reviews, affiliates, subscriptions, kb_documents, campaigns, cjm_events, inquiries, restock_subscriptions, notification_prefs).

| Table | Purpose | Key columns | FR |
|-------|---------|-------------|----|
| tenants | Tenant (shop) master | id, shop_domain, status, plan | FR-051,052 |
| admin_users | System admins | id, email, level(super_admin/admin), status | FR-053,059 |
| users | Tenant staff | id, tenant_id, email, rank(master/director/manager/staff), status | FR-054 |
| job_labels | Editable job labels per tenant | id, tenant_id, code, name | FR-055 |
| user_job_labels | User↔label N:M | user_id, job_label_id | FR-055 |
| roles_permissions | rank×label capability grants | id, scope, rank, label, capability, allow | FR-056 |
| integration_credentials | Per-tenant external creds (encrypted) | id, tenant_id, provider, secret_enc, status | FR-060 |
| audit_logs | Privileged-action audit | id, tenant_id, actor_type, actor_id, action, target, created_at | FR-061 |
| customers (changed) | + tenant_id, tier, shopify_tier | tier(guest/subscriber/regular), shopify_tier | FR-057 |

DDL appended in `chat-widget-schema.sql` (Tenancy & RBAC section).

## Bootstrap, Auth & Knowledge Source Tables (부트스트랩·인증·지식소스 — FR-062~065)

| Table | Purpose | Key columns | FR |
|-------|---------|-------------|----|
| invitations | User invite + temp password | tenant_id, email, rank, token, temp_password_hash, status, expires_at | FR-063 |
| admin_users / users (changed) | + password_hash, must_change_password (+users.invited_at) | auth/onboarding | FR-062,063 |
| knowledge_sources | KB source master (3 modes) | tenant_id, type(board/repository/gdrive), status, designated, config_json | FR-064 |
| kb_board_posts | Board posts (M1) | tenant_id, source_id, title, body, author_user_id | FR-064 |
| kb_files | Attachments / repository files (M1/M2) | tenant_id, source_id, post_id, filename, storage_path | FR-064 |
| kb_documents (changed) | + tenant_id, source_id, active, status | RAG chunks scoped to source | FR-065 |

Seed (FR-062): tenant `ivyusa`, admin `admin@amoeba.group`, master `dev@amoeba.group` (bcrypt hashes; must_change_password=1). See `chat-widget-schema.sql` Seed section & CHATWIDGET-BOOTSTRAP.

## Migration Notes (마이그레이션)
- `orders_cache`/`fulfillments` are caches synced via webhook (NFR-006); source of truth = Shopify/Odoo.
- `status_internal`↔`status_ui` mapping enforced at app layer per POL-014.
- `kb_documents.embedding_ref` points to the vector index entry (RAG); re-embed on edit (FN-040).
- Retention/anonymization jobs operate on `messages`, `cjm_events`, `notifications` per POL-003 (period [TBD]).
- DDL: see `chat-widget-schema.sql`.
