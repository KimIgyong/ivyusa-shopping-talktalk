---
document_id: CHATWIDGET-TC-RBAC-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
base_documents:
  - CHATWIDGET-RBAC-1.0.0 (Roles & Access Control)
  - CHATWIDGET-REQDEF-2.0.0 (FR-051~061, NFR-012)
change_log:
  - version: 1.0.0
    date: 2026-06-15
    author: Project Team
    description: Permission-matrix-based test cases (TC-R001~) covering system admin, rank, label, customer tiers, tenant isolation
---

# IVY TalkTalk — RBAC Test Cases (권한 매트릭스 기반 테스트케이스)

CHATWIDGET-RBAC §3 권한 매트릭스를 검증한다. 유효권한 = **rank ∩ label**, deny-by-default, 테넌트 격리(NFR-012). 결과 표기: ✅ allow / ⛔ deny.
(Verifies the RBAC matrices; effective = rank ∩ label; deny by default; tenant isolation.)

- **Test environment**: Staging, seeded tenants T1(IVY USA), T2(test), with accounts per role.
- **Format**: ID · Requirement · Precondition · Steps · Expected · Priority.
- **Priority**: 상(High)/중(Med)/하(Low).

## 0. Test Accounts (테스트 계정)

| Alias | Group | Rank/Level | Labels | Tenant |
|-------|-------|-----------|--------|--------|
| SA | System Admin | Super Admin | — | platform |
| AD | System Admin | Admin | — | platform |
| MST | User | Master | 상담,회계,운영 | T1 |
| DIR | User | Director | 상담,회계,운영 | T1 |
| MGR-C | User | Manager | 상담 | T1 |
| STF-O | User | Staff | 운영 | T1 |
| STF-A | User | Staff | 회계 | T1 |
| MST-T2 | User | Master | 상담,운영 | T2 |
| CUST-G | Customer | Guest | — | T1 |
| CUST-S | Customer | Subscriber | — | T1 |
| CUST-R | Customer | Regular | — | T1 |

---

## A. System Admin (시스템 어드민 — §3.1)

### TC-R001: Super Admin approves tenant application
- **Req**: FR-052, FR-053 · **Pre**: SA logged in; pending tenant application exists.
- **Steps**: SCR-201 → open application → 승인 → provision.
- **Expected**: ✅ Tenant status=active; defaults/KB seeded; audit_log entry created (FR-061).
- **Priority**: 상

### TC-R002: Admin cannot create admin accounts
- **Req**: FR-053, FR-059 · **Pre**: AD logged in.
- **Steps**: SCR-202 → attempt create admin_user.
- **Expected**: ⛔ Action hidden/blocked (Super-Admin-only); no record; deny audited.
- **Priority**: 상

### TC-R003: Admin cannot offboard tenant without approval
- **Req**: FR-052 · **Pre**: AD logged in; active tenant.
- **Steps**: SCR-201 → suspend/offboard.
- **Expected**: ⛔ Blocked or requires Super Admin approval (2-step); no data purge.
- **Priority**: 상

### TC-R004: Super Admin destructive op requires 2-step confirm
- **Req**: FR-053 · POL-017 R-exception · **Pre**: SA.
- **Steps**: trigger tenant data purge.
- **Expected**: ✅ 2-step confirmation enforced; on confirm, tenant data purged; audited.
- **Priority**: 상

### TC-R005: Admin reads but cannot write global destructive settings
- **Req**: FR-053, FR-060 · **Pre**: AD.
- **Steps**: SCR-203 → edit global policy template / platform reset.
- **Expected**: ✅ Read; ⛔ Super-Admin-only writes blocked.
- **Priority**: 중

---

## B. Tenant Rank (직급 — §3.2, 4단계 Master/Director/Manager/Staff)

### TC-R010: Master edits tenant settings & integration credentials
- **Req**: FR-054, FR-060 · **Pre**: MST.
- **Steps**: SCR-207A → connect Shopify/Odoo API credential; set policy value; tenant AI settings.
- **Expected**: ✅ Saved (creds encrypted/masked); applies to tenant; audited.
- **Priority**: 상

### TC-R010b: Director cannot edit integration credentials / adjust rank / edit labels
- **Req**: FR-054, FR-060 · **Pre**: DIR.
- **Steps**: attempt SCR-207A integration creds; attempt rank-adjust & label rename in SCR-207.
- **Expected**: ⛔ Master-only actions blocked; ✅ may invite/manage lower users & assign labels.
- **Priority**: 상

### TC-R011: Manager limited config
- **Req**: FR-054 · **Pre**: MGR-C.
- **Steps**: attempt tenant settings/integration vs ops (assign conversations).
- **Expected**: ⛔ Config blocked; ✅ operational mgmt allowed.
- **Priority**: 상

### TC-R012: Staff executes assigned work only
- **Req**: FR-054 · **Pre**: STF-O.
- **Steps**: open assigned conversation vs others; attempt config.
- **Expected**: ✅ Assigned work; ⛔ others/config denied.
- **Priority**: 상

### TC-R013: Master manages users, rank adjust & label edit
- **Req**: FR-054, FR-055, FR-059 · **Pre**: MST.
- **Steps**: SCR-207 → invite user, adjust rank, rename/add a label.
- **Expected**: ✅ User created; rank adjusted; label renamed and reflected in permission resolution.
- **Priority**: 상

### TC-R014: Staff cannot manage users
- **Req**: FR-059 · **Pre**: STF-O.
- **Steps**: open SCR-207.
- **Expected**: ⛔ Menu hidden; direct route denied.
- **Priority**: 중

---

## C. Job Labels — effective = rank ∩ label (직무 라벨 — §3.3)

### TC-R020: Consult label accesses chat console
- **Req**: FR-055, FR-056 · **Pre**: MGR-C (상담).
- **Steps**: open SCR-102 live chat / AI briefing.
- **Expected**: ✅ Allowed.
- **Priority**: 상

### TC-R021: Consult label blocked from accounting
- **Req**: FR-056 · **Pre**: MGR-C (상담).
- **Steps**: open finance/refund views.
- **Expected**: ⛔ Denied (no 회계 label).
- **Priority**: 상

### TC-R022: Operations label accesses orders/products/notifications
- **Req**: FR-055 · **Pre**: STF-O (운영).
- **Steps**: SCR-103 notifications, SCR-106 product/inventory.
- **Expected**: ✅ Allowed; ⛔ chat console (no 상담) denied.
- **Priority**: 상

### TC-R023: Accounting label accesses refunds/finance only
- **Req**: FR-055 · **Pre**: STF-A (회계).
- **Steps**: payment/refund/finance report; then orders/fulfillment.
- **Expected**: ✅ Finance allowed; ⛔ operations/chat denied.
- **Priority**: 상

### TC-R024: Multi-label union
- **Req**: FR-055, FR-056 · **Pre**: DIR (상담,회계,운영).
- **Steps**: access chat + finance + operations modules.
- **Expected**: ✅ All allowed (union of labels ∩ Director rank).
- **Priority**: 중

### TC-R025: rank ∩ label intersection (low rank limits)
- **Req**: FR-056 · **Pre**: STF-O (운영).
- **Steps**: attempt campaign send (운영 모듈이나 발송은 Manager+).
- **Expected**: ⛔ Denied — Staff rank lacks send capability even with 운영 label.
- **Priority**: 상

### TC-R026: Label rename (Master) does not change code-level grants
- **Req**: FR-055 · **Pre**: MST renames "운영"→"Ops".
- **Steps**: verify STF-O permissions unchanged after rename; Director attempt rename → denied.
- **Expected**: ✅ Stable code keeps grants; only display name changes; ⛔ non-Master rename blocked.
- **Priority**: 중

---

## D. Customer Group & Widget States (고객 그룹·위젯 상태 — §3.4)

### TC-R030: Guest limited to non-personal features
- **Req**: FR-057, FR-058 · **Pre**: CUST-G, logged-out.
- **Steps**: ask product FAQ; attempt order status without lookup.
- **Expected**: ✅ FAQ/product answered; ⛔ personal order data → Auth Gate (SCR-008).
- **Priority**: 상

### TC-R031: Guest order lookup grants single-order scope
- **Req**: FR-009, FR-058 · **Pre**: CUST-G.
- **Steps**: order#+email lookup (valid).
- **Expected**: ✅ Single-order scope; ⛔ other orders not accessible.
- **Priority**: 상

### TC-R032: Subscriber receives member coupon, still gated for personal data
- **Req**: FR-037, FR-057 · **Pre**: CUST-S.
- **Steps**: view 이벤트 notifications; attempt subscription change.
- **Expected**: ✅ Member coupon visible; ⛔ subscription change requires login (Auth Gate).
- **Priority**: 중

### TC-R033: Regular (logged-in) full personal features + Shopify tier
- **Req**: FR-057, FR-058, FR-050 · **Pre**: CUST-R logged in.
- **Steps**: orders/tracking/reviews/inquiries; check tier-based segment.
- **Expected**: ✅ Full personal features; personalization header; Shopify tier drives segment/benefit.
- **Priority**: 상

### TC-R034: Logged-out cannot see personal notifications
- **Req**: FR-058, NFR-004 · **Pre**: CUST-G.
- **Steps**: open Notifications/Orders tabs.
- **Expected**: ⛔ Personal items require auth; only non-personal shown.
- **Priority**: 상

---

## E. Tenant Isolation (테넌트 격리 — NFR-012)

### TC-R040: User cannot access another tenant's data
- **Req**: FR-051, FR-056, NFR-012 · **Pre**: DIR (T1).
- **Steps**: attempt to read T2 conversations/orders via UI and direct API id.
- **Expected**: ⛔ Denied/empty; no cross-tenant rows returned.
- **Priority**: 상

### TC-R041: API enforces tenant scope (IDOR negative)
- **Req**: NFR-012 · **Pre**: DIR (T1) token.
- **Steps**: call API with T2 resource id (e.g., /orders/{T2 id}).
- **Expected**: ⛔ 403/404; access logged.
- **Priority**: 상

### TC-R042: RAG/KB isolation
- **Req**: FR-051, NFR-012 · **Pre**: DIR (T1).
- **Steps**: query RAG; verify no T2 KB content retrieved.
- **Expected**: ⛔ Only T1 namespace; no cross-tenant knowledge.
- **Priority**: 상

### TC-R043: Notification dispatch scoped to tenant
- **Req**: FR-051 · **Pre**: campaign in T1.
- **Steps**: send campaign; verify recipients.
- **Expected**: ✅ Only T1 customers; ⛔ no T2 recipients.
- **Priority**: 중

---

## F. Audit & Default-Deny (감사·기본거부)

### TC-R050: Privileged actions are audited
- **Req**: FR-061 · **Pre**: any privileged op (approve tenant, change role, edit policy).
- **Steps**: perform op → check audit_logs.
- **Expected**: ✅ Entry with actor/action/target/time; immutable.
- **Priority**: 상

### TC-R051: Unknown/unassigned permission denied
- **Req**: FR-056 (deny-by-default) · **Pre**: user with no matching grant.
- **Steps**: access a capability not granted.
- **Expected**: ⛔ Denied by default; menu hidden.
- **Priority**: 상

### TC-R052: Suspended account blocked
- **Req**: FR-059 · **Pre**: suspended user/admin.
- **Steps**: attempt login/action.
- **Expected**: ⛔ Access blocked; session invalidated.
- **Priority**: 중

---

## Coverage Summary (커버리지)

| Area | TCs | Matrix ref |
|------|-----|-----------|
| System Admin | TC-R001~005 | §3.1 |
| Rank (Master/Director/Manager/Staff) | TC-R010,010b,011~014 | §3.2 |
| Job labels (rank ∩ label) | TC-R020~026 | §3.3 |
| Customer tiers / widget | TC-R030~034 | §3.4 |
| Tenant isolation | TC-R040~043 | NFR-012 |
| Audit / default-deny | TC-R050~052 | POL-017 |

Traceability: each TC → FR/NFR + RBAC matrix cell. Negative (⛔) cases are mandatory for security sign-off (release gate).
