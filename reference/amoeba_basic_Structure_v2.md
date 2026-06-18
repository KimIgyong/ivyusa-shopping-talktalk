# Amoeba Basic Structure v2

## Amoeba Company Standard Project Structure Guide (Amoeba Company 표준 프로젝트 구조 가이드)

**Document Version (문서버전):** v2.0
**Date (작성일):** 2026-03-23
**Author (작성):** Amoeba Company
**Scope (적용 범위):** All Amoeba Company web projects (Amoeba Company 전체 웹 프로젝트)
**Reference Project (기준 프로젝트):** AMB Management (44+ domain modules, 188 tables / 44+ 도메인 모듈, 188 테이블)

---

## Table of Contents (목차)

1. [Monorepo Structure (모노레포 구조)](#1-monorepo-structure-모노레포-구조)
2. [Backend Module Structure (Backend 모듈 구조)](#2-backend-module-structure-backend-모듈-구조)
3. [Frontend Module Structure (Frontend 모듈 구조)](#3-frontend-module-structure-frontend-모듈-구조)
4. [Shared Package Structure (공유 패키지 구조)](#4-shared-package-structure-공유-패키지-구조)
5. [Infrastructure Structure (인프라 구조)](#5-infrastructure-structure-인프라-구조)
6. [Configuration Files (설정 파일)](#6-configuration-files-설정-파일)
7. [Script Structure (스크립트 구조)](#7-script-structure-스크립트-구조)
8. [Documentation Structure (문서 구조)](#8-documentation-structure-문서-구조)

---

## 1. Monorepo Structure (모노레포 구조)

### 1.1 Overview (개요)

Amoeba Company projects use a **Turborepo-based monorepo** structure as the standard.
(Amoeba Company 프로젝트는 **Turborepo 기반 모노레포** 구조를 표준으로 사용합니다.)

### 1.2 Top-Level Directory (최상위 디렉토리)

```
{project}/
│
├── apps/                            # Applications (애플리케이션) - deployment units (배포 단위)
│   ├── api/                         # NestJS Backend API Server (NestJS 백엔드 API 서버) - main (메인)
│   ├── web/                         # Frontend Web App (프론트엔드 웹앱) - React or Vue.js (React 또는 Vue.js)
│   ├── portal-api/                  # Portal API (포털 API) - for B2B clients/partners (B2B 고객/파트너용), optional (선택)
│   ├── portal-web/                  # Portal Frontend (포털 프론트엔드), optional (선택)
│   ├── mobile/                      # React Native Mobile App (React Native 모바일 앱), optional (선택)
│   └── admin/                       # Admin Portal (관리자 포털) - can be integrated into web (web에 통합 가능), optional (선택)
│
├── packages/                        # Shared Packages (공유 패키지)
│   ├── common/                      # Common Utilities (공통 유틸리티) - tsup bundle (tsup 번들)
│   └── types/                       # Shared TypeScript Types (공유 TypeScript 타입)
│
├── docker/                          # Docker Configuration (Docker 설정) - separated by environment (환경별 분리)
│   ├── docker-compose.dev.yml       # Development environment containers (개발 환경 컨테이너)
│   ├── dev/                         # Development environment deploy script (개발 환경 배포 스크립트)
│   │   └── deploy-dev.sh
│   ├── staging/                     # Staging environment (스테이징 환경)
│   │   ├── deploy-staging.sh
│   │   ├── docker-compose.staging.yml
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.web
│   │   └── .env.staging             # Not in git, managed directly on server (git 미포함, 서버에 직접 관리)
│   └── production/                  # Production environment (프로덕션 환경)
│       ├── deploy-production.sh
│       ├── docker-compose.production.yml
│       ├── Dockerfile.api
│       ├── Dockerfile.web
│       └── .env.production          # Not in git, managed directly on server (git 미포함, 서버에 직접 관리)
│
├── docs/                            # Project Documentation (프로젝트 문서)
│   ├── analysis/                    # Requirements Analysis (요구사항 분석서)
│   ├── plan/                        # Work Plans (작업 계획서)
│   ├── implementation/              # Implementation Reports (작업 완료 보고)
│   ├── test/                        # Test Cases (테스트 케이스)
│   ├── report/                      # Reports such as ERD (보고서 - ERD 등)
│   ├── guide/                       # User Guides (사용자 가이드)
│   ├── log/                         # Session Conversation Logs (세션 대화 로그) - excluded from git (git 제외)
│   └── design/                      # Design Documents (디자인 문서)
│
├── env/                             # Environment Variable Files (환경 변수 파일)
│   ├── backend/
│   │   └── .env.development
│   └── frontend/
│       └── .env.development
│
├── reference/                       # Amoeba Standard Reference Documents (Amoeba 표준 참조 문서)
│   ├── amoeba_basic_skill.md
│   ├── amoeba_basic_Structure.md
│   ├── amoeba_code_convention.md
│   ├── amoeba_web_style_guide.md
│   └── amoeba_basic_SPEC.md
│
├── scripts/                         # Development Helper Scripts (개발 헬퍼 스크립트)
├── sql/                             # DB Migration SQL (DB 마이그레이션 SQL)
├── secrets/                         # Secrets (시크릿) - excluded from git (git 제외)
│
├── package.json                     # Root Package Configuration (루트 패키지 설정)
├── turbo.json                       # Turborepo Pipeline Configuration (Turborepo 파이프라인 설정)
├── tsconfig.json                    # Root TypeScript Configuration (루트 TypeScript 설정)
├── .gitignore                       # Git Ignore File (Git 제외 파일)
├── CLAUDE.md                        # Claude Code AI Instructions (Claude Code AI 지침)
├── SPEC.md                          # Project Specification (프로젝트 명세서)
├── CHANGELOG.md                     # Change Log (변경 이력)
└── README.md                        # Project README (프로젝트 README)
```

### 1.3 apps/ Directory Rules (apps/ 디렉토리 규칙) (v2.0 Extended / v2.0 확장)

| Directory (디렉토리) | Description (설명) | Required (필수 여부) |
|----------|------|----------|
| `apps/api/` | NestJS Backend API Server - main (NestJS 백엔드 API 서버 - 메인) | Required (필수) |
| `apps/web/` | Frontend Web App - React or Vue.js (프론트엔드 웹앱 - React 또는 Vue.js) | Required (필수) |
| `apps/portal-api/` | B2B Client/Partner Portal API (B2B 고객/파트너 포털 API) | Optional (선택) |
| `apps/portal-web/` | Portal Frontend (포털 프론트엔드) | Optional (선택) |
| `apps/mobile/` | React Native Mobile App (React Native 모바일 앱) | Optional (선택) |
| `apps/admin/` | Admin Portal - can be integrated into web (관리자 포털 - web에 통합 가능) | Optional (선택) |

### 1.4 packages/ Directory Rules (packages/ 디렉토리 규칙)

| Package (패키지) | Description (설명) | Build Tool (빌드 도구) |
|--------|------|----------|
| `packages/common/` | Common Utilities, Helper Functions (공통 유틸리티, 헬퍼 함수) | tsup |
| `packages/types/` | Shared TypeScript Types/Interfaces (공유 TypeScript 타입/인터페이스) | tsc |

---

## 2. Backend Module Structure (Backend 모듈 구조)

### 2.1 Overall Structure (전체 구조)

```
apps/api/
├── src/
│   ├── domain/                      # Domain Modules (도메인별 모듈) (44+)
│   ├── database/                    # Database (데이터베이스)
│   ├── global/                      # Global Modules (전역 모듈)
│   ├── infrastructure/              # Infrastructure Layer (인프라 계층)
│   ├── app.module.ts                # Root Module (루트 모듈)
│   └── main.ts                      # Entry Point (진입점)
│
├── test/                            # Tests (테스트)
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── nest-cli.json
├── tsconfig.json
├── tsconfig.build.json
└── package.json
```

### 2.2 Domain Module Structure (도메인 모듈 구조)

Each domain module follows the structure below.
(각 도메인 모듈은 다음 구조를 따릅니다.)

```
src/domain/{domain-name}/
├── controller/                      # Presentation Layer (프레젠테이션 계층)
│   ├── {domain}.controller.ts       # Main Controller (메인 컨트롤러)
│   └── {sub-domain}.controller.ts   # Sub-domain Controller (하위 도메인 컨트롤러) - if needed (필요시)
│
├── service/                         # Application Layer (애플리케이션 계층)
│   ├── {domain}.service.ts          # Main Service (메인 서비스)
│   └── {sub-domain}.service.ts      # Sub-domain Service (하위 도메인 서비스) - if needed (필요시)
│
├── entity/                          # Domain Layer (도메인 계층)
│   ├── {domain}.entity.ts           # Main Entity (메인 엔티티)
│   └── {related}.entity.ts          # Related Entity (관련 엔티티)
│
├── repository/                      # Infrastructure Layer (인프라 계층)
│   ├── {domain}.repository.ts       # Custom Repository (커스텀 레포지토리)
│   └── {related}.repository.ts      # Related Repository (관련 레포지토리)
│
├── dto/                             # Data Transfer Objects (데이터 전송 객체)
│   ├── request/                     # Request DTO (요청 DTO) - snake_case
│   │   ├── create-{domain}.request.ts
│   │   ├── update-{domain}.request.ts
│   │   └── search-{domain}.request.ts
│   └── response/                    # Response DTO (응답 DTO) - camelCase
│       └── {domain}.response.ts
│
├── guard/                           # Auth Guards (인증/인가 가드) - optional (선택)
│   └── {domain}.guard.ts
│
├── strategy/                        # Auth Strategy (인증 전략) - optional, auth domain (선택 - auth 도메인)
│   └── jwt.strategy.ts
│
├── decorator/                       # Custom Decorators (커스텀 데코레이터) - optional (선택)
│   └── {decorator}.decorator.ts
│
├── constant/                        # Constant Definitions (상수 정의) - optional (선택)
│   └── {domain}.constant.ts
│
├── mapper/                          # Object Mapping (객체 변환) - optional → recommended (선택 → 권장)
│   └── {domain}.mapper.ts
│
├── types/                           # Type Definitions (타입 정의) - optional (선택)
│   └── {domain}.types.ts
│
└── {domain}.module.ts               # NestJS Module Definition (NestJS 모듈 정의)
```

### 2.3 Domain Module Classification (도메인 모듈 분류) (v2.0 New / v2.0 신규 - AMB reference, 44+ modules / AMB 기준 44+ 모듈)

| Category (카테고리) | Domain Modules (도메인 모듈) |
|---------|------------|
| **Core** | auth, users, entity-management |
| **Organization (조직)** | cells, units, user-roles |
| **HR** | hr, hr-payroll, hr-leave, hr-attendance, hr-ot, hr-freelancer, hr-yearend |
| **Projects (프로젝트)** | projects, issues, epics, components, work-items |
| **Billing (빌링)** | billing-contracts, billing-invoices, billing-partners, billing-payments |
| **Accounting (회계)** | accounting, expense-requests, expense-forecast, bank-accounts |
| **Communication (커뮤니케이션)** | talk (Amoeba Talk), notifications, notices, mail, calendar, meeting-notes |
| **AI** | chat (conversations), ai-usage, ai-quota, agent-configs, analysis |
| **KMS** | kms-tags, kms-doc-generation, kms-base-data, kms-ddd |
| **Service Management (서비스 관리)** | svc-clients, svc-subscriptions, svc-plans, svc-portal |
| **Assets (자산)** | assets, asset-requests |
| **Integration (연동)** | external-task-import, slack, migration, partner-apps |
| **Payment (결제)** | pg-gateway |
| **Settings (설정)** | settings, menu, smtp, api-keys, drive, cms, site-analytics |
| **Todos/Today (할 일/투데이)** | todos, today, daily-missions, work-reports |
| **Translation (번역)** | content-translation |

### 2.4 Required vs Optional Files (필수 파일 vs 선택 파일)

| File (파일) | Required (필수 여부) | Description (설명) |
|------|----------|------|
| `{domain}.module.ts` | **Required (필수)** | Module Definition (모듈 정의) |
| `controller/{domain}.controller.ts` | **Required (필수)** | HTTP Endpoints (HTTP 엔드포인트) |
| `service/{domain}.service.ts` | **Required (필수)** | Business Logic (비즈니스 로직) |
| `entity/{domain}.entity.ts` | **Required (필수)** | Data Model (데이터 모델) |
| `dto/request/` | **Required (필수)** | Input Validation (입력 검증) |
| `dto/response/` | **Required (필수)** | Output Format (출력 형식) |
| `mapper/` | **Recommended (권장)** | Entity→DTO Mapping (Entity→DTO 변환) - static methods (static 메서드) |
| `repository/` | Optional (선택) | When custom queries are needed (커스텀 쿼리 필요시) |
| `guard/` | Optional (선택) | Custom Auth Guard (커스텀 인증 가드) |
| `constant/` | Optional (선택) | Domain Constants (도메인 상수) |
| `types/` | Optional (선택) | Type Definitions (타입 정의) |

### 2.5 Global Modules (전역 모듈) (global/)

```
src/global/
├── config/                          # Environment Configuration (환경 설정)
│   ├── database.config.ts           # DB Connection Config (DB 연결 설정)
│   ├── typeorm.config.ts            # TypeORM Config (TypeORM 설정)
│   ├── jwt.config.ts                # JWT Config (JWT 설정)
│   └── app.config.ts                # App Base Config (앱 기본 설정)
│
├── filter/                          # Exception Filters (예외 필터)
│   ├── business-exception.filter.ts # Business Exception (비즈니스 예외)
│   └── http-exception.filter.ts     # HTTP Exception (HTTP 예외)
│
├── interceptor/                     # Interceptors (인터셉터)
│   ├── transform.interceptor.ts     # Response Transform - standard response wrapping (응답 변환 - 표준 응답 래핑)
│   └── logging.interceptor.ts       # Logging (로깅)
│
├── middleware/                      # Middleware (미들웨어)
│   └── logger.middleware.ts
│
├── pipe/                            # Pipes (파이프)
│   └── validation.pipe.ts           # Validation (유효성 검사)
│
├── decorator/                       # Global Decorators (전역 데코레이터)
│   ├── auth.decorator.ts            # @Auth() - JWT + OwnEntityGuard
│   ├── admin-only.decorator.ts      # @AdminOnly()
│   ├── master-or-admin.decorator.ts # @MasterOrAdmin()
│   ├── partner-only.decorator.ts    # @PartnerOnly()
│   ├── require-auth.decorator.ts    # @RequireAuth() (for SSE / SSE용)
│   ├── current-user.decorator.ts    # @CurrentUser()
│   ├── public.decorator.ts          # @Public()
│   └── roles.decorator.ts           # @Roles()
│
├── guard/                           # Global Guards (전역 가드)
│   ├── jwt-auth.guard.ts            # JWT Authentication (JWT 인증)
│   ├── own-entity.guard.ts          # Entity Isolation (엔티티 격리)
│   ├── level-role.guard.ts          # Level/Role Verification (레벨/역할 검증)
│   ├── roles.guard.ts               # Role-based Access Control (역할 기반 접근 제어)
│   ├── client.guard.ts              # Client Only (클라이언트 전용)
│   └── partner.guard.ts             # Partner Only (파트너 전용)
│
├── constant/                        # Global Constants (전역 상수)
│   └── error-code.constant.ts       # Error Codes (에러 코드)
│
├── util/                            # Global Utilities (전역 유틸리티)
│   ├── entity-id-resolver.ts        # resolveEntityId()
│   └── pagination.util.ts           # Pagination Utility (페이지네이션 유틸)
│
└── i18n/                            # Internationalization Translation Files (다국어 번역 파일)
    ├── ko/
    ├── en/
    └── vi/                          # v2.0 New: Vietnamese (v2.0 추가: 베트남어)
```

### 2.6 Infrastructure Layer (인프라 계층) (infrastructure/) (v2.0 Extended / v2.0 확장)

```
src/infrastructure/
├── cache/                           # Cache Service (캐시 서비스)
│   ├── cache.module.ts
│   └── cache.service.ts
│
├── queue/                           # Bull Job Queue (Bull 작업 큐)
│   ├── queue.module.ts
│   └── processors/
│       ├── email.processor.ts
│       └── notification.processor.ts
│
├── rate-limit/                      # API Rate Limiting
│   └── rate-limit.guard.ts
│
└── external/                        # External Service Integration (외부 서비스 연동)
    ├── claude/                      # AI (Anthropic Claude)
    │   ├── claude.module.ts
    │   └── claude.service.ts
    ├── google-drive/                # Google Drive/Sheets
    │   ├── google-drive.module.ts
    │   └── google-drive.service.ts
    ├── popbill/                     # Electronic Tax Invoice (전자세금계산서)
    ├── slack/                       # Slack Integration (Slack 연동)
    └── smtp/                        # Mail Sending (메일 발송)
```

---

## 3. Frontend Module Structure (Frontend 모듈 구조)

> The frontend uses either **React** or **Vue.js** depending on the project.
> (프론트엔드는 프로젝트에 따라 **React** 또는 **Vue.js**를 사용합니다.)

### 3.1 Overall Structure (전체 구조) (React Project - AMB reference / React 프로젝트 - AMB 기준)

```
apps/web/
├── src/
│   ├── domain/                      # Domain Modules (도메인별 모듈) (30+)
│   │   ├── dashboard/
│   │   ├── chat/
│   │   ├── issues/
│   │   ├── projects/
│   │   ├── hr/
│   │   ├── billing/
│   │   ├── accounting/
│   │   ├── talk/                    # Amoeba Talk
│   │   ├── calendar/
│   │   ├── notice/
│   │   ├── mail/
│   │   ├── todos/
│   │   ├── meeting-notes/
│   │   ├── kms/
│   │   ├── settings/
│   │   ├── expense/
│   │   ├── assets/
│   │   ├── content-translation/
│   │   └── ...
│   │
│   ├── components/                  # Common Components (공통 컴포넌트) (.tsx)
│   │   ├── common/                  # Loading, ErrorBoundary, Pagination, Modal, etc. (Loading, ErrorBoundary, Pagination, Modal 등)
│   │   ├── layout/                  # Header, Sidebar, Footer
│   │   └── form/                    # FormInput, FormSelect, etc. (FormInput, FormSelect 등)
│   │
│   ├── hooks/                       # Common Custom Hooks (공통 커스텀 훅)
│   ├── store/                       # Global State (전역 상태) (Zustand)
│   │   ├── auth.store.ts
│   │   ├── org.store.ts
│   │   ├── notification.store.ts
│   │   ├── timezone.store.ts
│   │   └── client-auth.store.ts     # For Client Portal (클라이언트 포털용)
│   │
│   ├── layouts/                     # Layout Components (레이아웃 컴포넌트)
│   │   ├── MainLayout.tsx           # Default (기본) (Basic-A-1)
│   │   ├── PanelLayout.tsx          # Right Panel (우측 패널) (Basic-A-2-R)
│   │   ├── SubMenuLayout.tsx        # Left Sub-menu (좌측 서브메뉴) (Basic-A-2-L)
│   │   ├── AuthLayout.tsx           # Authentication Pages (인증 페이지)
│   │   └── PublicLayout.tsx         # Public Pages (공개 페이지)
│   │
│   ├── lib/                         # Utilities (유틸리티)
│   │   ├── api-client.ts            # Axios Instance (Axios 인스턴스)
│   │   ├── sse-client.ts            # SSE Utility (SSE 유틸리티)
│   │   └── format.ts                # Formatting (포맷팅)
│   │
│   ├── global/
│   │   ├── i18n/                    # Internationalization Settings (다국어 설정)
│   │   │   ├── i18n.ts              # Initialization + Namespace Registration (초기화 + 네임스페이스 등록)
│   │   │   └── locales/
│   │   │       ├── ko/              # Korean (한국어) (40+ JSON)
│   │   │       ├── en/              # English (영어)
│   │   │       └── vi/              # Vietnamese (베트남어)
│   │   └── mock/                    # Mock Data (Mock 데이터) (MSW)
│   │
│   ├── router/                      # React Router v6
│   │   └── index.tsx                # createBrowserRouter
│   │
│   ├── assets/                      # Static Resources (정적 리소스)
│   ├── styles/                      # Global Styles (전역 스타일)
│   ├── App.tsx
│   └── main.tsx
│
├── public/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

### 3.2 Domain Module Structure (도메인 모듈 구조)

**React Project (React 프로젝트):**
```
src/domain/{domain-name}/
├── pages/                           # Page Components (페이지 컴포넌트)
│   ├── {Domain}ListPage.tsx
│   ├── {Domain}DetailPage.tsx
│   └── {Domain}CreatePage.tsx
│
├── components/                      # Domain-specific Components (도메인 전용 컴포넌트)
│   ├── {Domain}Card.tsx
│   ├── {Domain}Form.tsx
│   ├── {Domain}Table.tsx
│   └── {Domain}FormModal.tsx        # Modal Form - create/edit (모달 폼 - 생성/수정)
│
├── hooks/                           # Custom Hooks (커스텀 훅)
│   ├── use{Domain}List.ts           # React Query Fetch Hook (React Query 조회 훅)
│   ├── use{Domain}Detail.ts
│   └── use{Domain}Mutations.ts      # Create/Update/Delete Hook (생성/수정/삭제 훅)
│
├── service/                         # API Service (API 서비스)
│   └── {domain}.service.ts
│
├── store/                           # Zustand State (Zustand 상태) - optional (선택)
│   └── {domain}.store.ts
│
└── types/
    └── {domain}.types.ts
```

### 3.3 i18n Namespace Structure (i18n 네임스페이스 구조) (v2.0 Extended / v2.0 확장)

Based on actual implementation, 40+ namespaces:
(실제 구현 기준 40+ 네임스페이스:)

| Category (카테고리) | Namespaces (네임스페이스) |
|---------|------------|
| **Common (공통)** | common, auth, error, settings, profile, dashboard |
| **Work (업무)** | issues, projects, todos, work-reports, calendar |
| **HR** | hr, payroll, leave, attendance, ot-records |
| **Communication (커뮤니케이션)** | talk, notices, notifications, mail, meeting-notes |
| **Billing/Accounting (빌링/회계)** | billing, invoices, contracts, accounting, expenses |
| **KMS** | kms, tags, doc-generation, base-data, ddd |
| **Service (서비스)** | clients, subscriptions, plans, portal |
| **Others (기타)** | assets, translation, partner-apps, cms |

### 3.4 Common Components (공통 컴포넌트)

```
src/components/
├── common/
│   ├── PermissionGuard.tsx          # Permission Guard (권한 가드)
│   ├── ProtectedRoute.tsx           # Authenticated Route (인증 라우트)
│   ├── Loading.tsx                  # Loading State (로딩 상태)
│   ├── ErrorBoundary.tsx            # Error Boundary (에러 바운더리)
│   ├── Pagination.tsx               # Pagination (페이지네이션)
│   ├── Modal.tsx                    # Modal (모달)
│   ├── ConfirmDialog.tsx            # Confirm Dialog (확인 다이얼로그)
│   ├── Toast.tsx                    # Toast Notification (토스트 알림)
│   ├── EmptyState.tsx               # Empty State (빈 상태)
│   ├── FileUpload.tsx               # File Upload (파일 업로드)
│   └── RichTextEditor.tsx           # Rich Text Editor (리치 텍스트 편집기)
│
├── layout/
│   ├── Header.tsx                   # Header (헤더) (64px)
│   ├── Sidebar.tsx                  # Sidebar (사이드바) (240px/64px)
│   ├── Footer.tsx
│   └── {Level}Layout.tsx            # Level-specific Layout (레벨별 레이아웃) (Admin/User/Client/Partner)
│
└── form/
    ├── FormInput.tsx
    ├── FormSelect.tsx
    ├── FormTextarea.tsx
    └── FormDatePicker.tsx
```

---

## 4. Shared Package Structure (공유 패키지 구조)

### 4.1 packages/common

```
packages/common/
├── src/
│   ├── utils/
│   │   ├── date.ts
│   │   ├── string.ts
│   │   ├── number.ts
│   │   └── validation.ts
│   ├── constants/
│   │   └── index.ts
│   └── index.ts
│
├── tsup.config.ts
├── tsconfig.json
└── package.json
```

### 4.2 packages/types

```
packages/types/
├── src/
│   ├── api/
│   │   ├── response.types.ts
│   │   └── request.types.ts
│   ├── domain/
│   │   ├── user.types.ts
│   │   ├── entity.types.ts          # Corporation/Cell/Unit Types (법인/셀/유닛 타입)
│   │   └── {domain}.types.ts
│   ├── common/
│   │   ├── pagination.types.ts
│   │   └── enum.types.ts
│   └── index.ts
│
├── tsconfig.json
└── package.json
```

---

## 5. Infrastructure Structure (인프라 구조)

### 5.1 Docker Structure (Docker 구조) (v2.0 - Separated by environment / 환경별 분리)

```
docker/
├── docker-compose.dev.yml           # Development Environment (개발 환경) - DB, Redis, etc. (DB, Redis 등)
│
├── dev/                             # Development Deploy (개발 배포)
│   └── deploy-dev.sh
│
├── staging/                         # Staging Deploy (스테이징 배포)
│   ├── deploy-staging.sh            # Deploy Script - mandatory (배포 스크립트 - 필수 사용)
│   ├── docker-compose.staging.yml
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   ├── nginx.conf                   # Nginx Proxy Config (Nginx 프록시 설정)
│   └── .env.staging                 # Not in git (git 미포함)
│
├── production/                      # Production Deploy (프로덕션 배포)
│   ├── deploy-production.sh
│   ├── docker-compose.production.yml
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   ├── nginx.conf
│   └── .env.production              # Not in git (git 미포함)
│
├── init-sql/                        # DB Initialization SQL (DB 초기화 SQL)
│   ├── 01-init.sql
│   └── 02-seed.sql
│
└── postal/                          # Mail Server (메일 서버) - optional (선택)
```

### 5.2 SQL Migration (SQL 마이그레이션) (v2.0 New / v2.0 신규)

```
sql/
├── migration_master_role.sql        # Master Account/Role Setup (마스터 계정/역할 설정)
├── migration_menu_config.sql        # Menu System Initialization (메뉴 시스템 초기화)
├── migration_add_column.sql         # Column Addition Migration (컬럼 추가 마이그레이션)
└── migration_{feature}.sql          # Feature-specific Migration (기능별 마이그레이션)
```

> TypeORM synchronize is disabled in staging/production, so manual SQL execution is required.
> (스테이징/프로덕션은 TypeORM synchronize가 비활성화되므로 수동 SQL 실행 필수.)

---

## 6. Configuration Files (설정 파일)

### 6.1 Root Configuration Files (루트 설정 파일)

| File (파일) | Description (설명) |
|------|------|
| `package.json` | Root Package, Workspaces, Scripts (루트 패키지, 워크스페이스, 스크립트) |
| `turbo.json` | Turborepo Pipeline Configuration (Turborepo 파이프라인 설정) |
| `tsconfig.json` | Root TypeScript Configuration (루트 TypeScript 설정) |
| `.gitignore` | Git Ignore File (Git 제외 파일) |
| `CLAUDE.md` | Claude Code AI Instructions (Claude Code AI 지침) |
| `SPEC.md` | Project Specification (프로젝트 명세서) |
| `CHANGELOG.md` | Change Log (변경 이력) (v2.0 New / v2.0 추가) |
| `README.md` | Project README (프로젝트 README) |

### 6.2 Environment Variable Files (환경 변수 파일) (v2.0 Extended / v2.0 확장)

```
env/
├── backend/
│   └── .env.development             # Development Environment (개발 환경) - included in git (git 포함)
└── frontend/
    └── .env.development
```

| Environment (환경) | Env File Location (환경변수 파일 위치) | In Git (git 포함) |
|------|-------------------|---------|
| Development (개발) | `env/backend/.env.development` | Yes (O) |
| Staging (스테이징) | `docker/staging/.env.staging` | No - managed directly on server (X - 서버 직접 관리) |
| Production (프로덕션) | `docker/production/.env.production` | No - managed directly on server (X - 서버 직접 관리) |

---

## 7. Script Structure (스크립트 구조)

### 7.1 scripts/ Directory (scripts/ 디렉토리)

```
scripts/
├── dev/
│   ├── start-all.sh
│   ├── stop-all.sh
│   ├── restart-all.sh
│   └── kill-ports.sh
│
├── db/
│   ├── seed.ts
│   ├── reset.ts
│   └── backup.sh
│
└── utils/
    ├── generate-module.sh
    └── check-env.sh
```

---

## 8. Documentation Structure (문서 구조)

### 8.1 docs/ Directory (docs/ 디렉토리) (v2.0 Extended / v2.0 확장)

```
docs/
├── analysis/                        # Requirements Analysis (요구사항 분석서)
│   └── REQ-{title}-{YYYYMMDD}.md    # REQ-{제목}-{YYYYMMDD}.md
│
├── plan/                            # Work Plans (작업 계획서)
│   └── PLAN-{title}-WorkPlan-{YYYYMMDD}.md  # PLAN-{제목}-작업계획-{YYYYMMDD}.md
│
├── implementation/                  # Implementation Reports (작업 완료 보고)
│   └── RPT-{title}-Report-{YYYYMMDD}.md     # RPT-{제목}-작업완료보고-{YYYYMMDD}.md
│
├── test/                            # Test Cases (테스트 케이스)
│   └── TC-{title}-Test-{YYYYMMDD}.md        # TC-{제목}-Test-{YYYYMMDD}.md
│
├── report/                          # Reports (보고서)
│   └── AMA-ERD.md                   # DB ERD Document (DB ERD 문서)
│
├── guide/                           # User Guides (사용자 가이드)
│
├── design/                          # Design Documents (디자인 문서)
│
├── log/                             # Session Conversation Logs (세션 대화 로그) - excluded from git (git 제외)
│   └── YYYY-MM-DD/
│       ├── HH_seq_summary.md        # HH_순번_작업요약.md
│       └── DAILY-REPORT.md          # Daily Report (일일 리포트)
│
├── company/                         # Company Documents (회사 관련 문서)
│
└── infrastructure/                  # Infrastructure Documents (인프라 문서)
```

### 8.2 Requirements Work Workflow (요구사항 작업 워크플로우) (v2.0 New / v2.0 신규)

Items with a `[Requirements]` (`[요구사항]`) title must follow this order:
(`[요구사항]` 타이틀 건은 다음 순서로 진행:)

1. **Requirements Analysis (요구사항 분석서)** → `docs/analysis/REQ-{title}-{YYYYMMDD}.md`
2. **Work Plan (작업 계획서)** → `docs/plan/PLAN-{title}-WorkPlan-{YYYYMMDD}.md`
3. **Implementation (구현)** → Code Implementation (코드 구현)
4. **Test Cases (테스트 케이스)** → `docs/test/TC-{title}-Test-{YYYYMMDD}.md`
5. **Implementation Report (작업 완료 보고)** → `docs/implementation/RPT-{title}-Report-{YYYYMMDD}.md`

---

## Appendix: Structure Checklist (부록: 구조 체크리스트)

### A. Project Initialization Checklist (프로젝트 초기화 체크리스트)

- [ ] Monorepo structure (모노레포 구조) (turbo.json, package.json workspaces)
- [ ] Create apps/api (apps/api 생성) (NestJS)
- [ ] Create apps/web (apps/web 생성) (React or Vue.js + Vite / React 또는 Vue.js + Vite)
- [ ] Create apps/portal-api (apps/portal-api 생성) - optional (선택)
- [ ] Create packages/common (packages/common 생성) (tsup)
- [ ] Create packages/types (packages/types 생성)
- [ ] docker/ separated by environment (docker/ 환경별 분리) (dev/staging/production)
- [ ] env/ environment variable configuration (env/ 환경 변수 구성)
- [ ] ESLint + Prettier configuration (ESLint + Prettier 설정)
- [ ] tsconfig.json root configuration (tsconfig.json 루트 설정)
- [ ] Write README.md, SPEC.md, CLAUDE.md, CHANGELOG.md (README.md, SPEC.md, CLAUDE.md, CHANGELOG.md 작성)
- [ ] Place reference/ standard documents (reference/ 표준 문서 배치)
- [ ] Create sql/ migration directory (sql/ 마이그레이션 디렉토리 생성)
- [ ] Configure .gitignore (.gitignore 설정) (docs/log/, secrets/, .env.staging, .env.production, etc.)

### B. Domain Module Checklist (도메인 모듈 체크리스트)

**Backend (백엔드):**
- [ ] Create `{domain}.module.ts` (`{domain}.module.ts` 생성)
- [ ] Create `controller/{domain}.controller.ts` + apply @Auth() (`controller/{domain}.controller.ts` 생성 + @Auth() 적용)
- [ ] Create `service/{domain}.service.ts` + apply entity isolation (ent_id) (`service/{domain}.service.ts` 생성 + entity 격리(ent_id) 적용)
- [ ] Create `entity/{domain}.entity.ts` + explicit type for nullable columns (`entity/{domain}.entity.ts` 생성 + nullable 컬럼 명시적 타입 지정)
- [ ] Create `dto/request/` DTOs (snake_case) (`dto/request/` DTO 생성 - snake_case)
- [ ] Create `dto/response/` DTOs (camelCase) (`dto/response/` DTO 생성 - camelCase)
- [ ] Create `mapper/{domain}.mapper.ts` (static methods) (`mapper/{domain}.mapper.ts` 생성 - static 메서드)
- [ ] Manual SQL migration for staging/production (수동 SQL 마이그레이션 - 스테이징/프로덕션 대비)

**Frontend (프론트엔드) (React):**
- [ ] Create `pages/{Domain}ListPage.tsx` (`pages/{Domain}ListPage.tsx` 생성)
- [ ] Create `components/` domain components (`components/` 도메인 컴포넌트 생성)
- [ ] Create `hooks/use{Domain}List.ts` hook (React Query + entityId in queryKey) (`hooks/use{Domain}List.ts` 훅 생성 - React Query + entityId 포함 queryKey)
- [ ] Create `service/{domain}.service.ts` service (`service/{domain}.service.ts` 서비스 생성)
- [ ] Create `types/{domain}.types.ts` types (`types/{domain}.types.ts` 타입 생성)
- [ ] Register pages in React Router (React Router에 페이지 등록)
- [ ] Add i18n translation files (3 languages: ko/en/vi) (i18n 번역 파일 추가 - ko/en/vi 3개 언어)
- [ ] Register namespace in i18n.ts (i18n.ts에 네임스페이스 등록)

---

## Document History (문서 이력)

| Version (버전) | Date (일자) | Author (작성자) | Changes (변경 내용) |
|------|------|--------|-----------|
| v1.0 | 2026-02-12 | Amoeba Company | Initial creation (최초 작성) |
| v1.1 | 2026-02-12 | Amoeba Company | React + Vue.js dual framework support reflected (React + Vue.js 듀얼 프레임워크 지원 반영) |
| **v2.0** | **2026-03-23** | **Amoeba Company** | **AMB project structure reflected: apps expansion (portal-api, portal-web, mobile), Docker environment separation (dev/staging/production), deploy script mandatory, 44+ backend domain module list, global guard/decorator system (@Auth etc. 6 types), infrastructure external services (claude/google-drive/popbill/slack/smtp), i18n 3 languages (ko/en/vi) 40+ namespaces, SQL migration directory, requirements work workflow, docs structure expansion (AMB 프로젝트 구조 반영: apps 확장(portal-api, portal-web, mobile), Docker 환경별 분리(dev/staging/production), 배포 스크립트 필수화, 44+ 백엔드 도메인 모듈 목록, 전역 가드/데코레이터 체계(@Auth 등 6종), 인프라 외부 서비스(claude/google-drive/popbill/slack/smtp), i18n 3개국어(ko/en/vi) 40+ 네임스페이스, SQL 마이그레이션 디렉토리, 요구사항 작업 워크플로우, docs 문서 체계 확장)** |