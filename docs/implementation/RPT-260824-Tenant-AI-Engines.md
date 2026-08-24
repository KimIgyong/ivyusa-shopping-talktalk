# RPT-260824-Tenant-AI-Engines

테넌트별 AI 엔진 모델 설정 — 구현 결과

- 근거: `REQ-260824` / `PLN-260824` / `TCR-260824`
- 상태: **스테이징 배포 완료 2026-08-24**, 인증 경로 검증만 잔여(§5 R-1)

## 1. 배포 상태

| PR | 내용 | 커밋 |
|---|---|---|
| #358 | REQ + PLN | `f12c18f` |
| #359 | 구현(결함 2건 + 등록 경로 + 콘솔) | `7083b84` |

- 스테이징: **배포 완료** (`shoptalk.amoeba.site`)
- 프로덕션: 미배포 환경
- **마이그레이션 없음** — `ai_engines.tenant_id`가 이미 존재. 롤백은 코드 되돌리기로 충분

## 2. 요청과 실제 작업의 차이

요청은 "어드민이 정한 엔진을 전 테넌트가 쓴다 → 테넌트별로"였습니다. 코드를 읽어보니
**라우팅은 이미 테넌트를 우선**하고 있었습니다:

```
EXPLICIT → INHERITED → TENANT_DEFAULT → PLATFORM_DEFAULT → NONE
```

`ai_engines.tenant_id`도 이미 있었고 한 테넌트가 여러 행을 가질 수 있어 **복수 엔진도
이미 표현 가능**했습니다. 없던 것은 **테넌트가 엔진을 가질 방법**이었습니다 —
`/ai-engines` 네 라우트가 전부 `@AdminOnly()`.

그래서 이 작업은 라우팅을 만드는 일이 아니라 **등록 경로를 여는 일**이 됐고, 범위가 줄었습니다.

## 3. 무엇을 만들었나

**결함 2건을 먼저 닫았습니다**(순서가 계획의 핵심 — 등록을 먼저 열면 그 순간 실재합니다).
- 플랫폼 폴백에 `tenant_id IS NULL` 추가
- 테넌트용 엔진 목록을 `내 것 + 플랫폼`으로 스코프

**그다음 등록 경로**: `tenants/me/ai-engines` 6개 라우트, 신규 capability
`TENANT_AI_ENGINE_MANAGE`(master 전용), 콘솔 설정에 AI 엔진 카드, i18n 6개 언어.

### 파일
```
신규  apps/api/.../ai-engine/tenant-ai-engine.service.ts(+spec) · tenant-ai-engine.controller.ts
      apps/web/.../settings/AiEngineCard.tsx
수정  ai-gateway.service.ts(+routing.spec) · ai-engine.service.ts · ai-setting.controller.ts
      ai-engine.mapper.ts · ai-engine.module.ts · dto/request/ai-engine.request.ts
      packages/types/.../rbac.types.ts · packages/common/.../permission-matrix.ts
      apps/web/.../settings.{service,hooks}.ts · SettingsPage.tsx · locales × 6
```

## 4. 결함 2건 — 무엇이었고 어떻게 실증했나

두 결함 모두 **지금은 발생하지 않는 상태**였습니다. 테넌트 소유 엔진이 0건이었기 때문입니다.
이번 기능이 정확히 그 전제 조건을 만듭니다.

스테이징에 **tenant 2 소유·기본값 엔진 1건을 임시로 넣고**, 코드가 실행하는 쿼리를 수정 전/후
형태로 실데이터에 대조한 뒤 삭제했습니다(잔존 0건 확인).

| | 수정 전 쿼리 결과 | 수정 후 |
|---|---|---|
| **D-2** 플랫폼 폴백 | `Built-in Stub`(NULL) + **`TEMP`(tenant 2)** 2행. `findOne`에 정렬이 없어 **남의 엔진이 뽑힐 수 있었음** | `Built-in Stub` 1행 |
| **D-1** 테넌트 목록 | 4행, **맨 앞이 `TEMP`(tenant 2)** — 목록은 `ORDER BY id DESC`라 남의 최신 엔진이 최상단 | 플랫폼 3행만 |

D-2가 현실이 됐다면 **다른 테넌트의 대화가 그 엔진과 그 API 키로 응답되고 그쪽에 청구**됩니다.

**테스트 더블도 함께 고쳤습니다.** 기존 더블은 "테넌트 조건이 없으면 플랫폼"으로 취급해서,
결함이 있는 코드도 통과시켰습니다. 지금은 `IsNull()`과 숫자를 구분합니다 — 이게 없었으면
회귀 테스트가 회귀를 못 잡습니다.

## 5. 설계 판단 기록

- **`tenant_id`는 호출자에서**, 본문에서 받지 않습니다. 어드민 DTO는 받지만 테넌트 경로가
  받으면 남의 테넌트에 엔진을 심을 수 있습니다.
- **소유 검사는 WHERE 절에.** 로드 후 비교는 한 곳만 잊으면 그 한 곳이 전부입니다.
- **키 없는 엔진은 비활성.** 활성인데 못 부르면 게이트웨이가 조용히 stub으로 떨어집니다
  ([[staging-ai-stub-blockers]]에서 이미 겪음).
- **빈 키 입력은 유지, 삭제 아님.** 폼이 저장된 키를 보여줄 수 없으니 공백이 정상 상태입니다.
- **사용 중 삭제 거부 + 기능 이름 명시.** "사용 중"만 말하면 6개 기능을 뒤져야 합니다.
- **연결 테스트 실패를 4종으로 분리.** 401을 "연결 실패"로 보이면 멀쩡한 서버를 확인하러 갑니다
  ([[fail-classification-copy]]).
- **프로바이더는 어댑터 있는 것만.** `custom`은 저장돼도 답하지 않습니다.
- **`NONE`을 답하는 쪽을 택했습니다**(R-3). 폴백을 넓히면 응답률은 오르지만 그 응답은 남의
  키로 나가고 남에게 청구됩니다.

## 6. 잔여

| # | 내용 |
|---|---|
| **R-1** | **인증 경로 검증 미완** — 세션 중 `dev@amoeba.group` 비밀번호가 바뀌어(계정은 active) 로그인하지 못했습니다. 배포 산출물(dist·번들)과 쿼리 수준 실증까지는 끝냈습니다 |
| R-2 | 콘솔 실화면 스모크 TCR §3 M-1~M-10 — 사람 필요 |
| R-3 | vi/ja/zh 신규 문구는 LLM 초벌(β), 원어민 검수 대기 |
| R-4 | 프로덕션 배포 시 마이그레이션 불필요, 코드만 |
| R-5 | 테넌트 키 사용 시 **과금 주체가 테넌트로 이동** — 영업·계약 안내가 필요합니다(REQ D3) |
