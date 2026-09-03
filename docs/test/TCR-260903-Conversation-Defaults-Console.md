# TCR-260903 — 기본 대화내용·시나리오 버튼 설정 화면

REQ `REQ-260903-Conversation-Defaults-Console.md` · PLN `PLN-260903-Conversation-Defaults-Console.md`

## 1. 단위 테스트 (신규 6건 · `ai-config.service.scenario-copy.spec.ts`)

| # | 케이스 | 기대 | 결과 |
|---|---|---|---|
| U1 | 기본값 API 응답 | 스크립트 7종 전부, 각 **6개 언어**(EN·ES·JA·KO·VI·ZH) 빈 값 없음, `delivery_status→shipping_policy` 매핑 포함, 후속칩 전용 스크립트도 `via: follow_up`으로 노출 | PASS |
| U2 | **결함① 저장 키** — 배송 버튼에서 편집 | `shipping_policy` 키로 저장되고 `delivery_status` 키는 남지 않음 | PASS |
| U3 | **결함① 기존 데이터 회복** — 옛 콘솔이 `delivery_status`로 저장해 둔 값 | 마이그레이션 없이 `shipping_policy` 조회에 그대로 적용 | PASS |
| U4 | **결함② 죽은 설정** — `product_help` 편집 저장 | 저장 대상에서 제외, 같은 요청의 `cancel_refund`는 정상 저장 | PASS |
| U5 | 기본값 되쓰기 방지 | 기본과 동일한 텍스트는 override로 저장하지 않음, 실제로 바꾼 언어만 저장 | PASS |
| U6 | 후속 칩 id 검증 | 자유 입력 id(`주문확인`) 제거, 컨트롤 id(`my_orders`)·스크립트 id(`refund_policy`)만 저장 | PASS |

U5가 필요한 이유: 화면이 기본 문구를 **값으로** 보여주므로, 운영자가 아무것도 고치지 않고 [저장]만 눌러도
전량이 서버로 되돌아온다. 그대로 저장하면 오늘의 기본값이 테넌트 행에 굳어, 이후 기본 문구를 고쳐도
이 테넌트만 옛 문구에 남는다.

## 2. 회귀

| 항목 | 결과 |
|---|---|
| `npm --workspace apps/api run test` | **179 suites / 1,798 tests PASS** |
| `npm run typecheck` · `npm run build` | 9/9 · 6/6 PASS |
| `npm run i18n:check` | es·ko·vi·ja·zh complete (신규 키 `scripts`·`effective`·`editor.*` 6개 언어) |
| 스키마 | 변경 0건 |

## 3. 스테이징 E2E (2026-09-03, tenant ivyusa)

`shipping_policy` 대사 편집이 **실제 대화 턴에 반영되는지**가 이번 수정의 핵심 증거다.

| # | 단계 | 결과 |
|---|---|---|
| I1 | `GET /ai-config/defaults` | 스크립트 **7종**, 버튼 6종, `delivery_status → shipping_policy`, 위젯 인사말 **6개 언어**. 후속칩 전용 5종(`cancel_order`·`refund_policy`·`return_exchange`·`order_help`·`product_help_general`)도 응답에 포함 |
| I2 | 배송 버튼 대사를 KO로 편집 후 저장 | 저장 결과 키가 **`shipping_policy`** — 콘솔이 보낸 `delivery_status`가 정규화됨 |
| I3 | 미리보기 세션 생성 → `POST /chat/scenario {action: shipping_policy}` | 응답 본문이 **편집한 문구 그대로** = `APPLIED? YES` (이전에는 이 경로가 절대 반영되지 않았다) |
| I4 | 원상복구 | override 0건으로 복원 확인 |
| I5 | 배포 확인 | `Nest application successfully started`, 컨테이너 healthy, `/ai-config/defaults` **401**(=배포됨, 404 아님) |

## 4. 배포 전 점검 (PLN R1)

스테이징 전 테넌트의 `scenario_overrides` 키를 조회했다.

```
tenant 3 (amoebaorder): ["affiliate", "product_help", "delivery_status"]
```

- `delivery_status`: 후속 칩 1개(id `주문확인`) + `postAction: open_orders` — **이번 배포부터 실제 적용**된다.
  운영자가 설정해 두고 반영되지 않던 값이 뒤늦게 살아나는 것이므로 의도에 부합한다.
- 다만 그 칩의 id `주문확인`은 위젯이 처리할 수 없는 자유 입력이라, 그대로 살아나면 **탭했을 때 실패**한다
  → 읽기 시 필터링으로 노출되지 않는다(U6과 같은 규칙).
- `product_help`·`affiliate`: 스크립트가 없어 조회 자체가 일어나지 않는다(무해). 다음 저장 시 정리된다.

## 5. 수동 확인 (콘솔 화면)

| 화면 | 확인 |
|---|---|
| `/ai-setting` 버튼 목록 | 각 행에 실행 스크립트 배지(`shipping_policy`) / 스크립트 없는 버튼은 "AI가 답변" 안내 |
| 대사 편집기 | 기본 원문이 **채워진 상태**, 수정한 언어에 표시, [기본값으로 되돌리기], 고객 발화도 편집 가능 |
| 기본 대화내용 섹션 | 스크립트 7종 + 도달 경로(메뉴 버튼/후속 칩) + 수정 여부 |
| 에이전트 적용 설정 | 선택 에이전트의 인사말·페르소나·규칙·노출 버튼 요약 |
| `/settings` 위젯 문구 | 입력칸 아래 **기본 문구 원문** 표시(값으로 채우지 않음 — 저장 시 굳는 것 방지) |
