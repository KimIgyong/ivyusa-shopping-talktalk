# TCR-260825 — 테넌트 요금제 변경 + 이슈 워크플로우 애드온 설정

- 근거: PLN-260825-Tenant-Plan-Addon-Management.md (D1~D3 확정안대로)
- 스키마 변경 없음 — SQL 사전 적용 불필요.

## 1. 단위 테스트 (jest — 전체 스위트 통과, 신규 2)

| # | 케이스 | 결과 |
|---|---|---|
| U1 | `updatePlan`: plan 저장 + 감사 `tenant.plan_changed`(old→new, actorType admin) | ✅ |
| U2 | `updateWorkflowMode`: 모드 저장 + 감사 `tenant.workflow_mode_changed` | ✅ |

값 검증은 DTO 경계(`@IsIn`) — 통합 I5에서 실검증.

## 2. 통합/UI (로컬 실행 — API :3001 + vite :5175, 브라우저 실측)

| # | 시나리오 | 결과 |
|---|---|---|
| I1 | API 부팅 `successfully started`, 신규 PATCH 2종 라우트 매핑 로그 | ✅ |
| I2 | /admin/tenants: [요금제/애드온] 버튼·모달 렌더(플랜 셀렉트+프리뷰 문구+모드 라디오), 변경 전 Save 비활성 | ✅ 스크린샷 |
| I3 | native 저장 → 성공 토스트 + 목록에 `issues: native` 배지 즉시 반영 | ✅ |
| I4 | base 복귀 후 제공메뉴 모달: **이슈보드 행에 애드온 꺼짐 경고**(native 안내) 표시; native일 땐 미표시 | ✅ 스크린샷 |
| I5 | `PATCH workflow-mode` 허용 외 값(`weird`) → 400 E5003(허용값 목록 명시) | ✅ |
| I6 | API 응답에 `workflowMode` 노출(목록·단건) | ✅ |
| I7 | Login path 컬럼 신경로 `/user/{slug}` 표기(#356 후속 정합) | ✅ |

### 실행 중 확인된 환경 사항
- 로컬 :3000은 다른 세션(taxonomy 워크트리)의 구버전 API가 점유 — 본 검증은 :3001로
  분리 실행(타 세션 무간섭). "Cannot PATCH" 404는 그 구버전 응답이었음.

## 3. 스테이징 스모크 계획 (배포 후)

| # | 항목 |
|---|---|
| S1 | 배포 검증: health·부팅 로그·PATCH 라우트 존재(미인증 401 = 배포됨) |
| S2 | admin 로그인 → go2joy [요금제/애드온] → workflow_mode `native` 저장(감사로그 확인) |
| S3 | go2joy 목록 배지 `issues: native`, 제공메뉴 모달 이슈보드 경고 소멸 |
| S4 | go2joy 콘솔 `/issues` — 애드온 안내문 대신 칸반 보드 렌더 (stats API `workflowMode: native`) |
| S5 | amoebaorder(기존 native)·타 테넌트 무회귀, plan 변경 스모크 1회(starter↔growth 후 원복, 제공메뉴 프리셋 변동 확인) |
