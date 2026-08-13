# PLN-260813-AMA-Iframe-SSO

REQ-260813-AMA-Iframe-SSO 구현 계획. 결정 확정(2026-08-13 권장안 승인):
D1 email 일치 기존 사용자만 · D2 슬러그 고정 · D3 ama 내부 사용자만 · D4 SSO는 ShopTalk MFA 면제 ·
D5 테넌트 콘솔만(/admin 제외) · D6 SLO 제외.

**스키마 변경 없음** — SQL 마이그레이션·Migration 섹션 불요. ama 측 작업(클라이언트 등록·메뉴)은
S4 명세 문서로 분담.

## S1. 콘솔 iframe 허용 (G1)

`docker/staging/nginx.web.conf`:
```
- add_header X-Frame-Options "DENY" always;
- add_header Content-Security-Policy "frame-ancestors 'none'" always;
+ add_header Content-Security-Policy "frame-ancestors 'self' https://ama.amoeba.site" always;
```
- `X-Frame-Options`는 제거(ALLOW-FROM 사장 — CSP frame-ancestors가 상위 호환).
- 위젯(`nginx.widget.conf`)·PWA(`nginx.pwa.conf`) 불변. 웹 컨테이너 리빌드로 반영.

## S2. SSO 수용 API (G2) — `POST /api/v1/auth/sso/ama` `@Public`

request(snake): `{ ama_token: string, tenant_slug: string }` → response: 기존 `AuthTokensResponse` 재사용.

처리 순서 (`auth` 도메인 내 `ama-sso.service.ts` 신설, AuthService.issue 재사용):
1. **기능 게이트**: env `AMA_SSO_CLIENT_ID` 미설정 시 즉시 거절(E-code) — 배포는 되나 비활성.
2. **레이트리밋**: 기존 `LoginRateLimitService` 재사용(IP + tenant_slug 축).
3. **교환**: ama `POST {AMA_SSO_TOKEN_URL}` — `grant_type=ama_session, ama_token, client_id, client_secret, scope=profile` (서버→서버, secret은 env로만 보관).
4. **신원**: ama `GET /oauth/userinfo` (Bearer 교환토큰) → email 확보. email 부재 시 거절.
5. **매핑(D1/D2)**: `tenant_slug`→tenant 조회 → 해당 tenant의 active 사용자 중 email 일치 검색(기존 email_hash 블라인드 인덱스 경로 재사용). 불일치·비활성 → 거절.
6. **발급(D4)**: 기존 `issue()` 경로로 ShopTalk 자체 JWT — `mustChangePassword` 잠금은 유지, **MFA enforcement는 미적용**(ama 인증 신뢰; MFA 등록 계정도 SSO 진입은 통과).
7. **감사·로그**: 성공/실패 모두 `AuditService.write`(action `auth.sso_ama`, 실패 사유 포함) + 거절 지점 `logger.warn`(4xx 무로그 함정 방지).

에러 코드: 신규 블록 1개(다음 빈 Exxxx)에 `AMA_SSO_DISABLED / AMA_TOKEN_INVALID / AMA_SSO_USER_NOT_MAPPED` 3종.
env 추가(`env/backend/.env.development` + 스테이징 수동 반영): `AMA_SSO_TOKEN_URL`, `AMA_SSO_USERINFO_URL`, `AMA_SSO_CLIENT_ID`, `AMA_SSO_CLIENT_SECRET`.

## S3. 웹 콘솔 진입 처리 (G3)

테넌트 로그인 라우트(`/{slug}`)에서:
1. URL `?ama_token=` 감지(세션 없을 때만) → 즉시 `history.replaceState`로 파라미터 제거(로그 유출면 축소) → S2 호출.
2. 성공: 기존 auth store에 토큰 저장 → 콘솔 홈 진입(일반 로그인과 동일 경로).
3. 실패: 로그인 화면 + 에러 배너(수동 닫기, i18n en/es/ko — UX 피드백 MUST).
4. 처리 중 스피너 문구("아메바 계정으로 로그인 중…").

**UI 와이어프레임** (변경점 = 로그인 화면 상태 2종):
```
[SSO 처리 중]                          [SSO 실패 → 로그인 폴백]
┌──────────────────────────┐          ┌──────────────────────────┐
│        {tenant logo}     │          │ ⚠ 아메바 SSO 로그인 실패  │
│                          │          │   (사유: 계정 미등록)  [x]│
│   ◌ 아메바 계정으로       │          ├──────────────────────────┤
│     로그인 중...          │          │  email  [____________]   │
│                          │          │  pw     [____________]   │
│                          │          │        [ 로그인 ]         │
└──────────────────────────┘          └──────────────────────────┘
```

## S4. ama 측 작업 명세 (G5/G6) — `docs/guide/AMA-SSO-INTEGRATION.md`

ama 레포 작업자용(별도 레포, 본 트랙 범위 밖) 스펙 문서:
- 파트너 앱 등록: 이름 ShopTalk, 스코프 `profile`(+필요 시 `users:read`), client_id/secret 발급 → ShopTalk env 전달.
- 메뉴/런처: `AppStorePage` 패턴 재사용 — iframe src `https://shoptalk.amoeba.site/{slug}?ama_token={단명 SSO JWT}` (테넌트별 메뉴 항목 = D2).
- 권고: ama_token TTL 수분 이내·1회용, issuer env 정정(api.amoeba.site → 실제 호스트), 후속 협의로 fragment/postMessage 전환.

## 사이드 임팩트

| 영역 | 영향 | 대응 |
|---|---|---|
| 클릭재킹 면 | frame-ancestors를 'none'→ama 한정 허용 | 허용 오리진 1개 고정, 와일드카드 금지 |
| @Public 신규 엔드포인트 | 무차별 대입·토큰 릴레이 시도 | 레이트리밋 + ama 서버측 검증(시크릿 비공유) + 감사 |
| MFA 우회 경로(D4) | SSO로 MFA 계정 진입 가능 | 의도된 결정(ama 인증 신뢰). ama_token 경로 외 일반 로그인은 기존 MFA 그대로 |
| 기존 로그인 플로우 | 무변경 — SSO는 추가 경로, ama_token 없으면 기존과 동일 | 회귀 테스트로 확인 |
| 위젯/PWA | 무변경 | — |

## 테스트·검증 계획 (TCR로 상세화)
- 단위: 교환 성공→발급 / ama 4xx→AMA_TOKEN_INVALID / email 미매핑·타 테넌트 slug→USER_NOT_MAPPED / 게이트 off→DISABLED / mustChangePassword 계정→pwdPending 유지 / MFA 계정→mfaPending 미설정.
- 스테이징: S1 헤더 curl 확인(frame-ancestors), 신규 라우트 404→배포 후 4xx 확인. E2E는 ama 클라이언트 등록(G5) 후 — 등록 전까지는 로컬 ama 인스턴스 또는 curl로 ama_session 교환만 대체 검증.
- 배포: SQL 없음 → 일반 배포(web+api 리빌드). 스테이징 env 4종 수동 추가 후 배포.

## PR 분할
1. PR-A: S1+S2+S4(가이드) — api·nginx·docs
2. PR-B: S3 — web 콘솔
