# PLN-260826-Denylist-Answer-Before-Handoff

REQ-260826(deny-list) 실행 계획 — 규칙별 `mode` 추가

- 작성일: 2026-08-26
- 선행: [REQ-260826-Denylist-Answer-Before-Handoff](../analysis/REQ-260826-Denylist-Answer-Before-Handoff.md)
- 승인: 안 C(규칙별 모드) 선택 + tenant 3 `refund` 규칙 즉시 활성화 (2026-08-26)

## 1. 변경

```ts
denyRules: Array<{
  keywords: string[];
  type?: string;
  label?: string;
  mode?: 'silent' | 'answer_then_handoff';   // 신설. 없으면 silent(현행)
}>
```

`handoff_config`는 JSON 컬럼이라 **스키마 변경이 없습니다.**

| 파일 | 변경 |
|---|---|
| `ai-engine/entity/tenant-ai-config.entity.ts` | `DENY_MODE` 상수 + `mode?` |
| `ai-engine/handoff-router.service.ts` | `denyMatch`가 `mode`도 반환 |
| `chat/chat.service.ts` | deny 분기: `answer_then_handoff`면 즉시 인계하지 않고 **답변 경로를 그대로 태운 뒤** 인계 |
| `ai-engine/dto/request/ai-config.request.ts` | `mode` 검증(`@IsIn`) |
| `web/domain/ai-settings/HandoffSection.tsx` | 규칙 행에 모드 선택 |
| 로케일 6종 | 라벨·설명 |

## 2. 위젯 동작 (승인된 그림)

```
고객: 환불계좌 바꾸고 싶어
  │ deny 매칭(refund) · mode=answer_then_handoff
  ├─ AI 답변 (KB 근거 · 모더레이션 통과 · messages에 저장)
  └─ 시스템 인계 안내 (messages에 저장) + 상담원 호출 + 이슈 생성(type=refund,label=accounting)
```

**인계·이슈·SLA·알림은 하나도 바뀌지 않습니다.** 고객이 기다리는 동안 답을 받을 뿐입니다.

예외 처리 — 답이 안 될 때는 지금 그대로:

| 상황 | 결과 |
|---|---|
| 모더레이션 차단 | 답변 없이 인계(기존) + **deny 규칙의 type/label 유지** |
| 신뢰도 미달 | 답변 없이 인계(기존) + 동일 |
| 승인 모드(draft) | 기존대로 즉시 인계 — 초안은 배달되지 않으므로 답변 먼저가 성립하지 않음 |
| 이미 대기중(queued) | 기존대로 침묵 — 상담원은 이미 호출된 상태 |

## 3. 콘솔 와이어프레임 (`/ai-setting` 핸드오프 카드)

```
정책 강제 인계 (deny-list)
┌───────────────────────────────────────────────────────────────────┐
│ 키워드            유형        담당라벨     AI 답변                │
│ 환불계좌, 계좌변경  [환불 ▾]   [회계 ▾]   [답변 후 인계 ▾]  [삭제] │
│ 소송, 변호사       [기타 ▾]   [상담 ▾]   [답변 안 함  ▾]  [삭제] │
│                                                     [+ 규칙 추가] │
└───────────────────────────────────────────────────────────────────┘
· 「답변 안 함」(기본): 사람에게만 넘깁니다.
· 「답변 후 인계」: AI가 먼저 답하고, 상담원에게도 그대로 넘어갑니다.
```

## 4. side-impact

- 기본값이 현행이라 **기존 테넌트 동작 무변화** (mode 미지정 = silent)
- 모더레이션 게이트 유지 — 자동 답변도 반드시 통과
- 이슈 워크플로우(type/label/SLA)·off-hours 이메일 경로 무변화
- 답변이 하나 더 저장되므로 대화 로그·통계에 AI 응답 1건이 늘어남(의도된 것)
- 재사용 저장은 기존 필터 그대로(인용 있고 신뢰도 충족 시)

## 5. 검증

| # | 시나리오 | 기대 |
|---|---|---|
| D1 | mode 미지정 규칙 | 지금과 동일하게 즉시 인계, 답변 없음 |
| D2 | `answer_then_handoff` + 지식 있음 | AI 답변 + 인계 안내 둘 다 저장, 상담원 호출됨 |
| D3 | `answer_then_handoff` + 신뢰도 미달 | 답변 없이 인계, 이슈 label 유지 |
| D4 | 모더레이션 차단 | 답변 없이 인계, 이슈 label 유지 |
| D5 | queued 상태 재질문 | 침묵(기존) |
| D6 | 스테이징 tenant 3 실대화 | 위젯에서 환불계좌 답변 수신 + 상담원 큐 진입 |
