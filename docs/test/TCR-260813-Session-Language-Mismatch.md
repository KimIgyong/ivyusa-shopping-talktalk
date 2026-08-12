# TCR — 고객이 쓰는 언어로 안내한다 테스트 케이스 및 결과

| | |
|---|---|
| Doc ID | CHATWIDGET-TCR-SESSLANG-1.0.0 |
| 작성일 | 2026-08-13 |
| 선행 | `REQ-260813-Session-Language-Mismatch` → `PLN-260813-Session-Language-Mismatch` |
| 대상 PR | **#260** (`c91fd75`) |
| 환경 | 스테이징 `shoptalk.amoeba.site` / tenant 1 |

---

## 1. 자동 테스트 (신규 32건)

| 파일 | 건수 | 고정 대상 |
|---|---|---|
| `detect-language.util.spec.ts` | 22 | KO/ES/EN 판정 · **판정 보류**(4자 미만·기호·숫자·이모지·빈값) · 혼합 문장 · **기호 없는 스페인어는 EN**(알려진 한계를 테스트로 못박음) |
| `chat.service.session-language.spec.ts` | 10 | 연속 2턴 전환 · 1턴 미전환 · **플립플롭 방어** · 잠금 존중 · 동일 언어 무동작 · 잠금 시 쿼리 자체를 하지 않음 |

전체 **1,075 passed / 101 suites** (변경 전 1,043 / 99) · typecheck 9/9 · build 통과.

---

## 2. 실환경 검증

각 턴 뒤 `session/ensure`로 세션 언어를 읽고, **저장된 메시지의 언어**로 시스템 문구가 실제로 바뀌었는지 확인했습니다.

| # | 시나리오 | 결과 |
|---|---|---|
| **V1** | EN 세션 + 한국어 2턴 | 1턴 `EN` → **2턴 `KO`** ✅ |
| **V2** | 1턴만 | `EN` 유지 — 연속 2회 조건이 실제로 작동 ✅ |
| **V3** | KO 대화 중 `ok`·`thanks` | `KO` 유지 — **플립플롭 없음** ✅ |
| **V4** | `ㅇㅇ`·`?` | `KO` 유지 ✅ |
| **V5** | 선택기로 EN 고정 후 한국어 3턴 | `EN` 유지 — **수동 선택 존중** ✅ |
| **V6** | 브라우저 언어 시작값 | `ko-KR`→ko · `es-419`→es · `fr-FR`→en · **수동 선택(es) + `ko-KR` → es** ✅ |
| **V7** | 스페인어 2턴 | 2턴째 `ES` ✅ |
| **V8** | `배송 언제 오나요? shipping` | `KO` ✅ |
| **V9** | 영어 대화 2턴 | `EN` 유지 — 회귀 없음 ✅ |

### V1 — REQ 재현 (대화 227)

```
user   뉴욕 날씨 알려주시오
ai     안녕하세요! 날씨 정보는 …          ← AI는 처음부터 한국어
user   배송 언제 오나요?
system 주문을 조회하려면 본인 확인이 필요합니다 …   ← 시스템 문구가 한국어로
```

REQ에 적힌 증상(`We're outside our support hours right now.`)이 사라졌습니다. **전환된 그 턴부터** 새 언어로 나갑니다 — 다음 턴이 아니라.

### V5 — 잠금 (대화 232)

```
user   뉴욕 날씨 알려주시오 / 배송 언제 오나요? / 주문 취소하고 싶어요
system To look up your order I need to verify your identity. …   ← 3턴 내내 영어
```

고객이 EN을 직접 골랐으므로 감지가 덮지 않습니다.

### V7 — 스페인어 (대화 229)

```
turn1  ¿Cuándo llega mi pedido?      → system: To look up your order …   (EN)
turn2  Mi pedido no ha llegado todavía → system: Para consultar tu pedido … (ES)
```

### V6 — 위젯 시작값

프론트에 테스트 러너가 없어 **배포된 소스의 `initialLanguage()`를 node에서 직접 실행**해 확인했고, 스테이징 번들에 `navigator.language` 경로가 포함된 것도 함께 확인했습니다(`assets/index-CGXhMS68.js`).

---

## 3. 알려진 한계 (테스트로 고정함)

**고유 기호가 없는 스페인어 문장은 영어로 읽힙니다.** `Quiero cancelar mi pedido` → `EN`. 문자 범위 감지의 구조적 한계이며, 테스트에 *"영어로 읽힌다"* 를 기대값으로 적어 **의도된 동작임을 문서 대신 코드로** 남겼습니다. 스페인어 고객은 선택기로 확정할 수 있고 그 선택은 잠금으로 보호됩니다.

부수적으로, 전환을 유발한 **그 고객 메시지 행의 `lang` 스탬프는 이전 언어**로 남습니다(감지가 저장 이후에 돌기 때문). 시스템 문구·AI 답변에는 영향이 없고 통계도 `intent` 기준이라 실害가 없어 그대로 둡니다.

---

## 4. 미해결 / 후속

| # | 내용 |
|---|---|
| **R1 계측** | 전환 로그(`session language detected:`)로 배포 후 전환 빈도 관찰 — 과전환 조짐이 보이면 연속 3회로 올릴 수 있음 |
| **D6 법무** | 동의 고지 언어와 대화 언어가 달라질 수 있음(재고지 안 함) — 법무 확인 항목 |
| V10 | `agent_alerts` 저신뢰 비중 재측정(별건, 트래픽 축적 대기) |
| O3 | 프로덕션 미배포 |
