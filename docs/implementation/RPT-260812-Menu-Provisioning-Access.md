# RPT-260812-Menu-Provisioning-Access

테넌트별 제공 메뉴(어드민) + 팀원별 메뉴 접근권한(테넌트) 구현 보고.

- 작성일: 2026-08-12
- 선행: REQ-260812 / PLN-260812 (승인 2026-08-12) / TCR-260812
- 브랜치: `feature/menu-provisioning-access` (main에서 분기)

---

## 1. 무엇을 바꿨나

| 단계 | 커밋 | 내용 |
|---|---|---|
| S1 | `c4309a4` | 메뉴 카탈로그·판정 로직·테이블 3종·`GET /menu-access/me`·사이드바 연동 (동작 변화 0) |
| S2 | `7e0f08d` | 어드민 `GET/PUT /tenants/:uuid/menus` + 테넌트 관리 [제공 메뉴] 모달 |
| S3 | `894b733` | 테넌트 `menu-access/roles`·`menu-access/users` + `/settings` 메뉴 접근권한 섹션 |
| S4 | `f97aae3` | `@RequireMenu` + `MenuAccessGuard` + 프런트 `MenuGuard` |

합계 57파일 / +3,269 −49.

## 2. 설계 확정 사항 (구현하며 굳어진 것)

**판정 우선순위** — `제공(어드민) > 마스터 > 사용자 예외 > 직급 매트릭스 ∧ 라벨 규칙`.

- **라벨 게이팅은 없애지 않고 분해했다.** 기존 콘솔 규칙은 "직급 부여 ∪ 라벨 부여"의 **합집합**이었다. 이를 `DEFAULT_ROLE_MENUS`(이 직급이 도달 가능한 메뉴) × `RANK_LABEL_EXEMPT_MENUS`(직급이 이미 준 메뉴는 라벨 면제)로 나눠, 테넌트가 앞쪽만 편집해도 뒤쪽이 조용히 넓어지지 않게 했다. 이 분해가 옛 규칙과 동일함을 32조합으로 검증한다(TCR T-R1) — **이 등가성이 S1 무회귀의 근거**다.
- **행 부재 = 기본값.** 세 테이블 모두 예외만 저장한다. 저장 시 기본값과 같은 행은 버려서, 실제로 갈라지지 않은 테넌트는 제품 기본값이 바뀔 때 함께 따라간다.
- **마스터 면제.** 매트릭스 읽기전용 · 예외 대상 403 · 리졸버 단락. 테넌트가 자기 설정/사용자 관리 화면을 스스로 잠글 수 없다.
- **플랜 미지정 = 전체 제공.** 기존 테넌트가 배포 순간 축소되지 않는다(스테이징 tenant 1은 `plan='custom'` → 미지의 값 → 전체).

## 3. 파일 목록

**공유 패키지**
- `packages/types/src/domain/menu.types.ts` 신규 — `MENU`(16) · `MENU_CATALOG` · `PLAN_MENUS` · 모드 enum
- `packages/common/src/rbac/menu-access.ts` 신규 — `resolveProvidedMenus` / `resolveEffectiveMenus` / `roleAllows` / `labelAllows` + 기본 매트릭스
- `packages/common/src/rbac/menu-access.spec.ts` 신규 (47) · 각 `index.ts` export

**백엔드** (`apps/api/src/domain/menu-access/`)
- `entity/{tenant-menu,tenant-role-menu,tenant-user-menu}.entity.ts` 신규
- `menu-access.service.ts` · `menu-access.mapper.ts` · `menu-access.controller.ts`(me/roles/users) · `admin-tenant-menu.controller.ts` · `dto/request/menu-access.request.ts` · `menu-access.module.ts`(@Global)
- `global/decorator/auth.decorator.ts` — `RequireMenu` 추가
- `global/guard/menu-access.guard.ts` + `.spec.ts` 신규 (7)
- `global/constant/error-code.constant.ts` — E5029~E5031
- 게이트 부착 컨트롤러 11개(TCR §5)
- `app.module.ts` 등록

**프런트**
- `lib/use-menu-access.ts` 신규(폴백 포함) · `components/MenuGuard.tsx` 신규
- `layouts/{nav-config,Sidebar,AppLayout}.tsx` · `domain/menu/MenuPage.tsx`
- `domain/admin/{TenantMenusModal.tsx 신규,TenantsPage,admin.service,admin.hooks}`
- `domain/settings/{MenuAccessSection.tsx,UserMenuOverrideModal.tsx,menu-access.service.ts,menu-access.hooks.ts 신규,SettingsPage}`
- i18n `{en,es,ko}/{tenants,settings,nav}.json`

**SQL**: `sql/migration_menu_access.sql` 신규(테이블 3종, `CREATE TABLE IF NOT EXISTS`)

## 4. 테스트 결과

```
packages/common   60 passed   (menu-access 47 신규)
apps/api         959 passed   (92 suites, guard 7 신규)
typecheck        9/9 tasks    build 6/6 tasks
```

로컬 실측(dev DB/Redis):
- 마스터 `/menu-access/me` → 16개
- 어드민이 `campaigns` 차단 → 마스터 응답 15개(즉시 반영, 캐시 버전 증가) · `audit_logs`에 `tenant_menus.update` 기록
- 직급 매트릭스 3행 전송 → 기본값과 다른 2행만 저장
- 마스터를 예외 대상으로 PUT → 403
- 게이트 라우트 9종 마스터 200 / 미제공 시 E5029 / 직급 차단 시 E5030 / 미게이트 이웃 정상

> 실행 후 dev DB는 원상 복구했다(테이블 3종 0행, seed 계정 rank·must_change_password 원복, 테스트 감사로그 삭제).

### 4.1 배포 후 무회귀 실측 (스테이징 실데이터)

콘솔 로그인 스모크는 시드 비밀번호가 변경돼 있어 못 했다(런북 §4 로그인 → E1002). 대신 더 넓게 덮었다:
스테이징 DB에서 **실제 사용자 16명 전원의 rank·라벨·테넌트 plan·오버라이드 행**을 뽑아, 배포된 리졸버
(`packages/common/dist`)와 구 콘솔 규칙을 각각 돌려 1:1 비교했다.

```
OK — 16명 전원 배포 전후 메뉴 동일 (변화 0)
```

한계: 스테이징 사용자는 **전원 `master`** 라 이 실측이 덮는 건 마스터 경로와 제공(플랜) 계층이다.
직급 매트릭스·사용자 예외 경로는 실데이터가 없어 단위 테스트(47건)로만 덮인다 — R2가 필요한 이유.

반사실 확인(오버라이드가 없었다면):
```
ivyusa(custom)        16개
starter + 오버라이드  16개  ← 현재
starter 프리셋만       9개  → issues, work_log, statistics, ai_settings, products, campaigns, reviews 상실
```

## 5. 배포 상태

| 항목 | 상태 |
|---|---|
| PR | #239(S1) `baa2209` · #240(S2) `253b411` · #241(S3) `b9e3d67` · #242(S4+문서) `e63db4c` — 전부 squash 머지 |
| 마이그레이션 | `sql/migration_menu_access.sql` — **스테이징 적용 완료 2026-08-12** (테이블 3종 생성 확인) |
| 스테이징 | **배포 완료 2026-08-12** (`e63db4c`) |
| 프로덕션 | 미배포(호스트 미확정) |

배포 검증: `Nest application successfully started` · `/api/v1/menu-access/{me,roles,users}` 라우트 매핑 로그 ·
`GET /api/v1/menu-access/me` → **401**(배포됨) · `/api/v1/health` 200 · 콘솔 SPA 200 ·
배포 후 API 로그에 ERROR/`Unknown column`/`doesn't exist` 없음.

### 5.1 배포 중 발견 — starter 테넌트 2곳의 무회귀 처리

스테이징 테넌트는 3개이고 플랜이 이렇게 갈렸다.

| id | slug | plan | workflow_mode | 프리셋대로면 |
|---|---|---|---|---|
| 1 | ivyusa | `custom` | base | 미지의 플랜 → **16개 전부** |
| 2 | annehearts | `starter` | base | 9개 (7개 상실) |
| 3 | amoebaorder | `starter` | **native** | 9개 (**이슈 보드 상실**) |

프리셋을 그대로 적용하면 배포 순간 테넌트 2·3에서 이슈 보드·작업로그·통계·AI설정·상품·캠페인·리뷰가 사라진다.
amoebaorder는 이슈 워크플로우 **파일럿(native)** 이라 이슈 보드 상실은 곧 파일럿 중단이다.

계획의 수용 기준은 "배포 직후 화면상 변화 0"(FR-MP5·NFR-2)이므로, 두 테넌트에 **해당 7개 메뉴의 `강제 제공`
오버라이드 행**을 넣어 현행을 유지했다(`tenant_menus` 각 7행). 어드민 [제공 메뉴] 모달에 `*` 예외로 보이며
셀렉트를 `플랜 따름`으로 되돌리면 그 순간 프리셋이 적용된다 — 축소는 영업 판단이므로 배포가 대신 결정하지 않는다.

> **결정(2026-08-12, 사용자 확인): 두 테넌트의 오버라이드를 유지한다.**
> 즉 annehearts·amoebaorder는 플랜이 `starter`여도 콘솔 메뉴 16개를 전부 받는다.
>
> ⚠️ 어드민 [제공 메뉴] 모달에서 두 테넌트는 `*` 예외 7건으로 보인다. **테스트 잔여물이 아니다.**
> 이 행들을 `플랜 따름`으로 되돌리면 amoebaorder(`workflow_mode='native'`)에서 이슈 보드가 사라져
> 라이브챗 이슈 워크플로우 파일럿이 끊긴다. 되돌리기 전에 파일럿 상태를 먼저 확인할 것.

## 6. 남은 일

| # | 항목 | 비고 |
|---|---|---|
| ~~R1~~ | ~~스테이징 SQL 적용 + 배포~~ | **완료(8/12)** — §5 |
| R2 | 수동 스모크 E1~E10 | TCR §6. **콘솔 비밀번호 필요** — 시드 비번은 이미 변경됨(런북 §4 로그인 E1002) |
| ~~R3~~ | ~~starter 테넌트의 프리셋 적용 여부 결정~~ | **완료(8/12)** — 오버라이드 유지로 확정(§5.1). 두 곳은 계속 16개 전부 받는다 |
| R7 | 오버라이드에 사유를 남길 자리가 없다 | 지금은 `*` 표시뿐이라 왜 걸렸는지 모달만 봐서는 알 수 없다. 백로그: `tenant_menus`에 note 컬럼 + 모달 표시 |
| R4 | 공유 라우트 차단(주문·이슈·실시간·AI설정) | TCR §5.3. 화면↔API를 1:1로 정리하거나 라우트 레벨로 쪼개야 가능 — 별건 |
| R5 | `roles_permissions` 죽은 테이블 폐기 | 이번 범위 밖(REQ §6) |
| R6 | 사이드바 반영 지연 60초 | **보안 구멍이 아니다.** 권한 회수 시 캐시 버전이 즉시 올라가 서버 차단은 바로 걸린다. 60초는 프런트 React Query `staleTime`이라, 회수된 사람 사이드바에 항목이 1분 더 보일 수 있을 뿐이고 눌러도 403이다 |

## 7. 예방 패턴 (일반화)

1. **권한을 브라우저에서 계산하면 그건 권한이 아니라 장식이다.** 서버가 같은 판정을 내려주고, 프런트는 그 결과를 렌더하기만 해야 한다.
2. **새 게이트의 기본값은 "현행 재현"이어야 한다.** 옛 규칙을 테스트에 그대로 옮겨 심고 신규 구현과의 등가성을 단언하면, 무회귀가 주장이 아니라 검증이 된다.
3. **설정 테이블은 예외만 저장한다.** 전체를 물질화하면 제품 기본값이 바뀌어도 아무도 따라오지 않고, 그 사실이 어디에도 드러나지 않는다.
4. **자기잠금 경로를 구조적으로 없앤다.** 마스터를 편집 대상에서 빼는 것이, 저장 직전에 경고를 띄우는 것보다 안전하다.
5. **화면과 API는 1:1이 아니다.** 차단을 붙이기 전에 인벤토리를 뽑고, 공유 라우트에는 달지 않는다 — 빠진 게이트보다 허용 화면을 깨는 게이트가 나쁘다.
