# PLN-260824 — 테넌트 로그인 경로 /user/{slug} + 잠금 복구 + 임시비밀번호 이메일

- 근거: `docs/analysis/REQ-260824-Login-Path-Lockout-Recovery.md`
- 스키마 변경: **없음** (마이그레이션 불필요 — 기존 `must_change_password`, MailerService 활용)
- 신규 에러코드: E1011~E1013 (E1010은 MFA M3 예약이므로 건너뜀)

## 결정 사항 (REQ §6 확정안)

- **D1 구경로 유지**: `/{slug}` → `/user/{slug}` 클라이언트 리다이렉트 **무기한 유지**
  (쿼리·해시 보존 — ama_token 경유 SSO, 북마크, 매뉴얼 링크 전부 무중단).
- **D2 비밀번호 변경 방식**: 공개 API `POST /auth/password/change` 신설.
  - email + tenant_slug + 현재(또는 임시) 비밀번호 + 새 비밀번호.
  - **전용 리미터(계정당 5회/시간, IP당 15회/시간, 항상 집계·항상 검사)** — 로그인
    잠금과 독립이라 "정상 비밀번호를 아는데 잠긴" 사용자는 통과하고, 공격자에게는
    로그인(10회/10분)보다 좁은 추측 예산만 추가됨. 실패도 로그인 리미터에 함께 기록.
  - 성공 시: 비밀번호 변경 + `must_change_password=0` + 로그인 잠금 클리어 + 감사로그.
- **D3 SMTP 미설정 폴백**: 셀프 요청 시 MailerService `configured()`가 false면 발급하지
  않고 `E1013`("이메일 발송을 사용할 수 없습니다 — 관리자에게 문의") 반환. 계정 존재
  여부와 무관한 사전 검사라 열거 위험 없음.

## Stage 구성

### S1 — 경로 변경 `/user/{slug}` (프런트 전용)

| 파일 | 변경 |
|---|---|
| `apps/web/src/router/AppRouter.tsx` | `/user/:tenantSlug` → TenantLoginPage; `/:tenantSlug` → `<LegacySlugRedirect />` (search+hash 보존 Navigate) |
| `apps/web/src/lib/tenant-path.ts` (신규) | `tenantLoginPath(slug)` 헬퍼 — URL 생성 일원화 |
| `lib/api-client.ts` · `layouts/Sidebar.tsx` · `landing/LandingPage.tsx`(2곳) · `admin/TenantUsersPage.tsx` · `auth/LoginTroubleHint.tsx` | `/${slug}` → `tenantLoginPath(slug)` |
| `apps/api/src/global/constant/reserved-slug.constant.ts` | `'user'` 추가 |
| `apps/web/public/manual/*.md`(+html) · `docs/guide/GUIDE-260824-Quick-Setup-Manual.md` 등 | `/{slug}` 표기 → `/user/{slug}` (사본 동반 갱신 원칙) |

- 검증: `user` 슬러그 테넌트 스테이징 부재 확인 완료(8/24, by-slug 404).
- ama 포털: 구경로로 진입해도 리다이렉트가 ama_token 쿼리를 보존 → 무중단.
  (포털 측 URL은 추후 여유 있을 때 갱신 권고 — 백로그로 기록만.)

### S2 — 백엔드: 셀프서비스 임시비밀번호 + 잠금 중 비밀번호 변경

새 컨트롤러 경로 (auth 도메인, 모두 `@Public()`):

1. `POST /auth/password/temp-request` — body `{ tenant_slug, email }`
   - 리미터(신설 scope `pwreset`): 계정당 **3회/시간**, IP당 **10회/시간** → 초과 시 `E1011`.
   - SMTP 미설정 → `E1013` (발급 없이 즉시).
   - 대상 조회: tenant_slug → tenant, email → 해당 테넌트 활성 사용자.
     **존재하지 않아도 동일한 성공 응답** `{ requested: true }` (열거 방지).
   - 존재 시: 기존 `UserService.issueTempPassword()` 재사용(잠금 클리어·must_change·감사
     로그 포함, actorType은 셀프 요청임을 구분해 `user.temp_password_requested`로 기록)
     → MailerService로 발송(영문+한글 병기 고정 문안, 베스트에포트 — 실패해도 응답 동일,
     실패는 warn 로그).
2. `POST /auth/password/change` — body `{ tenant_slug, email, current_password, new_password }`
   - 전용 리미터(scope `pwchange`): 계정당 5회/시간, IP당 15회/시간 → 초과 시 `E1011`.
   - 현재 비밀번호 불일치 → `E1002` + 양쪽 리미터 실패 기록.
   - 새 비밀번호는 기존 password-policy 검사(`E1009`).
   - 성공: bcrypt 교체, `must_change_password=0`, `password_changed_at=NOW`(리프레시 무효화),
     로그인 잠금 클리어, 감사로그 `user.password_changed_self`.
- 에러코드 신설: `E1011 PASSWORD_RESET_RATE_LIMITED`, `E1012`(예비), `E1013 EMAIL_UNAVAILABLE`.
- 단위테스트: 리미터 경계, 중립 응답(존재/부재 동일), SMTP 미설정 폴백, 잠금 해제 여부,
  정책 위반, 메일 실패 시에도 발급 유지.

### S3 — 프런트: 잠금 복구 UI (TenantLoginPage)

- `LoginTroubleHint` 잠금 배너 하단에 버튼 2개 → 클릭 시 로그인 폼 자리에 인라인 패널 전환.
- 신규 컴포넌트 `PasswordRecoveryPanel.tsx` (mode: `'temp-request' | 'change'`).
- 성공/실패 토스트 필수(UX 표준): 요청 성공 = 중립 문구, `E1013` = 관리자 문의 안내,
  `E1011` = 요청 한도 안내. 변경 성공 시 로그인 폼 복귀 + 이메일 프리필.
- i18n: `auth` 네임스페이스에 신규 키 ~15개 × 6개 언어, `npm run i18n:check`.

와이어프레임 — 잠금 상태:
```
┌────────────────────────────────────────────┐
│  ⛔ 로그인이 잠시 제한되었습니다              │
│  시도 횟수를 초과했습니다. 잠시 후 다시      │
│  시도하거나 아래 방법으로 복구하세요.        │
│  ┌──────────────┐ ┌────────────────────┐   │
│  │ 비밀번호 변경 │ │ 임시비밀번호 요청   │   │
│  └──────────────┘ └────────────────────┘   │
├────────────────────────────────────────────┤
│  (기존 로그인 폼 — 그대로 유지)              │
└────────────────────────────────────────────┘
```
임시비밀번호 요청 패널(로그인 폼 자리 전환):
```
┌────────────────────────────────────────────┐
│  임시비밀번호 요청                           │
│  가입된 이메일로 임시비밀번호를 보내드립니다. │
│  이메일   [ user@example.com          ]     │
│  ┌────────────┐  ┌───────┐                 │
│  │ 요청하기    │  │ 취소  │                 │
│  └────────────┘  └───────┘                 │
│  ✓ 계정이 있다면 이메일로 안내를 보냈습니다.  │
└────────────────────────────────────────────┘
```
비밀번호 변경 패널:
```
┌────────────────────────────────────────────┐
│  비밀번호 변경                               │
│  현재 또는 임시 비밀번호로 본인 확인 후       │
│  새 비밀번호로 변경합니다. (변경 시 잠금 해제)│
│  이메일          [                    ]     │
│  현재/임시 비밀번호 [                  ]     │
│  새 비밀번호      [                    ]     │
│  새 비밀번호 확인  [                    ]     │
│  ┌────────────┐  ┌───────┐                 │
│  │ 변경하기    │  │ 취소  │                 │
│  └────────────┘  └───────┘                 │
└────────────────────────────────────────────┘
```

### S4 — 관리자 임시비밀번호 이메일 발송

- API: 기존 `POST /users/:id/temp-password` body에 선택 필드 `{ send_email?: boolean }`
  (기본 false=현행 유지). true면 발급 후 MailerService 발송, 응답에 `emailSent: boolean`
  추가(평문 tempPassword는 계속 반환 — 발송 실패 시 수동 전달 폴백). 시스템 어드민용
  `admin-tenant-user` 동일 적용.
- UI(UsersPage + TenantUsersPage): 발급 확인 다이얼로그에 "이메일로도 발송" 체크박스,
  결과 모달에 발송 성공/실패 표시.

와이어프레임 — 발급 결과 모달(변경분만):
```
┌────────────────────────────────────────────┐
│  임시비밀번호 발급됨 — user@example.com      │
│  [ Xk3!fj9Q ]  [복사]                       │
│  ☑ 이메일로도 발송   ✓ 발송됨 / ⚠ 발송 실패  │
│                         (수동 전달 필요)     │
└────────────────────────────────────────────┘
```

### S5 — TCR/RPT + 스테이징 배포

- TCR: (a) 신경로·구경로 리다이렉트(쿼리 보존), (b) 잠금 재현 후 버튼 2종 E2E,
  (c) 셀프 요청 → 실메일 수신 → 임시비밀번호 로그인 → 강제 변경, (d) 변경 API로 잠금 해제,
  (e) 중립 응답·리미터·E1013 폴백, (f) 관리자 이메일 발송, (g) 기존 로그인/MFA/SSO 무회귀.
- 배포: 스키마 변경 없음 → SQL 사전 적용 불필요. 검증은 401/404 규칙 + 신규 라우트 HTTP 확인.

## 사이드 임팩트 분석

| 영역 | 영향 | 대응 |
|---|---|---|
| ama iframe SSO | 구경로 진입 | 리다이렉트가 쿼리 보존 → 무영향(스크럽 로직은 신경로에서 동작) |
| 매뉴얼/가이드 링크 | 구경로 표기 | 리다이렉트로 동작 유지 + S1에서 표기 갱신 |
| 위젯/스토어프런트 | 슬러그 로그인 미사용 | 무영향 |
| 로그인 리미터 | 새 검증 채널 2개 추가 | 전용 리미터 상시 집계로 추측 예산 통제(위 D2) |
| 임시비밀번호 발급 DoS | 셀프 요청이 기존 비밀번호 교체 | 계정당 3회/시간 제한 + 감사로그 |
| MFA 사용자 | 임시비밀번호 로그인 후에도 MFA 단계 유지 | 기존 플로우 그대로(무변경) |
| 어드민 콘솔(/admin) 로그인 | 요구 범위 밖 | 이번엔 테넌트 로그인만(어드민 잠금 복구는 백로그) |

## 예상 규모·순서

S1(소) → S2(중) → S3(중) → S4(소) → S5. PR은 S1 단독 1건 + S2~S4 묶음 1건(또는 전체 1건,
리뷰 편의에 따라). 브랜치 `feature/login-path-lockout-recovery`.

---
**⚠️ 본 PLN 승인 후 구현 착수합니다. 위 결정안(D1~D3 확정 포함)으로 진행해도 좋을지
확인 부탁드립니다.**
