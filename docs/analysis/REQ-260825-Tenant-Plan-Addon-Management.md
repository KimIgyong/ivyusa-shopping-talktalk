# REQ-260825 — 테넌트 요금제 변경 + 이슈 워크플로우 애드온 설정 (어드민)

- 요청일: 2026-08-25
- 요청 원문:
  1. `/admin/tenants` 제공메뉴 설정에서 이슈보드를 **강제제공**으로 바꾸면 결과가
     "제공"으로 나와 **메뉴에는 노출되지만 실제 기능은 지원하지 않음**
     (go2joy에서 `/issues` 진입 시 "이슈 워크플로우 애드온이 활성화되어 있지 않습니다").
  2. go2joy 테넌트 — 이슈보드 사용 설정 필요.
  3. **요금제 변경 기능이 없음** — 추가 필요.

## 1. AS-IS

### 1.1 두 개의 독립 게이트 — 요구사항 1의 원인
| 축 | 저장 | 제어 주체 | 효과 |
|---|---|---|---|
| **메뉴 제공** | `tenant_menus`(plan/on/off 오버라이드) + `PLAN_MENUS` 프리셋 | 어드민 UI 있음(제공메뉴 설정, PR #239~#242) | 사이드바 노출·라우트 접근만 |
| **이슈 워크플로우 entitlement** | `tenants.workflow_mode` (`base`/`bridge`/`native`, 기본 base) | **설정 수단 없음 — SQL 수동뿐**(amoebaorder 파일럿이 그렇게 설정됨) | `/issues` 보드·상태머신·칸반은 `native`만; 서버 판정(REQ-260807 §11.1) |

제공메뉴에서 ISSUE를 `on`(강제제공)으로 바꾸면 1축만 열리고 2축(`workflow_mode`)은
`base` 그대로 → 메뉴는 보이는데 페이지는 애드온 안내(`livechat.json board.notNative`)를
띄운다. IssueBoardPage는 `stats.workflowMode !== 'native'`로 가드(`IssueBoardPage.tsx:95`).
**동작 자체는 설계 의도(§11.1 서버 판정 entitlement)대로이나, 어드민이 애드온을 켤
수단이 없고 제공메뉴 UI가 이 관계를 전혀 보여주지 않는 것이 결함.**

### 1.2 요금제(plan)
- `tenants.plan`은 자유 문자열. 생성 시(`POST /tenants`)에만 지정 가능, **변경 API 없음**.
- 웹 생성 폼 선택지 `PLANS = ['starter','growth','enterprise']`(TenantsPage 하드코딩);
  시드 ivyusa는 `custom`. `PLAN_MENUS` 프리셋은 starter/growth/enterprise만 알고
  **미지의 plan(null/custom 포함)은 전체 제공**으로 폴백.
- plan을 바꾸면 제공메뉴 프리셋이 즉시 바뀜(오버라이드는 유지) — 이미 계산형 구조라
  요금제 변경의 파급은 메뉴 축에 한정.

### 1.3 스테이징 현황 (2026-08-25 실측)
- go2joy: `plan=starter, workflow_mode=base, status=active` → 이슈보드 미지원 상태.
- native는 amoebaorder 하나뿐(SQL 수동). 나머지 전부 base.
- 테넌트 목록 API 응답(TenantMapper)에 `plan`은 있으나 `workflowMode`는 **미노출**.

### 1.4 관련 제약
- `@AdminOnly()` + CAPABILITY 게이트 기존 패턴(상태 변경은 AdminOnly, 생성은
  TENANT_APPROVE). 감사로그 필수(privileged).
- `workflow_mode='bridge'`는 외부 헬프데스크 연동(Gorgias L1) — 값 셋 다 실사용 중.

## 2. TO-BE

1. **요금제 변경**: `/admin/tenants`에서 테넌트별 plan 변경(starter/growth/enterprise/custom).
   변경 즉시 제공메뉴 프리셋 재계산(기존 계산형 구조 그대로), 감사로그.
2. **애드온 설정**: 같은 화면에서 이슈 워크플로우 `workflow_mode`(base/bridge/native)
   변경. 감사로그. 목록/응답에 workflowMode 노출.
3. **불일치 가시화**: 제공메뉴 설정 모달의 ISSUE 행에 애드온 상태를 표시 —
   `native`가 아니면 "메뉴를 제공해도 애드온이 꺼져 있어 기능이 동작하지 않음" 경고.
4. **운영 적용**: 배포 후 go2joy를 새 UI/API로 `native` 설정 → `/issues` 정상 동작 확인.

## 3. 갭 분석

| # | 갭 | 필요 작업 |
|---|---|---|
| G1 | plan 변경 API/UI 없음 | `PATCH /tenants/:uuid/plan` + TenantsPage 편집 UI |
| G2 | workflow_mode 설정 수단 없음(SQL뿐) | `PATCH /tenants/:uuid/workflow-mode` + UI |
| G3 | workflowMode 어드민 응답 미노출 | TenantMapper/목록·컬럼 추가 |
| G4 | 제공메뉴 모달이 애드온과 무관계 | ISSUE 행 애드온 상태 경고(모달에 workflowMode 전달) |
| G5 | plan 선택지 하드코딩(웹) + 서버 무검증 | 허용 목록 상수 일원화(types) + DTO 검증 |
| G6 | go2joy 애드온 꺼짐 | 배포 후 운영 설정(native) + 스모크 |

## 4. 제약·정책

- plan 허용값: `starter/growth/enterprise/custom` (custom = 프리셋 미적용=전체 제공,
  ivyusa 기존값 호환). 그 외 값 400.
- workflow_mode 허용값: `base/bridge/native`. 그 외 400. bridge↔native 전환 시 기존
  티켓 데이터는 보존(모드는 판정 게이트일 뿐 — 현행 서버 로직 그대로).
- 두 변경 모두 `AuditService.write`(action: `tenant.plan_changed` / `tenant.workflow_mode_changed`).
- UI 문구 i18n 6개 언어, 저장 성공/실패 토스트(UX 표준).
- 스키마 변경 없음(기존 컬럼) — 마이그레이션 불필요.

## 5. 사용자 플로우 (TO-BE)

```
플랫폼 운영자(/admin/tenants)
  ├─ [요금제/애드온] 버튼 → 모달: plan 선택 + 이슈 워크플로우 모드 선택 → 저장
  │     └─ plan 변경 → 제공메뉴 프리셋 즉시 반영(오버라이드 유지)
  │     └─ workflow_mode=native → 해당 테넌트 /issues 보드 활성
  └─ [제공메뉴] 모달 ISSUE 행: 애드온 꺼짐 경고 표시 → 운영자가 모드도 함께 설정
```

## 6. 결정 필요 사항 (PLN에서 확정)

- D1: plan/workflow_mode를 한 모달·한 PATCH로 묶을지, 분리할지 — 권고: **한 모달**
  (운영 동선 일치) + **PATCH 2개 분리**(감사·권한 축 명확).
- D2: 요금제 축소(예: enterprise→starter) 시 확인 다이얼로그 — 권고: 결과 프리셋
  미리보기 문구 한 줄 + 확인 버튼(별도 2단계 확인은 과설계).
- D3: go2joy 설정값 — 권고: `native` (요구 원문 "이슈보드 사용"), plan은 현행 starter 유지.
