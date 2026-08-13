# REQ-260813-AMA-Iframe-SSO

ama.amoeba.site(아메바 관리 포털)에서 ShopTalk 콘솔을 iframe으로 임베드하고,
ama 발행 JWT로 ShopTalk에 SSO 로그인하는 방안 검토.

- 요구 원문: ① ama.amoeba.site에서 iframe으로 shoptalk.amoeba.site 접근 가능해야 함 ② ama가 발행하는 JWT 토큰으로 SSO 로그인 방안 검토
- 분석 렌즈: 적정기술·재사용·연결(amoeba-bitbiz 철학) — ama에 이미 있는 OAuth 인프라를 최대 재사용

## 1. AS-IS

### 1a. ShopTalk (이 레포)
| 항목 | 현황 |
|---|---|
| iframe 차단 | 웹 콘솔 nginx가 `X-Frame-Options: DENY` + `Content-Security-Policy: frame-ancestors 'none'` (`docker/staging/nginx.web.conf:22-23`) — **전면 차단**. PWA도 DENY. 위젯(nginx.widget.conf)은 스토어프론트 임베드용으로 의도적 허용 |
| 콘솔 인증 | 자체 HS256 JWT(access+refresh, refresh는 Redis jti 화이트리스트). **Bearer 헤더 방식, 쿠키 미사용**(`apps/web/src/lib/api-client.ts:23`) → iframe 서드파티 쿠키/스토리지 파티셔닝 이슈 **없음** (로그인·API 호출 모두 iframe 오리진 내에서 완결) |
| Principal | actorType(admin/user)·tenantId·rank·labels — 멀티테넌트 축 |
| 테넌트 진입 | 슬러그 라우팅 `/{slug}` (PR #24) |
| SSO 수용 창구 | 없음 (신규 필요) |

### 1b. ama (ambManagement, `/Users/gray/Desktop/Site/ambManagement`)
| 항목 | 현황 |
|---|---|
| OAuth2/OIDC 제공자 | **완비** — `/oauth/authorize`(+consent)·`/token`·`/userinfo`·`/introspect`·`/revoke`·`.well-known/openid-configuration`·`jwks.json`. PKCE S256, 클라이언트 레지스트리(파트너 앱), 스코프·쿼터·감사 포함 |
| **`ama_session` 그랜트** | 커스텀 그랜트: **AMA 세션 JWT → OAuth access_token 교환**(`oauth.service.ts` exchangeSession — client_id/secret 검증 + ama JWT 서버측 검증 + 사용자 상태 확인). REQ-260609 "앱스토어 SSO 진입"용으로 이미 운영 중 |
| 임베디드 앱 실행 패턴 | **iframe + URL 파라미터 토큰 핸드오프 기성품**: `AppStorePage.tsx`가 iframe으로 외부 앱을 띄우고 `buildStoreUrl()`이 `?ama_token={SSO JWT}` 전달(Phase B) → 앱이 `ama_session` 그랜트로 교환 → `/oauth/userinfo`로 신원 확인 |
| 서명 | RS256(키 설정 시)+JWKS 공개, HS256 폴백. **운영 JWKS는 현재 빈 keys**(`https://ama.amoeba.site/api/v1/oauth/.well-known/jwks.json` → `{"keys":[]}`) = HS256 폴백 운용 중 |
| 내부 세션 JWT | sub/email/level/role/status/companyId/entityId/… (httpOnly 쿠키 access_token) |
| 디스커버리 이슈 | openid-configuration의 issuer/엔드포인트가 `https://api.amoeba.site`로 표기되나 실제 응답 경로는 `https://ama.amoeba.site/api/v1/oauth/*` — **issuer 환경변수 불일치**(ama측 정정 대상, 본 건 차단 요소는 아님) |

## 2. TO-BE

```
┌─ ama.amoeba.site (부모, ama 세션 보유) ──────────────────────┐
│  메뉴 "ShopTalk" 클릭                                          │
│  ┌─ iframe: shoptalk.amoeba.site/{slug}?ama_token=... ──────┐ │
│  │ 1. ShopTalk 웹: 세션 없음 + ama_token 감지               │ │
│  │ 2. POST /api/v1/auth/sso/ama { ama_token }               │ │
│  │    ShopTalk API ──(grant_type=ama_session,               │ │
│  │      client_id/secret)──▶ ama /oauth/token               │ │
│  │    ──▶ ama /oauth/userinfo (email, entityId, role…)      │ │
│  │ 3. 계정 매핑(§5 미결정) → ShopTalk 자체 JWT 발급          │ │
│  │ 4. 이후 기존과 동일 (Bearer, RBAC, 감사)                  │ │
│  └───────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

- ShopTalk 세션은 **항상 자체 JWT** — ama 토큰은 "신원 증명 1회용"으로만 쓰고 버림. 기존 RBAC/가드/감사 체계 무변경.
- ama 토큰 검증은 **ama 서버가 수행**(ama_session 교환) → ShopTalk은 ama의 JWT 시크릿·키를 알 필요 없음(시크릿 공유 없음). JWKS 빈 상태도 무관.

## 3. 갭 분석

| # | 갭 | 작업 | 측 |
|---|---|---|---|
| G1 | 콘솔 iframe 전면 차단 | `nginx.web.conf`: `X-Frame-Options` 제거(ALLOW-FROM은 사장된 스펙) + `frame-ancestors 'self' https://ama.amoeba.site`로 교체. 위젯·PWA 불변 | ShopTalk |
| G2 | SSO 수용 엔드포인트 부재 | `POST /auth/sso/ama` 신규: ama_token 수취 → ama_session 교환 → userinfo → 매핑 → 자체 JWT 발급(+감사 로그, 실패 사유 코드) | ShopTalk |
| G3 | 웹 콘솔 진입 처리 부재 | 라우터에서 `?ama_token=` 감지 → G2 호출 → 토큰 저장 → 파라미터 즉시 제거(replaceState). 실패 시 기존 로그인 화면 폴백 | ShopTalk |
| G4 | 계정 매핑 규칙 미정 | §5 결정 필요 (매핑 축·프로비저닝·권한) | 결정 |
| G5 | ama 클라이언트 미등록 | ama 파트너 앱 레지스트리에 ShopTalk 등록(client_id/secret 발급, 스코프 profile+users:read 수준) | ama(운영 작업) |
| G6 | ama 메뉴/런처 부재 | AppStorePage 패턴 재사용해 ShopTalk 메뉴 추가 + `ama_token` 발급·전달 | ama |

## 4. SSO 방안 비교

| 방안 | 개요 | 평가 |
|---|---|---|
| **A. `ama_session` 그랜트 재사용** (권장) | 위 TO-BE. ama 기성 SSO 진입 패턴 그대로, ShopTalk은 수용 엔드포인트만 신설 | ✅ ama 코드 변경 최소(클라이언트 등록+메뉴), 시크릿 비공유, 토큰 회수·감사 ama 인프라 재사용, 검증 네트워크 콜 2회는 로그인 1회당이라 무시 가능 |
| B. 표준 OIDC code+PKCE 리다이렉트 | iframe 내에서 ama /oauth/authorize로 리다이렉트 → code 콜백 → 교환 | 동작은 함(부모=ama라 same-site 쿠키 전송됨). 그러나 iframe 내 리다이렉트 왕복 UX·콜백 라우트 추가로 A보다 무거움. 외부(비-ama) IdP가 늘어날 때 재검토 |
| C. ama JWT 직접 신뢰(공유 시크릿/JWKS 로컬 검증) | ShopTalk이 ama 토큰을 직접 검증 | ❌ HS256 시크릿 공유는 결합·유출면 확대. RS256 로컬 검증은 운영 JWKS가 비어 있어 선행 작업 필요 + 회수(introspect) 불가. 기각 |

### A안 보안 유의점
- **URL 쿼리 토큰 전달은 ama 기성 패턴이지만 로그·리퍼러 유출면이 있음** → ShopTalk 측은 ①수취 즉시 URL에서 제거 ②ama_token TTL 단축(ama 발급측, 수분) ③1회용(교환 시 소모)을 전제. 개선 여지로 fragment(`#ama_token=`) 또는 postMessage 핸드오프를 ama와 협의(후속).
- ama_session 교환은 ShopTalk **API 서버**가 수행(client_secret은 서버 env, AES 저장 불요 — 단일 자사 연동).
- 매핑 실패(미등록 사용자)는 명시적 오류 화면 + 감사 로그(silent fallback 금지 — invisible-fallback 교훈).

## 5. 미결정 사항 (PLN 전 확정 필요)

| # | 질문 | 선택지 | 권장 |
|---|---|---|---|
| D1 | **계정 매핑 축** | (a) email 일치하는 기존 ShopTalk 사용자만 허용 (b) 매핑 테이블(ama usr_id ↔ shoptalk user) (c) 자동 프로비저닝 | **(a)로 시작** — 적정기술. 미등록자는 안내 후 차단. 필요 시 (c) 후속 |
| D2 | **테넌트 결정** | ama 사용자가 어느 테넌트 콘솔로 들어가나: (a) iframe URL의 슬러그 고정(ama 메뉴가 테넌트별 링크) (b) ama entityId↔tenant 매핑 테이블 | **(a)** — 슬러그 라우팅 기성 재사용, 매핑은 email 일치 사용자의 소속 tenant와 슬러그 일치 검증 |
| D3 | **대상 사용자 레벨** | ama 내부 사용자(운영팀)만? 고객사(CLIENT_LEVEL)도? | 내부 사용자만 1차 |
| D4 | **ShopTalk MFA와의 관계** | SSO 진입 시 ShopTalk MFA (a) 면제(ama 인증 신뢰) (b) 그대로 요구 | **(a)** — 단, mustChangePassword 등 기존 잠금은 유지 |
| D5 | **admin(플랫폼 관리자) SSO 포함 여부** | 테넌트 콘솔만? /admin도? | 테넌트 콘솔만 1차(공격면 최소) |
| D6 | 로그아웃 전파(SLO) | 부모 ama 로그아웃 시 iframe 세션 종료? | 1차 제외 — ShopTalk 세션 TTL로 자연 만료 |

## 6. 제약·전제
- ama 측 작업 2건(G5 클라이언트 등록, G6 메뉴+토큰 전달)은 별도 레포 — 본 트랙에서는 ShopTalk 측(G1~G3) + ama 측 작업 명세 전달로 분담.
- 스테이징 검증은 ama 운영(ama.amoeba.site) ↔ ShopTalk 스테이징(shoptalk.amoeba.site) 조합 — frame-ancestors에 두 환경 도메인 축 확정 필요.
- 스키마 변경: D1(a)/D2(a) 채택 시 **없음**(매핑 테이블 불요) — 배포 리스크 최소.
- 콘솔이 Bearer(비쿠키)라 iframe 환경에서 추가 쿠키 속성(SameSite=None 등) 작업 불요.
