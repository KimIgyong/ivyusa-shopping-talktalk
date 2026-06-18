# Amoeba Basic SPEC v2

## Amoeba Company Standard Project Specification Template (표준 프로젝트 명세 템플릿)

**Document Version (문서버전):** v2.0
**Date (작성일):** 2026-03-23
**Author (작성):** Amoeba Company
**Scope (적용 범위):** All Amoeba Company web projects (Amoeba Company 전체 웹 프로젝트)
**Reference Project (기준 프로젝트):** AMB Management (Best practices based / 베스트 프랙티스 기반)

---

## Table of Contents (목차)

1. [Project Overview (프로젝트 개요)](#1-project-overview-프로젝트-개요)
2. [Tech Stack (기술 스택)](#2-tech-stack-기술-스택)
3. [System Architecture (시스템 아키텍처)](#3-system-architecture-시스템-아키텍처)
4. [Project Structure (프로젝트 구조)](#4-project-structure-프로젝트-구조)
5. [Multi-Tenancy Design (멀티테넌시 설계)](#5-multi-tenancy-design-멀티테넌시-설계)
6. [Database Design (데이터베이스 설계)](#6-database-design-데이터베이스-설계)
7. [API Design (API 설계)](#7-api-design-api-설계)
8. [Authentication & Authorization (인증/인가)](#8-authentication--authorization-인증인가)
9. [AI Integration (AI 통합)](#9-ai-integration-ai-통합)
10. [Development Environment (개발 환경)](#10-development-environment-개발-환경)
11. [Code Conventions (코드 컨벤션)](#11-code-conventions-코드-컨벤션)
12. [Deployment Environment (배포 환경)](#12-deployment-environment-배포-환경)
13. [External Integrations (외부 연동)](#13-external-integrations-외부-연동)
14. [Payment System (결제 시스템)](#14-payment-system-결제-시스템)
15. [Non-Functional Requirements (비기능 요구사항)](#15-non-functional-requirements-비기능-요구사항)
16. [Reference Documents (참고 문서)](#16-reference-documents-참고-문서)

---

## 1. Project Overview (프로젝트 개요)

### 1.1 Document Information (문서 정보)

| Item (항목) | Content (내용) |
|------|------|
| **Document Name (문서명)** | SPEC.md |
| **Project Name (프로젝트명)** | {Project Name / 프로젝트명} |
| **Project Code (프로젝트 코드)** | {Project Code / 프로젝트 코드} |
| **Version (버전)** | v1.0 |
| **Date (작성일)** | YYYY-MM-DD |
| **Domain (도메인)** | {Service Domain / 서비스 도메인} |

### 1.2 Service Introduction (서비스 소개)

{Write a brief introduction about the service. / 서비스에 대한 간략한 소개를 작성합니다.}

### 1.3 Core Values (핵심 가치)

| Value (가치) | Description (설명) |
|------|------|
| **{Value1 / 가치1}** | {Description / 설명} |
| **{Value2 / 가치2}** | {Description / 설명} |
| **{Value3 / 가치3}** | {Description / 설명} |

### 1.4 User Types (사용자 유형) (v2.0 Extended / v2.0 확장)

| Type (유형) | Level (레벨) | Role (역할) | Key Features (주요 기능) |
|------|------|------|----------|
| **System Admin (시스템 관리자)** | ADMIN_LEVEL | Platform operations/settings (플랫폼 운영/설정) | User management, system settings, entity management (사용자 관리, 시스템 설정, 법인 관리) |
| **Internal Employee (내부 직원)** | USER_LEVEL | Business operations (업무 수행) | View/edit own entity data, use AI agents (본인 법인 데이터 조회/편집, AI 에이전트 사용) |
| **B2B Customer (B2B 고객)** | CLIENT_LEVEL | Customer portal usage (고객 포털 이용) | Contract inquiry, payment, service requests (계약 조회, 대금 결제, 서비스 요청) |
| **Partner (파트너)** | PARTNER_LEVEL | Partner ecosystem (파트너 생태계) | App registration/management, API integration, marketplace (앱 등록/관리, API 연동, 마켓플레이스) |

> **v2.0 Change (v2.0 변경):** Expanded from v1's 3-role system (USER/MANAGER/ADMIN) to v2's 4-level system (ADMIN/USER/CLIENT/PARTNER). Fine-grained roles within each level are `Roles`-based. (v1에서 3-역할(USER/MANAGER/ADMIN) → v2에서 4-레벨(ADMIN/USER/CLIENT/PARTNER) 시스템으로 확장. 레벨 내 세부 역할은 `Roles` 기반.)

### 1.5 Key Features (주요 기능)

| Feature ID (기능 ID) | Feature Name (기능명) | Description (설명) |
|---------|--------|------|
| FN-001 | {Feature Name / 기능명} | {Description / 설명} |
| FN-002 | {Feature Name / 기능명} | {Description / 설명} |

---

## 2. Tech Stack (기술 스택)

### 2.1 Frontend

**Common (공통):**

| Technology (기술) | Version (버전) | Purpose (용도) |
|------|------|------|
| TypeScript | 5.x | Type system (타입 시스템) |
| Vite | 5.x | Build tool (빌드 도구) |
| TailwindCSS | 3.x | Styling (스타일링) |
| Zod | 3.x | Schema validation (스키마 검증) |
| recharts | 2.x | Chart library (차트 라이브러리) |
| Lucide | latest | Icons (아이콘) (`lucide-react` / `lucide-vue-next`) |

**When choosing React (React 선택 시):**

| Technology (기술) | Version (버전) | Purpose (용도) |
|------|------|------|
| React | 18.x | UI library (UI 라이브러리) |
| Zustand | 4.x | Global state management (전역 상태 관리) |
| React Query (TanStack) | 5.x | Server state management (서버 상태 관리) |
| React Hook Form | 7.x | Form management (폼 관리) |
| React Router | 6.x | Routing (라우팅) (createBrowserRouter) |
| react-i18next | 14.x | Internationalization (다국어 지원) |

**When choosing Vue.js (Vue.js 선택 시):**

| Technology (기술) | Version (버전) | Purpose (용도) |
|------|------|------|
| Vue.js | 3.x | UI framework (UI 프레임워크) |
| Pinia | 2.x | Global state management (전역 상태 관리) |
| Vue Query (TanStack) | 5.x | Server state management (서버 상태 관리) |
| VeeValidate | 4.x | Form management (폼 관리) |
| Vue Router | 4.x | Routing (라우팅) |
| vue-i18n | 9.x | Internationalization (다국어 지원) |

**Mobile (Optional) (모바일 (선택)):**

| Technology (기술) | Version (버전) | Purpose (용도) |
|------|------|------|
| React Native | 0.7x | Mobile app (모바일 앱) |
| Expo | 51.x | Build/deploy tool (빌드/배포 도구) |

### 2.2 Backend

| Technology (기술) | Version (버전) | Purpose (용도) |
|------|------|------|
| NestJS | 10.x | Server framework (서버 프레임워크) |
| TypeScript | 5.x | Type system (타입 시스템) |
| Node.js | 20.x LTS | Runtime (런타임) |
| TypeORM | 0.3.x | ORM |
| PostgreSQL | 15.x | Primary database (주 데이터베이스) |
| Redis | 7.x | Cache, session, queue (캐시, 세션, 큐) |
| Bull | 4.x | Job queue (작업 큐) |
| Passport | 10.x | Authentication (인증) |
| class-validator | 0.14.x | DTO validation (DTO 검증) |
| @nestjs/swagger | 7.x | API documentation (API 문서) |
| @anthropic-ai/sdk | latest | Claude AI integration (Claude AI 연동) |

### 2.3 Infrastructure (인프라)

| Service (서비스) | Purpose (용도) |
|--------|------|
| Docker / Docker Compose | Container orchestration (컨테이너 오케스트레이션) |
| Nginx | Reverse proxy, static file serving (리버스 프록시, 정적 파일 서빙) |
| Cloud DNS | Domain management (도메인 관리) |
| Cloud Storage (GCS) / S3 | File storage (파일 스토리지) |
| Let's Encrypt | SSL certificates (SSL 인증서) |

> **v2.0 Change (v2.0 변경):** Switched from GCP-only to flexible Docker-based deployment. Supports on-premise, VPS, and cloud. (GCP 전용 → Docker 기반 유연한 배포로 전환. 온프레미스, VPS, 클라우드 모두 지원.)

### 2.4 Development Tools (개발 도구)

| Tool (도구) | Purpose (용도) |
|------|------|
| ESLint | Code linting (코드 린팅) |
| Prettier | Code formatting (코드 포매팅) |
| Jest / Vitest | Unit testing (단위 테스트) |
| Swagger (OpenAPI) | API documentation (API 문서화) |
| Docker | Containers (컨테이너) |
| Turborepo | Monorepo build (모노레포 빌드) |

### 2.5 Internationalization (i18n) Support (다국어 (i18n) 지원) (v2.0 Extended / v2.0 확장)

| Code (코드) | Language (언어) | Status (상태) |
|------|------|------|
| `ko` | Korean (한국어) | Default (Fallback) (기본 제공 (Fallback)) |
| `en` | English (영어) | Default (기본 제공) |
| `vi` | Vietnamese (베트남어) | Added in v2.0 (v2.0 추가) |

FE: `react-i18next` / `vue-i18n`, namespace-based JSON translation files (네임스페이스 기반 JSON 번역 파일)
BE: English fixed, FE translates based on error codes (영어 고정, 에러 코드 기반 FE 번역)
AI: Response language controlled via `Accept-Language` header (`Accept-Language` 헤더로 응답 언어 제어)

---

## 3. System Architecture (시스템 아키텍처)

### 3.1 Architecture Principles (아키텍처 원칙)

| Principle (원칙) | Description (설명) | Application (적용) |
|------|------|------|
| **Clean Architecture (클린 아키텍처)** | Separation of concerns, dependency inversion (관심사 분리, 의존성 역전) | 4-Layer structure (4-Layer 구조) |
| **Domain-Driven Design (DDD) (도메인 주도 설계 (DDD))** | Business domain-centric modularization (비즈니스 도메인 중심 모듈화) | Domain-specific folder structure (도메인별 폴더 구조) |
| **Multi-Tenancy (멀티테넌시)** | Entity-level data isolation (법인 단위 데이터 격리) | Entity(ent_id) based (Entity(ent_id) 기반) |
| **Type Safety** | Ensure type safety (타입 안정성 보장) | TypeScript strict mode (TypeScript strict 모드) |
| **API First** | Contract-first design (계약 우선 설계) | OpenAPI Spec defined first (OpenAPI Spec 선행 정의) |

### 3.2 Layer Structure (계층 구조) (4-Layer)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Presentation Layer (프레젠테이션 계층)                      │
│              Controller, Request/Response DTO, Validation                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                    Application Layer (애플리케이션 계층)                       │
│                   Service, Mapper, Event Handler                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                      Domain Layer (도메인 계층)                               │
│            Entity, Value Object, Repository Interface                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer (인프라 계층)                          │
│          Repository Impl, External API, Cache, Database                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Overall System Diagram (전체 시스템 구성도) (v2.0 Extended / v2.0 확장)

```
                        ┌──────────────────┐
                        │    Cloud DNS     │
                        └────────┬─────────┘
                                 │
                        ┌────────▼─────────┐
                        │   Nginx Proxy    │
                        │   (SSL/HTTPS)    │
                        └────────┬─────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
┌───────▼────────┐ ┌─────────────▼──────────┐ ┌──────────▼──────────┐
│  Web Frontend  │ │    API Server          │ │   Portal API        │
│  (Nginx/React) │ │    (NestJS)            │ │   (NestJS)          │
│                │ │                        │ │   (Client/Partner)  │
└────────────────┘ └────────┬───────────────┘ └──────────┬──────────┘
                            │                            │
        ┌───────────────────┴────────────────────────────┘
        │
┌───────┼───────────┬──────────────────────┬──────────────┐
│       │           │                      │              │
│ ┌─────▼─────┐ ┌───▼────────┐ ┌──────────▼────┐ ┌───────▼───────┐
│ │PostgreSQL │ │ Redis      │ │ Claude API   │ │ External APIs │
│ │ (Primary) │ │ (Cache)    │ │ (Anthropic)  │ │ (Google, etc) │
│ └───────────┘ └────────────┘ └───────────────┘ └───────────────┘
│
│ ┌─────────────┐ ┌──────────────┐ ┌────────────────┐
│ │ GCS/S3      │ │ SMTP         │ │ Payment GW     │
│ │ (Files)     │ │ (Email)      │ │ (NICEPAY etc)  │
│ └─────────────┘ └──────────────┘ └────────────────┘
```

---

## 4. Project Structure (프로젝트 구조)

### 4.1 Monorepo Structure (Monorepo 구조) (v2.0 Extended / v2.0 확장)

```
{project}/
├── apps/
│   ├── api/                         # NestJS backend (Main API) (NestJS 백엔드 (메인 API))
│   ├── web/                         # Frontend (React or Vue.js) (프론트엔드 (React 또는 Vue.js))
│   ├── portal-api/                  # Portal API (B2B Customer/Partner) (포털 API (B2B 고객/파트너))
│   ├── portal-web/                  # Portal frontend (포털 프론트엔드)
│   └── mobile/                      # React Native mobile app (React Native 모바일 앱)
│
├── packages/
│   ├── common/                      # Common utilities (tsup bundle) (공통 유틸리티 (tsup 번들))
│   └── types/                       # Shared type definitions (공유 타입 정의)
│
├── docker/
│   ├── docker-compose.dev.yml       # Development environment (개발 환경)
│   ├── dev/                         # Dev Docker + deploy script (개발 Docker + deploy 스크립트)
│   ├── staging/                     # Staging Docker + deploy script (스테이징 Docker + deploy 스크립트)
│   └── production/                  # Production Docker + deploy script (프로덕션 Docker + deploy 스크립트)
│
├── env/
│   ├── backend/.env.development
│   └── frontend/.env.development
│
├── sql/                             # DB migration SQL (DB 마이그레이션 SQL)
├── docs/                            # Documents (Analysis→Plan→Impl→Test→Report) (문서 (분석→계획→구현→테스트→보고))
├── reference/                       # Amoeba standard documents (Amoeba 표준 문서)
├── scripts/                         # Development helper scripts (개발 도우미 스크립트)
│
├── package.json
├── turbo.json                       # Turborepo config (Turborepo 설정)
├── tsconfig.json
└── README.md
```

### 4.2 Backend Structure (NestJS) (백엔드 구조 (NestJS))

```
apps/api/src/
├── domain/                          # Domain modules (44+) (도메인별 모듈 (44+))
│   ├── auth/                        # Auth (JWT, OAuth, Redis) (인증 (JWT, OAuth, Redis))
│   ├── users/                       # User CRUD (사용자 CRUD)
│   ├── invitation/                  # Invitation/Registration (초대/가입)
│   ├── hr-entity/                   # HR Entity/Organization (HR 법인/조직)
│   ├── hr-employee/                 # HR Employee (HR 직원)
│   ├── hr-attendance/               # HR Attendance (HR 근태)
│   ├── hr-payroll/                  # HR Payroll (HR 급여)
│   ├── project/                     # Project management (프로젝트 관리)
│   ├── billing/                     # Sales/Billing (영업/청구)
│   ├── accounting/                  # Accounting (Journal entries, Chart of accounts) (회계 (분개, 계정과목))
│   ├── issues/                      # Issue tracker (이슈 트래커)
│   ├── ai-usage/                    # AI usage/quota (AI 사용량/쿼터)
│   ├── talk/                        # Amoeba Talk (Chat) (Amoeba Talk (채팅))
│   ├── kms/                         # Knowledge management (지식관리)
│   ├── todo/                        # Todo management (할일 관리)
│   ├── svc-client/                  # Service center client (서비스센터 고객)
│   ├── partner/                     # Partner/App market (파트너/앱 마켓)
│   ├── payment-gateway/             # Payment (결제)
│   ├── settings/                    # API keys, DB connection, NAS (API키, DB연결, NAS)
│   └── ...                          # Additional domains (추가 도메인)
│
├── global/                          # Global modules (전역 모듈)
│   ├── config/                      # TypeORM, Redis config (TypeORM, Redis 설정)
│   ├── filter/                      # Global exception filters (전역 예외 필터)
│   ├── interceptor/                 # Response transform, timezone (응답 변환, 타임존)
│   ├── middleware/                   # Logging, correlation ID (로깅, 상관관계 ID)
│   ├── pipe/                        # Validation pipes (유효성 검증 파이프)
│   ├── decorator/                   # @Auth, @AdminOnly, custom decorators (커스텀 데코레이터)
│   └── guard/                       # JWT, OwnEntity, LevelRole, Roles
│
├── infrastructure/                  # Infrastructure layer (인프라 계층)
│   └── external/
│       ├── claude/                   # Claude AI service (Single gateway) (Claude AI 서비스 (싱글 게이트웨이))
│       ├── google-drive/            # Google Drive integration (Google Drive 연동)
│       ├── google-sheets/           # Google Sheets integration (Google Sheets 연동)
│       ├── popbill/                 # Popbill e-tax invoice (Popbill 전자세금계산서)
│       ├── slack/                   # Slack notifications (Slack 알림)
│       └── smtp/                    # Email sending (이메일 발송)
│
├── app.module.ts
└── main.ts
```

### 4.3 Frontend Structure (프론트엔드 구조)

```
apps/web/src/
├── domain/{domain}/
│   ├── pages/                       # Page components (페이지 컴포넌트) (.tsx)
│   ├── components/                  # Domain-specific components (도메인 전용 컴포넌트)
│   ├── hooks/                       # Custom hooks (커스텀 훅) (useXxx.ts)
│   ├── service/                     # API service layer (API 서비스 레이어)
│   ├── store/                       # Zustand store (Zustand 스토어)
│   └── types/                       # Type definitions (타입 정의)
│
├── global/
│   ├── components/                  # Common components (layouts/, ui/) (공통 컴포넌트)
│   ├── hooks/                       # Common hooks (공통 훅)
│   ├── store/                       # Global stores (auth, org, notification, timezone) (전역 스토어)
│   ├── service/                     # API client (axios) (API 클라이언트)
│   ├── i18n/
│   │   ├── locales/
│   │   │   ├── ko/                  # Korean (한국어) (40+ namespace JSON)
│   │   │   ├── en/                  # English (영어)
│   │   │   └── vi/                  # Vietnamese (베트남어)
│   │   └── i18n.ts                  # i18n instance config (i18n 인스턴스 설정)
│   └── lib/                         # Utilities (유틸리티) (api-client, date, format)
│
├── router/                          # React Router (createBrowserRouter)
├── App.tsx
└── main.tsx
```

---

## 5. Multi-Tenancy Design (멀티테넌시 설계) (v2.0 New / v2.0 신규)

### 5.1 Tenant Structure (테넌트 구조)

```
Entity (Corporation / 법인/회사) ──── ent_id (UUID)
  ├── Cell (Amoeba Cell / 아메바 셀) ── Visibility unit, AI agent assignment per dept (가시성 단위, 부서별 AI 에이전트 배정)
  └── Unit (Department/Team / 부서/팀) ──── Org hierarchy (self-referencing tree) (조직 계층 (자기참조 트리))
      └── UserUnitRole ── User-department-role mapping (사용자-부서-역할 매핑)
```

### 5.2 Data Isolation Principles (데이터 격리 원칙)

| Principle (원칙) | Implementation (구현) |
|------|------|
| **Entity Isolation (법인 격리)** | All data tables have `ent_id` FK (모든 데이터 테이블에 `ent_id` FK 보유) |
| **Auto Filtering (자동 필터링)** | `OwnEntityGuard` → auto-filter by JWT entityId (`OwnEntityGuard` → JWT의 entityId로 자동 필터) |
| **Visibility Model (가시성 모델)** | ENTITY (entire entity / 법인 전체) / CELL (within cell / 셀 내) / PRIVATE (author only / 작성자만) |
| **EntityId Resolution (EntityId 결정)** | `resolveEntityId(queryEntityId, user)` → query param > JWT |

### 5.3 Organization Hierarchy (조직 계층)

```
amb_hr_entities (Entity / 법인)
  └── amb_hr_cells (Cell / 셀) ── AI agent assignment unit (AI 에이전트 배정 단위)
  └── amb_hr_units (Unit / Department / 부서) ── parent_unit_id self-reference (자기참조)
      └── amb_hr_user_unit_roles (User-unit-role mapping / 사용자-부서-역할)
```

---

## 6. Database Design (데이터베이스 설계)

### 6.1 Database Information (데이터베이스 정보)

| Item (항목) | Value (값) |
|------|-----|
| **Database Name** | `db_{project}` |
| **DBMS** | PostgreSQL 15+ |
| **Charset** | UTF-8 |
| **Table Prefix** | `{prefix}_` (per project / 프로젝트별), domain sub-prefix (도메인별 하위 prefix) |
| **Column Prefix** | 3 characters (per table, unique) (3자 (테이블별 고유)) |

### 6.2 Naming Conventions (네이밍 컨벤션)

| Category (구분) | Rule (규칙) | Example (예시) |
|------|------|------|
| Table name (테이블명) | `{prefix}_` + plural snake_case (복수형 snake_case) | `amb_campaigns` |
| Domain prefix (도메인 prefix) | `{prefix}_{domain}_` | `amb_hr_employees`, `amb_bil_invoices` |
| Column name (컬럼명) | 3-char prefix + snake_case (3자 prefix + snake_case) | `cmp_name`, `usr_email` |
| PK | `{col_prefix}_id` (UUID) | `cmp_id`, `usr_id` |
| FK | Same as referenced table's PK name (참조 테이블의 PK명 그대로) | `ent_id`, `usr_id` |
| Boolean | `{col_prefix}_is_{name}` | `cmp_is_active` |
| Created at (생성일) | `{col_prefix}_created_at` | `cmp_created_at` |
| Updated at (수정일) | `{col_prefix}_updated_at` | `cmp_updated_at` |
| Deleted at (삭제일) | `{col_prefix}_deleted_at` | `cmp_deleted_at` (Soft Delete) |
| Visibility (가시성) | `{col_prefix}_visibility` | `iss_visibility` |
| Encryption (암호화) | `{col_prefix}_encrypted/iv/tag` | AES-256-GCM 3-field pattern (3-필드 패턴) |

### 6.3 Domain Table Composition (도메인별 테이블 구성)

| Domain (도메인) | Table Count (테이블 수) | Key Tables (주요 테이블) |
|--------|----------|-------------|
| **{Domain1 / 도메인1}** | {N}+ | {List tables / 테이블 나열} |
| **{Domain2 / 도메인2}** | {N}+ | {List tables / 테이블 나열} |

### 6.4 Entity Authoring Rules (Entity 작성 규칙) (v2.0 Enhanced / v2.0 강화)

```typescript
@Entity('{prefix}_{table_name}')
export class {EntityName} {
  @PrimaryGeneratedColumn('uuid', { name: '{col}_id' })
  {col}Id: string;

  @Column({ name: 'ent_id', type: 'uuid' })
  entId: string;  // Multi-tenancy required (멀티테넌시 필수)

  @Column({ name: '{col}_name', length: 200 })
  {col}Name: string;

  // ⚠️ nullable → type must be specified (TypeORM reflect-metadata issue)
  // (nullable → type 명시 필수 (TypeORM reflect-metadata 이슈))
  @Column({ name: '{col}_description', type: 'text', nullable: true })
  {col}Description: string | null;

  @CreateDateColumn({ name: '{col}_created_at' })
  {col}CreatedAt: Date;

  @UpdateDateColumn({ name: '{col}_updated_at' })
  {col}UpdatedAt: Date;

  @DeleteDateColumn({ name: '{col}_deleted_at' })
  {col}DeletedAt: Date;
}
```

> **v2.0 MUST:** Union type properties like `string | null` must specify `type: 'varchar'` / `type: 'text'`. Omission causes runtime DataTypeNotSupportedError. (`string | null` 등 union type 프로퍼티는 `type: 'varchar'` / `type: 'text'` 명시. 미지정 시 런타임 DataTypeNotSupportedError.)

### 6.5 Schema Migration (스키마 마이그레이션) (v2.0 New / v2.0 신규)

| Environment (환경) | Method (방식) |
|------|------|
| Development (개발) | TypeORM `synchronize: true` (Auto / 자동) |
| Staging/Production (스테이징/프로덕션) | **Manual SQL (수동 SQL)** (`sql/` directory (디렉토리)) |

```bash
# Staging example (스테이징 예시)
docker exec {postgres-container} psql -U {user} -d {db} -c '
  ALTER TABLE amb_campaigns ADD COLUMN cmp_cell_id UUID;
'
```

> **Caution (주의):** Staging/Production uses `NODE_ENV=production` with `synchronize: false`. New tables/columns must be applied via manual SQL before code deployment. (스테이징/프로덕션은 `NODE_ENV=production`으로 `synchronize: false`. 새 테이블/컬럼은 코드 배포 전 수동 SQL 적용 필수.)

---

## 7. API Design (API 설계)

### 7.1 API Basic Information (API 기본 정보)

| Item (항목) | Value (값) |
|------|-----|
| **Base URL** | `/api/v1` |
| **Auth Method (인증 방식)** | Bearer Token (JWT) |
| **Content-Type** | `application/json` |
| **Documentation (문서화)** | Swagger (OpenAPI 3.0) |

### 7.2 API Response Structure (API 응답 구조)

**Single Response (단일 응답):**
```typescript
interface BaseSingleResponse<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string; details?: Record<string, string[]> };
  timestamp: string;
}
```

**List Response (목록 응답):**
```typescript
interface BaseListResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    size: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  timestamp: string;
}
```

### 7.3 Error Code System (에러 코드 체계)

| Code Range (코드 범위) | Type (유형) |
|-----------|------|
| E1xxx | Auth/Authorization errors (인증/인가 오류) |
| E2xxx | User-related errors (사용자 관련 오류) |
| E3xxx | Conversation/Chat errors (대화/채팅 오류) |
| E4xxx | AI/Agent errors (AI/에이전트 오류) (E4010: daily quota (일간 쿼터), E4011: monthly quota (월간 쿼터)) |
| E5xxx | Project-specific domain errors (프로젝트별 도메인 오류) |
| E9xxx | System errors (시스템 오류) |

### 7.4 DTO Case Rules (DTO 케이스 규칙)

| Category (구분) | Rule (규칙) | Notes (비고) |
|------|------|------|
| Request DTO | `snake_case` | API input (API 입력) (entity_id, campaign_name) |
| Response DTO | `camelCase` | API output (API 출력) (entityId, campaignName) |
| Query Parameter | `snake_case` | ?status=ACTIVE&entity_id=xxx |

### 7.5 Key API Endpoints (주요 API 엔드포인트)

**Authentication (인증):**
| Method | Endpoint | Description (설명) |
|--------|----------|------|
| POST | `/auth/login` | Login (로그인) |
| POST | `/auth/register` | Registration (회원가입) |
| POST | `/auth/refresh` | Token refresh (토큰 갱신) |
| POST | `/auth/logout` | Logout (로그아웃) |

**{Domain / 도메인} (Example / 예시):**
| Method | Endpoint | Description (설명) |
|--------|----------|------|
| GET | `/{domain}` | List (목록 조회) |
| POST | `/{domain}` | Create (생성) |
| GET | `/{domain}/:id` | Detail (상세 조회) |
| PUT | `/{domain}/:id` | Update (수정) |
| DELETE | `/{domain}/:id` | Delete (삭제) (Soft Delete) |

**SSE (Server-Sent Events):** (v2.0 New / v2.0 신규)
| Method | Endpoint | Description (설명) |
|--------|----------|------|
| GET | `/ai-agents/chat/stream` | AI chat streaming (AI 채팅 스트리밍) |
| GET | `/{domain}/events` | Real-time event subscription (실시간 이벤트 구독) |

---

## 8. Authentication & Authorization (인증/인가) (v2.0 Extended / v2.0 확장)

### 8.1 Authentication Methods (인증 방식)

| Method (방식) | Purpose (용도) |
|------|------|
| **JWT** | General auth (Access Token + Refresh Token) (일반 인증) |
| **OAuth 2.0** | Social login (소셜 로그인) (Google, Kakao, Naver) |
| **API Key** | External service auth (외부 서비스 인증) (AES-256-GCM encrypted storage / 암호화 저장) |

### 8.2 Token Policy (토큰 정책)

| Item (항목) | Access Token | Refresh Token |
|------|--------------|---------------|
| Validity (유효기간) | 15 min (15분) | 7 days (7일) |
| Storage (저장 위치) | Memory / Header | HttpOnly Cookie |
| Renewal (갱신) | Using Refresh Token (Refresh Token 사용) | Re-login (재로그인) |

### 8.3 Permission System (권한 체계) (v2.0 Extended: 4-Level / v2.0 확장: 4-레벨)

| Level (레벨) | Decorator (데코레이터) | Guard | Access Scope (접근 영역) |
|------|-----------|-------|----------|
| ADMIN_LEVEL | `@AdminOnly()` | LevelRoleGuard | Full system management (전체 시스템 관리) |
| USER_LEVEL | `@Auth()` | JwtAuthGuard + OwnEntityGuard | Within entity operations (법인 내 업무) |
| CLIENT_LEVEL | `@ClientOnly()` | ClientGuard | Customer portal (고객 포털) |
| PARTNER_LEVEL | `@PartnerOnly()` | PartnerGuard | Partner portal (파트너 포털) |

**Decorator Stack (데코레이터 스택):**

| Decorator (데코레이터) | Composition (구성) | Purpose (용도) |
|-----------|------|------|
| `@Auth()` | JWT + OwnEntityGuard | Most commonly used (Default) (가장 많이 사용 (기본)) |
| `@AdminOnly()` | Auth + LevelRole(ADMIN) | Admin only (관리자 전용) |
| `@MasterOrAdmin()` | Auth + Master/Admin (마스터/관리자) | Entity master or admin (법인 마스터 또는 관리자) |
| `@PartnerOnly()` | Partner level only (파트너 레벨 전용) | Partner API (파트너 API) |
| `@RequireAuth()` | SSE/Streaming only (SSE/스트리밍 전용) | Streaming auth (스트리밍 인증) |

### 8.4 Security Policies (보안 정책)

| Policy (정책) | Setting (설정) |
|------|------|
| Password hashing (비밀번호 해싱) | bcrypt (salt rounds: 12) |
| Login attempt limit (로그인 시도 제한) | Locked for 30 min after 5 failures (5회 실패 시 30분 잠금) |
| HTTPS | Required (필수) (TLS 1.3) |
| CORS | Allowed domains explicitly listed (허용 도메인 명시) |
| Encryption (암호화) | AES-256-GCM (API Key, SMTP PW, PG Key) |

### 8.5 Input Validation & Web Security (입력 검증 및 웹 보안)

| Threat (위협) | Countermeasure (대응 방안) |
|------|----------|
| SQL Injection | TypeORM parameter binding required; parameterized query enforced for raw queries (TypeORM 파라미터 바인딩 필수, Raw Query 사용 시 parameterized query 강제) |
| XSS | HTML escape user input, Content-Security-Policy header (사용자 입력 HTML 이스케이프, Content-Security-Policy 헤더 적용) |
| CSRF | SameSite Cookie attribute + CSRF token (for SSR) (SameSite Cookie 속성 + CSRF 토큰 적용 (SSR 사용 시)) |
| Mass Assignment | DTO whitelist validation (class-validator + whitelist: true) (DTO whitelist 검증) |
| Path Traversal | File name/path validation on upload, UUID-based storage (파일 업로드 시 파일명/경로 검증, UUID 기반 저장) |
| Rate Limiting | Auth endpoint request limit per minute (throttler) (인증 엔드포인트 분당 요청 제한) |
| Security Headers (보안 헤더) | helmet middleware applied (helmet 미들웨어 적용) |

---

## 9. AI Integration (AI 통합) (v2.0 New / v2.0 신규)

### 9.1 AI Service Architecture (AI 서비스 아키텍처)

```
User Request (사용자 요청)
  └── Controller (@Auth)
       └── DomainService
            └── ClaudeService (Single Gateway / 싱글 게이트웨이)
                 ├── checkQuotaIfNeeded() ── AiUsageService.checkQuota()
                 ├── sendMessage()         ── Sync response (동기 응답)
                 └── streamMessage()       ── SSE streaming response (SSE 스트리밍 응답)
```

### 9.2 Quota Management (쿼터 관리)

| Item (항목) | Description (설명) |
|------|------|
| Daily Quota (일간 쿼터) | Per-entity daily AI token limit (법인별 일일 AI 토큰 한도) |
| Monthly Quota (월간 쿼터) | Per-entity monthly AI token limit (법인별 월간 AI 토큰 한도) |
| Enforcement Timing (강제 시점) | Auto-check before ClaudeService call (ClaudeService 호출 전 자동 체크) |
| Error Codes (에러 코드) | E4010 (daily exceeded / 일간 초과), E4011 (monthly exceeded / 월간 초과) |

### 9.3 AI Application Domains (AI 적용 도메인) (13+ Endpoints / 13+ 엔드포인트)

| Domain (도메인) | Feature (기능) |
|--------|------|
| Department AI Chat (부서별 AI 채팅) | Cell-based expert agent conversation (Cell 기반 전문 에이전트 대화) |
| Translation (번역) | Real-time content translation (ko/en/vi) (콘텐츠 실시간 번역) |
| Report Generation (보고서 생성) | Meeting minutes, proposals (회의록, 기획서, 제안서) |
| Daily Analysis (오늘의 분석) | Daily work status AI analysis (일일 업무 현황 AI 분석) |
| Issue AI Review (이슈 AI 리뷰) | Automatic issue analysis/suggestions (이슈 자동 분석/제안) |
| Accounting AI (회계 AI) | Journal entry recommendations, financial analysis (분개 추천, 재무 분석) |
| KMS Document Generation (KMS 문서 생성) | Auto-generation of knowledge base documents (지식 베이스 문서 자동 생성) |

---

## 10. Development Environment (개발 환경)

### 10.1 Port Mapping (포트 매핑)

| Service (서비스) | Default Port (기본 포트) | Purpose (용도) |
|--------|----------|------|
| Backend API (NestJS) | 3000~3009 | REST API server (REST API 서버) |
| Frontend (Vite) | 5173~5179 | Web frontend (웹 프론트엔드) |
| PostgreSQL | 5432 | Primary database (주 데이터베이스) |
| Redis | 6379 | Cache/Session (캐시/세션) |

### 10.2 Environment Variable Structure (환경 변수 구조) (v2.0 Extended / v2.0 확장)

```
env/
├── backend/
│   └── .env.development
└── frontend/
    └── .env.development

docker/
├── dev/                             # Development environment (개발 환경)
│   └── deploy-dev.sh
├── staging/                         # Staging (스테이징)
│   ├── .env.staging (not in git / git 미포함)
│   └── deploy-staging.sh
└── production/                      # Production (프로덕션)
    ├── .env.production (not in git / git 미포함)
    └── deploy-production.sh
```

> **MUST:** VITE_* environment variables are **inlined at build time**, so image rebuild is required when changing environments. `deploy-*.sh` scripts auto-pass `--env-file`, so always go through scripts. (VITE_* 환경변수는 **빌드 시점 인라인**이므로, 환경 변경 시 이미지 재빌드 필수. `deploy-*.sh` 스크립트가 `--env-file`을 자동 전달하므로 반드시 스크립트 경유.)

---

## 11. Code Conventions (코드 컨벤션)

### 11.1 Naming Rules (네이밍 규칙)

**File Names (파일명):**
| Type (유형) | Rule (규칙) | Example (예시) |
|------|------|------|
| Component (컴포넌트) | PascalCase | `CampaignCard.tsx` |
| Hook (훅) | camelCase + use prefix (use 접두사) | `useCampaign.ts` |
| Service (서비스) | kebab-case + .service | `campaign.service.ts` |
| Controller (컨트롤러) | kebab-case + .controller | `campaign.controller.ts` |
| Entity | kebab-case + .entity | `campaign.entity.ts` |
| Mapper | kebab-case + .mapper | `campaign.mapper.ts` |

### 11.2 Git Branch Strategy (Git 브랜치 전략) (v2.0 Changed / v2.0 변경)

| Branch (브랜치) | Purpose (용도) | Deploy Environment (배포 환경) | Protection (보호) |
|--------|------|----------|------|
| `production` | Production release (프로덕션 릴리즈) | Production server (프로덕션 서버) | PR required, 1 approval (PR 필수, 1명 승인) |
| `main` | Development integration (Default) (개발 통합 (기본)) | Staging server (스테이징 서버) | PR required, 1 approval (PR 필수, 1명 승인) |
| `feature/*` | Feature development (기능 개발) | Local (로컬) | - |
| `hotfix/*` | Emergency fix (긴급 수정) | - | - |

> **v2.0 Change (v2.0 변경):** Switched from v1's `main` (production) + `develop` (development) to v2's `production` (production) + `main` (development/staging) structure. (v1의 `main`(프로덕션) + `develop`(개발) → v2의 `production`(프로덕션) + `main`(개발/스테이징) 구조로 전환.)

### 11.3 Commit Messages (커밋 메시지)

```
{type}: {description / 설명}

type: feat | fix | docs | style | refactor | test | chore | hotfix
Example (예): feat: Add user profile page (사용자 프로필 페이지 추가)
```

---

## 12. Deployment Environment (배포 환경) (v2.0 Extended / v2.0 확장)

### 12.1 Per-Environment Domains (환경별 도메인)

| Environment (환경) | Web | API |
|------|-----|-----|
| Development (개발) | http://localhost:{port} | http://localhost:{port} |
| Staging (스테이징) | https://stg-{domain} | https://stg-{domain}/api/v1 |
| Production (프로덕션) | https://{domain} | https://{domain}/api/v1 |

### 12.2 Docker-Based Deployment (Docker 기반 배포) (v2.0 New / v2.0 신규)

```yaml
# Service composition (per-environment docker-compose)
# (서비스 구성 (환경별 docker-compose))
services:
  web:        # Nginx + React static build (Nginx + React 정적 빌드)
  api:        # NestJS application (NestJS 애플리케이션)
  postgres:   # PostgreSQL 15
  redis:      # Redis 7
```

### 12.3 Deployment Scripts (배포 스크립트) (MUST)

| Environment (환경) | Script (스크립트) | Execution Location (실행 위치) |
|------|---------|----------|
| Development (개발) | `bash docker/dev/deploy-dev.sh` | Local (로컬) |
| Staging (스테이징) | `bash docker/staging/deploy-staging.sh` | Staging server (스테이징 서버) |
| Production (프로덕션) | `bash docker/production/deploy-production.sh` | Production server (프로덕션 서버) |

> **PROHIBITED (금지):** Direct execution of `docker compose build` is prohibited. Missing `--env-file` causes VITE_* variables to be incorrectly inlined, leading to critical errors like CORS. (`docker compose build` 직접 실행 금지. `--env-file` 누락으로 VITE_* 변수가 잘못 인라인되어 CORS 등 치명적 오류 발생.)

---

## 13. External Integrations (외부 연동) (v2.0 Extended / v2.0 확장)

### 13.1 AI Service (AI 서비스)

| Service (서비스) | Purpose (용도) | Auth (인증) |
|--------|------|------|
| Anthropic Claude API | LLM analysis, chat, translation, document generation (LLM 분석, 채팅, 번역, 문서 생성) | API Key (AES-256-GCM encrypted / 암호화) |

### 13.2 Project Management Tools (프로젝트 관리 도구)

| Service (서비스) | Purpose (용도) | Auth (인증) |
|--------|------|------|
| Redmine | External issue sync (외부 이슈 동기화) | API Key |
| Asana | External task sync (외부 태스크 동기화) | API Key |

### 13.3 Google Services (Google 서비스)

| Service (서비스) | Purpose (용도) | Auth (인증) |
|--------|------|------|
| Google Drive | File storage/sharing (파일 저장/공유) | Service Account (JSON) |
| Google Sheets | Report export (보고서 내보내기) | Service Account (JSON) |

### 13.4 Finance/Tax (금융/세무)

| Service (서비스) | Purpose (용도) | Auth (인증) | Region (지역) |
|--------|------|------|------|
| Popbill | E-tax invoice issuance/inquiry (전자세금계산서 발행/조회) | Link ID + Secret Key (링크ID + 비밀키) | Korea (한국) |
| Vietnam E-Tax Invoice (베트남 전자세금계산서) | E-tax invoice issuance/inquiry (전자세금계산서 발행/조회) | Certificate (인증서) | Vietnam (베트남) |

### 13.5 Communication (커뮤니케이션)

| Service (서비스) | Purpose (용도) | Auth (인증) |
|--------|------|------|
| Slack | Webhook notifications (deploy, error, events) (웹훅 알림 (배포, 에러, 이벤트)) | Webhook URL |
| SMTP (nodemailer) | Email sending (invitation, notifications) (이메일 발송 (초대, 알림)) | ID/PW (AES-256-GCM) |

### 13.6 Payment (결제)

| Service (서비스) | Purpose (용도) | Auth (인증) | Region (지역) |
|--------|------|------|------|
| NICEPAY | Online payment (온라인 결제) | MerchantID + SecretKey (encrypted / 암호화) | Vietnam (베트남) |

---

## 14. Payment System (결제 시스템) (v2.0 New / v2.0 신규)

### 14.1 Payment Architecture (결제 아키텍처)

```
User (사용자) → Frontend (프론트엔드) → API (Create payment request / 결제 요청 생성)
                      → PG payment page (redirect/popup) (PG 결제 페이지 (리다이렉트/팝업))
PG → API (Webhook callback / 웹훅 콜백) → Payment completion processing (결제 완료 처리) → Frontend refresh (프론트엔드 갱신)
```

### 14.2 PG Configuration Pattern (PG 설정 패턴)

| Item (항목) | Description (설명) |
|------|------|
| Config storage (설정 저장) | `amb_pg_configs` (per entity / 법인별) |
| Key encryption (키 암호화) | AES-256-GCM (6 types: merchant_id, encrypt_key, secret_key, etc.) (6종) |
| Multi-PG (다중 PG) | Different PG configs per entity possible (법인별 다른 PG 설정 가능) |
| Transaction log (거래 로그) | `amb_pg_transactions` (full transaction history / 전체 거래 이력) |

---

## 15. Non-Functional Requirements (비기능 요구사항)

### 15.1 Security (보안)

| Item (항목) | Standard (기준) |
|------|------|
| Transport encryption (전송 구간 암호화) | HTTPS/TLS 1.3 required (필수) |
| Password storage (비밀번호 저장) | bcrypt (salt rounds: 12+) |
| Sensitive data encryption (민감 데이터 암호화) | AES-256-GCM (API Key, PG Key, SMTP PW) |
| Auth tokens (인증 토큰) | Access 15 min (15분) / Refresh 7 days (7일) |
| Secret management (시크릿 관리) | Use environment variables, no repo commits (환경변수 사용, 저장소 커밋 금지) |
| Access control (접근 제어) | 4-level RBAC + multi-tenancy isolation (4-레벨 RBAC + 멀티테넌시 격리) |
| SQL Injection prevention (SQL Injection 방지) | ORM parameter binding required (ORM 파라미터 바인딩 필수) |
| XSS prevention (XSS 방지) | User input escape, CSP header (사용자 입력 이스케이프, CSP 헤더) |
| CSRF prevention (CSRF 방지) | SameSite Cookie + CSRF token (for SSR) (SameSite Cookie + CSRF 토큰 (SSR 사용 시)) |
| Security headers (보안 헤더) | helmet middleware applied (helmet 미들웨어 적용) |
| Dependency vulnerabilities (의존성 취약점) | Periodic npm audit checks (npm audit 주기적 점검) |

### 15.2 Performance (성능)

| Item (항목) | Target (목표) |
|------|------|
| API response time (API 응답 시간) | P95 under 500ms (P95 500ms 이하) |
| Initial page load (초기 페이지 로딩) | LCP under 2.5s (LCP 2.5초 이하) |
| AI streaming (AI 스트리밍) | First Token Time under 2s (First Token Time 2초 이하) |
| Error rate (에러율) | Maintain under 1% (1% 이하 유지) |

### 15.3 Observability (관측성)

- Use structured logs (JSON), request ID propagation (구조화 로그(JSON) 사용, 요청 ID 전파)
- Metrics: request count, P50/P95 latency, error rate (메트릭: 요청수, P50/P95 지연시간, 오류율)
- AI usage: per-entity daily/monthly token consumption tracking (AI 사용량: 법인별 일간/월간 토큰 소비 추적)

### 15.4 Backup/Recovery (백업/복구)

| Item (항목) | Standard (기준) |
|------|------|
| DB backup frequency (DB 백업 주기) | Auto backup at least once daily (일 1회 이상 자동 백업) |
| Backup retention (백업 보관) | At least 30 days (최근 30일 이상) |
| Recovery target (복구 목표) | RPO 24h, RTO under 4h (recommended) (RPO 24시간, RTO 4시간 이내(권장)) |

### 15.5 Privacy Protection (개인정보보호) (v2.0 Extended / v2.0 확장)

| Item (항목) | Standard (기준) |
|------|------|
| Applicable regulations (적용 법규) | PIPA (Korea), GDPR (EU), **CCPA/CPRA (US-California)**, PDPD (Vietnam) (개인정보보호법(PIPA), GDPR(EU), CCPA/CPRA(미국-캘리포니아), PDPD(베트남)) |
| Consumer rights — CCPA/CPRA (소비자 권리) | Know/access, delete, correct, **opt-out of sale/sharing**, limit sensitive PI, non-discrimination (열람/삭제/정정, 판매·공유 거부, 민감정보 제한, 비차별) |
| Cross-border transfer (국외 이전) | Lawful basis (e.g., SCC), processor/sub-processor agreements (적법 이전 근거·수탁자 계약) |
| Collection principle (수집 원칙) | Minimum collection, no use beyond purpose (최소 수집, 목적 외 이용 금지) |
| Sensitive data storage (민감 정보 저장) | PII stored encrypted (AES-256-GCM) (PII는 암호화 저장) |
| Data masking (데이터 마스킹) | PII masking in logs/admin screens (로그/관리자 화면에서 PII 마스킹) |
| Data subject rights (정보주체 권리) | APIs for access/correction/deletion/processing suspension (열람/정정/삭제/처리정지 API 제공) |
| Data retention/disposal (데이터 보존/파기) | Specify retention period, destroy/de-identify after expiry (보존 기한 명시, 기한 경과 시 파기/비식별화) |

> **v2.0 Addition (v2.0 추가):** Added Vietnam PDPD (Personal Data Protection Decree) compliance items. (베트남 개인정보보호법(PDPD - Personal Data Protection Decree) 준수 항목 추가.)

---

## 16. Reference Documents (참고 문서)

### 16.1 Amoeba Company Standard Documents (Amoeba Company 표준 문서)

| Document Name (문서명) | File Name (파일명) | Description (설명) |
|--------|--------|------|
| Code Convention (코드 컨벤션) | `amoeba_code_convention_v2.md` | DB/BE/FE naming, multi-tenancy, encryption rules (DB/BE/FE 네이밍, 멀티테넌시, 암호화 규칙) |
| Web Style Guide (웹 스타일 가이드) | `amoeba_web_style_guide_v2.md` | Layout, icons, colors, chat UI, AI UI (레이아웃, 아이콘, 컬러, 채팅 UI, AI UI) |
| Development Skill Guide (개발 스킬 가이드) | `amoeba_basic_skill_v2.md` | Comprehensive development guide (개발 종합 가이드) |
| Structure Guide (구조 가이드) | `amoeba_basic_Structure_v2.md` | Project structure standard (프로젝트 구조 표준) |
| Project Specification (프로젝트 명세) | `amoeba_basic_SPEC_v2.md` | Project specification template (This document) (프로젝트 명세 템플릿 (본 문서)) |

### 16.2 Project Deliverables (프로젝트 산출물)

| Document Name (문서명) | File Name (파일명) | Description (설명) |
|--------|--------|------|
| ERD | `AMA-ERD.md` | Database ERD (데이터베이스 ERD) |
| Requirements Analysis (요구사항분석서) | `docs/analysis/REQ-{Title / 제목}.md` | Feature requirements analysis (기능 요구사항 분석) |
| Work Plan (작업 계획서) | `docs/plan/PLAN-{Title / 제목}.md` | Implementation plan (구현 계획) |
| Test Cases (테스트 케이스) | `docs/test/TC-{Title / 제목}.md` | Test scenarios (테스트 시나리오) |
| Work Completion Report (작업 완료 보고) | `docs/implementation/RPT-{Title / 제목}.md` | Implementation report (구현 보고) |

---

## Document History (문서 이력)

| Version (버전) | Date (일자) | Author (작성자) | Changes (변경 내용) |
|------|------|--------|-----------|
| v1.0 | 2026-02-12 | Amoeba Company | Initial creation - Project specification standard template (최초 작성 - 프로젝트 명세 표준 템플릿) |
| v1.2 | 2026-02-13 | Amoeba Company | Added non-functional requirements chapter (Security/Performance/Observability/Backup-Recovery) (비기능 요구사항(보안/성능/관측성/백업복구) 장 추가) |
| v1.3 | 2026-02-13 | Amoeba Company | Added input validation/web security, privacy protection (GDPR/PIPA) sections (입력 검증/웹 보안, 개인정보보호(GDPR/PIPA) 섹션 추가) |
| **v2.0** | **2026-03-23** | **Amoeba Company** | **AMB project best practices: Multi-tenancy (Entity/Cell/Unit + OwnEntityGuard + Visibility model), 4-level auth (ADMIN/USER/CLIENT/PARTNER + Decorator stack), AI integration (ClaudeService single gateway + Quota management + 13+ domain applications), Payment system (NICEPAY + AES-256-GCM key encryption), 12 external integrations (Google Drive/Sheets, Popbill, Slack, Redmine, Asana, SMTP, NICEPAY), Portal architecture (portal-api/web), Docker-based deployment (deploy-*.sh scripts required), Manual schema migration, i18n 3 languages (ko/en/vi), SSE real-time communication, Vietnam PDPD compliance (AMB 프로젝트 베스트 프랙티스: 멀티테넌시(Entity/Cell/Unit + OwnEntityGuard + 가시성 모델), 4-레벨 인증(ADMIN/USER/CLIENT/PARTNER + 데코레이터 스택), AI 통합(ClaudeService 싱글 게이트웨이 + 쿼터 관리 + 13+ 도메인 적용), 결제 시스템(NICEPAY + AES-256-GCM 키 암호화), 외부 연동 12종(Google Drive/Sheets, Popbill, Slack, Redmine, Asana, SMTP, NICEPAY), 포털 아키텍처(portal-api/web), Docker 기반 배포(deploy-*.sh 스크립트 필수), 스키마 수동 마이그레이션, i18n 3개국어(ko/en/vi), SSE 실시간 통신, 베트남 PDPD 준수)** |

---

**- End (끝) -**