# Code Convention v3.0

> **버전**: 3.0 (2026-07-30) — v2.1(2026-04-11) 업그레이드
> **변경 요지**: AMA 실구현 진단(개발표준 V2 추천안, 2026-06-14) 정정 8건 반영 + 실전 장애에서 도출된 MUST 규칙 추가
> ⚠️ 표시 = AMA에서 실제 장애/반복 함정으로 확인된 항목

---

## 1. 프로젝트 구조

### 1.1 모노레포 구조

```
{project}/
├── apps/
│   ├── api/              # NestJS 백엔드
│   ├── web/              # React 프론트엔드
│   ├── portal-api/       # (선택) SaaS 포털 API
│   ├── portal-web/       # (선택) SaaS 포털 웹
│   └── mobile/           # (선택) React Native(Expo)
├── packages/
│   ├── types/            # 공유 TypeScript 타입
│   ├── common/           # 공유 유틸리티/상수
│   └── portal-shared/    # (선택) 포털 공유 코드
├── docker/{dev,staging,production}/
├── env/{backend,frontend,portal-frontend}/
├── spec/                 # 기술 명세 문서
├── docs/                 # 프로젝트 문서 (claude/spec-guide.md 참조)
├── sql/                  # DB 마이그레이션 SQL
├── scripts/              # 유틸리티 스크립트
├── .claude/skills/       # Claude 스킬 (claude/skills-guide.md 참조)
├── CLAUDE.md             # AI 에이전트 지침
└── SPEC.md               # 프로젝트 명세서
```

- `apps/mobile`, `packages/portal-shared`는 v2.1에서 "선택"이었으나 AMA에서 실운영 검증됨 — 필요 시 정식 채택.
- ⚠️ **모바일 워크스페이스 격리**: React Native 의존성이 웹/API Docker 빌드에 유입되면 빌드가 깨진다. `apps/mobile`은 루트 워크스페이스에서 격리하거나(AMA REQ-260705 방식) Dockerfile `npm ci` 스코프를 명시한다.

### 1.2 백엔드 구조 (NestJS)

```
apps/api/src/
├── main.ts / app.module.ts
├── domain/{module}/
│   ├── {module}.module.ts
│   ├── controller/  service/  entity/
│   ├── dto/request/ (snake_case)  dto/response/ (camelCase)
│   ├── guard/ mapper/ constant/   # 필요 시
│   └── interface/
├── infrastructure/       # 외부 서비스 연동 (claude, mail, file, ...)
├── global/               # constant, decorator, guard, filter, interceptor, pipe
└── database/             # DB 설정/시드/migrations
```

- **repository/ 폴더는 SHOULD** (v2.1은 사실상 MUST 뉘앙스였으나 완화): 커스텀 쿼리가 많을 때만 분리하고, 일반적으로는 서비스에서 `@InjectRepository()` 직접 사용. AMA 53개 모듈 실측 결과 이것이 실용적 표준.

### 1.3 프론트엔드 구조 (React)

```
apps/web/src/
├── domain/{module}/
│   ├── components/ pages/ hooks/ service/ store/
├── components/{common,ui}/
├── global/{store,layout,error}/
├── router/  lib/  locales/{en,ko,vi}/
└── i18n.ts
```

---

## 2. 네이밍 규칙

### 2.1 파일 네이밍

| 대상 | 규칙 | 예시 |
|------|------|------|
| React 컴포넌트/페이지 | PascalCase(.tsx), 페이지는 `Page` suffix | `ChatPage.tsx` |
| NestJS controller/service/module/entity/guard | kebab-case + 역할 suffix | `project-ai.service.ts` |
| DTO | kebab-case.request/response.ts | `login.request.ts` |
| Zustand 스토어 | kebab-case.store.ts | `auth.store.ts` |
| 커스텀 훅 | use + PascalCase.ts | `useChat.ts` |
| i18n 번역 | camelCase.json | `clientPortal.json` |
| SQL | kebab-case.sql | `client-portal-migration.sql` |

### 2.2 DB 네이밍

```
테이블:      {prj}_{domain}_{복수형_snake_case}   예: amb_users, amb_hr_employees
컬럼:        {3자_접두사}_{snake_case}            예: usr_email, pjt_title
PK:          {접두사}_id (UUID v4)
FK:          원본 테이블 PK 컬럼명 그대로          예: usr_id, ent_id
Soft Delete: {접두사}_deleted_at (TIMESTAMPTZ NULL)
생성/수정일:  {접두사}_created_at / _updated_at (TIMESTAMPTZ NOT NULL DEFAULT NOW())
Boolean:     {접두사}_is_{형용사}                 예: ntc_is_pinned
암호화 3-필드: {컬럼}_encrypted / _iv / _tag       (AES-256-GCM)
```

- 3자 접두사는 프로젝트 내 유일. 도메인 하위 그룹은 테이블 prefix로 구분(`amb_hr_*`, `amb_bil_*`, `amb_talk_*` 등) — AMA 240개 엔티티 전수 일치 검증됨.

### 2.3 API 네이밍·응답

```
Base Path:   /api/v1
리소스:      복수형 kebab-case            /api/v1/expense-requests
중첩:        2단계까지                    /api/v1/projects/:id/members
액션:        비-REST 동사 허용             /api/v1/auth/login
Request DTO:  snake_case / Response DTO: camelCase
```

**표준 응답** (`TransformInterceptor` 전역 래핑):

```typescript
// 성공
{ success: true, data: {...}, timestamp: '...' }
// 에러 (HttpExceptionFilter 표준화)
{ success: false, error: { code: 'E1001', message: '...', details: [] }, timestamp: '...' }
```

**페이지네이션 (v3.0 확정)** — v2.1의 `size`가 아니라 **`limit`** 사용 (실구현 다수결 기준 정정):

```typescript
{ success: true, data: { items: [...], page: 1, limit: 20, totalCount: 100, totalPages: 5, hasNext: true, hasPrev: false } }
```

### 2.4 에러 코드 체계

| 범위 | 도메인 |
|------|--------|
| E1xxx | 인증/인가 |
| E2xxx~E9xxx | 기본 모듈 (사용자, 대화, 에이전트, 시스템 E9xxx) |
| E10xxx~E29xxx | 업무 모듈 (AMA 실측: 프로젝트 E21, 이슈 E23, 번역 E24, 자산 E25, 캘린더 E26, CMS E27, 결제 E28, 구독 E29) |
| E30xxx~ | 신규 모듈 — **기존 최대값+1000 범위 순차 할당** |

---

## 3. 백엔드 규칙 (NestJS + TypeORM)

### 3.1 인증/인가 데코레이터 (v3.0 정정)

v2.1 문서의 `@AdminOnly()/@PartnerOnly()/@RequireAuth()` 등은 실코드와 불일치했다. **실제 표준 명칭**:

| 데코레이터/가드 | 역할 |
|----------------|------|
| `@Auth()` | 인증 + 상태 검증 (JwtAuthGuard + LevelRoleGuard 합성) |
| `@Public()` | 인증 완전 우회 (로그인/회원가입/웹훅) |
| `@Roles('MANAGER')` + `RolesGuard` | 역할 계층 기반 접근 (ROLE_HIERARCHY 숫자 비교) |
| `@CurrentUser()` | UserPayload 주입 |
| `OwnEntityGuard` | USER_LEVEL 법인 범위 접근 제어 (§3.2) |
| `MasterOrAdminGuard` | 법인 MASTER 또는 전사 관리자 |
| `ClientGuard` / `ClientReadOnlyGuard` | CLIENT_LEVEL 격리 / 읽기전용(비-GET 403) |

**규칙**: 가드 조합이 3회 이상 반복되면 합성 데코레이터로 래핑해 명칭을 표준화한다(신규 개발자 오적용 방지).

### 3.2 멀티테넌시(법인) 격리 — MUST

⚠️ **`ent_id` 필터 누락 = 타 법인 데이터 노출 = 보안 사고.** 신규 엔드포인트마다 반드시 적용.

```typescript
@Get('list')
@Auth()
@UseGuards(OwnEntityGuard)
async getList(
  @Query('entity_id') queryEntityId: string | undefined,
  @CurrentUser() user: UserPayload,
) {
  const entityId = resolveEntityId(queryEntityId, user); // query 우선 → JWT fallback
  return this.service.findByEntity(entityId);            // WHERE에 entityId 필수
}
```

- `ADMIN_LEVEL`은 `OwnEntityGuard`에서 자동 바이패스.
- 사용자 레벨: `ADMIN_LEVEL`(전체) / `USER_LEVEL`(소속 법인, 격리 필수) / `PARTNER_LEVEL` / `CLIENT_LEVEL`.
- ⚠️ 통계/집계성 신규 엔드포인트에서 격리 누락이 자주 발생한다(AMA monthly-summary 사례). 목록 API뿐 아니라 **모든 조회 경로**에 적용.

### 3.3 엔티티 패턴

```typescript
@Entity('amb_projects')
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'pjt_id' })
  pjtId: string;

  @Column({ name: 'pjt_title', type: 'varchar', length: 200 })
  pjtTitle: string;

  @Column({ name: 'pjt_memo', type: 'varchar', length: 500, nullable: true })
  pjtMemo: string | null;   // ⚠️ 유니언 타입은 type 명시 필수 (§3.4-1)

  @CreateDateColumn({ name: 'pjt_created_at', type: 'timestamptz' })
  pjtCreatedAt: Date;

  @UpdateDateColumn({ name: 'pjt_updated_at', type: 'timestamptz' })
  pjtUpdatedAt: Date;

  @DeleteDateColumn({ name: 'pjt_deleted_at', type: 'timestamptz' })
  pjtDeletedAt: Date | null;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'usr_id' })
  owner: UserEntity;
}
```

### 3.4 TypeORM 필수 규칙 (실전 장애 기반) — MUST

1. ⚠️ **유니언 TS 타입 컬럼은 `type` 명시 필수.** `pjtMemo: string | null`을 `type` 없이 선언하면 TypeORM이 `Object`로 추론 → `DataTypeNotSupportedError` → **DataSource 초기화 실패 → API 부팅 크래시**(AMA 2026-07-11 스테이징 502 장애). `tsc`는 이 오류를 못 잡는다 — 엔티티 변경 시 **실제 부팅**(`Nest application successfully started` 로그)까지 확인.
2. ⚠️ **동일 FK 컬럼에 `@Column` + `@JoinColumn` 중복 매핑 금지.** `@Column({name:'exr_id'}) exrId`와 `@ManyToOne @JoinColumn({name:'exr_id'})`를 동시에 두면 insert 시 FK가 NULL로 저장되는 경로가 생긴다(AMA 지출결의 500). 관계만 두거나, 둘 다 필요하면 저장 시 관계를 명시적으로 설정.
3. ⚠️ **법인별 시퀀스 번호는 복합 유니크.** `EXP-yyyymm-NNNN`류 번호를 법인별로 생성하면 유니크 제약도 `(ent_id, number)` 복합이어야 한다(전역 단일 유니크면 타 법인과 충돌 → 500). 다음 번호는 `count+1` 금지(삭제 공백 시 충돌) → **최대 시퀀스+1**.
4. ⚠️ **soft delete는 `softDelete(id)` 우선.** `softRemove(entity)`는 로드된 관계에 cascade가 걸려 의도치 않은 500을 유발할 수 있다(AMA 캘린더 반복일정 사례).
5. **운영 환경 `synchronize: false` — 스테이징 포함** (v2.1의 `NODE_ENV !== 'production'` 조건은 MUST 위반으로 판정됨). `DB_SYNCHRONIZE` 환경변수로 명시 제어하고 개발 환경만 `true`.

### 3.5 서비스/에러 처리

```typescript
throw new BusinessException(ERROR_CODE.PROJECT_NOT_FOUND, HttpStatus.NOT_FOUND);
```

- 백엔드 에러 메시지는 **영어 고정** (프론트에서 에러 코드 기반 번역).
- ⚠️ **4xx는 서버 로그에 남지 않는 것이 기본** (500+만 기록). "로그에 에러 없음 ≠ 요청 성공." 거부성 가드에는 `logger.warn`으로 거부 사유를 남기는 것을 권장.

### 3.6 외부 시스템 연동 규칙

- ⚠️ **외부 시스템 리소스 명칭 하드코딩 금지.** IMAP 폴더명을 `Sent`/`Trash`로 하드코딩했다가 실제 서버가 `Sent Items`/`Deleted Items`를 쓰면서 48시간 동안 19,000회 동기화 실패(AMA 웹메일). 표준 발견 메커니즘(IMAP special-use 등)으로 해석하거나 설정화한다.
- ⚠️ **AI 모델 ID는 환경변수 오버라이드 필수.** 하드코딩된 모델이 은퇴하면 전 기능 중단(AMA 2026-06-17 전역 장애, 404 not_found). `process.env.CLAUDE_MODEL || DEFAULT_MODEL` 패턴으로 무배포 교체 가능하게.
- **자격증명 저장은 AES-256-GCM 3-필드**(`_encrypted/_iv/_tag`) + 표시용 last4 힌트. 단 ⚠️ last4 힌트는 실값과 어긋날 수 있으니(입력 검증 없이 저장된 경우) 장애 진단 시 **복호화 검증**이 정본.
- 외부 토큰/시크릿은 입력 시점에 **형식 검증**(prefix, 길이)을 걸어 더미값 저장을 차단한다(AMA Polar 더미 토큰 인시던트).

---

## 4. 프론트엔드 규칙 (React + TypeScript)

### 4.1 상태 관리

| 도구 | 용도 |
|------|------|
| Zustand + persist | 전역 영속 (인증, 선택 법인, 설정) |
| React Query | 서버 상태 + 캐시 무효화 |
| URL searchParams | 페이지네이션, 필터, 검색어 |
| useState | 로컬 UI (모달, 폼) |

⚠️ **store stale 주의**: 서버에서 갱신된 값이 persist된 스토어에 가려 화면에 반영 안 되는 버그가 반복됨(AMA 참조통화 미노출). 서버가 정본인 값은 로그인/진입 시점 재조회로 동기화.

### 4.2 i18n — MUST

1. UI 텍스트 하드코딩 금지 → `useTranslation()` + `t()`.
2. 네임스페이스 = 도메인 모듈 단위, 새 네임스페이스는 `i18n.ts` 등록 필수.
3. 지원 언어 전체(en/ko/vi) 동시 작성.
4. AI 응답 언어는 `Accept-Language` 헤더로 제어.

### 4.3 UX 규칙: 데이터 변경 피드백 필수 — MUST

⚠️ 모든 저장/수정/생성/삭제 후 **반드시 완료 안내를 표시**한다. 조용한 성공 처리 금지(사용자가 중복 클릭하거나 실패로 오해 — AMA 전 도메인 소급 적용까지 간 확정 규칙).

- 성공: 성공 안내 (자동 닫힘 3초) / 실패: 에러 상세 (수동 닫기)
- 구현은 **앱 관례를 따른다**: AMA 기준 web = `sonner` `toast.success(t('common:saveSuccess'))`, portal-web = `AlertModal`(+`ModalState`). 신규 프로젝트는 시작 시점에 앱별 표준 컴포넌트 1개를 정하고 통일.
- 공통 메시지 키 재사용: `common:saveSuccess/createSuccess/updateSuccess/deleteSuccess/submitSuccess/sendSuccess`.
- 예외 허용: 삭제 후 navigate, 토글, 실시간 반영 등 결과가 즉시 자명한 경우.

### 4.4 API 클라이언트

- Axios 인스턴스 단일화. 요청 인터셉터: `Authorization`, `Accept-Language`, `X-Timezone`, `X-Entity-Id`.
- 401 자동 refresh는 **Race Condition 방지**(isRefreshing 플래그 + subscriber 큐) 포함.

### 4.5 타임존·다크모드

- 서버 UTC(TIMESTAMPTZ) 저장, 표시 시 사용자 타임존 변환. 날짜 전용 필드(생년월일 등)는 DATE 타입, 변환 없음. 타임존 목록은 `Intl.supportedValuesOf('timeZone')` 전체 + 백엔드 검증.
- 다크모드를 지원하려면 `tailwind.config.js`에 `darkMode: 'class'` + 사용자 토글을 **처음부터** 설계. 방치하면 기본 `'media'`(OS 설정)로 동작해 `dark:` 커버리지 불완전 페이지가 깨져 보인다(AMA 함정).

### 4.6 폰트/외부 리소스

⚠️ 웹폰트는 **self-hosting**(동일 오리진). CDN(jsdelivr 등)은 일부 네트워크에서 차단되어 최초 로그인 실패까지 유발했다(AMA Pretendard 사례).

---

## 5. 보안 규칙

| 항목 | 설정 |
|------|------|
| 비밀번호 해싱 | bcrypt, salt rounds 12 |
| JWT | Access 15분 / Refresh 7일 (httpOnly cookie) |
| Rate Limiting | `@nestjs/throttler` — 로그인 5req/60s, 일반 60req/60s. **명문화만 하지 말고 실제 도입 확인**(AMA는 표준 주장과 달리 미구현 상태로 발견됨) |
| API 키/시크릿 | AES-256-GCM 3-필드 암호화 |
| 파일 업로드 | 10MB 제한, MIME 화이트리스트, UUID 파일명 |
| HTML | DOMPurify sanitize |
| CORS | 허용 도메인 명시 (와일드카드 금지) |
| SQL Injection | TypeORM 파라미터 바인딩 (raw query 금지) |

역할 계층: `CLIENT_MEMBER(0) < CLIENT_ADMIN(0) < USER(1) < MANAGER(2) < ADMIN(3) < SUPER_ADMIN(4)`

---

## 6. 코드 품질

- TypeScript strict 모드 (BE/FE 공통).
- ESLint: `no-explicit-any: error`, unused-vars(`^_` 허용), `no-console`(warn/error 허용).
- Prettier: semi, singleQuote, printWidth 100, trailingComma all.
- 테스트: 핵심 도메인(auth·billing·멀티테넌시 격리) 우선 커버리지 목표 설정. AMA 실측 ≈5%는 미흡 판정 — 신규 프로젝트는 시작부터 격리 로직 테스트를 강제.

---

## 부록: 신규 도메인 모듈 체크리스트

### 백엔드
- [ ] `domain/{module}/` 생성 + `{module}.module.ts` AppModule 등록
- [ ] Entity (3자 접두사, UUID PK, soft delete, **유니언 타입 컬럼 type 명시**)
- [ ] Request(snake_case)/Response(camelCase) DTO
- [ ] Controller: `@Auth()` + `OwnEntityGuard` + `resolveEntityId` (USER_LEVEL 데이터면 MUST)
- [ ] 에러 코드 범위 할당 (`ERROR_CODE`)
- [ ] SQL 마이그레이션 파일 작성 (`sql/`) — 멱등성(`IF NOT EXISTS`) 확보
- [ ] **로컬 API 실부팅 확인** (tsc 통과 ≠ 부팅 성공)

### 프론트엔드
- [ ] `domain/{module}/` 생성 (pages/components/hooks/service/store)
- [ ] i18n 3개 언어 + `i18n.ts` 등록
- [ ] 라우트 + 가드, 메뉴/사이드바 등록
- [ ] 저장/수정/삭제 완료 피드백 (toast/모달)

### 공통
- [ ] `packages/types/` 공유 타입
- [ ] SPEC.md 갱신 (테이블, API, 에러코드)
- [ ] 스키마 변경 PR이면 본문에 `## Migration` 섹션 (03 문서 참조)
