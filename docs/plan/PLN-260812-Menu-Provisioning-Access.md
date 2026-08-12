# PLN-260812-Menu-Provisioning-Access

테넌트별 제공 메뉴(어드민) + 팀원별 메뉴 접근권한(테넌트) 구현 계획.

- 작성일: 2026-08-12
- 선행: `docs/analysis/REQ-260812-Menu-Provisioning-Access.md`
- 승인 전 구현 착수 금지(CLAUDE.md §7)

---

## 1. 설계 결정 요약

| # | 결정 | 이유 |
|---|---|---|
| D1 | 메뉴 카탈로그의 **단일 출처는 백엔드 상수**, 프론트는 API로 받아 쓴다 | `apps/web` 는 `@ivy/types`(CJS)를 타입 전용으로만 임포트 가능 — 런타임 공유 상수 불가(REQ G7) |
| D2 | 플랜 프리셋은 **코드 상수**, DB에는 **오버라이드만** 저장 | 프리셋 편집 UI는 비범위. 행 부재 = "플랜 따름" 이라 3상태가 자연스럽게 표현됨 |
| D3 | 죽은 `roles_permissions` 를 되살리지 않고 **tenant_id 있는 신규 테이블 3개** | 해당 테이블은 tenant_id가 없어 테넌트별 오버라이드가 구조적으로 불가(REQ 1.5) |
| D4 | 유효 메뉴는 **서버가 계산**해 `GET /menu-access/me` 로 전달 | 프론트 계산은 곧 우회 가능한 장식. 서버 차단(FR-MP11)과 같은 판정을 공유해야 함 |
| D5 | 서버 차단은 **`@RequireMenu()` 컨트롤러 데코레이터 + 가드** | 기존 `AuthorizationGuard` 와 같은 방식이라 배우거나 예외를 만들 것이 없음 |
| D6 | **master는 사용자 예외/직급 매트릭스의 대상이 아니다** | 테넌트 자기잠금 방지(NFR-3). 기존 `userCan` 의 master 라벨 우회와 동일 원칙 |
| D7 | 신규 백엔드 도메인 `menu-access` 로 격리 | tenant/user 양쪽에서 쓰는 교차 관심사. 한쪽에 얹으면 순환 의존 |

---

## 2. 데이터 모델

### 2.1 메뉴 카탈로그 (코드 상수 · 16개)

`packages/types/src/domain/menu.types.ts` 신규.

| code | path | labelKey | 라벨 게이팅 | 비고 |
|---|---|---|---|---|
| `dashboard` | /dashboard | dashboard | — | |
| `live_chat` | /live-chat | liveChat | consult | |
| `issues` | /issues | issueBoard | consult | + `workflow_mode` AND |
| `history` | /history | history | consult | |
| `work_log` | /work-log | workLog | — | |
| `statistics` | /statistics | statistics | — | |
| `ai_settings` | /ai-setting | aiSettings | — | |
| `knowledge` | /knowledge | knowledge | operations | |
| `products` | /products | products | operations | |
| `customers` | /customers | customers | operations | |
| `orders` | /orders | orders | operations | |
| `campaigns` | /campaigns | campaigns | operations | |
| `reviews` | /reviews | reviews | operations | |
| `users` | /users | users | — | |
| `settings` | /settings | settings | — | |
| `privacy_notice` | /privacy-notice | privacyNotice | — | |

`labelKey` 는 기존 `nav` i18n 네임스페이스 키 그대로 — 메뉴 이름 번역을 새로 만들지 않는다.

### 2.2 플랜 프리셋 (초안 — REQ Q1)

| plan | 제공 메뉴 |
|---|---|
| `starter` (9) | dashboard, live_chat, history, knowledge, customers, orders, users, settings, privacy_notice |
| `growth` (15) | starter + work_log, statistics, ai_settings, products, campaigns, reviews |
| `enterprise` (16) | 전체 |
| `NULL` / 미지의 값 | **전체** (무회귀, FR-MP5) |

### 2.3 테이블 3종 (`sql/migration_menu_access.sql`)

```sql
-- ① 어드민: 테넌트별 제공 메뉴 오버라이드 (행 부재 = 플랜 따름)
CREATE TABLE `tenant_menus` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `menu_code` varchar(32) NOT NULL,
  `provided` tinyint(1) NOT NULL,           -- 1=강제 제공, 0=차단
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_menu` (`tenant_id`,`menu_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ② 테넌트: 직급별 기본 접근 (행 부재 = 코드 기본 매트릭스)
CREATE TABLE `tenant_role_menus` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `rank` varchar(16) NOT NULL,              -- master/director/manager/staff (예약어 → 백틱)
  `menu_code` varchar(32) NOT NULL,
  `allowed` tinyint(1) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_rank_menu` (`tenant_id`,`rank`,`menu_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ③ 테넌트: 사용자 예외 (행 부재 = 직급 기본값)
CREATE TABLE `tenant_user_menus` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `menu_code` varchar(32) NOT NULL,
  `allowed` tinyint(1) NOT NULL,            -- 1=허용 예외, 0=차단 예외
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_user_menu` (`tenant_id`,`user_id`,`menu_code`),
  KEY `idx_tum_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

세 테이블 모두 `tenant_id` 를 갖는다(CLAUDE.md §2 멀티테넌시). 엔티티는 nullable 컬럼이 없어 `type` 누락으로 인한 부팅 크래시 위험은 낮지만, 엔티티 추가 후 실제 부팅(`Nest application successfully started`) 확인은 필수.

### 2.4 판정 로직 (`packages/common/src/rbac/menu-access.ts`)

```ts
resolveProvidedMenus(plan, overrides): MenuCode[]
resolveEffectiveMenus({ provided, rank, labels, roleRows, userRows }): MenuCode[]
```

REQ §3 규칙을 그대로 구현한 순수 함수 2개. DB/Nest 의존 없음 → 단위 테스트가 쉽고, 서버 가드와 조회 API가 같은 함수를 쓴다.

### 2.5 캐시

- Redis `menuacc:v:{tenantId}` = 테넌트 권한 버전(정수). 세 쓰기 API가 `INCR`.
- Redis `menuacc:u:{userId}:{version}` = 유효 메뉴 배열, TTL 300s.
- Redis 불가 시 매번 DB 계산(기존 로그인 리미터와 같은 degrade-open 방침). 쿼리 3건·인덱스 적중이라 감당 가능.

---

## 3. 와이어프레임

### 3.1 어드민 — `/admin/tenants` 행 액션 추가

```
┌ 테넌트 관리 ───────────────────────────────────────────────────────────────────┐
│  이름      슬러그   도메인            플랜    상태   사용자                     │
│  IVY USA   /ivyusa  ivyusa.myshop…   growth  활성   7      [제공 메뉴][사용자 관리][정지] │
│  amoebaorder /amb   amb.cafe24.com   starter 활성   3      [제공 메뉴][사용자 관리][정지] │
└────────────────────────────────────────────────────────────────────────────────┘
                                                          ↑ 신규 버튼
```

### 3.2 어드민 — 제공 메뉴 모달

```
┌ 제공 메뉴 · IVY USA ──────────────────────────────────────────── ✕ ┐
│ 플랜 [growth] · 플랜 기본 제공 15 / 16                            │
│ 플랜을 따르는 항목은 플랜이 바뀌면 함께 바뀝니다.                  │
│                                                                    │
│  메뉴              플랜 기본   이 테넌트                            │
│  ──────────────────────────────────────────────────────────────    │
│  대시보드            제공      [ 플랜 따름  ▾ ]   → 제공            │
│  실시간 상담         제공      [ 플랜 따름  ▾ ]   → 제공            │
│  이슈 보드          미제공     [ 강제 제공  ▾ ]   → 제공 ⚑         │
│  대화 이력           제공      [ 플랜 따름  ▾ ]   → 제공            │
│  작업 로그           제공      [ 차단      ▾ ]   → 미제공 ⚑        │
│  통계                제공      [ 플랜 따름  ▾ ]   → 제공            │
│  …                                                                 │
│  개인정보 고지       제공      [ 플랜 따름  ▾ ]   → 제공            │
│                                                                    │
│  ⚑ = 플랜과 다른 예외 (2건)                                        │
│  ⚠ 이슈 보드는 워크플로우 모드가 base면 제공해도 안내만 표시됩니다. │
│                                          [ 취소 ]  [ 저장 ]        │
└────────────────────────────────────────────────────────────────────┘
```

- 3상태 셀렉트: `플랜 따름`(행 삭제) / `강제 제공`(provided=1) / `차단`(provided=0).
- 오른쪽 `→ 제공/미제공` 은 계산된 결과를 즉시 보여주는 읽기 전용 열 — 저장 전에 결과를 확인할 수 있어야 한다.

### 3.3 테넌트 — `/settings` 신규 섹션 (마스터에게만 표시)

```
┌ 메뉴 접근권한 ─────────────────────────────────────────────────────────────┐
│ 팀원이 볼 수 있는 메뉴를 정합니다. 회색 처리된 메뉴는 플랜에 포함되지 않아 │
│ 지금은 사용할 수 없습니다.                                                 │
│                                                                            │
│  [ 역할 기본값 ]  [ 사용자 예외 ]                                          │
│  ───────────────                                                           │
│              대시  실시간  이슈  이력  작업  통계  AI  지식  상품  …  설정  │
│   마스터      ●     ●      ●    ●    ●    ●   ●   ●    ●        ●    │
│   디렉터      ☑     ☑      ☑    ☑    ☑    ☑   ☑   ☑    ☑        ☐    │
│   매니저      ☑     ☑      ☑    ☐    ☐    ☑   ☑   ☑    ☑        ☐    │
│   스태프      ☑     ☑      ☐    ☐    ☐    ☐   ☐   ☐    ☐        ☐    │
│                                        ▨ 작업로그 = 미제공(플랜)           │
│                                                                            │
│   ● 마스터는 제공된 모든 메뉴에 접근합니다(잠금 방지).                     │
│   ⓘ 실시간·이력·이슈는 '상담' 라벨 보유자에게만 보입니다. 라벨과 무관하게  │
│     열어주려면 [사용자 예외]에서 지정하세요.                               │
│                                                        [ 저장 ]            │
└────────────────────────────────────────────────────────────────────────────┘
```

```
┌ 메뉴 접근권한 ─────────────────────────────────────────────────────────────┐
│  [ 역할 기본값 ]  [ 사용자 예외 ]                                          │
│                   ───────────────                                          │
│   이름 / 이메일          직급      예외                                    │
│   ────────────────────────────────────────────────────────────────         │
│   kim@ivyusa.com        매니저    이력 +허용 · 설정 −차단   [ 편집 ]       │
│   lee@ivyusa.com        스태프    —                          [ 편집 ]       │
│   park@ivyusa.com       디렉터    —                          [ 편집 ]       │
│   dev@amoeba.group      마스터    (예외 대상 아님)                         │
└────────────────────────────────────────────────────────────────────────────┘

┌ 예외 편집 · kim@ivyusa.com (매니저) ───────────────────────── ✕ ┐
│  메뉴            직급 기본   이 사용자                          │
│  ─────────────────────────────────────────────────────────     │
│  대시보드          허용     [ 기본 따름 ▾ ]  → 접근 가능        │
│  실시간 상담       허용     [ 기본 따름 ▾ ]  → 접근 가능        │
│  대화 이력        차단      [ 허용     ▾ ]  → 접근 가능 ⚑      │
│  통계             허용     [ 차단     ▾ ]  → 접근 불가 ⚑      │
│  작업 로그       (미제공)   [ — ]            비활성            │
│  …                                                             │
│                                      [ 취소 ]  [ 저장 ]        │
└────────────────────────────────────────────────────────────────┘
```

### 3.4 차단된 메뉴 직접 진입

```
┌────────────────────────────────────────────────┐
│                    ⊘                           │
│        이 메뉴에 접근할 수 없습니다             │
│  권한이 필요하면 관리자에게 문의하세요.         │
│              [ 대시보드로 ]                     │
└────────────────────────────────────────────────┘
```

---

## 4. API

| 메서드 | 경로 | 가드 | 용도 |
|---|---|---|---|
| GET | `/menu-access/me` | `@Auth()` | 내 유효 메뉴 코드 배열 (FR-MP9) |
| GET | `/tenants/:uuid/menus` | `@AdminOnly()` | 카탈로그 + 플랜 기본 + 오버라이드 + 계산 결과 |
| PUT | `/tenants/:uuid/menus` | `@AdminOnly()` | 오버라이드 일괄 저장 |
| GET | `/menu-access/roles` | `@RequireCapability(TENANT_SETTINGS_MANAGE)` | 직급 매트릭스 + 제공 여부 |
| PUT | `/menu-access/roles` | 동일 | 직급 매트릭스 저장 |
| GET | `/menu-access/users` | 동일 | 팀원 + 예외 요약 |
| PUT | `/menu-access/users/:id` | 동일 | 한 사용자 예외 저장 |

- 요청 DTO는 snake_case, 응답은 Mapper로 camelCase(CLAUDE.md §2).
  예: `PUT /tenants/:uuid/menus` → `{ "menus": [{ "menu_code": "issues", "mode": "on" }] }` (`mode`: `plan|on|off`)
- 에러 코드 신규(다음 빈 블록 E5029–E5031):
  `MENU_NOT_PROVIDED: E5029`, `MENU_ACCESS_DENIED: E5030`, `MENU_CODE_UNKNOWN: E5031`

---

## 5. 단계별 구현

### S1 — 기반: 카탈로그 · 스키마 · 판정 · 유효 메뉴 전달 (동작 변화 0)

| 파일 | 변경 |
|---|---|
| `packages/types/src/domain/menu.types.ts` **신규** | `MENU`, `MenuCode`, `MENU_CATALOG`, `PLAN_MENUS` |
| `packages/common/src/rbac/menu-access.ts` **신규** | `resolveProvidedMenus` / `resolveEffectiveMenus` + 기본 매트릭스·라벨 규칙 |
| `packages/common/src/rbac/menu-access.spec.ts` **신규** | 판정 규칙 단위 테스트 |
| `apps/api/src/domain/menu-access/entity/{tenant-menu,tenant-role-menu,tenant-user-menu}.entity.ts` **신규** | 3 엔티티 |
| `apps/api/src/domain/menu-access/menu-access.service.ts` **신규** | 조회·저장·유효 메뉴 계산 + Redis 캐시/무효화 |
| `apps/api/src/domain/menu-access/menu-access.controller.ts` **신규** | `/menu-access/me` |
| `apps/api/src/domain/menu-access/menu-access.module.ts` **신규** + `app.module.ts` | 모듈 등록 |
| `sql/migration_menu_access.sql` **신규** | §2.3 DDL |
| `apps/web/src/layouts/nav-config.ts` | 각 항목에 `code` 추가 |
| `apps/web/src/hooks/use-menu-access.ts` **신규** | React Query로 `/menu-access/me`, 실패 시 기존 `makeCan` 폴백(NFR-4) |
| `apps/web/src/layouts/Sidebar.tsx`, `domain/menu/MenuPage.tsx` | 필터를 유효 메뉴 기준으로 교체 |

> 검증 기준: 이 단계 배포 후 **모든 사용자의 사이드바가 이전과 동일**해야 한다.

### S2 — 어드민 제공 메뉴 (FR-MP3/4/5)

| 파일 | 변경 |
|---|---|
| `apps/api/src/domain/menu-access/admin-tenant-menu.controller.ts` **신규** | GET/PUT `/tenants/:uuid/menus` (기존 `admin-tenant-user.controller.ts` 패턴) |
| `.../dto/{request,response}/*` , `menu-access.mapper.ts` **신규** | DTO/매퍼 |
| `apps/web/src/domain/admin/admin.service.ts` / `admin.hooks.ts` | 조회·저장 훅 |
| `apps/web/src/domain/admin/TenantMenusModal.tsx` **신규** | §3.2 모달 |
| `apps/web/src/domain/admin/TenantsPage.tsx` | `[제공 메뉴]` 행 액션 |
| `apps/web/src/i18n/locales/{en,es,ko}/tenants.json` | 문구 |

### S3 — 테넌트 역할 기본값 · 사용자 예외 (FR-MP6/7)

| 파일 | 변경 |
|---|---|
| `apps/api/src/domain/menu-access/menu-access.controller.ts` | roles/users 4개 엔드포인트 |
| `apps/web/src/domain/settings/MenuAccessSection.tsx` **신규** | §3.3 두 탭 |
| `apps/web/src/domain/settings/UserMenuOverrideModal.tsx` **신규** | 예외 편집 모달 |
| `apps/web/src/domain/settings/{settings.service,settings.hooks}.ts` | API/훅 |
| `apps/web/src/domain/settings/SettingsPage.tsx` | 섹션 삽입(마스터만) |
| `apps/web/src/i18n/locales/{en,es,ko}/settings.json` | 문구 |

### S4 — 차단 (FR-MP10/11)

| 파일 | 변경 |
|---|---|
| `apps/api/src/global/decorator/auth.decorator.ts` | `@RequireMenu(...codes)` |
| `apps/api/src/global/guard/menu-access.guard.ts` **신규** | 테넌트 사용자만 평가, `@Public`/admin 스킵, 위반 시 E5029/E5030 + `logger.warn`(4xx 무로그 함정) |
| 메뉴 소유 컨트롤러 ~14개 | 클래스 레벨 `@RequireMenu` (§6.2 라우트 인벤토리 확정 후) |
| `apps/web/src/components/MenuGuard.tsx` **신규** + `AppRouter.tsx` | 라우트별 진입 차단 + §3.4 안내 |

### S5 — 문서 · 배포

`docs/test/TCR-260812-Menu-Provisioning-Access.md`, `docs/implementation/RPT-260812-Menu-Provisioning-Access.md`, 스테이징 SQL 선적용 → 배포 → 스모크.

PR은 단계별 4개(S1/S2/S3/S4)로 분리한다. S1이 회귀 없이 붙는 것을 확인한 뒤 나머지를 얹어야, 문제가 생겼을 때 되돌릴 단위가 명확하다.

---

## 6. 사이드 임팩트

### 6.1 회귀 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| **사이드바가 비어 보임** — `/menu-access/me` 실패 시 | 전 사용자 콘솔 사용 불가 | NFR-4 폴백: 조회 실패/로딩 중에는 기존 `makeCan` 결과 사용 |
| **플랜 프리셋이 기존 테넌트를 축소** | 쓰던 메뉴가 사라짐 | S2 배포 전 스테이징 두 테넌트의 `plan` 확인. 필요 시 `enterprise` 로 정정하거나 NULL 유지(전체 제공) |
| **캐시 미무효화로 변경이 안 먹음** | "저장했는데 그대로" | 세 쓰기 경로 모두 테넌트 버전 `INCR`. TCR에 명시 케이스 |
| **마스터 자기잠금** | 복구 불가 | D6: 마스터는 예외/매트릭스 대상 아님. UI에서도 마스터 행은 읽기 전용 `●` |
| **S4 과차단** — 대시보드가 통계/주문 API를 호출하는 등 화면↔API가 1:1이 아님 | 허용된 화면이 깨짐 | §6.2 인벤토리 먼저. 확신이 없는 라우트는 데코레이터를 **달지 않는다**(차단 실패 < 오작동) |

### 6.2 S4 착수 전 필수 작업 — 라우트 인벤토리

메뉴 코드 ↔ 컨트롤러/라우트 매핑표를 만들고, 다음을 명시적으로 분류한다.

- **전용**: 그 메뉴만 쓰는 라우트 → `@RequireMenu` 부착
- **공유**: 여러 메뉴가 쓰는 라우트(예: 대시보드 위젯이 통계 API 호출) → 부착하지 않음
- **공개**: `@Public()` 위젯/스토어프론트 라우트 → 가드가 스킵

이 표는 PLN 승인 후 S4 시작 시점에 코드에서 뽑아 TCR에 첨부한다.

### 6.3 영향 없는 영역

- 위젯(`apps/widget`), 고객 세션/모더레이션/AI 경로 — 메뉴 개념 없음
- 기존 `@RequireCapability`/`@RequireRank` 판정 — 변경 없이 그대로 AND 된다
- `roles_permissions` — 계속 미사용(이번에 건드리지 않음)

---

## 7. 테스트 계획 (TCR에서 확장)

**단위** — `menu-access.spec.ts`
1. 오버라이드 없음 + plan=NULL → 16개 전부 제공
2. plan=starter → 프리셋 9개 / `on` 오버라이드로 1개 추가 / `off` 로 1개 제거
3. master → 제공 전체(직급 매트릭스가 전부 false여도)
4. 사용자 `allow` 예외가 라벨 규칙을 이긴다 / `deny` 예외가 직급 허용을 이긴다
5. 제공되지 않은 메뉴는 사용자 `allow` 예외로도 열리지 않는다
6. 행이 하나도 없을 때 결과 = 현행 `capabilitiesFor` 결과와 동일 (**회귀 판정 테스트**, 4직급 × 라벨 조합)

**통합** — 저장 → 캐시 무효화 → 다음 조회 반영, 크로스 테넌트 격리(다른 테넌트 행이 섞이지 않음), 비마스터의 `/menu-access/roles` PUT → 403

**수동 스모크** — 어드민 차단 → 해당 테넌트 마스터 사이드바에서 사라짐 / 차단 메뉴 URL 직접 입력 → 안내 화면 / 해당 API 직접 호출 → 403

---

## 8. 마이그레이션 · 배포

- 스키마 변경 PR → PR 본문에 `## Migration` 섹션(SQL 경로, 환경별 적용 체크박스, 롤백) 필수.
- **순서**: 스테이징 DB에 `sql/migration_menu_access.sql` 선적용 → 코드 배포(`DB_SYNCHRONIZE=false`).
- 롤백: 세 테이블 DROP + 코드 리버트. 데이터는 오버라이드/예외뿐이라 소실 영향이 없다.
- 배포 검증: 부팅 로그 `successfully started`, `docker ps` STATUS, `GET /api/v1/menu-access/me` → 401(미인증)이면 배포됨 / 404면 미배포.

---

## 9. 승인 요청 사항

1. §2.2 플랜 프리셋 구성 (starter 9 / growth 15 / enterprise 16)
2. 직급 매트릭스 편집 권한을 **마스터 전용**으로 할지, 디렉터도 포함할지
3. PR 4분할(S1~S4) 진행 여부
