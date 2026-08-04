# FIX — 모더레이션 `warn` 액션이 차단으로 동작

| | |
|---|---|
| Doc ID | CHATWIDGET-FIX-MODWARN-1.0.0 |
| 작성일 | 2026-08-04 |
| 발견 경위 | `REQ-260804-Knowledge-ConflictEdit-Revisions` §1-1 실측 중 |
| 심각도 | **중** — 고객 대화 경로에 잠재, 실피해 0건(실측) |
| 관련 | PLN-260804-Knowledge-ConflictEdit-Revisions **T0** |

---

## 1. 증상

지식 충돌 판정 11건이 전부 모더레이션에 차단됐습니다. 차단된 텍스트는 평범한 분석 문장이었습니다.

```
"A states orders can be canceled before entering preparing status
 (a definite guarantee), while B says cancellation is only possibly available…"
```

`moderation_logs`가 원인을 그대로 보여줍니다.

```
rule_id: 1   action: warn   decision: blocked
```

**액션은 `warn`인데 판정은 `blocked`** 입니다.

## 2. 근본 원인

`apps/api/src/domain/moderation/moderation.service.ts`:

```ts
if (action === MODERATION_ACTION.BLOCK || action === MODERATION_ACTION.WARN) {
  return this.finalize(input, MODERATION_DECISION.BLOCKED, action, '', rule.id);
}
```

`WARN`이 `BLOCK`과 **같은 분기**에 묶여 있어, 경고 규칙이 판정을 `BLOCKED`로 만들고 본문을
빈 문자열로 바꿉니다. 증상 패치가 아니라 이 분기 자체가 원인입니다.

**두 번째 문제**: 첫 매칭에서 즉시 반환하므로, 경고 규칙 뒤에 오는 `block`·`mask` 규칙이
**평가되지 않습니다.** 목록 앞쪽의 경고 하나가 실제 차단 규칙을 가립니다.

## 3. 영향 범위

이 기능 밖입니다 — `moderate()`는 **고객 대화의 AI·상담원 답변 경로에서도 동일**하게 호출됩니다.
스테이징 테넌트에는 `guarantee` 단어 규칙(`action: warn`, 시드 데이터, 2026-06-30 생성)이
활성 상태이므로, **AI 답변에 `guarantee`가 포함되면 차단 후 상담원 이관**됩니다 — 운영자는
경고만 설정했는데도.

**실피해는 아직 0건**입니다. `moderation_logs`에서 `conversation_id IS NOT NULL`인 차단은
한 건도 없습니다(기록된 차단 60건은 전부 2026-08-04 충돌 스캔). 잠재 위험이며 진행 중인 장애는
아닙니다.

`/ai-setting` 콘솔의 액션 선택지는 `block|mask|rephrase`뿐이라 **신규 규칙으로는 `warn`을 만들 수
없습니다.** 문제의 규칙은 시드 데이터입니다.

## 4. 수정

```ts
if (action === MODERATION_ACTION.BLOCK) {
  return this.finalize(input, MODERATION_DECISION.BLOCKED, action, '', rule.id);
}
if (action === MODERATION_ACTION.WARN) {
  warnedRuleId ??= rule.id;   // 기록만 하고
  continue;                    // 순회를 계속한다
}
```

최종 판정 시 경고가 있었다면 `action: 'warn'` + `rule_id`로 로그에 남기고 본문은 그대로
전달합니다.

**계약 변경 없음** — `MODERATION_DECISION` 열거형(`DELIVERED`/`EDITED`/`BLOCKED`)은 그대로이고,
소비자는 전부 `decision === BLOCKED`만 검사합니다. 경고 사실은 `moderation_logs`로 확인합니다.

## 5. 회귀 테스트 (4건)

| 케이스 | 고정하는 것 |
|---|---|
| warn 규칙 → `DELIVERED`, 본문 보존 | 핵심 증상 |
| warn 로그에 `action='warn'` + `ruleId` 기록 | 경고가 조용히 사라지지 않음 |
| warn 뒤의 block 규칙이 여전히 평가됨 | 두 번째 문제(가림) |
| warn + mask 조합 → `EDITED` + 마스킹 | 순회 계속이 mask를 깨지 않음 |
| block 규칙은 그대로 차단 | 수정이 차단을 약화시키지 않음 |

`424` 전체 통과.

## 6. 예방 패턴

> **액션 열거형을 분기에서 묶을 때는 "의미가 같은가"를 물어야 합니다.**
> `warn`과 `block`은 같은 "부정적 판정"으로 보이지만 **전달 여부가 정반대**입니다.
> 이 코드는 두 값을 `||`로 묶어 한 줄을 아꼈고, 그 대가로 운영자 설정이 조용히 무력화됐습니다.

> **관측 가능성 부재가 발견을 지연시켰습니다.** `moderation_logs`에 `action`과 `decision`이
> **둘 다** 기록돼 있었기에 모순(`warn`인데 `blocked`)이 한눈에 드러났습니다. 한쪽만 기록했다면
> 원인 추적이 훨씬 오래 걸렸을 것입니다 — 판정과 그 근거를 함께 남기는 설계가 값을 했습니다.

일반화 가능하므로 메모리에 승격합니다.
