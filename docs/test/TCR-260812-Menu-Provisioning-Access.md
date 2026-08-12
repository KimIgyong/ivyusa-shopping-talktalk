# TCR-260812-Menu-Provisioning-Access

테넌트별 제공 메뉴 + 팀원별 메뉴 접근권한 테스트 케이스.

- 작성일: 2026-08-12
- 대상: PLN-260812-Menu-Provisioning-Access S1~S4
- 자동화: `packages/common/src/rbac/menu-access.spec.ts` (47), `apps/api/src/global/guard/menu-access.guard.spec.ts` (7)

---

## 1. 회귀 게이트 — 아무것도 설정하지 않았을 때 현행과 동일 (T-R)

`menu-access.spec.ts` — 이 그룹이 깨지면 배포 금지.

| ID | 케이스 | 기대 | 결과 |
|---|---|---|---|
| T-R1 | 4직급 × 8라벨 조합(32건) 유효 메뉴 = 구 `capabilitiesFor` 결과 | 완전 일치 | ✅ 32/32 |
| T-R2 | 마스터 기본 | 16개 전부 | ✅ |
| T-R3 | 디렉터 기본 | `users` 제외 15개 | ✅ |
| T-R4 | 매니저 기본(라벨 없음) | 대시보드·AI설정·통계 | ✅ |
| T-R5 | 매니저 + consult | +실시간·이슈·이력 | ✅ |
| T-R6 | 스태프 + operations | +주문만(고객·리뷰 아님) | ✅ |

## 2. 제공(플랜) 계층 (T-P)

| ID | 케이스 | 기대 | 결과 |
|---|---|---|---|
| T-P1 | `plan = NULL` | 16개 전부 제공 | ✅ |
| T-P2 | 미지의 플랜(`legacy-pilot`, 실제 dev는 `custom`) | 16개 전부 제공 | ✅ |
| T-P3 | `starter` | 프리셋 9개, `statistics`·`issues` 미제공 | ✅ |
| T-P4 | 오버라이드 `on`/`off` | 프리셋에 가감 | ✅ |
| T-P5 | 반환 순서 | 오버라이드 순서와 무관하게 카탈로그 순 | ✅ |
| T-P6 | 미제공 메뉴는 마스터도 못 봄 | 유효 메뉴에서 제외 | ✅ |
| T-P7 | 미제공 메뉴에 사용자 `allow` 예외 | 여전히 차단 | ✅ |

## 3. 테넌트 계층 (T-T)

| ID | 케이스 | 기대 | 결과 |
|---|---|---|---|
| T-T1 | 직급 매트릭스로 기본 보유 메뉴 차단 | 숨김 | ✅ |
| T-T2 | 직급 매트릭스로 미보유 메뉴 부여 | 표시 | ✅ |
| T-T3 | 매트릭스로 부여했으나 라벨 없음(라벨 게이트 메뉴) | 여전히 숨김 | ✅ |
| T-T4 | 사용자 `allow` | 매트릭스·라벨 모두 무시하고 표시 | ✅ |
| T-T5 | 사용자 `deny` | 매트릭스 허용을 이김 | ✅ |
| T-T6 | 마스터에 전체 차단 행 주입 | 무시(16개 유지) | ✅ |
| T-T7 | 다른 직급의 행 | 영향 없음 | ✅ |
| T-T8 | 기본값과 동일한 행 저장 | DB에 남지 않음(실측: 3행 전송 → 2행 저장) | ✅ |
| T-T9 | 마스터를 예외 대상으로 PUT | 403 | ✅ |

## 4. 서버 차단 가드 (T-G)

`menu-access.guard.spec.ts` + 로컬 실측.

| ID | 케이스 | 기대 | 결과 |
|---|---|---|---|
| T-G1 | 메뉴 요구 없는 라우트 | 통과 | ✅ |
| T-G2 | `@Public` 라우트(클래스에 게이트가 있어도) | 통과 | ✅ |
| T-G3 | 플랫폼 어드민 | 통과(유효 메뉴 조회조차 안 함) | ✅ |
| T-G4 | 복수 코드 중 하나 보유 | 통과 | ✅ |
| T-G5 | 테넌트 미제공 | 403 **E5029** | ✅ (실측 `/admin/products`) |
| T-G6 | 제공되나 직급 차단 | 403 **E5030** | ✅ (실측 `/campaigns`, rank=manager) |
| T-G7 | 차단 시 `logger.warn` | 로그 기록 | ✅ (`menu gate blocked …`) |
| T-G8 | 게이트 없는 이웃 라우트 | 영향 없음 | ✅ |

## 5. 라우트 인벤토리 (S4 부착 근거)

프런트 각 화면이 실제 호출하는 API를 추출해 분류했다.

### 5.1 전용 — 클래스 레벨 `@RequireMenu`

| 메뉴 | 컨트롤러 | 비고 |
|---|---|---|
| `products` | `admin/products` (ProductAdminController) | 스토어프론트용 `products`는 별개·공개 |
| `campaigns` | `campaigns` | |
| `customers` | `customers` | 실시간 상담은 `/agent/customers/search` 사용 |
| `knowledge` | `knowledge` | 상담용 `/agent/knowledge/ask`는 별개 |
| `users` | `users`, `job-labels` | |
| `work_log` | `audit` | 어드민 콘솔도 쓰지만 어드민은 가드 스킵 |
| `settings` | `messenger/channels`, `tenants/me/cafe24` | |

### 5.2 전용 — 라우트 레벨

| 메뉴 | 라우트 | 이유 |
|---|---|---|
| `reviews` | `GET/PATCH admin/reviews` | 같은 컨트롤러에 `@Public` 리뷰 작성/조회가 섞임 |
| `history` | `GET analytics/conversations`, `analytics/conversations/:id` | 한 컨트롤러가 3개 화면을 지원 |
| `statistics` | `GET analytics/questions` | 위와 동일 |

### 5.3 공유 — **의도적으로 미부착**

| 라우트 | 쓰는 화면 |
|---|---|
| `GET admin/orders` | 주문 + **대시보드** |
| `agent/issues/*` | 이슈 보드 + **실시간 상담** |
| `agent/*` (sessions/conversations/alerts) | 실시간 상담 + 이슈 |
| `chat/*` | AI 설정 미리보기 + **위젯(공개)** |
| `integrations/status` | 설정 + **대시보드** |
| `analytics/dashboard` | 대시보드(전 직급 보유, 랜딩 화면) |
| `tenants/*` (widget-settings/storefront/privacy-notice/me/credentials) | 설정 + 개인정보 고지, 어드민 라우트와 한 컨트롤러 |
| `menu-access/*` | **권한 API 자체** — 게이트를 걸면 자기 자신을 잠근다 |

> 판단 기준: 허용된 화면을 깨뜨리는 게이트 > 빠진 게이트. 확신이 없으면 달지 않는다.

## 6. 수동 스모크 (스테이징 · 미실시)

| ID | 시나리오 | 기대 |
|---|---|---|
| E1 | 어드민 `/admin/tenants` → [제공 메뉴] → 캠페인 `차단` 저장 | 토스트, 결과 열 즉시 `미제공` |
| E2 | 해당 테넌트 마스터 새로고침 | 사이드바에서 캠페인 사라짐 |
| E3 | 그 상태로 `/campaigns` URL 직접 입력 | "접근할 수 없습니다" 안내 + 대시보드 링크 |
| E4 | 같은 상태로 `GET /api/v1/campaigns` 직접 호출 | 403 E5029 |
| E5 | 마스터 `/settings` → 메뉴 접근권한 → 매니저 통계 해제 저장 | 토스트, 매니저 계정 사이드바에서 통계 사라짐 |
| E6 | 사용자 예외로 스태프에게 이력 `허용`(consult 라벨 없음) | 해당 스태프에게 이력 표시 |
| E7 | 마스터 행/마스터 사용자 | 체크박스 비활성, [편집] 버튼 없음 |
| E8 | 플랜 `starter` 테넌트 생성 후 확인 | 9개만 제공, 나머지 취소선 |
| E9 | ko/es 전환 | 신규 문구 전부 번역 표시 |
| E10 | API 일시 중단 상태로 콘솔 진입 | 사이드바가 비지 않음(폴백 동작) |

## 7. 실행 결과 요약

```
packages/common  60 passed  (menu-access 47 + permission-matrix 13)
apps/api        959 passed  (91+1 suites, 신규 guard 7 포함)
typecheck       9/9 tasks   build 6/6 tasks
로컬 부팅       Nest application successfully started · /menu-access/me 401(미인증)/200(인증)
```
