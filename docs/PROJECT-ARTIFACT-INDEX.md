# IVY USA Chat & Support Widget — Project Index (산출물 인덱스)

문서/설계 산출물 전체 인덱스와 추적성 맵. 모든 문서는 영어 우선·한국어 병기, Amoeba SDLC 표준(`chat-widget-sdlc-process.md`)을 따른다.
(Index and traceability map of all artifacts. Bilingual; follows the Amoeba SDLC document standard.)

> 📦 Moved from the root `README.md` on 2026-07-16 (README is now the project overview).
> Artifact files listed below live in [`../design/`](../design/) unless a path is given;
> company standards live in [`../standards/`](../standards/).

- **Project**: IVY USA Chat & Customer Support Widget (Shopify storefront, Naver TalkTalk 기준)
- **Stack**: React (widget/admin) · Next.js · MySQL · RabbitMQ · Redis
- **Integrations**: Shopify · Fulfillment · Klaviyo · Odoo · Google Drive · AmoebaTalk [TBD]
- **Updated**: 2026-06-18

---

## 0. Quick Start (구현 실행)

This repo contains both the **design deliverables** (`design/`, `standards/`) and a full
**working implementation** (Turborepo monorepo). Implemented stack: **NestJS + TypeORM +
MySQL 8 · Redis · RabbitMQ** (backend) and **React 18 + Vite + Tailwind** (admin + widget).
> Note: the line below historically labels the backend "Next.js"; the implementation uses
> **NestJS** per `design/chat-widget-architecture-report.md` and the Amoeba structure standard.

```bash
npm install
npm run db:up      # MySQL :3316 · Redis :6389 · RabbitMQ :5682 (docker/docker-compose.dev.yml)
npm run db:seed    # tenant ivyusa, admin+master accounts, labels, AI engine, KB, demo data
npm run dev        # API :3000 (/api/v1/docs) · admin web :5173 · widget :5174
```

Seed logins (must change on first login): `admin@amoeba.group` / `amb2026!@` (System Admin),
`dev@amoeba.group` / `amb2026!@` (Tenant Master, `ivyusa`).

| App | Path | Port |
|---|---|---|
| Backend API (NestJS) | `apps/api` | 3000 |
| Admin console (tenant + platform) | `apps/web` | 5173 |
| Customer widget | `apps/widget` | 5174 |
| Shared types / utils | `packages/{types,common}` | — |

See `SPEC.md`, `CLAUDE.md`, and `docs/implementation/RPT-ChatWidget-Implementation-20260618.md`
for architecture, conventions, and the implementation report.

---

## 1. Document Map (산출물 맵)

| # | Artifact (산출물) | ID | File | Status |
|---|-------------------|----|------|--------|
| — | SDLC Process Standard (문서 작성 표준) | CHATWIDGET-PROCESS-1.0.0 | `chat-widget-sdlc-process.md/.docx` | Draft |
| 1 | Requirements Analysis (요구사항 분석서) | CHATWIDGET-REQ-1.0.0 | `chat-widget-requirements.md` | Draft |
| 1b | Screen Gap Addendum (화면 갭 추가반영) | CHATWIDGET-REQ-ADDENDUM-1.1.0 | `chat-widget-requirements-addendum.md/.docx` | Draft |
| 2 | Requirements Definition (요구사항 정의서) | CHATWIDGET-REQDEF-2.0.0 | `chat-widget-req-definition.md/.docx` | Draft |
| 3 | Event Scenario (이벤트 시나리오) | CHATWIDGET-EVTSCN-2.0.0 | `chat-widget-event-scenario.md/.docx` | Draft |
| 4 | Policy Definition (정책 정의서) | CHATWIDGET-POLICY-1.0.0 | `chat-widget-policy.md/.docx` | Draft |
| 5 | Functional Definition (기능 정의서) | CHATWIDGET-FUNCDEF-1.0.0 | `chat-widget-func-definition.md/.docx` | Draft |
| 6a | Sequence Diagrams (시퀀스) | CHATWIDGET-SEQ-1.0.0 | `chat-widget-sequence.md/.docx` | Draft |
| 6b | Data Flow Diagram (DFD) | CHATWIDGET-DFD-1.0.0 | `chat-widget-dfd.md/.docx` | Draft |
| 6c | ERD + Schema (ERD·스키마) | CHATWIDGET-ERD-1.0.0 | `chat-widget-erd.md/.docx`, `chat-widget-schema.sql` | Draft |
| 7 | UI Specification (화면 정의서) | CHATWIDGET-UISPEC-1.0.0 | `chat-widget-ui-spec.md/.docx` | Draft |
| 8 | Wireframe (와이어프레임) | CHATWIDGET-WIREFRAME-1.0.0 | `chat-widget-wireframe.html` | Draft |
| 9 | Prototype (목업 프로토타입) | CHATWIDGET-PROTOTYPE-1.0.0 | `chat-widget-prototype.html` | Draft |
| — | WBS (작업 분해 구조) | CHATWIDGET-WBS-1.0.0 | `chat-widget-wbs.md`, `chat-widget-wbs.xlsx` | Draft |
| — | Project Execution Plan (수행계획서) | CHATWIDGET-PROJPLAN-1.0.0 | `chat-widget-project-plan.md/.docx` | Draft |
| — | Development Plan (개발계획서, 표준 정합) | CHATWIDGET-DEVPLAN-1.0.0 | `chat-widget-dev-plan.md/.docx` | Draft |
| — | Architecture & Tech Stack Report (아키텍처·기술스택 보고서) | CHATWIDGET-ARCH-REPORT-1.0.0 | `chat-widget-architecture-report.md/.docx` | Draft |
| — | Shopify Multi-Tenancy Proposal (멀티테넌트 방안) | CHATWIDGET-MULTITENANCY-1.0.0 | `chat-widget-shopify-multitenancy.md/.docx` | Draft |
| — | Actors, Roles & Access Control (액터·권한/RBAC) | CHATWIDGET-RBAC-1.0.0 | `chat-widget-roles-rbac.md/.docx` | Draft |
| — | Menu Structure & File System (메뉴구조·파일시스템) | CHATWIDGET-MENU-1.0.0 | `chat-widget-menu-structure.md/.docx` | Draft |
| — | User Guide (유저 설정·사용 매뉴얼) | CHATWIDGET-USERGUIDE-1.0.0 | `chat-widget-user-guide.md/.docx` | Draft |
| — | RBAC Test Cases (권한 테스트케이스) | CHATWIDGET-TC-RBAC-1.0.0 | `chat-widget-testcase-rbac.md`, `.xlsx` | Draft |
| — | Bootstrap Seed & Invitation (초기세팅·초대) | CHATWIDGET-BOOTSTRAP-1.0.0 | `chat-widget-bootstrap-seed.md/.docx` | Draft |
| — | Knowledge Source (RAG 지식소스 3모드) | CHATWIDGET-KSOURCE-1.0.0 | `chat-widget-knowledge-source.md/.docx` | Draft |
| — | Agent Mgmt & Response Moderation (상담원·응답필터) | CHATWIDGET-AGENTMOD-1.0.0 | `chat-widget-agent-moderation.md/.docx` | Draft |
| — | Figma screens (71 frames) | — | `screens/`, `_contact_sheet.png` | Source |
| — | Amoeba Standards (회사 표준 — 지식) | various | `standards/` | Reference |

### Amoeba Company Standards (`standards/` — 프로젝트 지식)

| File | 내용 |
|------|------|
| `amb-access-control-policy.md` | AMB 플랫폼 **소유자 기반 가시성·공유** 접근제어 정책(ACL-xxx) — 기능 RBAC 위에 얹는 visibility 레이어 |
| `amoeba_basic_skill_v2.md` | 표준 개발 스킬 가이드 |
| `amoeba_basic_SPEC_v2.md` | 표준 프로젝트 명세 템플릿 |
| `amoeba_basic_Structure_v2.md` | 표준 프로젝트 구조 가이드 |
| `amoeba_code_convention_v2.md` | 표준 코드 컨벤션 |
| `amoeba_web_style_guide_v2.md` | 표준 웹 스타일 가이드 |
| `amoeba_privacy_compliance_v2.md` | **개인정보보호·컴플라이언스 표준(신규)** — PIPA/GDPR/**CCPA·CPRA**/PDPD, DSAR·opt-out·암호화·감사 (PRV-xxx) |
| `amoeba-spec-generator-SKILL-v3.1.md` / `.skill` | Spec Generator 스킬 v3.1 |

> 정합성 메모: 본 프로젝트 RBAC(직급×직무 라벨, CHATWIDGET-RBAC)은 **기능 권한**, `amb-access-control-policy`는 **소유자 기반 가시성/공유** 레이어로 상호 병존(코드/문서 작성 시 code-convention·web-style-guide·structure 표준 준수).

---

## 2. Process Order (진행 순서)

```
표준(PROCESS) ──▶ 1 분석 ──▶ 2 정의 ──▶ 3 이벤트 시나리오 ──▶ 4 정책 ──▶ 5 기능 정의
   ──▶ 6 (시퀀스 + DFD + ERD/SQL) ──▶ 7 화면 정의서 ──▶ 8 와이어프레임 ──▶ 9 프로토타입
   관통: WBS · 추적성(FR→FN→SCR→TBL→T→TC) · Figma 화면을 검증 입력으로 활용
```

채택 조정 4가지: ①분석→정의 순서 ②정책 선고정 ③ERD 통합 ④화면=검증 입력 (상세는 PROCESS 문서 §8).

---

## 3. Scope at a Glance (범위 요약)

- **요구사항**: FR-001~070 (기능 70) · NFR-001~013 (비기능 13) — 포함: 멀티테넌시·RBAC/ACL, 부트스트랩·초대, 지식소스 3모드, 상담원·응답 모더레이션, **복수 AI 엔진(관리자 선택)**
- **액터·권한**: 시스템어드민(슈퍼/어드민) · 유저(**마스터/디렉터/매니저/스텝** × 직무라벨 상담·회계·운영; Master=테넌트 설정·외부연동·유저/등급/라벨·AI 설정 소유) · 고객(게스트/구독/일반→Shopify등급); 위젯 로그인/비로그인 — 멀티테넌트(커스텀앱) 대응
- **신규(화면 도출)**: FR-028~050, NFR-009~011 — 알림센터 통합, 주문패널·상세·배송스테퍼, 리뷰, 제휴, 재입고·구독, 멀티채널 상담, AI 상담보조, 관리자 대시보드/AI Setting/고객·상품 관리, Klaviyo·Odoo·Fulfillment 연동
- **시나리오**: S1~S17 · **정책**: POL-001~015 + 공통 · **기능**: FN-001~048 (15개 모듈)
- **데이터**: 19개 테이블 · **화면**: SCR-001~013(위젯), SCR-101~106(관리자)
- **WBS**: T-001~040 · 151 man-day · M1~M4 (Week 4/8/12/14)

---

## 4. Traceability Chain (추적성 체인)

대표 예시 (요구사항 1건이 전 단계로 이어지는 흐름):

| FR | EVT | POL | FN | SEQ / DFD / TBL | SCR | T |
|----|-----|-----|----|-----------------|-----|---|
| FR-031 배송 스테퍼 | S6,S11 | POL-014 | FN-020 | SEQ-04 / DFD P3 / fulfillments | SCR-011 | T-017 |
| FR-034 리뷰 | S13 | POL-008 | FN-028,029 | SEQ-07 / DFD P4 / reviews | SCR-012 | T-024 |
| FR-035 제휴 | S12 | POL-009 | FN-030,031 | SEQ-08 / DFD P5 / affiliates | SCR-006 | T-025 |
| FR-006 인증 | S4 | POL-001 | FN-011~014 | SEQ-02 / DFD P1 / sessions | SCR-008 | T-011 |
| FR-044 관리자 대시보드 | S17 | POL-015 | FN-038 | — / DFD P6 / cjm_events | SCR-101 | T-031 |

전체 매핑은 각 문서의 Traceability 절 참조. ID 규칙: FR/NFR · EVT · POL · FN · SEQ/DFD/TBL · SCR · T · TC.

---

## 5. Open Decisions (미결 사항 · [TBD])

| # | Item | 문서 |
|---|------|------|
| A-1 | RAG 답변 언어 전략 (A vs B) | REQDEF, POLICY |
| A-2 | AmoebaTalk 연동 깊이 | REQDEF |
| A-6 | 대화 로그 보존기간 | POLICY |
| A-7 | Odoo 연동 범위(재고 vs 주문) | POLICY |
| A-8 | Klaviyo vs 자체 Notifier 분담 | POLICY |
| A-9 | 리뷰 트리거 N일·저장처 | POLICY |
| A-10 | 제휴 정산 주체 | POLICY |
| A-11 | 고객·상품 관리 read vs write | UISPEC |
| — | 환불 기간·보증 약관·레이트리밋 | POLICY |

---

## 6. How to Review (검토 방법)

- **프로토타입(고충실도)**: `chat-widget-prototype.html` — 브라우저로 열기. 좌상단 로그인/비로그인 토글, Widget/Admin 전환. P0 플로우 엔드투엔드 클릭.
- **와이어프레임(저충실도)**: `chat-widget-wireframe.html` — 구조·플로우 검토용. 각 화면 SCR ID 표기.
- **다이어그램**: `*-sequence.md`, `*-dfd.md`, `*-erd.md`의 Mermaid 코드블록은 GitHub/뷰어에서 렌더.
- **DDL**: `chat-widget-schema.sql` (MySQL, utf8mb4·InnoDB).
- **WBS**: `chat-widget-wbs.xlsx` (WBS/Milestones/Effort 3시트).

---

## 7. Next Steps (다음 단계)

설계 단계(Stage 2) 산출물 완료. 후속 권장:
1. 미결 사항(§5) 의사결정 → 영향 문서 버전 갱신
2. WBS 기반 GitHub 이슈/프로젝트 보드 생성 (`.github/ISSUE_TEMPLATE/`)
3. 구현(Stage 3): 개발계획서 → 태스크 작업계획서/리포트
4. 테스트(Stage 4–5): 테스트케이스(TC) → 통합/최종 테스트 리포트
