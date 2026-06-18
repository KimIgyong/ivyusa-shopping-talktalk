# Amoeba Basic Development Skill Guide v2 (아메바 기본 개발 스킬 가이드 v2)

## Amoeba Company Standard Development Skill Guide (아메바 컴퍼니 표준 개발 스킬 가이드)

**Document Version (문서버전):** v2.0
**Date (작성일):** 2026-03-23
**Author (작성):** Amoeba Company
**Scope (적용 범위):** All Amoeba Company projects (Amoeba Company 전체 프로젝트)
**Reference Project (기준 프로젝트):** AMB Management (based on best practices / 베스트 프랙티스 기반)

---

## Table of Contents (목차)

1. [Project Structure (프로젝트 구성)](#1-project-structure-프로젝트-구성)
2. [Tech Stack (기술 스택)](#2-tech-stack-기술-스택)
3. [Architecture Principles (아키텍처 원칙)](#3-architecture-principles-아키텍처-원칙)
4. [Backend Development Skills (백엔드 개발 스킬)](#4-backend-development-skills-백엔드-개발-스킬)
5. [Frontend Development Skills (프론트엔드 개발 스킬)](#5-frontend-development-skills-프론트엔드-개발-스킬)
6. [Database Skills (데이터베이스 스킬)](#6-database-skills-데이터베이스-스킬)
7. [Authentication & Authorization (인증/인가)](#7-authentication--authorization-인증인가)
8. [Multi-Tenancy (멀티테넌시)](#8-multi-tenancy-멀티테넌시)
9. [Internationalization - i18n (다국어)](#9-internationalization---i18n-다국어)
10. [Real-time Processing - SSE (실시간 처리)](#10-real-time-processing---sse-실시간-처리)
11. [AI Integration (AI 통합)](#11-ai-integration-ai-통합)
12. [External Service Integration (외부 서비스 연동)](#12-external-service-integration-외부-서비스-연동)
13. [Testing Strategy (테스트 전략)](#13-testing-strategy-테스트-전략)
14. [Mock Data System (Mock 데이터 시스템)](#14-mock-data-system-mock-데이터-시스템)
15. [Deployment & Operations (배포 및 운영)](#15-deployment--operations-배포-및-운영)
16. [Security Development Skills (보안 개발 스킬)](#16-security-development-skills-보안-개발-스킬)
17. [Privacy Protection (개인정보보호)](#17-privacy-protection-개인정보보호)

---

## 1. Project Structure (프로젝트 구성)

### 1.1 Monorepo (Turborepo)

All projects use a **Turborepo-based Monorepo** structure.
모든 프로젝트는 **Turborepo 기반 Monorepo** 구조를 사용합니다.

```
{project}/
├── apps/           # Runnable applications (실행 가능한 애플리케이션)
│   ├── api/        # NestJS backend (main API) (NestJS 백엔드, 메인 API)
│   ├── web/        # Frontend (React or Vue.js) (프론트엔드, React 또는 Vue.js)
│   ├── portal-api/ # Portal API (for B2B clients/partners, optional) (포털 API, B2B 고객/파트너용, 선택)
│   ├── portal-web/ # Portal frontend (optional) (포털 프론트엔드, 선택)
│   └── mobile/     # React Native mobile app (optional) (React Native 모바일 앱, 선택)
├── packages/       # Shared packages (공유 패키지)
│   ├── common/     # Common utilities (tsup) (공통 유틸리티)
│   ├── types/      # Shared TypeScript types (공유 TypeScript 타입)
│   └── ui/         # Shared UI components (can be split by framework) (공유 UI 컴포넌트, 프레임워크별 분리 가능)
├── docker/         # Docker configs (per environment) (Docker 설정, 환경별 분리)
│   ├── dev/        # Development (개발 환경)
│   ├── staging/    # Staging (스테이징 환경)
│   └── production/ # Production (프로덕션 환경)
├── scripts/        # Helper scripts (도우미 스크립트)
├── env/            # Environment variables (per environment) (환경 변수, 환경별 분리)
│   ├── backend/    # .env.development, .env.staging, .env.production
│   └── frontend/   # .env.development, etc.
├── turbo.json      # Turborepo config (Turborepo 설정)
└── package.json    # Root package.json (workspaces)
```

### 1.2 Common Commands (공통 커맨드)

```bash
# Development (개발)
npm run dev              # Run all apps (전체 앱 실행)
npm run dev:api          # API server only (API 서버만)
npm run dev:web          # Web client only (웹 클라이언트만)

# Restart (재시작)
npm run restart          # Full restart (includes package build) (전체 재시작, 패키지 빌드 포함)
npm run stop             # Stop all (전체 중지)

# Build & Quality (빌드 & 품질)
npm run build            # Full build (전체 빌드)
npm run lint             # ESLint check (ESLint 검사)
npm run lint:fix         # ESLint auto-fix (ESLint 자동 수정)
npm run format           # Prettier formatting (Prettier 포매팅)

# Test (테스트)
npm run test             # Run all tests (전체 테스트)
npm run test:e2e         # E2E tests (E2E 테스트)

# Database (데이터베이스)
npm run db:up            # Start Docker container (Docker 컨테이너 시작)
npm run db:down          # Stop Docker container (Docker 컨테이너 중지)
npm run migration:run    # Run TypeORM migrations (TypeORM 마이그레이션 실행)
npm run migration:generate  # Generate migration (마이그레이션 생성)
```

---

## 2. Tech Stack (기술 스택)

### 2.1 Standard Tech Stack (표준 기술 스택)

> The frontend can use **React** or **Vue.js** depending on project needs, or both within a monorepo.
> 프론트엔드는 프로젝트 성격에 따라 **React** 또는 **Vue.js**를 선택하거나, 모노레포 내에서 동시에 사용할 수 있습니다.

| Area (영역) | Technology (기술) | Version (버전) | Usage (용도) |
|------|------|------|------|
| **FE Common (FE 공통)** | TypeScript | 5.x | Type system (타입 시스템) |
| | Vite | 5.x | Build tool (빌드 도구) |
| | TailwindCSS | 3.x | Styling (스타일링) |
| | Zod | 3.x+ | Schema validation (스키마 검증) |
| | Lucide | latest | Icons (아이콘) (`lucide-react` / `lucide-vue-next`) |
| | MSW | latest | Mock data (Mock 데이터) |
| **React** | React | 18.x | UI library (UI 라이브러리) |
| | Zustand | 4.x | Global state management (전역 상태 관리) |
| | React Query (TanStack) | 5.x | Server state management (서버 상태 관리) |
| | React Hook Form | 7.x | Form management (폼 관리) |
| | React Router | 6.x | Routing (라우팅) |
| | react-i18next | 14.x+ | Internationalization (다국어) |
| **Vue.js** | Vue.js | 3.x | UI framework (UI 프레임워크) |
| | Pinia | 2.x | Global state management (전역 상태 관리) |
| | Vue Query (TanStack) | 5.x | Server state management (서버 상태 관리) |
| | VeeValidate | 4.x | Form management (폼 관리) |
| | Vue Router | 4.x | Routing (라우팅) |
| | vue-i18n | 9.x+ | Internationalization (다국어) |
| **Backend** | NestJS | 10.x | Server framework (서버 프레임워크) |
| | TypeORM | 0.3.x | ORM |
| | PostgreSQL | 15.x | Database (데이터베이스) |
| | Redis | 7.x | Cache/Session/Queue (캐시/세션/큐) |
| | Bull | 4.x | Job queue (작업 큐) |
| | Passport + JWT | - | Authentication (인증) |
| | class-validator | 0.14.x | DTO validation (DTO 검증) |
| | nestjs-i18n | 10.x | Internationalization (다국어) |
| | Swagger | 7.x | API documentation (API 문서) |
| **AI** | Anthropic Claude API | @anthropic-ai/sdk | AI analysis/generation (AI 분석/생성) |
| **Mobile** | React Native | 0.76.x | Mobile app (optional) (모바일 앱, 선택) |
| **DevOps** | ESLint | 8.x | Linting (린팅) |
| | Prettier | 3.x | Formatting (포매팅) |
| | Jest / Vitest | - | Testing (테스트) |
| | Docker | - | Container (컨테이너) |

---

## 3. Architecture Principles (아키텍처 원칙)

### 3.1 Clean Architecture (4-Layer) (클린 아키텍처, 4계층)

```
Presentation Layer   (Controller, Request/Response DTO)
        |
Application Layer    (Service, Mapper, Event Handler)
        |
Domain Layer         (Entity, Value Object, Repository Interface)
        |
Infrastructure Layer (Repository Impl, External API, Cache, DB)
```

### 3.2 Layer Rules (레이어 규칙)

| Rule (규칙) | Description (설명) |
|------|------|
| `controller` -> `service` | Allowed (호출 가능) |
| `service` -> `entity`, `repository` | Allowed (호출 가능) |
| `entity` -> `service`, `controller` | **Import prohibited (import 금지)** |
| `repository` -> `controller` | **Import prohibited (import 금지)** |

### 3.3 DDD (Domain-Driven Design / 도메인 주도 설계)

- All code is organized by domain module (모든 코드는 도메인 모듈 단위로 구성)
- Direct cross-domain references are prohibited (use `forwardRef` for circular refs) (도메인 간 직접 참조 금지, 순환 참조 시 `forwardRef` 사용)
- Cross-domain communication goes through Interface or API (도메인 간 통신은 Interface 또는 API 경유)
- Common code placed in `/global` directory, domain-neutral (공통 코드는 `/global` 디렉토리에 도메인 중립적으로 배치)

### 3.4 Multi-Tenancy Architecture (멀티테넌시 아키텍처) (v2.0 New / v2.0 신규)

All data is **isolated by Entity (corporation)**.
모든 데이터는 **Entity(법인) 단위로 격리**됩니다.

```
Entity (Corporation/Company / 법인/회사)
  ├── Cell (Amoeba Cell / 아메바 셀) ── Data visibility unit (데이터 가시성 단위)
  └── Unit (Department/Team / 부서/팀) ── Organizational hierarchy (조직 계층 구조)
```

- Almost all data tables include `ent_id` FK (거의 모든 데이터 테이블에 `ent_id` FK 포함)
- `OwnEntityGuard` ensures automatic entity isolation (`OwnEntityGuard`로 자동 법인 격리 보장)
- Visibility model: `ENTITY | CELL | PRIVATE` (가시성 모델: `ENTITY | CELL | PRIVATE`)

---

## 4. Backend Development Skills (백엔드 개발 스킬)

### 4.1 Domain Module Structure (도메인 모듈 구조)

```
domain/{name}/
├── controller/          # HTTP endpoints (Swagger required) (HTTP 엔드포인트, Swagger 필수)
├── service/             # Business logic (비즈니스 로직)
├── entity/              # TypeORM entities (TypeORM 엔티티)
├── repository/          # Data access (데이터 접근)
├── dto/
│   ├── request/         # Request DTO (snake_case)
│   └── response/        # Response DTO (camelCase)
├── mapper/              # Entity <-> DTO conversion (static methods) (Entity <-> DTO 변환, static 메서드)
├── constant/            # Domain constants/error codes (도메인 상수/에러 코드)
├── guard/               # Auth/authorization guards (인증/인가 가드)
└── {name}.module.ts     # NestJS module (NestJS 모듈)
```

### 4.2 Controller Implementation (Controller 작성)

```typescript
@Controller('campaigns')
@ApiTags('캠페인')
export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  @Get()
  @Auth()  // JWT 인증 + 엔티티 격리 자동 적용
  @ApiOperation({ summary: '캠페인 목록' })
  async findAll(
    @Query() query: ListCampaignRequest,
    @CurrentUser() user: UserPayload,
  ): Promise<BaseListResponse<CampaignResponse>> {
    const entityId = resolveEntityId(query.entity_id, user);
    const [data, total] = await this.service.findAll(entityId, query);
    return {
      success: true,
      data: data.map(CampaignMapper.toResponse),
      pagination: { page: query.page, size: query.size, totalCount: total, totalPages: Math.ceil(total / query.size) },
    };
  }
}
```

### 4.3 Mapper Pattern (Mapper 패턴) (v2.0 Enhanced / v2.0 강화)

Uses **static method** pattern for Entity-to-Response DTO conversion.
Entity와 Response DTO 변환에 **static 메서드** 패턴을 사용합니다.

```typescript
export class CampaignMapper {
  static toResponse(entity: CampaignEntity): CampaignResponse {
    return {
      campaignId: entity.cmpId,
      campaignName: entity.cmpName,
      status: entity.cmpStatus,
      createdAt: entity.cmpCreatedAt.toISOString(),
    };
  }

  static toListResponse(entities: CampaignEntity[]): CampaignResponse[] {
    return entities.map(CampaignMapper.toResponse);
  }
}
```

### 4.4 Entity Implementation (Entity 작성)

```typescript
@Entity('amb_campaigns')
export class CampaignEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'cmp_id' })
  cmpId: string;

  @Column({ name: 'ent_id', type: 'uuid' })
  entId: string;  // 멀티테넌시 필수 FK

  @Column({ name: 'cmp_name', length: 100 })
  cmpName: string;

  @Column({ name: 'cmp_visibility', type: 'varchar', length: 20, default: 'ENTITY' })
  cmpVisibility: string;  // ENTITY | CELL | PRIVATE

  @Column({ name: 'cmp_cell_id', type: 'uuid', nullable: true })
  cmpCellId: string | null;  // 셀 기반 가시성

  @CreateDateColumn({ name: 'cmp_created_at' })
  cmpCreatedAt: Date;

  @DeleteDateColumn({ name: 'cmp_deleted_at' })
  cmpDeletedAt: Date; // Soft Delete
}
```

> **Caution:** In TypeORM, union types (`string | null`) cause `reflect-metadata` to infer `Object`, which leads to `DataTypeNotSupportedError`. For nullable columns, always specify an **explicit type** such as `type: 'varchar'` or `type: 'uuid'`.
> **주의:** TypeORM에서 union type(`string | null`)이면 `reflect-metadata`가 `Object`로 추론하여 `DataTypeNotSupportedError` 발생 가능. nullable 컬럼에는 반드시 `type: 'varchar'` 또는 `type: 'uuid'` 등 **명시적 타입** 지정 필수.

### 4.5 Error Handling (에러 처리)

```typescript
// Use BusinessException (BusinessException 사용)
throw new BusinessException('E3001', '캠페인을 찾을 수 없습니다.');

// Global Exception Filter converts to standard error response
// 전역 Exception Filter에서 공통 에러 응답 변환
{ success: false, error: { code: 'E3001', message: '...' }, timestamp: '...' }
```

### 4.6 Entity ID Resolution (v2.0 New / v2.0 신규)

Pattern for safely determining Entity ID in a multi-tenancy environment.
멀티테넌시 환경에서 Entity ID를 안전하게 결정하는 패턴입니다.

```typescript
// Prioritize query param; fallback to JWT entityId
// query param 우선, 없으면 JWT의 entityId 사용
const entityId = resolveEntityId(query.entity_id, user);
// user.entityId = Entity ID extracted from JWT (JWT에서 추출된 소속 법인 ID)
```

---

## 5. Frontend Development Skills (프론트엔드 개발 스킬)

> The frontend uses either **React** or **Vue.js** depending on the project. Below covers common patterns and per-framework guides.
> 프론트엔드는 프로젝트에 따라 **React** 또는 **Vue.js**를 선택합니다. 아래는 공통 패턴과 프레임워크별 가이드입니다.

### 5.1 Domain Module Structure (도메인 모듈 구조)

**React Project (React 프로젝트):**
```
domain/{name}/
├── pages/               # Page components (페이지 컴포넌트) ({Domain}{Action}Page.tsx)
├── components/          # Domain-specific components (도메인 전용 컴포넌트) (.tsx)
├── hooks/               # Custom hooks (커스텀 훅) (use{Xxx}.ts)
├── service/             # API service layer (API 서비스 레이어)
├── store/               # Zustand store (Zustand 스토어)
└── types/               # TypeScript types (TypeScript 타입)
```

**Vue.js Project (Vue.js 프로젝트):**
```
domain/{name}/
├── pages/               # Page components (페이지 컴포넌트) ({Domain}{Action}Page.vue)
├── components/          # Domain-specific components (도메인 전용 컴포넌트) (.vue)
├── composables/         # Composables (컴포저블) (use{Xxx}.ts)
├── service/             # API service layer (API 서비스 레이어)
├── store/               # Pinia store (Pinia 스토어)
└── types/               # TypeScript types (TypeScript 타입)
```

### 5.2 API Service Layer (Common / 공통)

> The service layer uses the same pattern regardless of framework.
> Service 레이어는 프레임워크와 무관하게 동일한 패턴을 사용합니다.

```typescript
class CampaignService {
  private readonly basePath = '/campaigns';

  getList = (filter: Filter) => apiClient.get(this.basePath, { params: filter }).then(r => r.data);
  getById = (id: string) => apiClient.get(`${this.basePath}/${id}`).then(r => r.data.data);
  create = (data: CreateReq) => apiClient.post(this.basePath, data).then(r => r.data.data);
}
export const campaignService = new CampaignService();
```

### 5.3 Query Key Factory (Common / 공통)

```typescript
export const campaignKeys = {
  all: ['campaigns'] as const,
  lists: () => [...campaignKeys.all, 'list'] as const,
  list: (entityId: string, filter: Filter) => [...campaignKeys.lists(), entityId, filter] as const,
  detail: (id: string) => [...campaignKeys.all, 'detail', id] as const,
};
```

### 5.4 React Development Skills (React 개발 스킬)

#### 5.4.1 Custom Hooks (커스텀 훅) (React Query)

```typescript
// Query hook (조회 훅)
export const useCampaignList = (filter: Filter) =>
  useQuery({ queryKey: campaignKeys.list(entityId, filter), queryFn: () => service.getList(filter) });

// Mutation hook (변경 훅)
export const useCreateCampaign = () =>
  useMutation({
    mutationFn: service.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: campaignKeys.lists() }),
  });
```

#### 5.4.2 Zustand Store

Key global store purposes (주요 전역 스토어 용도):

| Store (스토어) | Purpose (용도) |
|--------|------|
| `auth.store` | User authentication state, tokens (사용자 인증 상태, 토큰) |
| `org.store` | Organization info (entity, cell, unit) (조직 정보: 법인, 셀, 유닛) |
| `notification.store` | Notification state (알림 상태) |
| `timezone.store` | User timezone (사용자 타임존) |

```typescript
interface AuthState {
  user: UserPayload | null;
  isAuthenticated: boolean;
  setUser: (user: UserPayload) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: true }),
  clearUser: () => set({ user: null, isAuthenticated: false }),
}));
```

### 5.5 Vue.js Development Skills (Vue.js 개발 스킬)

#### 5.5.1 Composables (컴포저블) (Vue Query)

```typescript
export const useCampaignList = (filter: MaybeRef<Filter>) =>
  useQuery({ queryKey: campaignKeys.list(filter), queryFn: () => service.getList(toValue(filter)) });
```

#### 5.5.2 Pinia Store

```typescript
export const useAppStore = defineStore('app', () => {
  const filter = ref<Filter>(initialFilter);
  const setFilter = (f: Partial<Filter>) => { filter.value = { ...filter.value, ...f }; };
  const resetFilter = () => { filter.value = initialFilter; };
  return { filter, setFilter, resetFilter };
});
```

### 5.6 QueryClient Configuration (QueryClient 설정) (v2.0 New / v2.0 신규)

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,        // 30 seconds (30초, 기본)
      refetchOnWindowFocus: true,   // Refetch on window focus (창 포커스 시 재요청)
      retry: 1,
    },
  },
});
```

> **Caution:** Conflicts can occur when Service Worker API caching and React Query caching are used simultaneously. Remove SW caching and unify caching through React Query.
> **주의:** Service Worker API 캐싱과 React Query 캐싱이 동시 사용 시 충돌 가능. SW 캐싱은 제거하고 React Query에 캐싱을 일원화할 것.

### 5.7 Routing (라우팅) (v2.0 New / v2.0 신규)

Uses React Router v6 `createBrowserRouter`.
React Router v6 `createBrowserRouter` 사용:

```typescript
const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'campaigns', element: <CampaignListPage /> },
      { path: 'campaigns/:id', element: <CampaignDetailPage /> },
    ],
  },
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { path: 'login', element: <LoginPage /> },
    ],
  },
]);
```

### 5.8 Component Writing Principles (컴포넌트 작성 원칙) (Common / 공통)

- **No direct axios/fetch calls inside components** -> Go through Service (컴포넌트 내부에서 axios/fetch 직접 호출 금지 -> Service 경유)
- Import order: Framework core -> Libraries -> Global -> Domain -> Types (Import 순서: 프레임워크 코어 -> 라이브러리 -> 전역 -> 도메인 -> 타입)
- Page components: Data fetching + layout composition (페이지 컴포넌트: 데이터 패칭 + 레이아웃 조합)
- Presentation components: Render UI from props only (프레젠테이션 컴포넌트: props만으로 UI 렌더링)

---

## 6. Database Skills (데이터베이스 스킬)

### 6.1 Schema Change Management (스키마 변경 관리) (v2.0 Enhanced / v2.0 강화)

| Environment (환경) | Method (방식) | Notes (주의사항) |
|------|------|---------|
| **Development (개발)** | TypeORM `synchronize: true` | Auto schema sync (자동 스키마 동기화) |
| **Staging/Production (스테이징/프로덕션)** | **Manual SQL migration (수동 SQL 마이그레이션)** | `synchronize: false` (NODE_ENV=production) |

```bash
# Staging/Production DB schema change (Docker environment)
# 스테이징/프로덕션 DB 스키마 변경 (Docker 환경)
docker exec {container-name} psql -U {user} -d {db} -c '
  ALTER TABLE amb_campaigns ADD COLUMN cmp_cell_id UUID;
'
```

> **Important:** TypeORM synchronize is disabled in staging/production. When adding new entities/columns, you must run manual SQL **before** deploying code.
> **중요:** 스테이징/프로덕션에서는 TypeORM synchronize가 비활성화됩니다. 새 엔티티/컬럼 추가 시 반드시 코드 배포 **전** 수동 SQL을 실행해야 합니다.

### 6.2 Naming Conventions (네이밍 규칙)

| Target (대상) | Pattern (패턴) | Example (예시) |
|------|------|------|
| DB name (DB 이름) | `db_{project}` | `db_amb` |
| Table (테이블) | `{prefix}_{name_plural}` | `amb_campaigns`, `kms_projects` |
| PK | `{colPrefix}_id` | `cmp_id` |
| FK | Use referenced table PK as-is (참조 테이블 PK 그대로) | `usr_id`, `ent_id` |
| Created at (생성일) | `{colPrefix}_created_at` | `cmp_created_at` |
| Soft Delete | `{colPrefix}_deleted_at` | `cmp_deleted_at` |
| Boolean | `{colPrefix}_is_{name}` | `cmp_is_active`, `ntc_is_pinned` |
| Visibility (가시성) | `{colPrefix}_visibility` | `iss_visibility` (ENTITY/CELL/PRIVATE) |
| Encryption (암호화) | `{colPrefix}_encrypted/iv/tag` | AES-256-GCM 3-field pattern (AES-256-GCM 3-필드 패턴) |

### 6.3 Query Writing (쿼리 작성)

```typescript
// Repository pattern - includes entity isolation
// Repository 패턴 - 엔티티 격리 포함
async findByStatus(entityId: string, status: string): Promise<CampaignEntity[]> {
  return this.repository.find({
    where: { entId: entityId, cmpStatus: status, cmpDeletedAt: IsNull() },
    order: { cmpCreatedAt: 'DESC' },
  });
}

// QueryBuilder (complex queries / 복잡한 쿼리)
const qb = this.repository.createQueryBuilder('c')
  .leftJoinAndSelect('c.advertiser', 'a')
  .where('c.entId = :entityId', { entityId })
  .andWhere('c.cmpStatus = :status', { status })
  .andWhere('c.cmpDeletedAt IS NULL')
  .orderBy('c.cmpCreatedAt', 'DESC');
```

---

## 7. Authentication & Authorization (인증/인가)

### 7.1 JWT Strategy (JWT 전략)

| Item (항목) | Access Token | Refresh Token |
|------|--------------|---------------|
| Expiry (유효기간) | 15 min (15분) | 7 days (7일) |
| Storage (저장 위치) | Memory / Header | HttpOnly Cookie |

### 7.2 User Level System (사용자 레벨 체계) (v2.0 Enhanced / v2.0 확장)

> Extended from v1.x 3-role system (USER/MANAGER/ADMIN) to a **4-level** system.
> v1.x의 3-역할(USER/MANAGER/ADMIN) 체계에서 **4-레벨** 체계로 확장되었습니다.

| Level (레벨) | Description (설명) | Access Scope (접근 영역) |
|------|------|----------|
| **ADMIN_LEVEL** | System administrator (시스템 관리자) | Full system management, entity management (전체 시스템 관리, 법인 관리) |
| **USER_LEVEL** | Internal user (employee) (내부 사용자, 직원) | Entity data, AI chat, projects, etc. (법인 데이터, AI 채팅, 프로젝트 등) |
| **CLIENT_LEVEL** | External B2B client (외부 B2B 고객) | Client portal, service subscription management (고객 포털, 서비스 구독 관리) |
| **PARTNER_LEVEL** | Partner (파트너) | Partner portal, app management (파트너 포털, 앱 관리) |

Roles are subdivisions within levels (역할은 레벨 내에서 세분화):

| Role (역할) | Level (레벨) | Access Scope (접근 영역) |
|------|------|----------|
| USER | USER_LEVEL | Basic chat, dashboard (기본 채팅, 대시보드) |
| MANAGER | USER_LEVEL | USER + member view, invite management (USER + 멤버 조회, 초대 관리) |
| ADMIN | ADMIN_LEVEL | MANAGER + role change, group CRUD, API key management (MANAGER + 역할 변경, 그룹 CRUD, API 키 관리) |

### 7.3 Authentication Decorator Stack (인증 데코레이터 스택) (v2.0 New / v2.0 신규)

Composite authentication decorators used in actual implementation.
실제 구현에서 사용되는 복합 인증 데코레이터:

| Decorator (데코레이터) | Combination (조합) | Purpose (용도) |
|-----------|------|------|
| `@Auth()` | `@ApiBearerAuth` + `@UseGuards(JwtAuthGuard, OwnEntityGuard)` | **Basic auth - most commonly used (기본 인증, 가장 많이 사용)** |
| `@AdminOnly()` | `@Auth()` + `@UseGuards(LevelRoleGuard)` + `@Roles('ADMIN')` | Admin only (관리자 전용) |
| `@MasterOrAdmin()` | `@Auth()` + master/admin guard (마스터/관리자 가드) | Master or admin (마스터 또는 관리자) |
| `@PartnerOnly()` | Partner level guard (파트너 레벨 전용 가드) | Partner-only API (파트너 전용 API) |
| `@RequireAuth()` | SSE/streaming auth (SSE/스트리밍 전용 인증) | Used for streaming responses (스트리밍 응답에 사용) |

```typescript
// Most common pattern - @Auth() ensures JWT auth + entity isolation
// 가장 일반적인 패턴 - @Auth() 하나로 JWT 인증 + 엔티티 격리 보장
@Get()
@Auth()
async findAll(@CurrentUser() user: UserPayload) {
  // user.entityId로 데이터 격리 자동 적용
}

// Admin only (관리자 전용)
@Patch(':id/role')
@AdminOnly()
async updateRole() { ... }
```

### 7.4 UserPayload Interface (v2.0 Enhanced / v2.0 확장)

```typescript
interface UserPayload {
  userId: string;
  email: string;
  role: string;        // USER | MANAGER | ADMIN
  level: string;       // ADMIN_LEVEL | USER_LEVEL | CLIENT_LEVEL | PARTNER_LEVEL
  status: string;      // ACTIVE | PENDING | ...
  entityId: string;    // Affiliated entity ID (소속 법인 ID)
  cliId?: string;      // Client ID when CLIENT_LEVEL (CLIENT_LEVEL일 때 고객사 ID)
  partnerId?: string;  // Partner ID when PARTNER_LEVEL (PARTNER_LEVEL일 때 파트너 ID)
  timezone?: string;   // IANA timezone (IANA 타임존)
}
```

### 7.5 Invitation-Based Registration Flow (초대 기반 등록 플로우)

1. MANAGER+ user creates invitation specifying email/role/department/group (MANAGER+ 사용자가 이메일/역할/부서/그룹 지정하여 초대 생성)
2. System sends invitation email via nodemailer (with token link) (시스템이 nodemailer로 초대 이메일 발송, 토큰 포함 링크)
3. Recipient clicks link -> Registration page (email/dept auto-filled) (수신자가 링크 클릭 -> 회원가입 페이지, 이메일/부서 자동 입력)
4. On registration, invited role/dept/group auto-assigned, invitation status ACCEPTED (가입 완료 시 초대된 역할/부서/그룹 자동 할당, 초대 상태 ACCEPTED)

---

## 8. Multi-Tenancy (멀티테넌시) (v2.0 New / v2.0 신규)

### 8.1 Data Isolation Model (데이터 격리 모델)

```
┌────────────────────────────────────────────────┐
│  Entity (Corporation/Company / 법인/회사) - ent_id │
│  ┌──────────────────┐  ┌──────────────────────┐ │
│  │  Cell (Amoeba Cell)│  │  Unit (Dept/Team)    │ │
│  │  cel_id           │  │  unt_id              │ │
│  │  Visibility unit  │  │  Org hierarchy       │ │
│  │  (가시성 단위)      │  │  (조직 계층, 자기참조) │ │
│  └──────────────────┘  └──────────────────────┘ │
└────────────────────────────────────────────────┘
```

### 8.2 Data Visibility (데이터 가시성)

| Level (레벨) | Meaning (의미) | Example (예시) |
|------|------|------|
| **ENTITY** | Visible to entire entity (같은 법인 전체 열람 가능) | Announcements (공지사항) |
| **CELL** | Visible within same cell only (같은 셀 내에서만 열람) | Team issues, team meetings (팀 이슈, 팀 미팅) |
| **PRIVATE** | Visible to author only (작성자만 열람) | Personal todos (개인 할 일) |

### 8.3 OwnEntityGuard

A guard that **automatically ensures entity isolation** on all API requests.
모든 API 요청에서 **자동으로 법인 격리**를 보장하는 가드입니다.

```typescript
// @Auth() decorator automatically applies OwnEntityGuard
// @Auth() 데코레이터가 OwnEntityGuard를 자동 적용
// → Automatically compares requesting user's entityId with target resource's entityId
// → 요청 사용자의 entityId와 요청 대상 리소스의 entityId를 자동 비교
// → Returns 403 Forbidden on mismatch (불일치 시 403 Forbidden)
```

---

## 9. Internationalization - i18n (다국어) (v2.0 Enhanced / v2.0 확장)

### 9.1 Supported Languages (지원 언어) (v2.0: 3 languages / 3개국어)

| Code (코드) | Language (언어) | Status (상태) |
|------|------|------|
| `ko` | Korean (한국어) | Default/Fallback (기본/Fallback) |
| `en` | English (영어) | Included by default (기본 제공) |
| `vi` | **Vietnamese (베트남어)** | Added in v2.0 (v2.0 추가) |

### 9.2 Frontend Translation Structure (Namespace-based) (Frontend 번역 구조, 네임스페이스 기반)

```
src/global/i18n/locales/
├── ko/          # Korean (한국어)
│   ├── common.json
│   ├── auth.json
│   ├── {domain}.json   # Per-domain files (40+ namespaces) (도메인별 파일, 40+ 네임스페이스)
│   └── error.json
├── en/          # English (영어)
│   └── (same structure / 동일 구조)
└── vi/          # Vietnamese (베트남어)
    └── (same structure / 동일 구조)
```

### 9.3 i18n Configuration (React Project) (i18n 설정, React 프로젝트)

```typescript
// src/global/i18n/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Per-namespace imports (네임스페이스별 import)
import koCommon from './locales/ko/common.json';
import enCommon from './locales/en/common.json';
import viCommon from './locales/vi/common.json';
// ... per-domain imports (도메인별 import)

i18n.use(initReactI18next).init({
  resources: { ko: { common: koCommon, ... }, en: { common: enCommon, ... }, vi: { common: viCommon, ... } },
  lng: 'ko',
  fallbackLng: 'ko',
  ns: ['common', 'auth', 'dashboard', ...],  // Full namespace array (전체 네임스페이스 배열)
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});
```

### 9.4 Usage (사용법)

```typescript
// Single namespace (단일 네임스페이스)
const { t } = useTranslation('campaign');
<h1>{t('title.list')}</h1>

// Multiple namespaces (여러 네임스페이스)
const { t } = useTranslation(['campaign', 'common']);
<span>{t('common:button.save')}</span>
```

### 9.5 No Hardcoding Rule (MUST) (하드코딩 금지 규칙, 필수)

- **All UI text** must use translation files; direct string hardcoding in components is **prohibited** (모든 UI 텍스트는 번역 파일 사용, 컴포넌트에 직접 문자열 하드코딩 금지)
- When adding new namespaces, you **must register in i18n.ts** (import + resources + ns array) (새 네임스페이스 추가 시 반드시 i18n.ts에 등록: import + resources + ns 배열)
- Backend error messages stay in English (frontend translates based on error codes) (백엔드 에러 메시지는 영어 고정, 프론트에서 에러 코드 기반 번역)

---

## 10. Real-time Processing - SSE (실시간 처리) (v2.0 Enhanced / v2.0 확장)

### 10.1 Server-Sent Events Usage Areas (SSE 활용 영역)

| Area (영역) | Purpose (용도) | Description (설명) |
|------|------|------|
| AI Chat (AI 채팅) | Streaming response (스트리밍 응답) | Delivers Claude API responses in chunks (Claude API 응답을 청크 단위로 전달) |
| Notifications (알림) | Real-time notifications (실시간 알림) | Issue comments, todo changes, etc. (이슈 댓글, 할 일 변경 등) |
| Content Translation (콘텐츠 번역) | Translation progress (번역 진행 상태) | Progress tracking for multi-language translation (여러 언어 동시 번역 시 진행률) |
| Meeting Notes AI Analysis (회의록 AI 분석) | Analysis progress (분석 진행 상태) | AI summary/action item extraction (AI 요약/액션아이템 추출) |

### 10.2 Backend SSE Pattern (Backend SSE 패턴)

```typescript
@Sse('stream/:id')
@RequireAuth()  // SSE 전용 인증 데코레이터
stream(@Param('id') id: string): Observable<MessageEvent> {
  return this.service.getStream(id).pipe(
    map(data => ({ data: JSON.stringify(data) })),
  );
}
```

### 10.3 Frontend SSE Client (Frontend SSE 클라이언트)

```typescript
// SSE client utility (SSE 클라이언트 유틸리티)
const eventSource = new EventSource(`/api/v1/stream/${id}`, {
  headers: { Authorization: `Bearer ${token}` },
});

eventSource.onmessage = (e) => {
  const data = JSON.parse(e.data);
  setContent(prev => prev + data.text);
};

eventSource.onerror = () => { eventSource.close(); };
```

---

## 11. AI Integration (AI 통합) (v2.0 New / v2.0 신규)

### 11.1 Claude API Integration (Claude API 통합)

```
ClaudeService (Single Gateway / 단일 게이트웨이)
  ├── sendMessage()     ── Regular response (일반 응답)
  ├── streamMessage()   ── Streaming response via SSE (스트리밍 응답, SSE)
  └── checkQuotaIfNeeded() ── AI usage quota verification (AI 사용량 쿼터 검증)
```

### 11.2 AI Quota Management (AI 쿼터 관리)

- Daily/monthly token limits set per entity (법인별 일간/월간 토큰 한도 설정)
- `ClaudeService` auto-verifies quota before all AI calls (single gateway) (`ClaudeService`가 모든 AI 호출 전 쿼터 자동 검증, 단일 게이트웨이)
- Throws `BusinessException E4010(daily)/E4011(monthly)` on quota exceeded (초과 시 `BusinessException E4010(일간)/E4011(월간)` 발생)

### 11.3 AI Usage Areas (AI 활용 영역)

| Area (영역) | Feature (기능) | Description (설명) |
|------|------|------|
| Chat (채팅) | Department AI agents (부서별 AI 에이전트) | Specialization via system prompts (시스템 프롬프트로 전문 분야 설정) |
| Translation (번역) | Content translation (콘텐츠 번역) | Multilingual AI translation: ko/en/vi (ko/en/vi 다국어 AI 번역) |
| Analysis (분석) | Today analysis report (오늘 분석 리포트) | Daily work data AI analysis (일일 업무 데이터 AI 분석) |
| Issues (이슈) | AI review (AI 리뷰) | AI review of issue contents (이슈 내용 AI 검토) |
| Accounting (회계) | AI table analysis (AI 테이블 분석) | Accounting data AI analysis (회계 데이터 AI 분석) |
| KMS | Document generation (문서 생성) | Template-based AI document generation (템플릿 기반 AI 문서 생성) |
| Meeting Notes (회의록) | AI summary (AI 요약) | Auto-summary and action item extraction (회의록 자동 요약 및 액션아이템 추출) |

### 11.4 API Key Management (API 키 관리)

- Secure storage with **AES-256-GCM** encryption (AES-256-GCM 암호화로 API 키 안전 보관)
- Dual structure: per-entity and system-shared keys (per-entity -> system -> env fallback) (법인별/시스템 공유 키 이중 구조)
- Access via `ApiKeyService.getDecryptedKey(provider, entityId?)` (`ApiKeyService.getDecryptedKey(provider, entityId?)` 경유 사용)

---

## 12. External Service Integration (외부 서비스 연동) (v2.0 New / v2.0 신규)

### 12.1 Supported External Services (지원 외부 서비스)

| Service (서비스) | Purpose (용도) | Authentication (인증) |
|--------|------|------|
| **Google Drive** | File storage/sharing (파일 저장/공유) | Service Account |
| **Google Sheets** | Payroll/data export (급여/데이터 내보내기) | Service Account |
| **Popbill** | Korean e-tax invoice (한국 전자세금계산서) | API Key |
| **Slack** | Message integration (메시지 연동) | OAuth + Webhook |
| **Redmine** | Issue import (이슈 가져오기) | API Key |
| **Asana** | Task import (태스크 가져오기) | OAuth |
| **NICEPAY (VN)** | Payment gateway (결제 게이트웨이) | API Key (encrypted / 암호화) |
| **SMTP** (nodemailer) | Email sending (이메일 발송) | Account auth (encrypted / 계정인증, 암호화) |

### 12.2 External Integration Pattern (외부 연동 패턴)

```
src/infrastructure/external/
├── claude/         # AI API
├── google-drive/   # Google Drive/Sheets
├── popbill/        # E-tax invoice (전자세금계산서)
├── slack/          # Slack integration (Slack 연동)
└── {service}/      # Other external services (기타 외부 서비스)
```

---

## 13. Testing Strategy (테스트 전략)

| Type (유형) | Tool (도구) | Scope (범위) |
|------|------|------|
| Unit Test (단위 테스트) | Jest / Vitest | Service, Util |
| Integration Test (통합 테스트) | Jest + Supertest | Controller + Service |
| E2E Test (E2E 테스트) | Playwright | Key user scenarios (주요 사용자 시나리오) |
| Component Test (컴포넌트 테스트) | Storybook + Testing Library | UI components (UI 컴포넌트) |

---

## 14. Mock Data System (Mock 데이터 시스템)

### 14.1 MSW (Mock Service Worker)

```typescript
localStorage.setItem('{project}_mock_enabled', 'true');
window.location.reload();
```

### 14.2 Structure (구조)

```
src/global/mock/
├── index.ts          # Initialization (초기화)
├── handlers/         # API handlers (API 핸들러)
└── data/             # Mock data (Mock 데이터)
```

---

## 15. Deployment & Operations (배포 및 운영)

### 15.1 Environments (환경)

| Environment (환경) | Purpose (용도) | Branch (브랜치) |
|------|------|--------|
| Development (개발) | Development/Testing (개발/테스트) | `feature/*` |
| Staging (스테이징) | QA/Verification (QA/검증) | `main` |
| Production (프로덕션) | Live operations (운영) | `production` |

### 15.2 Deployment Scripts (배포 스크립트) (v2.0 Enhanced / v2.0 강화)

> Running `docker compose build` **directly is prohibited**. Always use `deploy-*.sh` scripts.
> `docker compose build` **직접 실행 금지**. 반드시 `deploy-*.sh` 스크립트 사용.

```bash
# Development (개발)
bash docker/dev/deploy-dev.sh

# Staging (SSH -> run on server) (스테이징, SSH -> 서버에서 실행)
ssh {staging-host} "cd ~/project && bash docker/staging/deploy-staging.sh"

# Production (SSH -> run on server) (프로덕션, SSH -> 서버에서 실행)
ssh {prod-host} "cd ~/project && bash docker/production/deploy-production.sh"
```

> **VITE Variable Caution:** `VITE_*` environment variables are inlined at build time. The deploy script passes `--env-file`, so running `docker compose build` directly will cause critical errors like CORS failures due to missing env vars.
> **VITE 변수 주의:** `VITE_*` 환경변수는 빌드 시점에 인라인됩니다. 배포 스크립트가 `--env-file`을 전달하므로, 직접 `docker compose build`를 실행하면 환경변수 누락으로 CORS 등 치명적 오류가 발생합니다.

### 15.3 PM2 (Node.js Process Management / Node.js 프로세스 관리)

```bash
pm2 start apps/api/dist/main.js --name api
pm2 restart api
```

---

## 16. Security Development Skills (보안 개발 스킬)

### 16.1 Input Validation Principles (입력 검증 원칙)

> **Never trust any user input.** Backend must validate; frontend validation is only for UX improvement.
> **모든 사용자 입력은 신뢰하지 않는다.** BE에서 반드시 검증하며, FE 검증은 UX 개선 목적으로만 사용합니다.

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
```

### 16.2 SQL Injection Prevention (SQL Injection 방지)

| Method (방식) | Safe? (안전 여부) |
|------|----------|
| TypeORM Repository methods (TypeORM Repository 메서드) | Safe (안전) |
| QueryBuilder parameter binding (QueryBuilder 파라미터 바인딩) | Safe (안전) |
| Raw Query parameter binding (Raw Query 파라미터 바인딩) | Safe (안전) |
| Direct string concatenation (문자열 직접 조합) | **Prohibited (금지)** |

### 16.3 XSS Prevention (XSS 방지)

```typescript
app.use(helmet());  // Auto-configures security headers (보안 헤더 자동 설정)
```

- React: JSX `{}` auto-escapes. Use of `dangerouslySetInnerHTML` is prohibited (React: JSX `{}` 자동 이스케이프. `dangerouslySetInnerHTML` 사용 금지)
- Vue.js: `{{ }}` auto-escapes. Use of `v-html` is prohibited (Vue.js: `{{ }}` 자동 이스케이프. `v-html` 사용 금지)

### 16.4 CSRF Prevention (CSRF 방지)

| Item (항목) | Setting (설정) |
|------|------|
| Cookie attribute (Cookie 속성) | `SameSite: Strict` or `Lax` (`SameSite: Strict` 또는 `Lax`) |
| HttpOnly | Required for Refresh Token cookie (Refresh Token 쿠키에 필수 적용) |

### 16.5 Rate Limiting

```typescript
ThrottlerModule.forRoot({ ttl: 60, limit: 10 });

@Throttle({ default: { ttl: 60, limit: 5 } })
@Post('auth/login')
async login() { ... }
```

### 16.6 Encryption (암호화) (v2.0 New / v2.0 신규)

| Target (대상) | Method (방식) | Usage Location (사용 위치) |
|------|------|----------|
| Password (비밀번호) | bcrypt (salt 12) | User Entity |
| API Key (API 키) | AES-256-GCM (scryptSync) | `CryptoService` |
| SMTP Password (SMTP 비밀번호) | AES-256-GCM | SMTP Settings |
| PG Key (PG 키) | AES-256-GCM | PG Configs |

```typescript
// CryptoService pattern (AES-256-GCM)
// CryptoService 패턴 (AES-256-GCM)
// Stored as 3 fields: encrypted + iv + tag
// encrypted + iv + tag 3개 필드로 저장
// Key derivation via scryptSync -> encrypt/decrypt
// scryptSync 키 도출 → 암호화/복호화
```

### 16.7 File Upload Security (파일 업로드 보안)

```typescript
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
}))
```

### 16.8 Security Checklist (보안 체크리스트)

| Item (항목) | Check Content (점검 내용) |
|------|----------|
| Input Validation (입력 검증) | class-validator DTO applied (class-validator DTO 적용 여부) |
| SQL Injection | Parameter binding used (파라미터 바인딩 여부) |
| XSS | Escaping, CSP headers (이스케이프, CSP 헤더) |
| Authentication (인증) | JWT expiry, HttpOnly Cookie (JWT 만료, HttpOnly Cookie) |
| Password (비밀번호) | bcrypt hashing (bcrypt 해싱) |
| Encryption (암호화) | Sensitive data encrypted with AES-256-GCM (API 키 등 민감정보 AES-256-GCM 암호화) |
| HTTPS | TLS 1.3 |
| CORS | Allowed domains specified (허용 도메인 명시) |
| Security Headers (보안 헤더) | helmet applied (helmet 적용) |
| Dependencies (의존성) | Periodic npm audit (npm audit 주기적 실행) |

---

## 17. Privacy Protection (개인정보보호)

### 17.1 Applicable Regulations (적용 법규)

| Regulation (법규) | Scope (적용 범위) |
|------|----------|
| **PIPA (Personal Information Protection Act / 개인정보보호법)** | Required for domestic services (국내 서비스 필수) |
| **GDPR** | When serving EU users (EU 대상 서비스 시) |
| **CCPA / CPRA (California Consumer Privacy Act)** | When serving US/California consumers (미국·캘리포니아 소비자 대상 시) — opt-out of sale/sharing, DSAR, delete |
| **Vietnam Data Protection Law (베트남 데이터보호법)** | When serving Vietnam (베트남 서비스 시) (v2.0 New / v2.0 추가) |

### 17.2 PII Handling (PII 처리)

| Item (항목) | Handling Method (처리 방법) |
|------|----------|
| Email/Phone (이메일/전화번호) | AES-256 encrypted storage (AES-256 암호화 저장) |
| Logs (로그) | PII masking (PII 마스킹) |
| Admin screens (관리자 화면) | PII masking, audit logs (PII 마스킹, 감사 로그) |
| Password (비밀번호) | bcrypt one-way hashing (bcrypt 단방향 해싱) |

### 17.3 Audit Log (감사 로그) (v2.0 New / v2.0 신규)

```
Records PII access in amb_access_audit_log table:
amb_access_audit_log 테이블로 PII 접근 기록:
  - aal_user_id: Accessing user (접근 사용자)
  - aal_action: Performed action (수행 액션)
  - aal_target_type: Target data type (대상 데이터 유형)
  - aal_ip_address: Access IP (접근 IP)
```

---

## Document History (문서 이력)

| Version (버전) | Date (일자) | Author (작성자) | Changes (변경 내용) |
|------|------|--------|-----------|
| v1.0 | 2026-02-12 | Amoeba Company | Initial creation (최초 작성) |
| v1.1 | 2026-02-12 | Amoeba Company | React + Vue.js dual framework support (React + Vue.js 듀얼 프레임워크 지원 반영) |
| v1.2 | 2026-02-13 | Amoeba Company | Added Security Development Skills and Privacy Protection sections (보안 개발 스킬, 개인정보보호 섹션 추가) |
| **v2.0** | **2026-03-23** | **Amoeba Company** | **AMB project best practices applied: Multi-tenancy (Entity/Cell/Unit), 4-level auth system (ADMIN/USER/CLIENT/PARTNER), 3 languages (ko/en/vi), AI integration (Claude+quota), 12 external service integrations, encryption (AES-256-GCM), Mapper pattern, QueryClient config, mandatory deploy scripts, enhanced schema migration rules (AMB 프로젝트 베스트 프랙티스 반영: 멀티테넌시, 4-레벨 인증 체계, 3개국어, AI 통합, 외부 서비스 연동 12종, 암호화, Mapper 패턴, QueryClient 설정, 배포 스크립트 필수화, 스키마 마이그레이션 규칙 강화)** |