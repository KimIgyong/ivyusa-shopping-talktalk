---
document_id: CHATWIDGET-PROCESS-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
scope: Document-production process standard for the IVY USA Chat & Support Widget project
change_log:
  - version: 1.0.0
    date: 2026-06-15
    author: Project Team
    description: SDLC document pipeline standard — per-artifact input/output/validation, ID system, traceability, phase gates
---

# IVY USA Chat & Support Widget — SDLC Document Process Standard (문서 작성 표준·프로세스 정의서)

## 1. Purpose (목적)

Define the **order, input, output, and exit criteria** for each SDLC document so the team produces artifacts consistently and traceably. This standard adopts the recommended hybrid pipeline: industry-standard *Analysis → Definition* order, policy fixed before functional logic, data design (Sequence + DFD + ERD) together, and **existing Figma screens used as a validation input** rather than a final output.
(각 산출물의 순서·입력·출력·완료기준을 표준화하여 일관성과 추적성을 확보한다. 분석→정의 순서, 정책 선고정, 데이터 설계 통합, 그리고 기존 Figma 화면을 검증 입력으로 활용하는 하이브리드 파이프라인을 채택한다.)

## 2. Pipeline Overview (파이프라인 개요)

```
[Completed] Requirements Analysis (요구사항 분석서)
[Completed] Requirements Definition (요구사항 정의서)
      │
 1. Event Scenario        이벤트 시나리오
 2. Policy Definition      정책 정의서        ← rules fixed before logic
 3. Functional Definition  기능 정의서 (FN)
 4. Sequence + DFD + ERD   시퀀스·데이터플로우·ERD  (designed together)
 5. UI Specification       화면 정의서        ← formalize existing Figma
 6. Wireframe              와이어프레임
 7. Prototype              목업 기반 프로토타입
      │
 Cross-cutting: Traceability  FR → FN → SCR → TC  (전 단계 관통)
                Figma screens (screens/) = validation input at stages 1,4,5,6,7
```

**Key principles (핵심 원칙)**
1. **Analysis before Definition (분석 선행)** — broad understanding/classification precedes per-requirement specification.
2. **Policy before Logic (정책 선고정)** — refund window, auth rules, CCPA retention, affiliate commission % constrain functional behavior, so they are frozen before FN.
3. **Data design as a unit (데이터 설계 통합)** — Sequence, DFD, and ERD are mutually dependent and produced/reviewed in one stage.
4. **Screens are input, not afterthought (화면은 입력)** — the 71 Figma frames are an authoritative source; later UI artifacts formalize them and earlier artifacts validate against them.
5. **One ID system (단일 ID 체계)** — FR/NFR → FN → SCR/PRC/POL → T → TC kept consistent across all docs.

## 3. ID System (ID 체계)

| Prefix | Artifact | Example |
|--------|----------|---------|
| FR / NFR | Requirement (functional / non-functional) | FR-010, NFR-006 |
| EVT | Event scenario | EVT-06 |
| POL | Policy | POL-003 |
| FN | Function (module-level) | FN-012 |
| SEQ | Sequence diagram flow | SEQ-04 |
| DFD | Data flow diagram | DFD-02 |
| TBL | ERD table | TBL-conversations |
| SCR | Screen / UI | SCR-007 |
| T | WBS task | T-021 |
| TC | Test case | TC-045 |

Every downstream item references its upstream ID (e.g., FN-012 → FR-031; SCR-007 → FN-012; TC-045 → SCR-007). Figma frames are cited as `화면 NN` from `screens/`.

## 4. Per-Artifact Standard (산출물별 표준)

### Stage 0 — Completed (완료)

| Artifact | Input | Output | Exit Criteria (완료기준) |
|----------|-------|--------|--------------------------|
| Requirements Analysis (요구사항 분석서) | Client brief, Naver TalkTalk reference, Figma | FR/NFR list, scope, stakeholders | All P0 features captured; scope agreed |
| Requirements Definition (요구사항 정의서) | Analysis + Figma screens | FR-001~050 / NFR-001~011 detailed (I/O, rules, acceptance) | Every FR has input/output/business rule/acceptance + screen ref |

### 1. Event Scenario (이벤트 시나리오)
- **Purpose**: Define user actions ↔ system responses at the event level, incl. exceptions.
- **Input**: Requirements Definition (FR/NFR); Figma screens for happy-path validation.
- **Output**: Scenario tables (EVT-NN) with Seq/Actor/Event/Response/Ref; exception tables.
- **Validation / Exit**: Every P0 FR appears in ≥1 scenario; each step references an FR; exceptions cover auth-fail, timeout, no-agent, consent-declined.
- **Reference screens**: 01,08,12,34,49,57,60,61,62.

### 2. Policy Definition (정책 정의서)
- **Purpose**: Freeze business rules that constrain logic and data.
- **Input**: Requirements Definition; Open Issues (A-1~A-12); client legal.
- **Output**: POL-NN entries (목적/적용범위/규칙/예외/변경이력). Must cover: refund window, return condition, auth-gate rule, CCPA retention & opt-out, notification channel rules, review trigger N-day, affiliate commission & settlement, warranty by category.
- **Validation / Exit**: Each policy maps to ≥1 FR; all [TBD] policy items either resolved or explicitly deferred with owner/date.
- **Reference screens**: 12 (warranty/coupon), 60 (return policy), 19/28 (review N-day).

### 3. Functional Definition (기능 정의서, FN)
- **Purpose**: Module/component-level function specs implementing the requirements.
- **Input**: Requirements Definition (FR), Event Scenario (EVT), Policy (POL).
- **Output**: FN-NN (선행/후행조건, 처리로직, 입력 파라미터/타입, 출력, 에러처리, 연관 FR/POL).
- **Validation / Exit**: Every P0/P1 FR maps to ≥1 FN; each FN cites the POL it enforces; error paths defined.
- **Reference screens**: all functional screens as behavior reference.

### 4. Sequence + DFD + ERD (시퀀스·데이터플로우·ERD) — one stage
- **Purpose**: Technical flow (Sequence), data movement across integrations (DFD), and persistent schema (ERD) — designed together because they are interdependent.
- **Input**: Functional Definition (FN); integration set (Shopify/Fulfillment/Klaviyo/Odoo/Google Drive/RAG).
- **Output**:
  - Sequence (SEQ-NN): Mermaid `sequenceDiagram` with real stack participants (React widget, Next.js, MySQL, RabbitMQ, Redis, external APIs).
  - DFD (DFD-NN): data sources → processes → stores → sinks across all integrations.
  - ERD (TBL-*) + `chat-widget-schema.sql`: MySQL tables (sessions, conversations, messages, notifications, orders cache, reviews, affiliates, kb_documents, etc.).
- **Validation / Exit**: Every FN has a SEQ; every data store in DFD has a matching ERD table; ERD covers all entities referenced by FN; schema.sql validates.
- **Note**: ERD was missing from the originally proposed order — it is mandatory here.

### 5. UI Specification (화면 정의서)
- **Purpose**: Formalize the existing Figma into a screen spec (layout, components, states, interactions), not design from scratch.
- **Input**: Figma screens (`screens/`, 71 frames); FN; EVT.
- **Output**: SCR-NN per screen (화면 목록, 레이아웃, 구성요소 표, 인터랙션, 로딩/에러/빈 상태, 반응형, React state/routing).
- **Validation / Exit**: Every screen maps to FN/FR; loading/error/empty states defined; each interactive element has a behavior; admin vs widget screens separated.
- **Reference screens**: full set (widget 01~17,34~69; admin 18~30,70~71).

### 6. Wireframe (와이어프레임)
- **Purpose**: Low-fidelity, structure-focused version reconciled with Figma — for layout/flow review without visual noise.
- **Input**: UI Specification (SCR); Figma.
- **Output**: Wireframes per SCR (grouped by flow), annotated with component IDs.
- **Validation / Exit**: 1:1 coverage with SCR list; navigation between wireframes matches Event Scenario flows.

### 7. Mockup-based Prototype (목업 기반 프로토타입)
- **Purpose**: Interactive prototype to validate end-to-end interaction before build.
- **Input**: Figma mockups; Wireframes; Event Scenario (for clickable flows).
- **Output**: Clickable prototype (Figma prototype or HTML), covering key flows: welcome→menu, auth gate, order status/tracking, product help, review, affiliate, notification center, admin console.
- **Validation / Exit**: All P0 happy-path scenarios are clickable end-to-end; reviewed with client; feedback logged as issues.

## 5. Traceability Matrix (추적성 매트릭스)

Maintain a running matrix (one row per requirement) updated at each stage:

| FR | EVT | POL | FN | SEQ/DFD/TBL | SCR | TC |
|----|-----|-----|----|-------------|-----|----|
| FR-031 | EVT-06 | POL-xx | FN-012 | SEQ-04 / DFD-02 / TBL-orders | SCR-007 | TC-045 |

A requirement is "design-complete" only when its row is filled through SCR.

## 6. Document Conventions (문서 규칙)

- **Bilingual**: English-first, Korean in parentheses; table headers English; code/SQL/API English.
- **Versioning (semver)**: MAJOR = scope/breaking; MINOR = additions; PATCH = fixes. Each doc carries the YAML version header.
- **Configuration management**: Git; branch `docs/{feature}`; commit `docs({stage}): {action} {desc}`.
- **Filenames** (Amoeba pattern, English):
  `chat-widget-event-scenario.md` · `chat-widget-policy.md` · `chat-widget-func-definition.md` · `chat-widget-sequence.md` · `chat-widget-dfd.md` · `chat-widget-erd.md` (+ `chat-widget-schema.sql`) · `chat-widget-ui-spec.md` · `chat-widget-wireframe.md` · `chat-widget-prototype/`.

## 7. Phase Gates (단계 게이트)

Proceed to the next stage only when the gate passes:

| Gate | Pass Condition |
|------|----------------|
| G1 after Event Scenario | All P0 FRs covered by scenarios + exceptions |
| G2 after Policy | All logic-affecting policies frozen or deferred with owner |
| G3 after Functional Def | FR→FN coverage 100% for P0/P1; errors specified |
| G4 after Seq/DFD/ERD | FN→SEQ 100%; DFD stores ↔ ERD tables consistent; schema validates |
| G5 after UI Spec | SCR↔FN mapped; all states defined |
| G6 after Prototype | P0 flows clickable end-to-end; client review signed off |

## 8. Summary of Adjustments vs Initial Order (초기안 대비 조정 요약)

1. **Swap 1↔2**: Analysis → Definition (industry-standard; already done this way).
2. **Policy before Functional**: rules frozen before logic (POL → FN).
3. **Add ERD**: Sequence + DFD + **ERD** in one data-design stage.
4. **Screens as input**: Figma used to validate scenarios/sequence/DFD and to source UI spec/wireframe/prototype — not produced last from scratch.
