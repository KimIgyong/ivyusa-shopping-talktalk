# TCR-260824 — 테넌트 로그인 경로 /user/{slug} + 잠금 복구 + 임시비밀번호 이메일

- 근거: PLN-260824-Login-Path-Lockout-Recovery.md
- 스키마 변경 없음(마이그레이션 불필요). 에러코드는 E1011/E1012가 MFA에 선점되어 있어
  **E1013(복구 요청 제한)/E1014(이메일 불가)** 로 할당 (PLN의 E1011~E1013 표기는 구번호).

## 1. 단위 테스트 (jest — 전체 138 suites / 1,516 tests 통과)

### password-recovery.service.spec.ts (신규 11)
| # | 케이스 | 결과 |
|---|---|---|
| U1 | temp-request: 계정 존재/부재 무관 동일 응답 + 쿼터 동일 소모(열거 방지) | ✅ |
| U2 | temp-request: 발급+메일+잠금해제+감사(`user.temp_password_requested`) | ✅ |
| U3 | temp-request: 메일 발송 실패해도 응답 중립 유지 | ✅ |
| U4 | temp-request: SMTP 미설정 → E1014 (계정 조회 전에 차단) | ✅ |
| U5 | temp-request: 쿼터 초과 전파 + 발급 없음 | ✅ |
| U6 | temp-request: suspended 사용자/테넌트 = 부재와 동일(중립) | ✅ |
| U7 | change: 성공 시 해시 교체·must_change=0·passwordChangedAt 스탬프·잠금 해제·감사 | ✅ |
| U8 | change: 오답 시 **두 예산 동시 소모**(pwchange 쿼터 + 로그인 카운터) 후 E1002 | ✅ |
| U9 | change: 부재 계정도 오답과 동일 E1002(열거 방지) | ✅ |
| U10 | change: 새 비밀번호 = 현재 비밀번호 → E1009(전맥락 재검증) | ✅ |
| U11 | change: 자체 쿼터 초과 시 자격검증 이전 차단 | ✅ |

### user.service.temp-password.spec.ts (기존 1 → 3)
| # | 케이스 | 결과 |
|---|---|---|
| U12 | 기본(옵션 없음): 메일 시도 없음, emailSent 필드 없음(현행 동작 보존) | ✅ |
| U13 | send_email=true: 발송 + 메일에 `/user/<slug>` 링크·평문 포함, 평문 응답 유지 | ✅ |
| U14 | send_email=true + SMTP 미설정: emailSent=false, 평문 반환(수동 전달 폴백) | ✅ |

## 2. 통합 시나리오 (로컬 실행 — dev DB/Redis, dist API + vite)

| # | 시나리오 | 결과 |
|---|---|---|
| I1 | API 부팅 `successfully started` (모듈 DI 포함) | ✅ |
| I2 | `/ivyusa` 진입 → `/user/ivyusa` 자동 리다이렉트(브라우저 확인) | ✅ |
| I3 | 10회 실패 → E1008 잠금 → 로그인 페이지에 잠금 배너 + 버튼 2종 렌더 | ✅ 스크린샷 |
| I4 | wrong-store 힌트가 신경로 `…/user/ivyusa` 표기 | ✅ |
| I5 | [비밀번호 변경] 패널: 규칙 힌트 라이브 검증(10자/3종/일반어) | ✅ |
| I6 | 잠금 상태에서 정답 현재비밀번호로 변경 → 성공 토스트 → 로그인 폼 복귀 → **새 비밀번호 로그인 성공(잠금 해제 실증)** | ✅ |
| I7 | `POST /auth/password/temp-request` SMTP 미설정 로컬 → 503 E1014 | ✅ |
| I8 | `POST /auth/password/change` 약한 새 비밀번호 → 400 (DTO 정책 검증) | ✅ |
| I9 | 오답 change 시 pwchange/user 카운터 Redis 기록 확인 | ✅ (redis-cli scan) |

### 파생 수정 (I6 과정에서 검출)
- **api-client 401 인터셉터가 공개 인증 시도(로그인/SSO/MFA/복구)의 401에도 로그인
  페이지로 리다이렉트** — tenantSlug 저장 전의 신규 방문자는 오답 한 번에 랜딩으로
  튕기고 에러 토스트가 유실됨. → 요청 URL이 공개 인증 엔드포인트면 리다이렉트 생략
  (`apps/web/src/lib/api-client.ts`). 기존에도 잠재해 있던 결함(저장된 tenantSlug가
  현재 경로와 일치하면 증상이 가려짐).

## 3. 엣지 케이스 (설계로 커버, 스테이징에서 재확인 대상)

| # | 케이스 | 처리 |
|---|---|---|
| E1 | ama_token 쿼리로 구경로 진입 | 리다이렉트가 search/hash 보존(스크럽은 신경로 페이지에서 수행) |
| E2 | 슬러그 `user`인 테넌트 생성 시도 | RESERVED_TENANT_SLUGS로 거부 |
| E3 | temp-request 반복(계정당 4회째/시간) | E1013 429 |
| E4 | 관리자 발급 시 메일 실패 | 평문은 모달에 그대로 — 수동 전달 폴백 안내 |
| E5 | MFA 계정의 임시비밀번호 로그인 | 기존 플로우 유지(비밀번호 단계 후 MFA) — 무변경 |

## 4. 스테이징 스모크 계획 (배포 후 실행)

S-1 `/user/ivyusa` 200 · 구 `/ivyusa` 리다이렉트 · `/manual/` 무영향
S-2 신규 라우트 존재 확인: `POST /auth/password/temp-request` (미배포=404, 배포=4xx/2xx)
S-3 dev@ 잠금 재현 → 버튼 → 임시비밀번호 요청 → **실메일 수신**(SMTP 구성됨) → 임시비밀번호 로그인 → 강제변경
S-4 change API로 잠금 해제 확인
S-5 콘솔 /users에서 발급+이메일 발송 체크 → emailSent 표시
S-6 기존 로그인·MFA(admin@)·위젯 무회귀
