# FIX-260813 — 401(계정 거부)이 "연결 오류"로 표시된다

- 발견: 스테이징 `/settings` (tenant `amoebaorder`) btbz 릴레이 채널 연결 테스트, 2026-08-13
- 대상: `apps/api/src/domain/messenger/adapter/*`, `apps/web/src/domain/settings/messenger.hooks.ts`
- 상태: **수정 적용** — 브랜치 `fix/relay-401-copy`

---

## 1. 증상

콘솔 연결 테스트가 실패하고, 화면에는 "연결 실패"만 떴다.

```json
{ "ok": false,
  "detail": "btbz relay login failed: 401 at https://messenger.amoeba.site/api/auth/login" }
```

읽는 쪽에서는 **메시지 중계서버 연결 오류**로 해석됐다. 실제로는 서버가 살아 있었다.

## 2. 원인 — 두 겹

**(1) 진단(사실관계).** 401은 연결 실패가 아니라 **릴레이가 계정을 거부한 응답**이다.

```
GET  https://messenger.amoeba.site/       → 302        (서버 정상)
POST /api/auth/login (임의 계정)           → 401 {"message":"invalid credentials"}
```

스테이징 DB `messenger_channels`에 저장된 자격증명이 ShopTalk 콘솔 계정이었다.
(값은 출력하지 않고 복호화 후 형태만 확인 — 길이 9, `am`으로 시작, `@`로 끝 = 시드 비밀번호 형태)

| id | tenant | email | base_url | status |
|---|---|---|---|---|
| 1 | 3 amoebaorder | admin@amoeba.group | https://messenger.amoeba.site | error |
| 2 | 1 ivyusa | dev@amoeba.group | https://messenger.amoeba.site | error |

messenger.amoeba.site(KSR)는 **자체 운영자 계정 체계**라 ShopTalk 로그인을 알지 못한다.
→ 데이터 수정(올바른 릴레이 운영자 계정 입력)은 사용자 확인 대기.

**(2) 결함(코드).** 어댑터가 실패를 문자열 하나로만 돌려주고, 콘솔은 그 전부를
`messenger.testFailed` = "연결 실패 — {{detail}}"로 렌더했다. 그래서 **네 가지 서로 다른 상황**이
한 문구로 합쳐졌다.

| 실제 상황 | 조치할 곳 | 기존 표시 |
|---|---|---|
| 401/403 계정 거부 | 계정/비밀번호 | 연결 실패 |
| 404 | 서버 URL | 연결 실패 |
| 응답 없음(DNS/거부/타임아웃) | 네트워크·서버 가동 | 연결 실패 |
| 5xx | 상대 서버 (대기) | 연결 실패 |

FIX-260810에서 같은 자리의 404를 "URL을 메시지에 넣는" 방식으로 완화했지만, 분류 자체가 없어
401에서 그대로 재발했다.

## 3. 수정

**분류 도입** — `TestResult.reason` (`credentials` / `not_found` / `unreachable` / `provider_error`).
선택 필드라 구분 못 하는 어댑터는 기존 문구로 폴백한다 (추측한 원인을 보여주지 않는다).

- `adapter-failure.util.ts` (신규): `AdapterFailure`(어댑터가 스스로 분류) + 메시지 기반 폴백 분류.
  401/403 메시지에는 **"use the … operator account, not the ShopTalk console login"** 힌트를 넣었다 —
  이번 오진의 실제 원인이 그것이었다.
- `btbz-relay.adapter.ts`: 로그인 fetch를 try/catch로 감싸 **응답 없음**과 상태코드를 분리, 401/404/5xx 구분.
- `amoeba-talk-hub.adapter.ts`: signin 실패에 같은 분류 적용 (동일 구조·동일 함정).
- `telegram / viber / gmail-imap`: `failedTest(e)`로 통일. IMAP은 상태코드가 없어 `AUTHENTICATIONFAILED`
  같은 문구로 분류한다.
- 콘솔: 사유별 문구 4종 (`testRejected` / `testNotFound` / `testUnreachable` / `testProviderError`),
  en·ko·es 등록. 예) 계정 거부 →
  *"계정 거부 — 서버는 응답했고 이메일/비밀번호가 맞지 않습니다. ShopTalk 로그인이 아니라 해당 서비스의 운영자 계정을 입력하세요."*

`last_error` 컬럼(255자)에 그대로 저장되므로 메시지는 200자 이내로 자른다.

## 4. 테스트

`apps/api` — 신규 `adapter-failure.util.spec.ts` 9케이스, `btbz-relay.adapter.spec.ts` 3케이스 추가.

```
messenger 도메인 전체: 11 suites / 122 tests passed
npm run typecheck: 9/9 passed
```

주요 케이스: 401→credentials(+계정 힌트), 404→not_found(비밀번호 언급 없음), fetch 실패→unreachable,
`conversation 404 has no messages` 같은 문장을 상태코드로 오독하지 않을 것, 미분류는 `undefined` 유지.

## 5. 예방 패턴

**실패를 한 문구로 합치지 말 것 — 조치할 곳이 다르면 다른 문구다.**
특히 **인증 거부(401/403)와 도달 실패는 정반대 진단**이다. 401은 "상대가 살아 있다"는 증거인데,
"연결 실패"로 표시하면 살아 있는 서버를 죽은 것으로 보게 만든다.

부수 규칙 두 가지:
- 외부 계정 입력란은 **어느 시스템의 계정인지** 오류 문구에서 다시 말해준다 (자사 콘솔 계정 오입력이 흔하다).
- 분류가 불확실하면 **비워 둔다**. 틀린 원인 표시는 무표시보다 나쁘다.
