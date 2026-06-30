# Test Cases — IVY USA Chat & Support Widget

| | |
|---|---|
| Doc ID | CHATWIDGET-TC-1.0.0 |
| Date | 2026-06-30 |
| Stage | SDLC Stage 4 (Test) — `reference/amoeba_basic_Structure_v2.md` §8.2 |
| Runner | Jest + ts-jest (`npm test` / `turbo run test`) |

## 1. Automated unit tests (40 passing)
| ID | Area | File | Asserts | Design ref |
|----|------|------|---------|-----------|
| UT-01 | RBAC permission matrix | `packages/common/src/rbac/permission-matrix.spec.ts` (12) | adminCan super/admin grants; userCan master label-bypass; staff+consult allowed CONVERSATION_HANDLE, denied CAMPAIGN_SEND; deny-by-default | FR-056 |
| UT-02 | Order status map | `packages/types/src/domain/status-map.spec.ts` (8) | internal→UI mapping; DELIVERY_STEPS=4; fulfillmentStepIndex | POL-014, NFR-010 |
| UT-03 | Moderation gate | `apps/api/src/domain/moderation/moderation.service.spec.ts` (7) | block rule→blocked; no rule→delivered; **error→fail-safe blocked**; mask→edited | FR-069, NFR-013 |
| UT-04 | Authorization guard | `apps/api/src/global/guard/authorization.guard.spec.ts` (13) | actor/level/rank/capability allow+deny; deny-by-default | FR-056, RBAC |

## 2. Manual / runtime smoke (verified)
| ID | Scenario | Result |
|----|----------|--------|
| SM-01 | Admin + tenant-master login (JWT) | pass |
| SM-02 | RBAC allow (master→dashboard) + deny (no token→E1001) | pass |
| SM-03 | Widget session ensure (en/es/ko) | pass |
| SM-04 | RAG chat: policy Q → grounded answer + KB citations through moderation gate | pass |
| SM-05 | Auth gate on order question; guest order lookup binds session | pass |
| SM-06 | Tenant isolation: new rows auto-stamped tenant_id (0 nulls); admin lists tenant-filtered | pass |
| SM-07 | Privacy: Shopify GDPR webhooks; DSAR export; CCPA opt-out; retention purge; shop/redact (bogus → no purge) | pass |
| SM-08 | i18n: backend chat strings + both frontends in en/es/ko | pass |

## 3. RBAC test cases
See `design/chat-widget-testcase-rbac.md` (rank × label permission matrix) — encoded in UT-01/UT-04.

## 4. Coverage gaps (roadmap)
e2e (supertest + test DB) for full HTTP flows; broaden service-level unit tests
(RAG retrieval, tenant subscriber, retention service).
