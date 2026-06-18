---
document_id: CHATWIDGET-DEVPLAN-1.0.0
version: 1.0.0
status: Draft
created: 2026-06-15
updated: 2026-06-15
author: Project Team
reviewers: []
base_documents:
  - standards/amoeba_code_convention_v2.md
  - standards/amoeba_basic_Structure_v2.md
  - standards/amoeba_web_style_guide_v2.md
  - CHATWIDGET-WBS-1.0.0, CHATWIDGET-FUNCDEF-1.0.0, CHATWIDGET-RBAC-1.0.0
change_log:
  - version: 1.0.0
    date: 2026-06-15
    author: Project Team
    description: Development plan aligned to Amoeba code convention & structure standards v2 (NestJS + PostgreSQL, monorepo, DDD)
---

# IVY TalkTalk — Development Plan (개발계획서, 표준 정합)

회사 표준(amoeba code-convention/structure v2)에 맞춘 구현 계획. **기존 설계 문서의 스택 가정(Next.js/MySQL)을 표준 스택(NestJS/PostgreSQL)으로 정정**한다(§9 정합·마이그레이션).

- **Project Code**: `ITT` (IVY TalkTalk) · **DB**: `db_itt` · **Table prefix**: `itt_`, sub-domain `itt_talk_`, `itt_kms_` 등 · **API Base**: `/api/v1`

## 1. Standard Tech Stack (표준 기술 스택)

| Area | Stack |
|------|-------|
| Frontend | React 18.x + TypeScript 5.x + TailwindCSS (Vite 5.x) |
| Backend | **NestJS 10.x** + TypeScript 5.x |
| Database | **PostgreSQL 15.x** |
| Cache/Session | Redis 7.x |
| Monorepo build | Turborepo |
| Architecture | **Clean Architecture + DDD** |
| State (FE) | Zustand + React Query |
| AI | **Pluggable multi-engine** via AI Provider Gateway/adapter (Anthropic/OpenAI/Google/Azure/custom); 어드민 선택(FR-070) — RAG/요약/모더레이션 |
| Real-time | **SSE (Server-Sent Events)** — 실시간 채팅/스트리밍 |
| Async | (event/queue) — 알림 디스패치 |

## 2. Monorepo Structure (모노레포 구조 — Structure v2)

```
ivy-talktalk/
├── apps/
│   ├── api/          # NestJS backend (main) — Chat Orchestrator + 도메인 모듈
│   ├── web/          # React — Tenant User Console + System Admin (admin은 web 통합)
│   └── widget/       # React — storefront Theme App Embed 위젯 번들 (Vite)
├── packages/
│   ├── common/       # utils/helpers (tsup)
│   └── types/        # shared TS types (FR/FN ids, status, RBAC)
├── docker/           # dev / staging / production (env별 분리)
├── docs/             # analysis/ plan/ design/ implementation/ test/ report/ guide/
├── env/              # backend/ frontend .env.*
├── reference/        # amoeba 표준 문서(standards/ 복사)
├── scripts/  sql/  secrets/
├── turbo.json  tsconfig.json  package.json  CLAUDE.md  SPEC.md  CHANGELOG.md  README.md
```
- `apps/admin`은 web에 통합(권한 가드로 platform/tenant 영역 분리). `apps/portal-*`(파트너)·`mobile`은 선택.

## 3. Backend — NestJS Domain Modules (백엔드 도메인 모듈)

Clean Architecture 계층: **controller(presentation) → service(application) → entity(domain) → repository(infra)** + dto(request snake_case / response camelCase) + guard/mapper/constant. 도메인 모듈 1개 = 1 폴더(`src/domain/{name}/`), `{name}.module.ts`.

도메인 모듈(기능 정의서 FN 매핑):
- **core**: auth, users, tenants(entity-management), rbac, audit
- **talk**: session, scenario, chat, escalation, ai-assist (FN-008~018,034~037)
- **rag**: retrieval, knowledge-source(board/repository/gdrive), embedding (FN-016,040,045,064,065)
- **orders**: order, fulfillment, tracking, inquiry (FN-019~024)
- **notifications**: notifier, channels(in-app/email/sms/webpush), prefs, campaign (FN-025~027,042)
- **reviews**, **affiliate**, **restock-subscription** (FN-028~033)
- **admin**: analytics, conversation-history, customer-product (FN-038,039,041)
- **integrations**: shopify, fulfillment, klaviyo, odoo, gdrive
- **webhooks**: shopify, fulfillment, gdpr(data_request/redact/shop_redact)

레이어 규칙(MUST NOT 위반): controller는 service만, service는 repository/entity, 도메인 간 직접 침범 금지(도메인 격리).

## 4. Database Naming (PostgreSQL — Convention §4)

- **DB**: `db_itt` · **Tables**: `itt_{name_plural}`, 하위도메인 `itt_talk_`, `itt_kms_`, `itt_svc_` 등 (snake_case 복수형).
- **Columns**: PK `{colPrefix}_id` (**UUID**), FK 참조 PK 그대로, 일반 `{colPrefix}_{name}`, boolean `{colPrefix}_is_{name}`, `_created_at/_updated_at/_deleted_at`(**soft delete**).
- **Multi-tenancy**: 모든 테넌트 테이블에 `ent_id`(=tenant) FK 필수 + 복합 인덱스.
- **Visibility**(POL-019/ACL): `{colPrefix}_visibility`(TENANT/TEAM/PRIVATE) + owner FK + `*_shares`.
- **Encryption**(자격증명/PII): AES-256-GCM 3-field `{p}_encrypted/_iv/_tag`.
- **Index/PK/FK/Unique**: `idx_/pk_/fk_/uq_` 규칙.
- 예: `itt_talk_messages`(msg_id PK, ent_id FK, msg_visibility, msg_created_at), `itt_kms_sources`, `itt_kms_documents`(designated/active), `itt_users`(usr_rank, usr_must_change_password), `itt_invitations`.

> 매핑: 기존 `chat-widget-schema.sql`(MySQL) → PostgreSQL + 네이밍 규칙으로 **재발행 필요**(§9).

## 5. AuthN/AuthZ (인증·인가 — Convention §5.7)

- JWT 세션 토큰(콘솔), 위젯=서명 shop 토큰, 웹훅=HMAC. 데코레이터 스택:
  - `@Auth()` 기본(JWT+OwnEntityGuard·테넌트 격리)
  - `@AdminOnly()` 시스템 어드민
  - `@MasterOrAdmin()` 테넌트 Master 또는 시스템 어드민 (외부연동/등급/라벨/지식소스 등 Master 전용 API)
  - `@RequireAuth()` SSE/스트리밍(실시간 채팅)
- RBAC(rank×label, FR-056) + Visibility(POL-019/ACL) = 중앙 접근 체크 서비스(ACL-050)에서 판정, 감사(ACL-070→`itt_audit_logs`).

## 6. API & Errors (API·에러)

- 경로 `/api/v1/{domain}`; REST(메서드 규칙 준수); 공통 응답 포맷(success/data/error). SSE는 실시간 채팅.
- **Error code range**: `ITT` 프로젝트 대역 할당(예: 1xxxx). 도메인별 구획.

## 7. Frontend (React — Web Style Guide v2)

- Vite + TS + Tailwind, Zustand(전역)+React Query(서버상태), Query Key 패턴.
- **i18n (북미)**: locale codes `en`/`es`/`ko`, region 변형 `es-US`·`es-MX`; 고객용 기본 EN + ES(1급), KO 내부/관리자; 네임스페이스 분리; RAG 출력도 ES 지원(FR-027). 라이브러리: react-i18next(또는 동등) + ICU 복수형/통화·날짜 로케일.
- 도메인별 폴더 + 공통 컴포넌트(ui-kit); web에 platform/tenant 영역 + RBAC 라우트 가드.
- widget은 경량 번들(비동기·CDN), 스토어 렌더 영향 0(NFR-002), Theme App Embed loader.

## 8. Environments, CI/CD, Branching (환경·배포·브랜치)

- **Env**: dev / staging / production (docker/ env별 분리, secrets git 제외).
- **Branch**: `main`(prod) / `develop`(integration) / `feature|bugfix|enhance/{issue}-{desc}`. Commit `feat|fix|docs({scope}): ...`. PR 리뷰 필수.
- **CI/CD**: Turbo 파이프라인(lint/test/build) → 환경별 deploy 스크립트.
- **PM 연동**: GitHub Issues ↔ Redmine(WBS T-001~), 상태 매핑.

## 9. Stack Alignment & Migration (정합·마이그레이션) — 중요

| 항목 | 기존 설계 가정 | 표준(본 계획) | 조치 |
|------|----------------|---------------|------|
| Backend | Next.js | **NestJS 10** | dev-plan부터 NestJS 적용 |
| DB | MySQL(utf8mb4) | **PostgreSQL 15** | `chat-widget-schema.sql` 재발행(네이밍/UUID/ent_id/visibility/soft delete) |
| 실시간 | (미정) | **SSE** | 실시간 채팅 SSE로 |
| PK | BIGINT AI | **UUID** | 엔티티 키 변경 |
| 멀티테넌시 | tenant_id | **ent_id**(표준 용어) | 컬럼/용어 정렬 |
| 가시성 | (RBAC만) | **visibility 레이어(ACL)** | `_visibility`+shares 추가 |

→ 후속 태스크: **T-046 PostgreSQL 스키마 재발행**(표준 네이밍), T-047 도메인 모듈 스캐폴딩(NestJS), T-048 visibility/ACL 적용. (WBS 반영 권장.)

## 10. Schedule (일정) — WBS 연계

M1 Foundation(env·연동·DB·auth·RAG) → M2 MVP Widget → M3 Full Features → M4 QA/Release (CHATWIDGET-WBS, 14주). 표준 정합 태스크(T-046~048)는 M1에 편입.

## 11. Compliance Checklist (표준 준수 체크)
- ☐ 모노레포(apps/api·web·widget, packages/common·types) ☐ 도메인 모듈 계층(controller/service/entity/repository/dto) ☐ DB 네이밍(db_itt, itt_*, colPrefix, UUID, ent_id, soft delete, visibility, AES-GCM) ☐ auth 데코레이터 스택 ☐ /api/v1 + 공통응답/에러코드 ☐ FE Zustand+RQ+Tailwind+i18n ☐ env별 docker/secrets 분리 ☐ RBAC+ACL 중앙 체크·감사.

## References
- standards/amoeba_code_convention_v2.md, amoeba_basic_Structure_v2.md, amoeba_web_style_guide_v2.md, amoeba_basic_SPEC_v2.md · CHATWIDGET-WBS/FUNCDEF/RBAC/POLICY(POL-019).
