# RPT-260825 — 테넌트 요금제 변경 + 이슈 워크플로우 애드온 설정

- 요구사항: ① 제공메뉴 강제제공해도 이슈보드 기능 미동작(메뉴만 노출) ② go2joy 이슈보드
  사용 설정 ③ 요금제 변경 기능 부재 → 추가.
- 문서 체인: REQ-260825 → PLN-260825(승인) → TCR-260825 → 본 RPT.
- **배포 상태: PR #379 (`2542381`) main 머지 + 스테이징 배포 완료 (2026-08-25). go2joy
  native 적용 완료.**

## 1. 원인과 해결

증상은 게이트가 **2축**인데 어드민이 1축만 만질 수 있던 것:
- **메뉴 제공**(plan 프리셋+오버라이드) = 사이드바 노출만. 강제제공 시 "결과: 제공"은 정상.
- **이슈 워크플로우 entitlement**(`tenants.workflow_mode`, 서버 판정) = `/issues` 보드는
  `native`만 동작. 이 값을 바꿀 UI/API가 없어 SQL 수동뿐이었음(go2joy는 `base`라 막힘).

해결: workflow_mode 설정 API/UI 신설 + 제공메뉴 모달에서 불일치를 경고로 가시화.

## 2. 변경 내용

### 백엔드 (tenant 도메인)
- `PATCH /tenants/:uuid/plan` — `@AdminOnly`, `@IsIn`(starter/growth/enterprise/custom),
  감사 `tenant.plan_changed`(old→new). 저장 즉시 제공메뉴 프리셋 재계산(계산형 구조).
- `PATCH /tenants/:uuid/workflow-mode` — `@AdminOnly`, `@IsIn`(base/bridge/native),
  감사 `tenant.workflow_mode_changed`. 모드는 게이트일 뿐 — 티켓 데이터 보존.
- `TenantMapper`/응답 DTO에 `workflowMode` 노출.

### 웹 어드민 (/admin/tenants)
- [요금제/애드온] 버튼 → `TenantPlanModal`: plan 셀렉트(프리셋 미리보기 한 줄) +
  workflow_mode 라디오(설명 병기). 변경분만 각 PATCH로 저장(D1: 한 모달·PATCH 분리).
- 목록 plan 옆 애드온 배지(`issues: native/bridge`, base는 표시 안 함).
- **제공메뉴 모달 이슈보드 행**: native가 아니면 "메뉴는 보여도 애드온이 꺼져 기능이
  동작하지 않음 — 요금제/애드온에서 native로" 경고.
- Login path 컬럼 `/user/{slug}` 표기 정합(#356 후속).

### 상수/타입
- `TENANT_PLAN`/`WORKFLOW_MODE` + `*_VALUES`를 `@ivy/types`(menu.types)에 일원화, DTO는
  이를 `@IsIn`에 사용. 웹은 값 임포트 불가(LESSON 2026-07-16)라 로컬 미러 상수 유지.

## 3. 파일 (PR #379)
- API: `tenant.controller/service/mapper`, `dto/request/tenant.request.ts`(+2 DTO),
  `dto/response/tenant.response.ts`, `tenant.service.plan.spec.ts`(신규)
- Web: `TenantPlanModal.tsx`(신규), `TenantsPage.tsx`, `TenantMenusModal.tsx`,
  `admin.service.ts`, `admin.hooks.ts`, locales 6파일
- Types: `menu.types.ts`
- 문서: REQ/PLN/TCR

## 4. 테스트
- 단위: 신규 2(plan/workflow-mode 저장+감사), 전체 스위트 통과. typecheck/build 그린,
  i18n:check 통과.
- 로컬 브라우저 E2E: 모달 저장→목록 배지 즉시 반영, base 복귀 후 제공메뉴 이슈보드
  경고 표시/native 시 소멸, 허용 외 값 400(허용값 목록 명시). (다른 세션이 :3000 점유 중이라
  API :3001로 분리 실행 — 무간섭.)
- 스테이징: health 200, 부팅 로그 정상, `PATCH workflow-mode` 미인증 401(=배포됨).

## 5. 운영 적용 / 주의

- **go2joy = native 적용 완료**(2026-08-25). 시스템 어드민 3계정 전부 MFA 등록이라 API
  경로가 막혀, **이번 1회만 DB로 설정**하고 감사로그를 동등 기록(`tenant:4 base -> native
  (bootstrap via DB)`). **앞으로 모든 애드온/요금제 변경은 새 [요금제/애드온] UI로**
  (감사로그 자동 기록). 콘솔 `/issues` 칸반 육안 확인은 go2joy 사용자 계정 필요 → 잔여.
- ⚠️ 배포 시 **journey_reports 마이그레이션 누락 사후 복구**: 직전 머지(#375/#376,
  고객여정 리포트)의 `sql/migration_journey_reports.sql`이 스테이징에 미적용 상태였음 —
  본 배포에서 `IF NOT EXISTS`로 적용(journey_reports/journey_report_criteria 생성).
  본 PR 자체는 스키마 변경 없음.
- 예방 패턴: 서버 판정 entitlement(workflow_mode 등)는 **메뉴 제공과 별개 축** — 새
  기능을 메뉴 게이트만으로 노출하면 "보이는데 안 되는" 혼란이 생기므로, entitlement
  설정 수단과 불일치 경고를 함께 제공할 것.

## 6. 잔여
- go2joy 콘솔 `/issues` 칸반 렌더 육안(사용자 계정) · plan 변경 스테이징 스모크(starter↔growth) ·
  amoebaorder 무회귀 확인.
