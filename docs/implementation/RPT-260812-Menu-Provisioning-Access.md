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

## 5. 배포 상태

| 항목 | 상태 |
|---|---|
| PR | (작성 예정 — 머지 후 번호·SHA 기입) |
| 마이그레이션 | `sql/migration_menu_access.sql` — **스테이징 미적용** |
| 스테이징 | 미배포 |
| 프로덕션 | 미배포(호스트 미확정) |

**적용 순서(필수)**: 스테이징 DB에 SQL 선적용 → 코드 배포. 스테이징은 `DB_SYNCHRONIZE=false`라 코드만 올리면 `Table 'tenant_menus' doesn't exist`로 콘솔 진입 시 500이 난다.

검증: 부팅 로그 `successfully started` · `docker ps` STATUS · `GET /api/v1/menu-access/me` → 401이면 배포됨 / 404면 미배포.

롤백: 코드 리버트 + 테이블 3종 DROP. 저장 데이터는 오버라이드·예외뿐이라 소실 영향이 없다.

## 6. 남은 일

| # | 항목 | 비고 |
|---|---|---|
| R1 | 스테이징 SQL 적용 + 배포 | §5 순서 |
| R2 | 수동 스모크 E1~E10 | TCR §6 |
| R3 | 스테이징 두 테넌트의 `plan` 값 확인 | 현재 tenant 1 = `custom`(전체 제공). `starter`/`growth`로 바꾸면 그 순간 메뉴가 줄어드니 영업 정책 확정 후 변경 |
| R4 | 공유 라우트 차단(주문·이슈·실시간·AI설정) | TCR §5.3. 화면↔API를 1:1로 정리하거나 라우트 레벨로 쪼개야 가능 — 별건 |
| R5 | `roles_permissions` 죽은 테이블 폐기 | 이번 범위 밖(REQ §6) |
| R6 | 유효 메뉴 폴링 주기 | 현재 staleTime 60초 + 포커스 리페치. 다른 사람이 바꾼 권한은 최대 60초 지연 |

## 7. 예방 패턴 (일반화)

1. **권한을 브라우저에서 계산하면 그건 권한이 아니라 장식이다.** 서버가 같은 판정을 내려주고, 프런트는 그 결과를 렌더하기만 해야 한다.
2. **새 게이트의 기본값은 "현행 재현"이어야 한다.** 옛 규칙을 테스트에 그대로 옮겨 심고 신규 구현과의 등가성을 단언하면, 무회귀가 주장이 아니라 검증이 된다.
3. **설정 테이블은 예외만 저장한다.** 전체를 물질화하면 제품 기본값이 바뀌어도 아무도 따라오지 않고, 그 사실이 어디에도 드러나지 않는다.
4. **자기잠금 경로를 구조적으로 없앤다.** 마스터를 편집 대상에서 빼는 것이, 저장 직전에 경고를 띄우는 것보다 안전하다.
5. **화면과 API는 1:1이 아니다.** 차단을 붙이기 전에 인벤토리를 뽑고, 공유 라우트에는 달지 않는다 — 빠진 게이트보다 허용 화면을 깨는 게이트가 나쁘다.
