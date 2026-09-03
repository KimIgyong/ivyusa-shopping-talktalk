# REQ-260903 — 기본 대화내용·시나리오 버튼 설정 화면

- 요구: **"샵톡 기본 설정된 대화내용 및 기본 시나리오 버튼 — 에이전트 설정 내용 보기 및 수정 가능한 화면 구성"**
- 배경: `RPT-260829-Go2Joy-Video-KB-Utilization.md` P3 — go2joy 실제 트래픽의 **37%가 이커머스 템플릿
  시나리오**("배송은 얼마나 걸리나요?", "이 제품은 어떻게 사용하나요?")였다. 호텔 예약 플랫폼에
  기본 문구·기본 버튼이 그대로 노출된 결과다.

## 1. AS-IS — 기본값은 어디에 있고, 무엇이 보이는가

샵톡의 "기본 설정된 대화"는 **네 곳**에 흩어져 있다.

| # | 무엇 | 저장/정의 위치 | 콘솔에서 **보이나** | 콘솔에서 **고칠 수 있나** |
|---|---|---|---|---|
| A | **기본 시나리오 버튼 6종**<br>(Delivery status·Cancel/Refund·Product Help·Contact Support·Affiliate·My Orders) | `ai-config.service.ts` `DEFAULT_SCENARIO_BUTTONS` (+ 위젯 자체 폴백 `useScenario.ts`) | ✅ `/ai-setting` 목록에 그대로 뜸(저장 전에도) | ⚠️ 라벨·액션·노출·순서·**에이전트 범위**는 가능. 단 **라벨이 단일 문자열**이라 저장 순간 다국어가 한 언어로 굳는다 |
| B | **내장 대화 스크립트 7종**<br>utterance/reply/follow-ups × 6개 언어 | `chat/scenario.service.ts` `SCENARIOS` | ❌ **어디에도 안 보임** | ⚠️ 3종만 편집 UI가 있고 **그중 1종만 실제로 동작**(§2) |
| C | **위젯 인사 문구**<br>displayName·firstVisit·loginGreeting | `tenants.widget_copy` (기본값은 위젯 i18n) | ❌ 입력칸은 있으나 **기본 문구는 안 보임**("비워두면 기본") | ✅ 언어별 편집 가능 (`/settings` 위젯 동작) |
| D | **에이전트별 설정**<br>페르소나·응답규칙·인사말 | `ai_agents`, `tenant_ai_config` | ✅ `/ai-setting` 에이전트 선택 시 | ✅ 가능 |

**공통 결함 — 기본값이 보이지 않는다.** A를 뺀 B·C는 "빈칸 = 기본 유지" 규약이라, 운영자는
*지금 고객에게 무슨 말이 나가는지 화면에서 확인할 수 없다*. 고치려면 무엇을 고치는지도 모른 채
빈칸에 새로 써야 한다. ([[invisible-fallback-trap]]와 같은 계열의 문제)

## 2. 검증된 결함 2건 (추정 아님 — 실행으로 확인)

콘솔의 대사 편집기는 3개 액션을 "편집 가능"으로 표시한다
(`ScenarioReplyEditor.tsx` `SCRIPTED_ACTIONS = {delivery_status, cancel_refund, product_help}`).

| 액션 | 콘솔 저장 키 | 런타임 조회 키 | 결과 |
|---|---|---|---|
| `cancel_refund` | `cancel_refund` | `cancel_refund` | ✅ 정상 반영 |
| **`delivery_status`** | `delivery_status` | **`shipping_policy`** | ❌ **저장은 되지만 절대 반영되지 않음** |
| **`product_help`** | `product_help` | — (내장 스크립트 자체가 없음) | ❌ **죽은 설정** — 위젯이 이 버튼을 스크립트가 아니라 RAG 채팅으로 처리 |

확인 방법: `ScenarioService.handle()`에 실제 호출을 걸어 `getScenarioOverride`가 어떤 키로 조회하는지
찍었다 → `['shipping_policy']`. `isScenarioAction('product_help')`, `isScenarioAction('delivery_status')`
둘 다 **false**. 위젯은 `delivery_status` 버튼을 누르면 `scenario('shipping_policy')`를 호출한다
(`ChatTab.tsx:207`).

즉 **"편집 가능"이라고 표시된 3개 중 2개가 무효**다. 운영자는 저장 성공 토스트를 보고 고쳐졌다고
믿지만 위젯 문구는 그대로다.

## 3. 추가로 드러난 갭

| # | 내용 |
|---|---|
| G1 | 내장 스크립트 7종 중 **4종**(`cancel_order`·`refund_policy`·`return_exchange`·`order_help`)은 follow-up 칩으로만 도달 가능하고 콘솔에 **존재 자체가 안 보인다** |
| G2 | 버튼 라벨이 `label: string` — 6개 언어를 쓰는 테넌트(go2joy: VI/EN/KO)가 저장하면 모든 언어에 한 문자열이 나간다 |
| G3 | 대사 override는 **테넌트 단위**라 에이전트(투숙객/파트너/광고)별로 다른 안내를 줄 수 없다 |
| G4 | "이 에이전트에는 결국 무엇이 적용되는가"를 한 화면에서 볼 수 없다 — 버튼은 `/ai-setting`, 인사 문구는 `/settings`, 페르소나는 또 다른 섹션 |
| G5 | 기본값이 **이커머스 전용**(배송·주문·제휴). 업종이 다른 테넌트는 "끄기"는 되지만 **무엇을 끄는지 모른 채** 끈다 |

## 4. TO-BE

`/ai-setting`에 **"기본 대화 설정"** 을 재구성한다. 원칙 하나: **기본값을 숨기지 않는다.**

1. **기본 시나리오 버튼** — 지금처럼 목록으로 보이되, 각 버튼이 실제로 어떤 스크립트를 실행하는지
   (`Delivery status → shipping_policy`) 함께 표시.
2. **기본 대화내용** — 내장 스크립트 **7종 전부**를 목록으로 노출하고, 선택하면 **기본 원문**
   (사용자 발화·응답·후속 칩, 6개 언어)을 **그대로 보여준 상태로** 편집. 편집한 값이 기본과 같아지면
   override를 지운다(= 기본으로 복귀).
3. **에이전트 관점 보기** — 에이전트를 고르면 그 에이전트에 실제 적용되는 인사말·페르소나·응답규칙·
   노출 버튼을 한 화면에서 조회(편집은 각 소유 섹션으로 연결).
4. **위젯 인사 문구** — 기본 문구를 실제 텍스트로 보여주고 편집(현재는 빈칸 + 힌트뿐).
5. §2 결함 2건 수정.

## 5. 제약·비목표

- **에이전트별 대사 분리(G3)는 이번 범위 밖**으로 제안한다. 노출 버튼·페르소나·인사말이 이미
  에이전트별로 갈라져 있어 대사까지 쪼개면 설정 축이 하나 더 늘어난다. 필요가 확인되면 별건.
- 기본값은 **서버가 내려준다**. 콘솔에 상수를 복제하면 배포 시점부터 어긋나고, 그 어긋남은 화면에
  드러나지 않는다.
- 메뉴 신설 없음(`/ai-setting` 내 재구성) — 신설은 메뉴 제공·권한 매트릭스까지 건드린다.
- 위젯 런타임 동작은 바꾸지 않는다(결함 2건 수정 제외).
