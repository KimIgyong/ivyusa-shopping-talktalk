# RPT-260819-Widget-Hide-On-Login

로그인 화면에서 챗위젯 미노출 — 구현·배포 결과.

- 작성일: 2026-08-19
- 선행: `REQ-260819-Widget-Hide-On-Login.md` · `PLN-260819-Widget-Hide-On-Login.md` ·
  `TCR-260819-Widget-Hide-On-Login.md`
- PR **#321** / squash `0acdf9c`
- 배포: **스테이징 완료 2026-08-19 16:26 KST** · 마이그레이션 **없음**(스키마 무변경)

## 1. 무엇을 고쳤나

요구사항은 "로그인시 챗위젯 hide"였고, 눈에 보이는 부분은 로그인 폼 옆의 96×96 런처였다.
**진짜 문제는 안 보이는 쪽이었다.**

`embed.js`는 로그인하러 나가기 전 `sessionStorage['ivy:reopen']`을 남기고, 복귀한
페이지에서 그걸 **읽고 지운 뒤** 위젯을 주문탭으로 다시 열어준다. 그런데 이 읽고-지우기가
**스크립트가 도는 모든 페이지**에서 일어난다 — 몰 로그인 페이지도 같은 origin이라 스크립트가
돈다. 즉 **로그인 페이지가 플래그를 먼저 써버린다.**

```
상품페이지 set → 로그인페이지에서 소비 → authorize → callback → 복귀
                                                            → 플래그 없음 → 위젯 안 열림
```

티켓 교환은 성공하는데 위젯은 닫힌 채로 돌아온다. 오류가 안 뜨니 "로그인이 또 안 됐나"로
보인다. 그래서 `display:none`이 아니라 **mount 자체를 안 하는** 방식이어야 했다.

## 2. 변경 파일

| 파일 | 내용 |
|---|---|
| `apps/widget/public/embed.js` | 로그인 화면 판정(`signInScreen`) — `boot()`·reopen 읽기·신원 부트스트랩 세 곳이 존중 |
| `apps/widget/test/embed-sign-in.test.mjs` | 신규 12건 (`node --test`) |
| `apps/widget/package.json` | `"test": "node --test test/"` — 이 앱의 **첫 테스트 하네스** |
| `docs/{analysis,plan,test}/…-260819-Widget-Hide-On-Login.md` | REQ·PLN·TCR |

## 3. 적용 범위

| 숨김 | 안 숨김 |
|---|---|
| `/member/login` `/member/join` `/member/agreement` `/member/id/` `/member/passwd/` | `/member/mall_agreement` `/member/privacy` `/member/modify` |
| Shopify `/account/login` `/account/register` `/account/reset` `/account/activate` `/challenge` | `/account`, 상품·장바구니·마이페이지 |
| 우리가 연 Cafe24 로그인 팝업(`ivy_cafe24_auth`) | — |

접두사가 일부러 좁다. 약관 읽다 문의하는 사람에게서 위젯을 뺏지 않는다. 로그인 **후**에는
숨기지 않는다. 오버라이드는 `IVY_WIDGET_CONFIG.hideOnPaths`(목록 교체, `[]`로 해제).

## 4. 구현 중 드러난 것 3건

### 4-1. 팝업 가드가 Shopify 이름만 알고 있었다
팝업 안에서 위젯을 막는 가드가 이미 있었는데 `ivy_auth_popup`만 검사했다. Cafe24 팝업은
`ivy_cafe24_auth`라 그냥 통과 — 480×720 팝업 안에 위젯이 떴다. Shopify 팝업은 "끝났다"를
알리고 닫혀야 하고 Cafe24 팝업은 **아직 진행 중**이라, 닫는 로직에 합치지 않고 분리했다.

### 4-2. 로케일 URL을 그냥 지나쳤다 (자체 리뷰에서 발견)
접두사를 URL 맨 앞에 고정해 비교하니 Shopify 마켓 스토어의 `/en-ca/account/login`이
안 걸렸다. **이 PR이 막으려는 것과 똑같은 종류의 조용한 누락**이라 로케일 모양 세그먼트
1개를 떼고 비교하도록 고쳤다(`/collections/account/login`은 그대로 mount).

### 4-3. 병행 세션과의 충돌 — CI가 잡았다 ⭐
브랜치를 딴 뒤 다른 세션이 `embed.js`에 공개 SDK 표면을 얹었다(PR #319, +189줄).
**파일 병합은 충돌 없이 됐는데 동작이 어긋났다.**

- 새 `embed.js`는 `IVY_WIDGET_CONFIG`가 있거나 `ShopTalk.init()`을 부를 때만 mount한다
- 내 가드가 **조기 return**이라 `window.ShopTalk`이 메서드 없는 빈 객체로 남는다 →
  SDK로 위젯을 다루는 몰이 자기 로그인 페이지에서 `init is not a function`을 맞는다

조기 return을 **플래그**로 바꿔 SDK 표면은 온전히 남기고 동작만 죽였다(T-10·T-11 추가).
로컬은 초록이었고 **GitHub PR CI가 `브랜치 + main` 병합본을 돌려서** 잡혔다.

## 5. 테스트

`apps/widget`에는 하네스가 **없었다.** jsdom을 새로 들이는 대신 Node 내장 `node --test`와
최소 DOM 스텁으로 **실제 배포되는 `public/embed.js`를 그대로 실행**한다. 규칙을 테스트
쪽에 복제하지 않았다 — 복제된 규칙이 어긋나 몰이 엉뚱한 테넌트에 묶인 게 직전 건이다
(`FIX-260819` §G-6).

```
main의 embed.js (가드 없음):  pass 3 / fail 9
이 브랜치:                    pass 12 / fail 0
```

통과하는 3건은 전부 "mount 되어야 한다" 쪽 — 스텁이 실제로 mount를 수행한다는 뜻이다.

전체: `typecheck` ✅ 9/9 · `test` ✅ **1,514건**(api 1,358 + types 84 + common 60 + widget 12) ·
`build` ✅

## 6. 배포와 실측 검증

```
staging  git 0acdf9c · deploy-staging.sh exit=0
         widget/web/pwa/api 컨테이너 재생성, nginx 재기동
         API "Nest application successfully started" · /health {"status":"ok"}
         GET /widget/embed.js → 200, signInScreen 포함
```

**실몰 `amoebaorder.cafe24.com` 확인 (배포 후)**

| 페이지 | 위젯 | SDK | 판정 |
|---|---|---|---|
| `/member/login.html` | **없음** | `ShopTalk` v1, 6개 메서드 전부 | ✅ |
| `/member/id/find_id.html` | **없음** | 존재 | ✅ |
| `/` (메인) | 있음 96×96 | 존재 | ✅ 회귀 없음 |
| `/member/privacy.html` | 있음 | 존재 | ✅ 의도대로 유지 |

## 7. 관측된 운영 이슈 — `embed.js`에 `Cache-Control`이 없다

배포 직후 실몰을 열었을 때 **옛 `embed.js`가 나왔다.** 강제 새로고침 후에야 새 파일이
적용됐다.

```
$ curl -sI https://shoptalk.amoeba.site/widget/embed.js
last-modified: …
etag: …
(cache-control 없음)
```

`Cache-Control`이 없으면 브라우저가 **휴리스틱 캐싱**을 한다 — 신선도를 스스로 추정하므로
배포 후 얼마 동안 옛 로더가 나갈지 **예측할 수 없다.** `embed.js`는 모든 테넌트의 진입점이라
이건 이 변경만의 문제가 아니다. 후속 과제로 남긴다(§8 F-1).

## 8. 후속

| # | 항목 | 상태 |
|---|---|---|
| F-1 | `/widget/embed.js`에 명시적 `Cache-Control` (예: `max-age=300, must-revalidate`) | 미착수. §7 |
| F-2 | TCR S-1(redirect 복귀)·S-2(popup) 실동작 | **tenant 3 재연결 대기.** 자격증명이 `annehearts`를 가리켜 `start`가 실패(`FIX-260819` §8) |
| F-3 | Shopify `/account/login` 실측 | 단위 테스트로만 덮음 |

§6에서 확인한 것은 "로그인 화면에 위젯이 없다"까지다. **"로그인하고 돌아오면 주문탭이
열린다"(이 변경의 본래 목적)는 tenant 3 재연결 전까지 검증할 수 없다.**
