# FIX — 위젯 Sign in 버튼 무동작 (샌드박스 alert 차단)

| 항목 | 내용 |
|---|---|
| 문서 ID | FIX-Widget-SignIn-Sandbox-20260803 |
| 증상 | 위젯 인증 게이트의 "Sign in" 클릭 시 아무 반응 없음. 콘솔: `Ignored call to 'alert()'. The document is sandboxed, and the 'allow-modals' keyword is not set.` |
| 신고 | 2026-08-03, ambshop-dev 스토어프런트 |
| 심각도 | Medium — 게스트 주문조회 우회 경로는 있으나 스토어 계정 로그인 진입 불가 |

## 1. 근본 원인

`AuthGate.tsx`의 Sign in 버튼이 실제 흐름 대신 **미구현 자리표시자**
`alert('Sign-in flow opens the storefront account page.')`를 호출했고(하드코딩 영어 —
i18n 규칙 위반이기도), embed.js의 iframe 샌드박스(FE-L1: `allow-scripts
allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox`)에
`allow-modals`가 없어 alert마저 차단 → 완전 무동작.

`allow-modals` 추가는 오답 — 필요한 것은 실제 사인인 흐름. 샌드박스 iframe은 부모
페이지를 직접 네비게이션할 수 없으므로(no `allow-top-navigation`) 부모 협조가 필요.

## 2. 수정

| 파일 | 변경 |
|---|---|
| `apps/widget/public/embed.js` | `ivy:signin` 메시지 핸들러 추가 — 스토어 페이지가 `/account/login`으로 이동 (스토어 상대경로라 classic/new customer accounts 모두 동작) |
| `apps/widget/src/components/chat/AuthGate.tsx` | alert 제거 → `startSignIn()`: embed면 부모에 `postMessage({type:'ivy:signin'})`, standalone이면 `window.open('https://{shop}/account/login')` (allow-popups 경로), shop 미상(로컬 dev)이면 버튼 숨김 |

로그인 후 스토어로 복귀하면 기존 **앱 프록시 identity 핸드셰이크가 위젯을 자동 인증**
(FIX-Customer-Duplicate-ShopifyId에서 검증된 경로). embed.js의 메시지 수신은 기존
origin 검증(`e.origin !== baseOrigin`)을 그대로 통과해야 하며, `ivy:signin` 페이로드에는
데이터가 없다.

## 3. 예방 패턴

- **자리표시자 UI(alert/console 기반)는 머지 전 i18n 스캔으로 걸러진다** — 하드코딩
  문자열 grep(`grep -rn "alert(\|'…'" src/components`)을 릴리스 전 점검에 포함.
- 샌드박스 iframe 안의 위젯이 부모 문서 상호작용(네비게이션·모달)이 필요하면
  **embed.js 메시지 프로토콜**(`ivy:*`)로 위임한다 — 샌드박스 키워드 완화는 최후 수단.

## 4. 검증

- typecheck·widget 빌드 통과
- staging 배포 후: 스토어에서 Sign in 클릭 → `/account/login` 이동 → 로그인 → 복귀 시 위젯 자동 인증 확인

## 5. 배포 기록

- 스키마 변경 없음 — SQL 선적용 불필요. 스토어 테마가 참조하는 embed.js는 위젯 컨테이너에서 서빙되므로 배포로 함께 갱신
- PR/커밋/배포: 머지 후 기입
