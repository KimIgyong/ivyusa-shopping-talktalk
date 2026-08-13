# AMA 포털 → ShopTalk iframe SSO 연동 가이드

ama.amoeba.site(ambManagement)에서 ShopTalk 콘솔을 iframe으로 임베드하고 원클릭 SSO로
진입시키는 설정. ShopTalk 측 구현: PLN-260813-AMA-Iframe-SSO (S1~S3).
**ama 레포 작업자용 명세** — ShopTalk 쪽은 배포 완료 상태를 전제.

## 1. 동작 개요

```
ama 웹(부모) ──iframe──▶ shoptalk.amoeba.site/{tenant_slug}?ama_token={SSO JWT}
                          │ 1. 콘솔이 ama_token 감지, URL에서 즉시 제거
                          │ 2. POST /api/v1/auth/sso/ama {ama_token, tenant_slug}
                          │ 3. ShopTalk API → ama /oauth/token (grant_type=ama_session,
                          │    client_id/secret) — ama가 서명·만료·회수·사용자상태 검증
                          │ 4. ama_token의 email 클레임 ↔ 해당 테넌트의 활성 계정 매핑
                          └▶ 5. ShopTalk 자체 JWT 발급 → 일반 콘솔 세션과 동일
```

앱스토어 임베드(REQ-260609, `AppStorePage.tsx` + `buildStoreUrl()` Phase B)와 같은 패턴.

## 2. ama 측 필요 작업

### 2a. 파트너 앱 등록 (1회)
| 항목 | 값 |
|---|---|
| 앱 이름 | ShopTalk |
| 스코프 | `profile` (최소) |
| 발급물 | client_id / client_secret → ShopTalk 운영자에게 전달(안전 채널) |

ShopTalk 스테이징 env에 반영: `AMA_SSO_TOKEN_URL=https://ama.amoeba.site/api/v1/oauth/token`,
`AMA_SSO_CLIENT_ID`, `AMA_SSO_CLIENT_SECRET`. 셋 중 하나라도 비면 기능 자체가 비활성(E5029).

### 2b. 메뉴/런처 추가
`AppStorePage` 패턴 재사용 — iframe src:
```
https://shoptalk.amoeba.site/{tenant_slug}?ama_token={SSO JWT}
```
- `tenant_slug`는 메뉴 항목별 고정(결정 D2): 예) `ivyusa`, `amoebaorder`.
- iframe `sandbox`에 `allow-same-origin allow-scripts allow-forms allow-popups` 필요
  (콘솔 SPA + 팝업 로그인 폴백).

### 2c. ama_token 요건 (MUST)
`ama_session` 그랜트로 교환 가능한 ama JWT — 기존 세션 JWT 또는 백엔드 발급 SSO JWT.
| 요건 | 이유 |
|---|---|
| **`email` 클레임 포함** | ShopTalk 계정 매핑 축. ama `/oauth/userinfo`는 email을 반환하지 않으므로 토큰 클레임이 유일한 전달로 — email 없으면 E5030 거절 |
| `sub` + `entityId` 포함 | ama exchangeSession 필수 필드 |
| `type != 'oauth_access'` | ama가 OAuth 토큰 재교환을 거부 |
| **TTL 수분 이내** 권장 | URL 쿼리로 전달되므로 노출면 최소화 |

### 2d. 권고 (후속)
- openid-configuration `issuer`가 `https://api.amoeba.site`로 표기 — 실제 서빙 호스트
  (`https://ama.amoeba.site/api/v1`)와 불일치, env 정정 권장.
- 쿼리 파라미터 대신 fragment(`#ama_token=`) 또는 postMessage 핸드오프 전환 협의.

## 3. ShopTalk 측 사양 (참고)

| 항목 | 값 |
|---|---|
| 수용 엔드포인트 | `POST /api/v1/auth/sso/ama` — body `{ ama_token, tenant_slug }` |
| 매핑 규칙 (D1/D2) | slug의 테넌트에서 email 일치 + `active` 상태 계정만. 자동 생성 없음 |
| MFA (D4) | SSO 진입은 ShopTalk MFA 면제(ama 인증 신뢰). 최초 비밀번호 변경 잠금은 유지 |
| 에러 | `E5029` 미설정 / `E5030` 교환 실패·email 없음 / `E5031` 계정 미매핑(테넌트 부재·정지 포함, 존재 여부 비노출) |
| 레이트리밋 | IP+slug 축, 기존 로그인 리미터와 동일 창 |
| 감사 | `auth.sso_ama`(성공) / `auth.sso_ama_failed`(사유 메타) |
| iframe 허용 | 콘솔 응답 헤더 `Content-Security-Policy: frame-ancestors 'self' https://ama.amoeba.site` |

## 4. 검증 절차 (등록 후)
1. ama에 로그인한 브라우저에서 ShopTalk 메뉴 클릭 → iframe 콘솔이 로그인 화면 없이 열림.
2. ShopTalk 감사 로그에 `auth.sso_ama` 1건.
3. ama 계정 email이 ShopTalk에 없는 사용자로 재시도 → "SSO 로그인 실패" 배너 + 일반 로그인 폼.
4. `curl -s -o /dev/null -w '%{http_code}' -X POST .../auth/sso/ama -d '{"ama_token":"x…x","tenant_slug":"ivyusa"}' -H 'Content-Type: application/json'` → 401 (E5030).
