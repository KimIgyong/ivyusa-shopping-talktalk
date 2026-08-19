# TCR-260819-Widget-Hide-On-Login

로그인 화면에서 챗위젯 미노출.

- 작성일: 2026-08-19
- 선행: `REQ-260819-Widget-Hide-On-Login.md` / `PLN-260819-Widget-Hide-On-Login.md`
- 대상: `apps/widget/public/embed.js`

## 1. 단위 테스트 (`apps/widget/test/embed-sign-in.test.mjs`) — 9건 전부 통과

`apps/widget`에는 테스트 하네스가 없었다. jsdom을 새로 들이는 대신 Node 내장 `node --test`와
최소 DOM 스텁으로 **실제 배포되는 `public/embed.js` 파일을 그대로 실행**한다.
규칙을 테스트 쪽에 복제하지 않는다 — 복제된 규칙이 어긋나서 몰이 엉뚱한 테넌트에 묶인 게
바로 전 건이다(`FIX-260819` §G-6).

| # | 케이스 | 확인 |
|---|---|---|
| T-1 | Cafe24 `/member/login.html` | iframe 미생성 |
| T-2 | 같은 페이지, `ivy:reopen=orders` 보유 | **플래그가 그대로 남는다** ⭐ |
| T-2b | 일반 페이지, 같은 플래그 | mount + 플래그 소비 — 플래그 메커니즘이 실재함을 증명 |
| T-3 | `/`, `/product/detail.html`, `/myshop/order/list.html` | 정상 mount |
| T-4 | `/member/mall_agreement`·`/member/privacy`·`/member/modify` | 정상 mount (의도적 제외) |
| T-5 | `window.name = 'ivy_cafe24_auth'` | 경로 무관 미생성 |
| T-6 | Shopify `/account/login`·`/account/register`·`/challenge` | 미생성 / `/account`·상품페이지는 mount |
| T-7 | 커스텀 도메인 + `loginPath:/member/login.html` | Cafe24 규칙 적용 / 힌트 없으면 기본 목록 |
| T-8 | `hideOnPaths: []` → 안 숨김 · `['/signin']` → 목록 **교체**(추가 아님) | 탈출구 동작 |
| T-9 | `/en-ca/account/login`·`/ko/member/login.html` | 로케일 접두사 1개는 떼고 비교 / `/collections/account/login`은 mount |

### 1-1. 음성 대조(negative control)

테스트가 스텁 때문에 그냥 통과하는 게 아님을 확인했다. 변경 **전** `embed.js`로 같은
테스트를 돌리면:

```
변경 전:  pass 3 / fail 6   (T-9 추가 전 기준)
변경 후:  pass 10 / fail 0
```

T-2b·T-3·T-4가 변경 전에도 통과한다 — 스텁이 실제로 mount를 수행한다는 뜻이고,
나머지 6건이 실패한다 — 가드가 실제로 판정을 바꾼다는 뜻이다.

## 2. 회귀

| 항목 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 9/9 |
| `npm run test` | ✅ (widget 9건 신규 포함) |
| `npm run build` | ✅ |
| 빌드 산출물에 가드 포함 (`dist/embed.js` grep) | ✅ — `public/`가 그대로 복사되는지 확인 |

## 3. 통합 시나리오 (스테이징 수동)

### S-1. redirect 모드 복귀 ⭐ 이번 요구사항의 핵심
1. `amoebaorder.cafe24.com` 상품 페이지에서 위젯 열기 → 주문탭 → 로그인
2. 몰 로그인 페이지 도착 — **위젯이 없어야 한다**
3. 로그인 완료 → 원래 페이지 복귀
4. **위젯이 주문탭으로 열린 채 돌아와야 한다** (변경 전에는 닫힌 채 온다)

### S-2. popup 모드
1. 콘솔에서 tenant 3 로그인 모드를 popup으로 설정
2. 위젯에서 로그인 → 480×720 팝업
3. 팝업이 몰 로그인 페이지를 거칠 때 **팝업 안에 위젯이 없어야 한다**
4. 로그인 완료 → 팝업 자동 종료, 원래 페이지의 위젯이 로그인 상태로 전환

⚠️ S-1·S-2는 **tenant 3 재연결 후에만** 가능하다. 지금은 자격증명이 `annehearts`를
가리켜 `start`가 실패한다(`FIX-260819` §8). 재연결 전까지 미실행.

### S-3. 회귀 — 숨기면 안 되는 곳
| 페이지 | 기대 |
|---|---|
| 메인 / 상품상세 / 장바구니 | 위젯 있음 |
| `/myshop/index.html`, `/myshop/order/list.html` (로그인 후) | 위젯 있음 |
| `/member/mall_agreement.html`, `/member/privacy.html` | 위젯 있음 |

### S-4. Shopify 회귀 (`ambshop-dev.myshopify.com`)
| 페이지 | 기대 |
|---|---|
| `/account/login` | 위젯 없음 |
| 상품 페이지 · `/account` | 위젯 있음 |

## 4. 엣지 케이스

| # | 상황 | 처리 |
|---|---|---|
| E-1 | 대소문자 섞인 경로 (`/Member/Login.html`) | 소문자 정규화 후 비교 |
| E-2 | `hideOnPaths`에 배열이 아닌 값 | `Array.isArray` 실패 → 기본 목록 사용 (조용한 무시 아님, 안전한 기본) |
| E-3 | 커스텀 스킨이 로그인 경로를 바꾼 몰 | `hideOnPaths`로 대응 (§T-8) |
| E-4 | `location.pathname` 없음 | `''`로 폴백 → 어떤 접두사에도 안 걸림 → mount (안전한 기본) |
| E-5 | 로케일 URL (`/en-ca/account/login`) | 로케일 모양 세그먼트 **1개만** 제거 후 비교. Shopify 마켓 스토어에서 앵커 접두사가 그냥 지나치던 구멍 |

## 5. 미검증

- S-1·S-2 실동작 — tenant 3 재연결 대기
- 커스터마이즈된 스킨을 쓰는 다른 Cafe24 테넌트의 실제 로그인 경로
