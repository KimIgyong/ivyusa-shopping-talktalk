# Amoeba Basic Code Convention v2

## Amoeba Company Standard Code Convention (Amoeba Company 표준 코드 컨벤션)

**Document Version (문서버전):** v2.0
**Date (작성일):** 2026-03-23
**Author (작성):** Amoeba Company
**Scope (적용 범위):** All Amoeba Company projects (Amoeba Company 전체 프로젝트)
**Reference Project (기준 프로젝트):** AMB Management (Best Practices based / 베스트 프랙티스 기반)

---

## Table of Contents (목차)

1. [Overview (개요)](#1-overview-개요)
2. [Core Principles (핵심 원칙)](#2-core-principles-핵심-원칙)
3. [Architecture Standards (아키텍처 표준)](#3-architecture-standards-아키텍처-표준)
4. [Database Naming Rules (데이터베이스 네이밍 규칙)](#4-database-naming-rules-데이터베이스-네이밍-규칙)
5. [Backend Rules (NestJS) (백엔드 규칙)](#5-backend-rules-nestjs-백엔드-규칙-nestjs)
6. [Frontend Common Rules (프론트엔드 공통 규칙)](#6-frontend-common-rules-프론트엔드-공통-규칙)
7. [Frontend Framework-Specific Guide (프론트엔드 프레임워크별 가이드)](#7-frontend-framework-specific-guide-프론트엔드-프레임워크별-가이드)
8. [API Design and Common Responses (API 설계 및 공통 응답)](#8-api-design-and-common-responses-api-설계-및-공통-응답)
9. [Validation and Error Handling (유효성 검증 및 에러 처리)](#9-validation-and-error-handling-유효성-검증-및-에러-처리)
10. [Naming Summary (네이밍 요약)](#10-naming-summary-네이밍-요약)
11. [ENUM and Constants Rules (ENUM 및 상수 규칙)](#11-enum-and-constants-rules-enum-및-상수-규칙)
12. [Multi-Tenancy Rules (멀티테넌시 규칙)](#12-multi-tenancy-rules-멀티테넌시-규칙)
13. [Encryption Rules (암호화 규칙)](#13-encryption-rules-암호화-규칙)
14. [i18n Rules (i18n 규칙)](#14-i18n-rules-i18n-규칙)
15. [Git Convention (Git 컨벤션)](#15-git-convention-git-컨벤션)
16. [Checklist (체크리스트)](#16-checklist-체크리스트)

---

## 1. Overview (개요)

### 1.1 Purpose (목적)

This document defines the standard code convention applied across all **Amoeba Company** projects.
본 문서는 **Amoeba Company**의 모든 프로젝트에 공통으로 적용되는 코드 컨벤션 표준을 정의합니다.

### 1.2 Standard Tech Stack (표준 기술 스택)

| Area (영역) | Tech Stack (기술 스택) |
|------|----------|
| **Frontend (프론트엔드)** | React 18.x or Vue.js 3.x + TypeScript 5.x + TailwindCSS |
| **Backend (백엔드)** | NestJS 10.x + TypeScript 5.x |
| **Database (데이터베이스)** | PostgreSQL 15.x |
| **Cache/Session (캐시/세션)** | Redis 7.x |
| **Build (빌드)** | Vite 5.x (FE) / Turbo (Monorepo) |
| **Architecture (아키텍처)** | Clean Architecture + DDD |
| **State Management (상태 관리)** | React: Zustand + React Query / Vue: Pinia + Vue Query |
| **AI** | Anthropic Claude API (@anthropic-ai/sdk) |
| **Real-time (실시간)** | SSE (Server-Sent Events) |

### 1.3 Per-Project Customization (프로젝트별 커스터마이징)

| Item (항목) | Example (예시) |
|------|------|
| **Project Code (프로젝트 코드)** | AMB, WIP, CRM, etc. (AMB, WIP, CRM 등) |
| **DB Name (DB 이름)** | `db_{project}` |
| **Table Prefix (테이블 Prefix)** | `amb_`, `wpl_` |
| **API Base Path** | `/api/v1` |
| **Domain Module List (도메인 모듈 목록)** | Varies per project (프로젝트별 상이) |
| **Error Code Range (에러 코드 범위)** | Assigned per project (프로젝트별 할당) |

### 1.4 Rule Level Definitions (규칙 수준 정의)

| Level (수준) | Meaning (의미) |
|------|------|
| **MUST** | Mandatory compliance (필수 준수) |
| **SHOULD** | Recommended (권장 사항) |
| **RECOMMENDED** | Flexible depending on context (상황에 따라 유연 적용) |

---

## 2. Core Principles (핵심 원칙)

### 2.1 Consistency (일관성)

All layers (Frontend/Backend/Database) maintain consistent naming, folder structure, and patterns.
모든 레이어(Frontend/Backend/Database)에서 네이밍, 폴더 구조, 패턴을 통일합니다.

### 2.2 Domain Isolation (도메인 격리)

- Cross-domain communication must go through Interface or API (도메인 간 통신은 Interface 또는 API 경유)
- Direct sharing of Entity/Repository/Service is prohibited (Entity/Repository/Service 직접 공유 금지)
- Use `forwardRef(() => ModuleName)` when circular dependency occurs (MUST) (순환 의존성 발생 시 `forwardRef(() => ModuleName)` 사용 (MUST))

### 2.3 Multi-Tenant Data Isolation (멀티테넌트 데이터 격리) (v2.0 New / v2.0 신규)

- Nearly all data tables have `ent_id` (Entity/Corporation ID) FK (거의 모든 데이터 테이블에 `ent_id` (Entity/법인 ID) FK 보유)
- `OwnEntityGuard` automatically ensures data isolation between corporations (`OwnEntityGuard`로 법인 간 데이터 격리 자동 보장)
- Cell-based visibility: `ENTITY | CELL | PRIVATE` (셀(Cell) 기반 가시성: `ENTITY | CELL | PRIVATE`)

### 2.4 Type Safety (타입 안정성)

- Strict restriction on `any` usage (`any` 사용 엄격히 제한)
- Strict mode must be enabled (strict 모드 필수 활성화)
- Explicit type annotation required for nullable columns in TypeORM Entity (MUST) (TypeORM Entity의 nullable 컬럼에 **명시적 타입 지정** (MUST))

### 2.5 Explicitness (명시적 코드)

- No magic values or implicit behavior (매직 값, 암묵적 동작 금지)
- Constants must be defined in `constant` files (상수는 반드시 `constant` 파일에 정의)

### 2.6 Privacy by Design (개인정보보호 내재화) (v2.0 New / v2.0 신규)

- **PII MUST** be encrypted at rest with **AES-256-GCM** (3-field `_encrypted/_iv/_tag`); passwords **bcrypt** hashed (never plaintext). (PII 암호화·비밀번호 해시 필수)
- **PII masking** in logs and admin screens; PII access **audit-logged**. (로그/관리자 마스킹·접근 감사)
- Provide **data-subject/consumer rights** endpoints — access/delete/correct/portability/processing-stop, and **CCPA opt-out of sale/sharing**. (정보주체·소비자 권리 API + CCPA opt-out)
- Honor **consent/opt-out** before processing; enforce **retention/disposal**. (동의/옵트아웃·보존/파기)
- Compliance per **`amoeba_privacy_compliance_v2.md`** (PIPA/GDPR/**CCPA·CPRA**/PDPD); Shopify apps implement GDPR mandatory webhooks. (개인정보 표준 준수)

---

## 3. Architecture Standards (아키텍처 표준)

### 3.1 Monorepo Base Structure (Monorepo 기본 구조)

```
{project}/
├── apps/
│   ├── api/             # NestJS Backend (NestJS 백엔드)
│   ├── web/             # Frontend - React or Vue.js (프론트엔드 - React 또는 Vue.js)
│   ├── portal-api/      # Portal API (B2B, optional) (포털 API (B2B, 선택))
│   ├── portal-web/      # Portal Frontend (optional) (포털 프론트엔드 (선택))
│   └── mobile/          # React Native (optional) (React Native (선택))
├── packages/
│   ├── common/          # Common utilities (tsup) (공통 유틸리티 (tsup))
│   └── types/           # Shared TypeScript types (공유 TypeScript 타입)
├── docker/              # Docker config (per environment) (Docker 설정 (환경별 분리))
├── docs/                # Documentation (문서)
├── env/                 # Environment variables (환경 변수)
├── sql/                 # DB migration SQL (DB 마이그레이션 SQL)
├── reference/           # Amoeba standard reference docs (Amoeba 표준 참조 문서)
├── scripts/             # Development helpers (개발 도우미)
├── package.json
├── turbo.json
└── tsconfig.json
```

### 3.2 Layer Rules (MUST NOT violate) (레이어 규칙 (MUST NOT 위반))

| Layer (레이어) | Allowed (허용) | Prohibited (금지) |
|--------|------|------|
| Controller | -> Service call (Service 호출) | -> Direct Repository call (Repository 직접 호출) |
| Service | -> Repository, Entity | -> Controller import |
| Entity | Pure domain logic (순수 도메인 로직) | -> Service, Controller import |
| Repository | -> Entity | -> Controller import |

---

## 4. Database Naming Rules (데이터베이스 네이밍 규칙)

### 4.1 Database Name (데이터베이스 이름)

```
Pattern (패턴): db_{project}
Example (예시): db_amb, db_waplus
```

### 4.2 Table Naming (테이블 네이밍)

| Rule (규칙) | Pattern (패턴) | Example (예시) |
|------|------|------|
| Base format (기본 형식) | `{prefix}_{name_plural}` | `amb_users`, `amb_bil_contracts` |
| Prefix | 3-letter project code (sub-domains add extra prefix) (프로젝트 3글자 (하위 도메인은 추가 prefix)) | `amb_`, `amb_hr_`, `amb_bil_`, `amb_talk_`, `amb_svc_`, `amb_kms_` |
| Table name (테이블명) | snake_case + plural (snake_case + 복수형) | `amb_hr_employees`, `amb_talk_messages` |

**Domain-specific table prefix mapping (도메인별 테이블 prefix 매핑):**

| Domain (도메인) | Prefix | Example (예시) |
|--------|--------|------|
| Core | `amb_` | `amb_users`, `amb_issues` |
| HR | `amb_hr_` | `amb_hr_employees`, `amb_hr_payroll_periods` |
| Billing | `amb_bil_` | `amb_bil_contracts`, `amb_bil_invoices` |
| Talk | `amb_talk_` | `amb_talk_channels`, `amb_talk_messages` |
| Service | `amb_svc_` | `amb_svc_clients`, `amb_svc_subscriptions` |
| KMS | `amb_kms_` | `amb_kms_tags`, `amb_kms_doc_generated` |
| CMS | `amb_cms_` | `amb_cms_pages`, `amb_cms_posts` |
| PG | `amb_pg_` | `amb_pg_configs`, `amb_pg_transactions` |
| Mail | `amb_mail_` | `amb_mail_accounts`, `amb_mail_messages` |
| Slack | `amb_slack_` | `amb_slack_workspace_configs` |

### 4.3 Column Naming (컬럼 네이밍)

| Type (유형) | Rule (규칙) | Example (예시) |
|------|------|------|
| **PK** | `{colPrefix}_id` (UUID) | `usr_id`, `cmp_id` |
| **FK** | Use referenced table's PK as-is (참조 테이블 PK 그대로) | `usr_id`, `ent_id` |
| **General (일반)** | `{colPrefix}_{name}` | `cmp_name`, `cmp_budget` |
| **Boolean** | `{colPrefix}_is_{name}` | `cmp_is_active`, `ntc_is_pinned` |
| **Created at (생성일시)** | `{colPrefix}_created_at` | `cmp_created_at` |
| **Updated at (수정일시)** | `{colPrefix}_updated_at` | `cmp_updated_at` |
| **Deleted at (삭제일시)** | `{colPrefix}_deleted_at` | `cmp_deleted_at` (Soft Delete) |
| **Visibility (가시성)** | `{colPrefix}_visibility` | `iss_visibility` (ENTITY/CELL/PRIVATE) |
| **Cell affiliation (셀 소속)** | `{colPrefix}_cell_id` | `iss_cell_id` (UUID, nullable) |
| **Entity affiliation (법인 소속)** | `ent_id` | Multi-tenancy required FK (멀티테넌시 필수 FK) |
| **Encryption (암호화)** | `{colPrefix}_encrypted/iv/tag` | AES-256-GCM 3-field pattern (AES-256-GCM 3-필드 패턴) |

### 4.4 Index / Constraint Naming (인덱스 / 제약조건 네이밍)

| Type (유형) | Pattern (패턴) | Example (예시) |
|------|------|------|
| Index | `idx_{table}_{column(s)}` | `idx_amb_issues_status` |
| Primary Key | `pk_{table}` | `pk_amb_issues` |
| Foreign Key | `fk_{table}_{ref_table}` | `fk_amb_issues_users` |
| Unique | `uq_{table}_{column}` | `uq_amb_users_email` |

---

## 5. Backend Rules (NestJS) (백엔드 규칙 (NestJS))

### 5.1 File Naming (파일 네이밍)

| Layer (레이어) | Naming Rule (네이밍 규칙) | Example (예시) |
|--------|-------------|------|
| Controller | `{domain}.controller.ts` | `campaign.controller.ts` |
| Service | `{domain}.service.ts` | `campaign.service.ts` |
| Repository | `{domain}.repository.ts` | `campaign.repository.ts` |
| Entity | `{domain}.entity.ts` | `campaign.entity.ts` |
| Request DTO | `{action}-{domain}.request.ts` | `create-campaign.request.ts` |
| Response DTO | `{domain}.response.ts` | `campaign.response.ts` |
| Mapper | `{domain}.mapper.ts` | `campaign.mapper.ts` |
| Module | `{domain}.module.ts` | `campaign.module.ts` |

### 5.2 Class Naming (클래스 네이밍)

| Type (유형) | Rule (규칙) | Example (예시) |
|------|------|------|
| Controller | `{Domain}Controller` | `CampaignController` |
| Service | `{Domain}Service` | `CampaignService` |
| Entity | `{Domain}Entity` | `CampaignEntity` |
| Request DTO | `{Action}{Domain}Request` | `CreateCampaignRequest` |
| Response DTO | `{Domain}Response` | `CampaignResponse` |
| Mapper | `{Domain}Mapper` | `CampaignMapper` |

### 5.3 Controller Rules (MUST) (Controller 규칙 (MUST))

- No business logic allowed (비즈니스 로직 포함 금지)
- Only responsible for DTO transformation (via Mapper) (DTO 변환만 담당 (Mapper 경유))
- Swagger decorators required (Swagger 데코레이터 필수)
- **@Auth() decorator applied by default** (authentication + entity isolation) (**@Auth() 데코레이터 기본 적용** (인증 + 엔티티 격리))

```typescript
@Controller('campaigns')
@ApiTags('캠페인')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Post()
  @Auth()  // JWT + OwnEntityGuard auto-applied (JWT + OwnEntityGuard 자동 적용)
  @ApiOperation({ summary: '캠페인 생성' })
  async create(
    @Body() request: CreateCampaignRequest,
    @CurrentUser() user: UserPayload,
  ): Promise<BaseSingleResponse<CampaignResponse>> {
    const entityId = resolveEntityId(request.entity_id, user);
    const campaign = await this.campaignService.create(entityId, request, user.userId);
    return { success: true, data: CampaignMapper.toResponse(campaign) };
  }
}
```

### 5.4 DTO Rules (DTO 규칙)

**Request DTO:** `snake_case` (API input / API 입력)

```typescript
export class CreateCampaignRequest {
  @IsString() @IsNotEmpty() @MaxLength(100)
  campaign_name: string;

  @IsOptional() @IsUUID()
  entity_id?: string;  // Multi-tenancy filter (optional) (멀티테넌시 필터 (선택))
}
```

**Response DTO:** `camelCase` (API output / API 출력)

```typescript
export class CampaignResponse {
  campaignId: string;
  campaignName: string;
  entityId: string;
  cellId?: string;
  visibility: string;
  createdAt: string;
}
```

### 5.5 Entity Rules (Entity 규칙) (v2.0 Enhanced / v2.0 강화)

```typescript
@Entity('amb_campaigns')
export class CampaignEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'cmp_id' })
  cmpId: string;

  @Column({ name: 'ent_id', type: 'uuid' })
  entId: string;  // Multi-tenancy required (멀티테넌시 필수)

  @Column({ name: 'cmp_name', length: 100 })
  cmpName: string;

  // ⚠️ Nullable columns must have explicit type (TypeORM reflect-metadata issue)
  // ⚠️ nullable 컬럼에는 반드시 type 명시 (TypeORM reflect-metadata 이슈)
  @Column({ name: 'cmp_cell_id', type: 'uuid', nullable: true })
  cmpCellId: string | null;

  @Column({ name: 'cmp_visibility', type: 'varchar', length: 20, default: 'ENTITY' })
  cmpVisibility: string;

  @CreateDateColumn({ name: 'cmp_created_at' })
  cmpCreatedAt: Date;

  @UpdateDateColumn({ name: 'cmp_updated_at' })
  cmpUpdatedAt: Date;

  @DeleteDateColumn({ name: 'cmp_deleted_at' })
  cmpDeletedAt: Date;
}
```

> **MUST:** When using `@Column()` with union type properties like `string | null` in TypeORM, you must explicitly specify the type such as `type: 'varchar'` / `type: 'uuid'`. Omission causes a runtime `DataTypeNotSupportedError`.
> **MUST:** TypeORM에서 `string | null` 등 union type 프로퍼티에 `@Column()` 사용 시 반드시 `type: 'varchar'` / `type: 'uuid'` 등 명시적 타입을 지정해야 합니다. 미지정 시 런타임 `DataTypeNotSupportedError` 발생.

### 5.6 Mapper Rules (Mapper 규칙) (v2.0 Enhanced / v2.0 강화)

Static method pattern for Entity to Response DTO conversion:
static 메서드 패턴으로 Entity → Response DTO 변환:

```typescript
export class CampaignMapper {
  static toResponse(entity: CampaignEntity): CampaignResponse {
    return {
      campaignId: entity.cmpId,
      campaignName: entity.cmpName,
      entityId: entity.entId,
      cellId: entity.cmpCellId ?? undefined,
      visibility: entity.cmpVisibility,
      createdAt: entity.cmpCreatedAt.toISOString(),
    };
  }
}
```

### 5.7 Authentication Decorator Stack (인증 데코레이터 스택) (v2.0 New / v2.0 신규)

| Decorator (데코레이터) | Combination (조합) | Usage (용도) |
|-----------|------|------|
| `@Auth()` | JWT + OwnEntityGuard | **Default (기본)** (most commonly used / 가장 많이 사용) |
| `@AdminOnly()` | Auth + LevelRoleGuard(ADMIN) | Admin only (관리자 전용) |
| `@MasterOrAdmin()` | Auth + Master/Admin (마스터/관리자) | Master or Admin (마스터 또는 관리자) |
| `@PartnerOnly()` | Partner level only (파트너 레벨 전용) | Partner API (파트너 API) |
| `@RequireAuth()` | SSE/Streaming auth (SSE/스트리밍 인증) | Streaming responses (스트리밍 응답) |

---

## 6. Frontend Common Rules (프론트엔드 공통 규칙)

### 6.1 Architecture Principles (MUST) (아키텍처 원칙 (MUST))

1. **Domain-based modularization (도메인 기반 모듈화)**
2. **Separation of UI, logic, and data fetching (UI, 로직, 데이터 패칭의 분리)**
3. **TypeScript across all areas (전 영역 TypeScript 적용)**
4. **API Layer separation** (no axios inside components) (**API Layer 분리** (컴포넌트 내부 axios 금지))
5. **Per-domain store composition (도메인별 store 구성)**
6. **Consistent naming rules between Frontend and Backend (프론트<->백엔드 네이밍 규칙 통일)**
7. **Single responsibility principle per file (파일 단위 단일 책임 원칙)**
8. **All UI text must use i18n** (no hardcoding) (**모든 UI 텍스트 i18n 처리** (하드코딩 금지)) (v2.0 New / v2.0 추가)
9. **Include entityId in QueryKey** (multi-tenancy) (**QueryKey에 entityId 포함** (멀티테넌시)) (v2.0 New / v2.0 추가)

### 6.2 File Naming (파일 네이밍)

| Type (유형) | Rule (규칙) | Example (예시) |
|------|------|------|
| Page (페이지) | PascalCase + `Page` | `CampaignListPage.tsx` |
| General component (일반 컴포넌트) | PascalCase | `CampaignCard.tsx` |
| Modal (모달) | PascalCase + `Modal` | `CampaignFormModal.tsx` |
| Hook/Composable (훅/컴포저블) | `use` + PascalCase | `useCampaignList.ts` |
| Service (서비스) | kebab-case + `.service` | `campaign.service.ts` |
| Store (스토어) | kebab-case + `.store` | `campaign.store.ts` |
| Type (타입) | kebab-case + `.types` | `campaign.types.ts` |

### 6.3 State Management Strategy (상태 관리 전략) (v2.0 Enhanced / v2.0 확장)

**React Projects (React 프로젝트):**

| State Type (상태 유형) | Tool (도구) | Config (설정) |
|-----------|------|------|
| Server state (서버 상태) | React Query (TanStack) | staleTime: 30s, refetchOnWindowFocus: true |
| Global state (전역 상태) | Zustand | auth, org, notification, timezone |
| Local state (로컬 상태) | useState | Component-specific (컴포넌트 전용) |
| URL state (URL 상태) | React Router | Query/path parameters (쿼리/경로 파라미터) |
| Form state (폼 상태) | React Hook Form + Zod | Form validation (폼 검증) |

> **Note:** Service Worker API caching may conflict with React Query, so it is recommended to remove SW caching and consolidate caching in React Query.
> **주의:** Service Worker API 캐싱은 React Query와 충돌할 수 있으므로, SW 캐싱을 제거하고 React Query에 캐싱 일원화 권장.

### 6.4 Query Key Pattern (Query Key 패턴) (v2.0 Enhanced / v2.0 강화)

```typescript
// Hierarchical query keys including entityId (multi-tenancy support)
// entityId를 포함한 계층적 쿼리 키 (멀티테넌시 대응)
export const issueKeys = {
  all: ['issues'] as const,
  lists: () => [...issueKeys.all, 'list'] as const,
  list: (entityId: string, filters: IssueFilter) => [...issueKeys.lists(), entityId, filters] as const,
  detail: (id: string) => [...issueKeys.all, 'detail', id] as const,
};
```

---

## 7. Frontend Framework-Specific Guide (프론트엔드 프레임워크별 가이드)

### 7.1 React Guide (React 가이드)

#### Import Order (Import 순서)

1. React core (`react`)
2. Third-party libraries (Third-party 라이브러리)
3. React Router
4. Global (`@/global/`, `@/components/`, `@/hooks/`, `@/lib/`) (전역)
5. Domain (`../`) (도메인)
6. Types (`type`) (타입)

#### Custom Hook Pattern (React Query) (커스텀 훅 패턴 (React Query))

```typescript
export const useCampaignList = (filter: CampaignFilter) => {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: campaignKeys.list(user.entityId, filter),
    queryFn: () => campaignService.getCampaigns(filter),
  });
};

export const useCreateCampaign = () =>
  useMutation({
    mutationFn: campaignService.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: campaignKeys.lists() }),
  });
```

#### Store Pattern (Zustand) (Store 패턴 (Zustand))

```typescript
export const useCampaignStore = create<CampaignState>((set) => ({
  filter: initialFilter,
  setFilter: (filter) => set((state) => ({ filter: { ...state.filter, ...filter } })),
  resetFilter: () => set({ filter: initialFilter }),
}));
```

### 7.2 Vue.js Guide (Vue.js 가이드)

(Vue.js patterns maintain the same structure as v1.1)
(Vue.js 패턴은 v1.1과 동일한 구조 유지)

---

## 8. API Design and Common Responses (API 설계 및 공통 응답)

### 8.1 API Path Rules (API 경로 규칙)

```
Pattern (패턴): /api/v{version}/{resource}
Example (예시): /api/v1/campaigns
               /api/v1/campaigns/:id
```

### 8.2 HTTP Method Usage (HTTP 메서드 사용)

| Method (메서드) | Usage (용도) |
|--------|------|
| GET | Read (조회) |
| POST | Create (생성) |
| PUT | Full update (전체 수정) |
| PATCH | Partial update (부분 수정) |
| DELETE | Delete (Soft Delete) (삭제 (Soft Delete)) |

### 8.3 Response Structure (응답 구조)

```typescript
// Single response (단일 응답)
interface BaseSingleResponse<T> {
  success: boolean;
  data: T | null;
  error?: { code: string; message: string; details?: Record<string, string[]> };
  timestamp: string;
}

// List response (목록 응답)
interface BaseListResponse<T> {
  success: boolean;
  data: T[];
  pagination: { page: number; size: number; totalCount: number; totalPages: number; hasNext: boolean; hasPrev: boolean; };
  timestamp: string;
}
```

### 8.4 Request/Response Case Rules (Request/Response 케이스 규칙)

| Category (구분) | Case (케이스) | Example (예시) |
|------|--------|------|
| **Request Body** | snake_case | `campaign_name`, `entity_id` |
| **Response Body** | camelCase | `campaignName`, `entityId` |
| **Query Parameter** | snake_case | `?status=ACTIVE&entity_id=xxx` |
| **Path Parameter** | camelCase identifier | `/campaigns/:id` |
| **Resource Segment** | kebab-case | `/campaign-contents/:id` |

---

## 9. Validation and Error Handling (유효성 검증 및 에러 처리)

### 9.1 Error Code System (에러 코드 체계)

| Code Range (코드 범위) | Type (유형) | Description (설명) |
|-----------|------|------|
| `E1xxx` | Auth (인증/인가) | Login, token, permissions (로그인, 토큰, 권한) |
| `E2xxx` | User (사용자) | Profile, invitation (프로필, 초대) |
| `E3xxx` | Chat (대화/채팅) | AI chat, conversation (AI 채팅, 대화) |
| `E4xxx` | Agent/AI (에이전트/AI) | AI quota (E4010: daily exceeded, E4011: monthly exceeded) (AI 쿼터 (E4010: 일간 초과, E4011: 월간 초과)) |
| `E5xxx` | Domain (도메인) | Defined per project (프로젝트별 정의) |
| `E9xxx` | System (시스템) | Server, DB, external services (서버, DB, 외부 서비스) |

---

## 10. Naming Summary (네이밍 요약)

| Target (대상) | Rule (규칙) | Example (예시) |
|------|------|------|
| DB Table (DB 테이블) | `{prefix}_{plural}` snake_case | `amb_campaigns`, `amb_hr_employees` |
| DB Column (DB 컬럼) | `{colPrefix}_{name}` snake_case | `cmp_name`, `ent_id` |
| Entity Class (Entity 클래스) | PascalCase + Entity | `CampaignEntity` |
| Entity Property (Entity 프로퍼티) | camelCase | `cmpName`, `entId` |
| Request DTO | snake_case | `campaign_name`, `entity_id` |
| Response DTO | camelCase | `campaignName`, `entityId` |
| Controller file (Controller 파일) | kebab-case.controller.ts | `campaign.controller.ts` |
| Service file (Service 파일) | kebab-case.service.ts | `campaign.service.ts` |
| Mapper file (Mapper 파일) | kebab-case.mapper.ts | `campaign.mapper.ts` |
| Component file (컴포넌트 파일) | PascalCase | `CampaignCard.tsx` |
| Hook file (훅 파일) | camelCase.ts | `useCampaignList.ts` |
| Constants (상수) | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE` |
| Environment variables (환경변수) | SCREAMING_SNAKE_CASE | `VITE_API_BASE_URL` |

---

## 11. ENUM and Constants Rules (ENUM 및 상수 규칙)

### 11.1 Backend Enum (백엔드 Enum)

```typescript
export enum CampaignStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
```

### 11.2 Frontend Enum (const object + type) (프론트엔드 Enum (const object + type))

```typescript
export const CAMPAIGN_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
} as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: '임시저장',
  PENDING: '승인대기',
  ACTIVE: '진행중',
};
```

---

## 12. Multi-Tenancy Rules (멀티테넌시 규칙) (v2.0 New / v2.0 신규)

### 12.1 Data Isolation (데이터 격리)

| Rule (규칙) | Description (설명) |
|------|------|
| `ent_id` FK required (`ent_id` FK 필수) | Nearly all data tables include corporation ID FK (거의 모든 데이터 테이블에 법인 ID FK 포함) |
| `@Auth()` used by default (`@Auth()` 기본 사용) | OwnEntityGuard automatically ensures corporation isolation (OwnEntityGuard가 자동 법인 격리 보장) |
| `resolveEntityId()` | Query param → JWT entityId fallback |
| Visibility (가시성) | ENTITY (entire corporation / 법인 전체) / CELL (within cell / 셀 내) / PRIVATE (author only / 작성자만) |

### 12.2 Entity/Cell/Unit Relationship (Entity/Cell/Unit 관계)

```
Entity (Corporation/Company / 법인/회사)
  ├── Cell (Amoeba Cell / 아메바 셀) ── Visibility unit, per-department AI agent (가시성 단위, 부서별 AI 에이전트)
  └── Unit (Department/Team / 부서/팀) ── Organization hierarchy (self-referencing tree) (조직 계층 (자기참조 트리))
      └── UserUnitRole ── User-department role mapping (사용자-부서 역할 매핑)
```

### 12.3 User Levels (4 tiers) (사용자 레벨 (4단계))

| Level (레벨) | Description (설명) |
|------|------|
| ADMIN_LEVEL | System administrator (시스템 관리자) |
| USER_LEVEL | Internal employee (내부 직원) |
| CLIENT_LEVEL | B2B customer (B2B 고객) |
| PARTNER_LEVEL | Partner (파트너) |

---

## 13. Encryption Rules (암호화 규칙) (v2.0 New / v2.0 신규)

### 13.1 AES-256-GCM Pattern (AES-256-GCM 패턴)

Sensitive data (API Keys, SMTP passwords, PG keys, etc.) is encrypted with **AES-256-GCM**:
민감 데이터(API Key, SMTP 비밀번호, PG 키 등)는 **AES-256-GCM**으로 암호화:

```typescript
// DB storage: 3-field pattern (DB 저장: 3-필드 패턴)
{colPrefix}_encrypted   // Encrypted data (암호화된 데이터)
{colPrefix}_iv          // Initialization vector (초기화 벡터)
{colPrefix}_tag         // Authentication tag (인증 태그)

// CryptoService (scryptSync key derivation / scryptSync 키 도출)
@Injectable()
export class CryptoService {
  encrypt(plainText: string): { encrypted: string; iv: string; tag: string }
  decrypt(encrypted: string, iv: string, tag: string): string
}
```

### 13.2 Applicable Targets (적용 대상)

| Target (대상) | Entity (엔티티) | Fields (필드) |
|------|--------|------|
| API Keys (API 키) | amb_api_keys | apk_encrypted/iv/tag |
| SMTP Password (SMTP 비밀번호) | amb_smtp_settings | sms_pass_encrypted/iv/tag |
| PG Keys (PG 키) | amb_pg_configs | pgc_*_encrypted/iv/tag (6 types / 6종) |
| Custom Apps (커스텀 앱) | amb_entity_custom_apps | eca_api_key_enc/iv/tag |

---

## 14. i18n Rules (i18n 규칙) (v2.0 New / v2.0 신규)

### 14.1 Supported Languages (지원 언어)

| Code (코드) | Language (언어) | Status (상태) |
|------|------|------|
| `ko` | Korean (한국어) | Default/Fallback (기본/Fallback) |
| `en` | English (영어) | Included by default (기본 제공) |
| `vi` | Vietnamese (베트남어) | Added in v2.0 (v2.0 추가) |

### 14.2 Rules (MUST) (규칙 (MUST))

1. Frontend UI text **must use translation files** (no hardcoding in components) (프론트엔드 UI 텍스트는 **반드시 번역 파일 사용** (컴포넌트 하드코딩 금지))
2. Translation keys are used via `t()` function from `useTranslation()` hook (번역 키는 `useTranslation()` 훅의 `t()` 함수로 사용)
3. When adding a new namespace, register it in `i18n.ts` (import + resources + ns array) (새 네임스페이스 추가 시 `i18n.ts`에 import + resources + ns 배열 등록)
4. Backend error messages are **fixed in English** (frontend translates based on error codes) (백엔드 에러 메시지는 **영어 고정** (프론트에서 에러 코드 기반 번역))
5. AI agent response language is controlled via `Accept-Language` header (AI 에이전트 응답 언어는 `Accept-Language` 헤더로 제어)

---

## 15. Git Convention (Git 컨벤션)

### 15.1 Branch Strategy (브랜치 전략) (v2.0 Enhanced / v2.0 수정)

| Branch (브랜치) | Purpose (용도) | Deploy Environment (배포 환경) | Protection (보호) |
|--------|------|----------|------|
| `production` | Production release (프로덕션 릴리즈) | Production (프로덕션) | PR required, 1 approval (PR 필수, 1명 승인) |
| `main` | Development integration (default) (개발 통합 (기본)) | Staging (스테이징) | PR required, 1 approval (PR 필수, 1명 승인) |
| `feature/*` | Feature development (기능 개발) | Local (로컬) | - |
| `hotfix/*` | Urgent fix (긴급 수정) | - | - |

### 15.2 Development Flow (개발 플로우)

1. Branch `feature/{name}` from `main` (`main`에서 `feature/{이름}` 분기)
2. After completion, PR to `main` → **Squash Merge** (작업 완료 후 `main`으로 PR → **Squash Merge**)
3. After staging test, `main` → `production` PR → **Merge Commit** (스테이징 테스트 후 `main` → `production` PR → **Merge Commit**)
4. Hotfix: Branch from `production` → merge to both `production` + `main` (Hotfix: `production`에서 분기 → `production` + `main` 둘 다 머지)

### 15.3 Commit Messages (커밋 메시지)

```
{type}: {description (설명)}

type: feat | fix | docs | style | refactor | test | chore | hotfix
Example (예): feat: 사용자 프로필 페이지 추가
```

---

## 16. Checklist (체크리스트)

### Backend (백엔드)

- [ ] `@Auth()` decorator applied to Controller (`@Auth()` 데코레이터 적용 여부)
- [ ] Data isolation based on `ent_id` in Service (Service에서 `ent_id` 기반 데이터 격리 여부)
- [ ] Explicit type specified for nullable columns in Entity (Entity nullable 컬럼에 명시적 type 지정 여부)
- [ ] Request DTO uses snake_case (Request DTO는 snake_case인가?)
- [ ] Response DTO uses camelCase (Response DTO는 camelCase인가?)
- [ ] Mapper static methods written (Mapper static 메서드 작성 여부)
- [ ] forwardRef() used for circular dependencies (순환 의존성 시 forwardRef() 사용 여부)
- [ ] Swagger decorators defined (Swagger 데코레이터 정의 여부)
- [ ] Manual SQL migration prepared for staging/production (스테이징/프로덕션 수동 SQL 마이그레이션 준비 여부)

### Frontend (프론트엔드)

- [ ] All UI text uses i18n (no hardcoding) (모든 UI 텍스트 i18n 처리 (하드코딩 없음))
- [ ] New namespace registered in i18n.ts (새 네임스페이스 i18n.ts 등록 여부)
- [ ] entityId included in QueryKey (QueryKey에 entityId 포함 여부)
- [ ] API calls made only from service layer (API 호출은 service에서만 수행)
- [ ] Translation files written for all 3 languages (ko/en/vi) (번역 파일 3개 언어 (ko/en/vi) 작성 여부)

### Database (데이터베이스)

- [ ] Table name `{prefix}_{plural}` snake_case (테이블명 `{prefix}_{plural}` snake_case)
- [ ] Column `{colPrefix}_{name}` 3-letter prefix (컬럼 `{colPrefix}_{name}` 3자 prefix)
- [ ] `ent_id` FK included (multi-tenancy) (`ent_id` FK 포함 (멀티테넌시))
- [ ] Nullable column type explicitly specified (nullable 컬럼 type 명시)
- [ ] Soft Delete `{prefix}_deleted_at`
- [ ] Encryption fields use 3-field pattern (encrypted/iv/tag) (암호화 필드 3-필드 패턴 (encrypted/iv/tag))

---

## Document History (문서 이력)

| Version (버전) | Date (일자) | Author (작성자) | Changes (변경 내용) |
|------|------|--------|-----------|
| v1.0 | 2026-02-12 | Amoeba Company | Initial creation (최초 작성) |
| v1.1 | 2026-02-12 | Amoeba Company | React + Vue.js dual framework support (React + Vue.js 듀얼 프레임워크 지원) |
| **v2.0** | **2026-03-23** | **Amoeba Company** | **AMB project best practices: Multi-tenancy (Entity/Cell/Unit + OwnEntityGuard), 4-level authentication (@Auth/@AdminOnly/@PartnerOnly, etc.), domain-specific table prefix mapping, TypeORM nullable explicit type, Mapper static pattern, encryption (AES-256-GCM 3-field), i18n 3-language (ko/en/vi) hardcoding prohibition, Git branch (production/main), QueryKey entityId inclusion, schema migration rules (AMB 프로젝트 베스트 프랙티스: 멀티테넌시(Entity/Cell/Unit + OwnEntityGuard), 4-레벨 인증(@Auth/@AdminOnly/@PartnerOnly 등), 도메인별 테이블 prefix 매핑, TypeORM nullable explicit type, Mapper static 패턴, 암호화(AES-256-GCM 3-필드), i18n 3개국어(ko/en/vi) 하드코딩 금지, Git 브랜치(production/main), QueryKey entityId 포함, 스키마 마이그레이션 규칙)** |