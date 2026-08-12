# TCR — 질문이 아닌 말에는 사람을 부르지 않는다 테스트 케이스 및 결과

| | |
|---|---|
| Doc ID | CHATWIDGET-TCR-CHITCHAT-1.0.0 |
| 작성일 | 2026-08-13 |
| 선행 | `REQ-260813-LowConfidence-Chitchat-Escalation` → `PLN-260813-LowConfidence-Chitchat-Escalation` |
| 대상 PR | **#255** (`7289d69`) |
| 환경 | 스테이징 `shoptalk.amoeba.site` / tenant 1 |

---

## 1. 자동 테스트 — `chat.service.non-question.spec.ts` (18건)

| 그룹 | 건수 | 고정 대상 |
|---|---|---|
| 분류 | 3 | `smalltalk`·`out_of_scope`·`unintelligible`을 높은 신뢰도에서 채택 |
| **비대상 유지** | 6 | `order_status`·`delivery`·`cancel_refund`·`product_inquiry`·`agent_request`·`other`는 **기존 경로 그대로** |
| 관문 | 4 | 0.6 경계 채택 / 0.55 거부 / **폴백 무시** / 신뢰도 누락 시 거부 |
| 스트릭 | 5 | 직전 턴만 셈 / 진짜 질문에서 끊김 / 직전이 질문이면 0 / **미분류 행에서 끊김** / 첫 턴 0 |

전체 **1,043 passed / 99 suites** (변경 전 1,025) · typecheck 9/9 · build 통과.

---

## 2. 실환경 검증

각 턴이 **어느 경로로 갔는지** `messages.intent`와 응답의 `retrieval_trace`로 확인했습니다.

| # | 입력 | 의도(신뢰도) | 경로 | 결과 |
|---|---|---|---|---|
| **V1** | `안녕하세요` | `smalltalk` 0.97 | `no_knowledge` | *"IVY USA 고객센터입니다 😊 무엇을 도와드릴까요?"* — **이관 없음** ✅ |
| **V2** | `상담원분 정말 친절하시네요 감사합니다` | `smalltalk` 0.95 | `no_knowledge` | *"따뜻한 말씀 감사합니다…"* — 이관 없음 ✅ |
| **V3** | `뉴욕 날씨 알려주시오` | `out_of_scope` 0.97 | `no_knowledge` | *"날씨는 도와드릴 수 없지만 주문·배송·반품·상품은…"* ✅ |
| **V4** | `안녕하세요, 배송 언제 오나요?` | **`delivery` 0.95** | 정상 | **잡담 처리되지 않고 배송 흐름**(본인확인) ✅ |
| **V5** | `이 제품 성분이 뭔가요?` | `product_inquiry` 0.96 | `low_confidence` | **여전히 이관** — 회귀 없음 ✅ |
| **V6** | `qzxv 7781 plkj 무의미 토큰` | `unintelligible` 0.85 | `no_knowledge` | *"이해하지 못했어요. 다시 말씀해 주시겠어요?"* ✅ |

### V7 — 3회 안전망

한 세션에서 비질문 3턴을 연속 입력:

```
1턴  안녕하세요            → 이관 없음 · 제안 문구 없음
2턴  오늘 기분 어때요?      → 이관 없음 · 제안 문구 없음
3턴  고마워요 수고하세요    → 이관 없음 · "혹시 상담원 연결이 필요하시면 말씀해 주세요." ✅
```

자동 이관이 아니라 **제안**이며, 1·2턴에는 붙지 않습니다.

### V8·V9

- **V8**(임계·폴백): 단위 테스트로 고정. 실측 신뢰도는 0.85~0.97로 임계(0.6)와 여유가 큼
- **V9**(모더레이션): 새 응답도 기존 AI 발신과 같은 게이트를 통과하며, 차단 시 이관으로 전환(코드 경로 공유)

---

## 3. 예상과 달랐던 관측 (회귀 아님)

`How can I leave a review?`가 **이관되지 않았습니다.** REQ에서는 이 유형을 "정상 이관 15건"으로 분류했던 터라 회귀로 보였습니다.

확인 결과 **이번 변경과 무관**했습니다.

| 확인 항목 | 값 |
|---|---|
| 의도 | `other` 0.85 — **비질문 집합에 없음**(새 경로를 타지 않음) |
| 응답 trace | `citations: [{id: 204, title: "5.x 리뷰…"}]` — **문서를 인용한 정상 RAG 응답** |

즉 검색이 리뷰 문서를 찾아내 신뢰도가 임계를 넘긴 것입니다. 과거에 이관됐던 이유는 그때 그 문서가 검색되지 않았기 때문이며, 그 사이 **top-K 4→6(PR #127)** 과 **상품지식 1,689건 투입(PR #147)** 으로 검색이 개선됐습니다. **회귀가 아니라 개선**입니다.

> 다만 답변이 *"정확한 절차는 모르겠다"* 로 끝나므로 **리뷰 작성 절차 문서의 보강**이 필요합니다(§4 O6).

---

## 4. 미해결 / 후속

| # | 내용 |
|---|---|
| **V10** | `agent_alerts` 중 `low_confidence` 비중(배포 전 **33/48 = 69%**) 감소 — **미측정, 트래픽 축적 후 재측정**(§5) |
| O6 | 리뷰 작성 절차 문서 보강(지식 공백) |
| ~~O2~~ | ~~세션 언어 고정(기존)~~ — 해결(PR #260) |
| O3 | 프로덕션 미배포 |

---

## 5. V10 기준선 (재측정용)

2026-08-13에 한 번 재봤으나 **경과 21분·고객 턴 10건(전부 검증 트래픽)** 으로 표본이 부족해 판정을 보류했습니다. 비율을 계산할 수는 있지만 그것은 테스트 문장의 비율이지 운영 실태가 아닙니다.

**기준선**

| 항목 | 값 |
|---|---|
| 배포 컷오프 (UTC) | `2026-08-12 17:03:42` — api 컨테이너 기동 시각 |
| 배포 전 알림 | `low_confidence` 33 · `user_request` 15 (총 48, 저신뢰 **69%**) |

**중간 관측** (결론 아님): 배포 후 10턴 중 **7턴이 `answeredFrom=no_knowledge`** 로 처리돼 알림이 0건이었고(smalltalk 5·out_of_scope 1·unintelligible 1), 같은 창의 알림 1건은 `이 제품 성분이 뭔가요?`(진짜 지식 공백)였습니다. 메커니즘은 의도대로지만 표본이 자체 테스트라 비율 근거로는 쓸 수 없습니다.

**재측정 방법** — 스테이징 MySQL에서:

```sql
-- 사유별 알림, 배포 전/후
SELECT CASE WHEN created_at < '2026-08-12 17:03:42' THEN 'before' ELSE 'after' END AS period,
       reason, COUNT(*) n
FROM agent_alerts WHERE tenant_id = 1 GROUP BY period, reason;

-- 이관을 건너뛴 턴 (예전이라면 알림이 됐을 턴)
SELECT JSON_UNQUOTE(JSON_EXTRACT(retrieval_trace,'$.nonQuestionKind')) kind, COUNT(*) n
FROM messages
WHERE tenant_id = 1 AND created_at >= '2026-08-12 17:03:42'
  AND JSON_EXTRACT(retrieval_trace,'$.answeredFrom') = 'no_knowledge'
GROUP BY kind;
```

**판정 기준**: 배포 후 구간의 고객 턴이 **최소 수백 건** 쌓였을 때, `low_confidence` 비중이 69%보다 유의하게 낮으면 성공. 그 전에는 수치를 기록하지 않습니다.
