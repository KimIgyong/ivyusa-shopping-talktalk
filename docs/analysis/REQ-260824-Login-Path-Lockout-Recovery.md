# REQ-260824 — 테넌트 로그인 경로 변경(/user/{slug}) + 잠금 복구(비밀번호 변경·임시비밀번호)

- 요청일: 2026-08-24
- 요청 원문:
  1. `https://shoptalk.amoeba.site/{slug}` → `https://shoptalk.amoeba.site/user/{slug}` 로 경로 변경
  2. 로그인 시도 초과로 잠금상태 발생 시 — [비밀번호 변경] / [임시비밀번호 요청] 버튼 추가
  3. 임시비밀번호는 관리자가 생성 **또는 이메일로 발송** 기능 추가

## 1. AS-IS

### 1.1 테넌트 로그인 경로
- `apps/web/src/router/AppRouter.tsx:97` — 최상위 캐치올 `{ path: '/:tenantSlug', element: <TenantLoginPage /> }`.
  루트의 **모든 1뎁스 경로가 잠재적 테넌트 슬러그**이므로, 실제 라우트와의 충돌을
  `RESERVED_TENANT_SLUGS` (admin/login/api/widget/manual 등 19개,
  `apps/api/src/global/constant/reserved-slug.constant.ts`)로 막고 있음.
  → 새 최상위 경로를 추가할 때마다 예약어를 늘려야 하는 구조적 부담 (8/24 `manual` 예약이 최근 사례).
- `/{slug}` URL을 만들어 쓰는 곳 (경로 변경 시 전부 영향):
  | 위치 | 용도 |
  |---|---|
  | `AppRouter.tsx:97` | 라우트 정의 |
  | `lib/api-client.ts:71` | 401 시 `/${store.tenantSlug}` 로 리다이렉트 |
  | `layouts/Sidebar.tsx:32` | 로그아웃 후 복귀 경로 |
  | `domain/landing/LandingPage.tsx:35,99` | 랜딩의 슬러그 입력 이동 + 링크 |
  | `domain/admin/TenantUsersPage.tsx:73` | 어드민이 복사해 주는 `loginUrl` 표기 |
  | `domain/auth/LoginTroubleHint.tsx` | "지금 이 스토어" URL 표기(`{origin}/{slug}`) |
  | `store/auth-store.ts:19` | 주석(슬러그 보관 명세) |
- **외부 참조(깨지면 안 됨)**: ama 포털 iframe SSO가 `/{slug}?ama_token=…` 으로 진입
  (PLN-260813 S3, 스테이징 연동 대기); 사용자 매뉴얼 사본(`apps/web/public/manual/*.md`,
  `docs/guide/GUIDE-260824-Quick-Setup-Manual.md` 등)과 기존 북마크/공유 링크.

### 1.2 로그인 잠금(브루트포스 방어)
- `LoginRateLimitService` (SEC-H3): Redis 슬라이딩 윈도 **10분**, 계정당 실패 **10회** /
  IP당 **20회** 초과 시 `E1008 LOGIN_RATE_LIMITED` (HTTP 429). 성공 시 계정 카운터만 클리어.
- 프런트(`TenantLoginPage.tsx` + `LoginTroubleHint.tsx`): E1008이면 빨간 잠금 배너
  ("잠시 후 다시 시도") + wrong-store 힌트만 표시. **복구 수단 버튼 없음** — 사용자는
  10분 대기 또는 관리자에게 별도 채널로 연락하는 방법뿐.

### 1.3 임시비밀번호
- 테넌트 콘솔 `/users` (USER_INVITE 권한): `POST /users/:id/temp-password` →
  임시비밀번호 생성, `must_change_password=1`, **계정 잠금 클리어**, 감사로그 기록.
  결과는 모달에 평문 1회 노출 → **관리자가 수동 전달** (이메일 발송 없음 — 8/24 매뉴얼
  검증에서 확정된 사실). 시스템 어드민용 동일 기능(`admin-tenant-user.controller.ts`,
  TenantUsersPage)도 수동 전달만.
- 잠긴 사용자가 **스스로 요청할 방법이 없음**.

### 1.4 이메일 인프라
- `MailerService` (infrastructure/external): SMTP 미설정 시 무해한 no-op, 실패해도
  boolean 반환(베스트에포트). **스테이징에 SMTP_HOST/PORT/USER/PASS + ALERT_EMAIL_FROM
  설정돼 있음**(근무시간외 이메일에서 기사용) → 발송 기반은 이미 존재.

### 1.5 관련 기존 플로우
- 임시비밀번호 로그인 → `mustChangePassword` 플래그 → 강제 비밀번호 변경 화면(기존 동작).
- 비밀번호 정책 `password-policy.util.ts` (`E1009 PASSWORD_POLICY_VIOLATION`).
- MFA: 잠금 클리어와 무관하게 별도 단계로 동작(영향 없음).

## 2. TO-BE

1. **경로**: 테넌트 로그인은 `/user/{slug}`. 기존 `/{slug}`는 **쿼리·해시를 보존한 301성
   클라이언트 리다이렉트**로 유지(ama_token, 북마크 호환). 슬러그 `user` 예약어 추가
   (스테이징에 `user` 슬러그 테넌트 없음 확인, 2026-08-24 by-slug 404).
2. **잠금 복구 UI**: E1008 잠금 배너에 [비밀번호 변경] / [임시비밀번호 요청] 두 버튼.
   - 임시비밀번호 요청: 이메일 입력 → 서버가 임시비밀번호 발급 + **등록된 이메일로 발송**
     (계정 존재 여부를 드러내지 않는 중립 응답, 강한 요청 제한).
   - 비밀번호 변경: 이메일 + 현재(또는 임시) 비밀번호 + 새 비밀번호 → 검증 성공 시
     비밀번호 변경 + 잠금 해제. 전용의 더 엄격한 시도 제한으로 보호(§4 보안).
3. **관리자 발송**: `/users`(및 어드민 TenantUsersPage) 임시비밀번호 발급 시
   "이메일로 발송" 선택지 추가 — 생성(수동 전달)과 발송(자동 메일) 병행.

## 3. 갭 분석

| # | 갭 | 필요 작업 |
|---|---|---|
| G1 | 라우트가 `/:tenantSlug` 캐치올 | `/user/:tenantSlug` 신설 + 구경로 리다이렉트 + 예약어 `user` |
| G2 | 슬러그 URL 생성/표기 6곳이 `/${slug}` | 전부 `/user/${slug}`로 갱신 (공용 헬퍼로 일원화) |
| G3 | 잠금 시 복구 수단 없음 | 버튼 2종 + 인라인 패널 UI (i18n 6개 언어) |
| G4 | 셀프서비스 임시비밀번호 없음 | 공개 API 신설 + 메일 발송 + 요청 제한 + 감사로그 |
| G5 | 잠금 상태 비밀번호 변경 불가 | 공개 change API 신설(전용 리미터) 또는 기존 강제변경 플로우 활용 — PLN에서 결정 |
| G6 | 관리자 발급이 수동 전달만 | 발급 API에 이메일 발송 옵션 + 모달 UI |
| G7 | 매뉴얼·가이드가 `/{slug}` 표기 | public/manual 사본 + GUIDE 원본 표기 갱신(리다이렉트 덕에 긴급 아님) |

## 4. 제약·보안 요구

- **계정 열거 금지**: 셀프서비스 요청은 계정 존재와 무관하게 동일 응답(기존
  LoginTroubleHint의 설계 원칙과 동일 기조).
- **브루트포스 우회 금지**: 잠금 상태에서 동작하는 모든 자격증명 검증 경로는 로그인
  리미터와 **독립적으로 항상 집계되는 전용 리미터**를 가져야 함(로그인 잠금을 우회하는
  무제한 추측 채널이 되면 안 됨).
- **DoS 완화**: 임시비밀번호 발급은 대상 계정의 기존 비밀번호를 교체하므로, 반복 요청으로
  타인 로그인을 방해할 수 있음 → 계정당 요청 횟수 제한 필수(예: 시간당 3회).
- 메일 발송은 베스트에포트(MailerService 계약 유지) — 발송 실패가 발급 자체를 깨면 안 되고,
  SMTP 미설정 환경(로컬)에서는 "관리자 문의" 안내로 폴백.
- 감사로그: 셀프 요청/발송/잠금 중 변경 모두 `AuditService.write` (PII 마스킹).
- i18n: 신규 문구 전부 en/es/ko/vi/ja/zh, `npm run i18n:check` 통과.
- 스키마 변경 없음(기존 컬럼으로 충분) → 마이그레이션 불필요 예상.

## 5. 사용자 플로우 (TO-BE)

```
[잠금 발생]
고객사 직원 ── 로그인 10회 실패 ──▶ E1008 잠금 배너
   ├─ [임시비밀번호 요청] → 이메일 입력 → "등록된 이메일로 안내를 보냈습니다"(중립)
   │      └─ 메일 수신 → 임시비밀번호로 로그인(발급 시 잠금 해제됨) → 강제 변경 화면 → 완료
   └─ [비밀번호 변경] → 이메일+현재/임시 비밀번호+새 비밀번호 → 성공 시 잠금 해제+변경 → 로그인

[관리자 경로]
테넌트 마스터 ── /users → 임시비밀번호 발급
   ├─ (기존) 평문 확인 후 수동 전달
   └─ (신규) [이메일로 발송] → 대상자 메일로 자동 발송
```

## 6. 결정 필요 사항 (PLN에서 확정)

- D1: 구경로 `/{slug}` 리다이렉트의 유지 기간(무기한 vs 과도기) — 권고: 무기한(비용 0).
- D2: [비밀번호 변경]의 방식 — 공개 change API(전용 리미터) vs 임시비밀번호 수령 후 기존
  강제변경 플로우로 안내만. 권고: 공개 change API(임시비밀번호를 받은 직후 로그인 없이
  바로 변경 가능, 요구사항 문구에 부합).
- D3: 셀프 요청 시 SMTP 미설정 환경 폴백 — 권고: 에러 대신 "관리자에게 문의" 안내 응답.
