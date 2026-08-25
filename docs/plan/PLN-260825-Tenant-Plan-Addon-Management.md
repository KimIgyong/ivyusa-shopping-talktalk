# PLN-260825 — 테넌트 요금제 변경 + 이슈 워크플로우 애드온 설정

- 근거: `docs/analysis/REQ-260825-Tenant-Plan-Addon-Management.md`
- 스키마 변경: **없음** (`tenants.plan`, `tenants.workflow_mode` 기존 컬럼) — 마이그레이션 불필요
- 결정(REQ §6): D1=한 모달 + PATCH 2개 분리 · D2=프리셋 미리보기 한 줄 + 확인 · D3=go2joy `native`(plan은 starter 유지)

## Stage 구성

### S1 — 타입/상수 일원화

- `packages/types/src/domain/menu.types.ts`(또는 tenant.types): `TENANT_PLAN` const
  (`starter/growth/enterprise/custom`) + `WORKFLOW_MODE` const(`base/bridge/native`) 추가,
  `PLAN_MENUS`와 키 일치. 웹 `PLANS` 하드코딩 제거(신규 상수 참조 — ⚠️ 웹은 `@ivy/types`
  **타입 전용 임포트만** 가능하므로 값은 menu.types처럼 딥임포트 가능한 위치인지 확인,
  불가하면 web 로컬 상수를 상수 파일 하나로 모아 중복 최소화).

### S2 — 백엔드 (tenant 도메인)

| 항목 | 내용 |
|---|---|
| `PATCH /tenants/:uuid/plan` | `@AdminOnly()`, body `{ plan }`(`@IsIn` 허용 4종). `TenantService.updatePlan` → 감사 `tenant.plan_changed`(old→new 기록) |
| `PATCH /tenants/:uuid/workflow-mode` | `@AdminOnly()`, body `{ workflow_mode }`(`@IsIn` 3종). `updateWorkflowMode` → 감사 `tenant.workflow_mode_changed` |
| `TenantMapper.toTenant` | `workflowMode` 노출 추가(목록·단건) |
| 단위테스트 | 허용값 검증, 감사 기록, 미존재 uuid 404 — 기존 tenant.service 스펙 스타일 |

- 메뉴 프리셋 재계산은 기존 계산형 구조(`resolveProvidedMenus(tenant.plan, overrides)`)가
  저장값을 안 가지므로 **plan 저장만으로 즉시 반영** — 추가 작업 없음.

### S3 — 웹 어드민 (/admin/tenants)

- 목록: `plan` 컬럼 옆에 **애드온 배지**(이슈: base/bridge/native; native만 강조).
- 행 액션에 [요금제/애드온] 버튼 → `TenantPlanModal`(신규):

```
┌──────────────────────────────────────────────┐
│  요금제 / 애드온 — go2joy                      │
│                                              │
│  요금제   [ starter        ▼ ]                │
│  └ 제공 메뉴 프리셋: 대시보드·라이브챗·이력·     │
│     지식·고객·주문·팀·설정·개인정보 (9개)       │
│     ※ 개별 오버라이드는 유지됩니다              │
│                                              │
│  이슈 워크플로우 애드온                         │
│  ( ) base — 미사용(채팅 목록만)                │
│  ( ) bridge — 외부 헬프데스크 연계              │
│  (•) native — 이슈보드·칸반 활성               │
│                                              │
│              ┌────────┐  ┌──────┐            │
│              │ 저장    │  │ 취소 │            │
│              └────────┘  └──────┘            │
└──────────────────────────────────────────────┘
```

- 제공메뉴 모달(`TenantMenusModal`) ISSUE 행: 애드온이 native가 아니면 경고 한 줄 —

```
│ 이슈보드   (plan|강제제공|미제공)  결과: 제공     │
│  ⚠ 이슈 워크플로우 애드온이 꺼져 있어(base)      │
│    메뉴가 보여도 기능은 동작하지 않습니다.        │
│    → 요금제/애드온에서 native로 설정             │
```

- plan/workflow 변경 성공·실패 토스트, i18n `tenants` 네임스페이스 신규 키 ~14개 × 6개 언어.

### S4 — TCR/배포/운영 적용

- TCR: 단위 + 스테이징 스모크(아래) 문서화.
- 배포: 스키마 변경 없음 → 코드만. 검증은 401/404 규칙.
- **운영 적용(D3)**: 새 API로 go2joy `workflow_mode=native` 설정(admin 계정, 감사로그
  경유 — SQL 직수정 금지) → go2joy 콘솔 `/issues` 게이트 해제 확인, 제공메뉴 ISSUE
  경고 소멸 확인. amoebaorder 기존 native 무회귀.

## 사이드 임팩트

| 영역 | 영향 | 대응 |
|---|---|---|
| 위젯/스토어프런트 | plan·workflow_mode 미참조 | 무영향 |
| 메뉴 제공 계산 | plan 변경 시 프리셋 즉시 변동 | 의도된 동작; 모달에 미리보기 문구(D2) |
| starter 2곳 현행유지 방침(menu-provisioning 260812) | plan 변경 기능이 생겨도 **자동 변경 없음** — 오버라이드 그대로 | 운영 판단 유지 |
| bridge 테넌트(Gorgias) | 값 변경 UI 노출 | 모드 라디오에 설명 병기, 감사로그로 추적 |
| 이슈 데이터 | 모드 전환에도 티켓 보존(게이트일 뿐) | 현행 서버 로직 무수정 |

## 규모·순서

S1(소) → S2(소) → S3(중) → S4. PR 1건(`feature/tenant-plan-addon`), 이후 docs PR(RPT).

---
**⚠️ 본 PLN 승인 후 구현 착수합니다. D1~D3 확정안 포함 승인 여부 확인 부탁드립니다.**
