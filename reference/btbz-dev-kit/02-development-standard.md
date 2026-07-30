# 개발 표준 (Development Standard) v2.0

> **버전**: 2.0 (2026-07-30) — 개발표준패키지 v1.1(2026-04-11) 업그레이드
> **기반**: AMA 실구현 (도메인 모듈 53개, 엔티티 240개, i18n 43+ 네임스페이스, 스테이징/프로덕션 이중 운영)

---

## 1. 기술 스택 표준

| 영역 | 기술 | 버전 | 비고 |
|------|------|------|------|
| Runtime | Node.js | 24.x | |
| 모노레포 | npm workspaces + Turborepo | 2.x | |
| Backend | NestJS + TypeORM | 10.x + 0.3.x | |
| DB | PostgreSQL (+pgvector +pg_trgm) | 15+ | |
| Frontend | React + TypeScript + Vite | 18.x + 5.x + 5.x | |
| 스타일 | TailwindCSS | 3.x | `darkMode: 'class'` 초기 설정 |
| 상태 | Zustand(persist) + TanStack Query | 4.x / 5.x | |
| 폼 | React Hook Form + Zod | | |
| i18n | i18next + react-i18next | | |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) | | 모델 ID env 오버라이드 필수 |
| 실시간 | SSE (Server-Sent Events) | | WebSocket 대비 단순, AI 스트리밍 최적 |
| 큐 | BullMQ + Redis | | ⚠️ 큐 이름에 `:` 금지, Worker `maxRetriesPerRequest=null` |
| 에디터 | Tiptap | 3.x | |
| 컨테이너 | Docker + Docker Compose | | |

기타: lucide-react(아이콘), sonner(토스트), dayjs, recharts, ExcelJS, PDFKit, Nodemailer/ImapFlow, Multer, DOMPurify, @nestjs/schedule, @nestjs/throttler.

---

## 2. 아키텍처 표준

### 2.1 레이어

```
Controller → Service → Repository(TypeORM)
```

- Controller: 검증/라우팅만. 비즈니스 로직 금지.
- Service: 비즈니스 로직 + 트랜잭션. TypeORM Repository 직접 주입이 기본(repository 폴더 분리는 커스텀 쿼리 多일 때만 — SHOULD).
- 순환 의존은 `forwardRef()` 허용(남용 금지).

### 2.2 멀티테넌시(다법인) 모델 — 설계 결정 사항

AMA에서 확정된 모델과, 드리프트로 인한 장애 경험:

1. **격리 축은 `ent_id`(법인)**. USER_LEVEL의 모든 데이터 접근은 `ent_id` WHERE 필터 필수 (01 문서 §3.2).
2. **계정 모델: (email, 법인)당 사용자 행 1개.** 한 이메일이 법인별로 별도 `{prj}_users` 행을 가진다(unique는 `(company, email)`). 법인 전환은 스위칭이 아니라 **법인별 재로그인**.
3. ⚠️ **역할 테이블과 사용자 테이블의 이원화 주의.** AMA는 로그인(=`amb_users.usr_company_id`)과 관리자 화면(=`amb_hr_entity_user_roles` 조인)이 서로 다른 모델을 봐서 "어드민엔 보이는데 로그인 안 됨"(EMAIL_NOT_FOUND) 사고가 났다. **신규 프로젝트는 처음부터 단일 정본을 정하고**, 역할 부여 시 대응 사용자 행 생성까지 원자적으로 처리한다.
4. 법인별 설정(통화, 국가, 테마 등)은 하드코딩 금지 — 법인 엔티티 컬럼 + 공통 유틸(`getEntityCurrencyOptions` 패턴)로 일반화. KRW/한국 기준 하드코딩이 다국가 확장 시 전면 수정을 유발했다.

### 2.3 권한 모델

- 전역 역할 계층(`ROLE_HIERARCHY` 숫자 비교) + 법인별 역할(entity-user-role) + **메뉴 권한**(menu_permissions) 3층.
- ⚠️ 메뉴 권한을 도입하면 **프론트 노출 제어만이 아니라 백엔드 가드로도 강제**해야 한다(AMA는 UI 전용으로 시작했다가 백엔드 일원화 재작업 발생).
- 도메인별 하드코딩 역할 검사(예: MANAGER만 유닛 필터)는 "등록했는데 안 보임"류 버그의 온상 — 메뉴 권한 + 법인 격리로 일원화 권장.

### 2.4 AI 통합 표준

```typescript
// 모델은 반드시 env 오버라이드
private readonly model = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
```

- SSE 스트리밍 응답 표준(`Content-Type: text/event-stream`, `data: {...}\n\n`, 종료 `data: [DONE]`).
- API 키 해석 우선순위를 **문서화**: AMA는 DB 공유키(ent_id NULL) 1순위 → env 폴백. 이 우선순위를 모르면 장애 진단이 산으로 간다(연결테스트 통과 ≠ 런타임 정상 — 테스트와 런타임이 다른 모델/키를 쓸 수 있음).
- AI 차단 경로(토큰 지갑, 일/월 쿼터)는 사용자에게 명시 에러로 표출. 업스트림 404/401은 관리자 알림 대상.
- 응답 언어는 `Accept-Language` 헤더로 제어.

### 2.5 실시간/알림

- 실시간은 SSE 유지(모바일 포함 — RN에서도 SSE + 푸시 병행).
- 시스템 발송 메일은 **단일 SMTP 정책**(AMA: Gmail SMTP 고정). 수신/발신 웹메일 엔진과 시스템 발송 채널을 분리한다.

---

## 3. DB 설계 표준

### 3.1 공통 컬럼 (모든 테이블)

```sql
{prefix}_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
{prefix}_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
{prefix}_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
{prefix}_deleted_at TIMESTAMPTZ  -- soft delete
```

### 3.2 인덱스 전략

| 패턴 | 적용 |
|------|------|
| FK 컬럼 | 전부 인덱스 |
| 자주 필터되는 status/type | BTREE |
| 날짜 범위 | created_at 등 BTREE |
| 텍스트 검색 | pg_trgm GIN |
| 벡터 | pgvector ivfflat |
| 법인별 시퀀스 번호 | ⚠️ `(ent_id, number)` 복합 유니크 (전역 유니크 금지) |

### 3.3 마이그레이션 정책 — MUST

```
개발:               synchronize: true 허용
스테이징/프로덕션:   synchronize: false + 수동 SQL 선적용
```

- `DB_SYNCHRONIZE` 환경변수로 명시 제어 (NODE_ENV 조건식 금지 — AMA에서 스테이징이 의도치 않게 `true`로 운영된 MUST 위반 발견).
- SQL 파일은 `sql/` 디렉터리, **멱등성(`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) 필수**, DROP/TRUNCATE는 리뷰 없이 금지.
- 적용 절차와 검증은 04 문서 §3 참조. 스키마 PR 규칙은 03 문서 §4 참조.

---

## 4. API 설계 표준

01 문서 §2.3~2.4와 동일 (Base `/api/v1`, 표준 응답, 페이지네이션 `limit`, 에러코드 순차 할당). 추가 결정 사항:

- 신규 라우트는 배포 검증의 기준점이 된다: **미인증 curl → 401 = 배포됨, 404 = 미배포** (04 문서 §4).
- 웹훅 수신 엔드포인트는 `@Public()` + **서명 검증**. ⚠️ 서명 검증 방식은 제공사 SDK의 실제 구현을 확인하고 구현한다(AMA Polar: 문서상 Svix 방식으로 추정 구현했다가 실제 HMAC 키 유도 방식이 달라 전 이벤트 검증 실패).

---

## 5. 환경/포트 표준

| 서비스 | 포트 (AMA 확정) |
|--------|-----------------|
| api | 3019 |
| portal-api | 3020 |
| web (Vite dev) | 5179 |
| portal-web (Vite dev) | 5180 |
| PostgreSQL | 5432 |

- 신규 프로젝트는 **로컬 다른 프로젝트와 충돌하지 않는 포트 대역을 초기에 확정**하고 CLAUDE.md·SPEC.md·INFRASTRUCTURE.md에 단일 표기(AMA는 3009→3019 변경 시 문서 불일치가 남아 진단 지적 사항이 됐다).
- 환경변수 파일: `env/backend/.env.development`(api 공용), `env/frontend/`, `env/portal-frontend/`. 스테이징/프로덕션 env는 **git 미포함, 서버 직접 관리**.
- ⚠️ `VITE_*` 변수는 빌드 시점 인라인 — 변경 시 이미지 재빌드 필수.

---

## 6. 문서화 표준

요구사항 워크플로우(REQ→PLN→구현→TCR→RPT), 버그수정(FIX), 대화 로그, 데일리 리포트 체계는 [claude/spec-guide.md](claude/spec-guide.md)에 통합 정리. 핵심 강제 사항 2가지:

1. ⚠️ **작업 계획서(PLN)에는 화면 구성도(ASCII 와이어프레임) 필수.** 없으면 미완성으로 간주(사용자 확정 규칙).
2. ⚠️ **계획서 승인 후에만 구현 착수.** 자동으로 구현을 시작하지 않는다.

---

## 7. 프로젝트 규모별 적용

| 규모 | 적용 |
|------|------|
| MVP | auth/members/settings + 도메인 2~3개, 단일 언어, dev Docker만 |
| 중규모 | + 메뉴권한/ACL, 도메인 5~10개, 다국어, 스테이징+프로덕션 |
| 대규모(AMA급) | 전체 표준 + Portal 아키텍처 + 전체 배포 파이프라인 |

단, 규모와 무관하게 처음부터 지키는 것: **ent_id 격리 패턴, synchronize 정책, 에러코드 체계, i18n 구조, 완료 피드백 UX** — 나중에 소급하는 비용이 훨씬 크다(AMA는 저장완료 안내 소급에만 120+ 지점 수정).

---

## 8. 기술 의사결정 기록 (ADR)

v1.1 ADR + AMA 후속 경험으로 추가/보강된 결정:

| 결정 | 근거 |
|------|------|
| SSE > WebSocket | 단방향 스트리밍 충분, 운영 단순, AI 응답 최적 (모바일 RN 전환에서도 유지 확정) |
| Zustand > Redux | 보일러플레이트 최소, persist 내장 |
| TypeORM > Prisma | NestJS 공식 통합, 마이그레이션 유연 — 단 §3.4(01 문서) 함정 규칙 필수 |
| UUID > Auto Increment | 분산 호환, ID 추측 불가 |
| Soft Delete > Hard Delete | 복구/감사/참조 무결성 |
| 3자 컬럼 prefix | 조인 시 명확성, 컬럼명 충돌 방지 (240 엔티티 검증) |
| snake_case 요청 / camelCase 응답 | DB 호환 + JS 컨벤션 양립 |
| 배포 스크립트 강제 | VITE 인라인/env 누락 차단 |
| **모델 ID env 오버라이드** | 모델 은퇴 시 무배포 교체 (2026-06-17 전역 장애 교훈) |
| **수동 SQL 선적용 > TypeORM auto-migration** | 운영 DB 변경을 명시 통제. 자동화하려면 deploy 스크립트에 pending migration 단계 추가 검토 |
| **법인별 재로그인 > 법인 스위칭** | JWT entityId 파생 단순화, 격리 검증 용이 — 대신 계정/역할 정본 단일화 필수 (§2.2-3) |
| **웹폰트 self-hosting** | CDN 차단 네트워크 대응 |
| **시스템 메일 = 단일 SMTP** | 웹메일 엔진 교체와 시스템 발송 안정성 분리 |

---

## 9. 신규 프로젝트 부트스트랩 체크리스트

### 초기화
- [ ] 모노레포 구조 생성 (01 문서 §1.1) + turbo.json + 루트 package.json(workspaces)
- [ ] 포트 대역 확정 → CLAUDE.md/SPEC.md 단일 표기
- [ ] `claude/CLAUDE.md.template` → 루트 CLAUDE.md (placeholder 치환)
- [ ] docs/ 구조 + `.gitignore`에 `docs/log/` 등록
- [ ] `.claude/skills/` 스킬 설치 (claude/skills-guide.md)

### 백엔드
- [ ] NestJS + TypeORM (`DB_SYNCHRONIZE` env 제어)
- [ ] JWT 인증 (Access 15m/Refresh 7d) + 데코레이터(@Auth/@Public/@Roles/@CurrentUser)
- [ ] OwnEntityGuard + resolveEntityId (멀티테넌시면 최우선)
- [ ] BusinessException + ERROR_CODE + TransformInterceptor + HttpExceptionFilter
- [ ] **Rate Limiting 실제 도입** (@nestjs/throttler — 명문화만 하지 말 것)
- [ ] CryptoService (AES-256-GCM 3-필드)
- [ ] 파일 업로드 (Multer, 10MB, MIME 화이트리스트) — ⚠️ 메타데이터만 저장하고 실파일 저장 누락하는 실수 주의
- [ ] Claude 연동 (모델 env 오버라이드 + SSE)
- [ ] 환경변수 검증 (@nestjs/config + Joi)

### 프론트엔드
- [ ] Vite + React + TS + TailwindCSS(`darkMode: 'class'`)
- [ ] i18n 초기화 (지원 언어 확정)
- [ ] Zustand 인증 스토어(persist) + Axios 인스턴스(401 race-safe refresh)
- [ ] 라우터 + AuthGuard
- [ ] 완료 피드백 표준 컴포넌트 확정 (toast 또는 AlertModal — 앱당 1개)
- [ ] 웹폰트 self-hosting

### 인프라
- [ ] docker/{dev,staging,production} + deploy-*.sh (04 문서 §2 요구사항 반영)
- [ ] Dockerfile deps 스테이지에 네이티브 빌드툴(`python3 make g++`) 포함 (⚠️ bcrypt 소스 컴파일 대비)
- [ ] GitHub 브랜치 보호 (main/production, 승인 1+) + check-branch-protection.sh
- [ ] 서버 SSH alias, DB 컨테이너 명명 규칙 확정 → CLAUDE.md 기록
