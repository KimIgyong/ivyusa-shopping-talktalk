# REQ-260807 — 라이브챗 이슈해결 워크플로우 개선안 (초안)
# Live Chat → Issue-Resolution Workflow (Draft Analysis)

> 상태: **DRAFT / 검토용**. 본 문서는 요구사항 분석(REQ)이다. 와이어프레임·상세설계·구현은
> 승인 후 PLN 단계에서 진행한다(구현 자동 착수 금지 — skill §6).
> 작성일 2026-08-07 · 대상 `apps/{api,web,widget}` · 관련 도메인 chat/session/agent/inquiry/
> notification/ai-engine/knowledge/analytics/cjm/moderation.

---

## 0. 기획의도 요약 (Intent)

라이브챗을 **"세션 나열 + 통계"에서 → "이슈카드(티켓) 기반 문제해결 워크플로우"로 격상**한다.

1. 스토어프런트 고객의 소리를 **지연 없이** 듣고, **가능한 한 고객이 스스로 해결**하도록 돕는다.
2. 응대는 3단계: **1차 시나리오**(주문/배송 상태확인, 주문취소, 환불문의, 제휴·문의) → **2차 상담 AI**(RAG·정책가이드 범위 내 답변/상품추천) → **3차 인간 상담원**.
3. AI가 **대응하면 안 되는(정책) 요청**은 담당 상담원/부서/실무자에게 **이슈로 전달·배정**한다.
4. 이슈는 **상태 워크플로우**(접수→진행→해결/반려→종료)로 관리·트래킹되고, **상태 변화는 고객에게 회신**된다.
5. 대시보드는 *통계보다* **이슈해결 워크플로우와 상태 전이 과정**을 보여준다. 모든 세션은 **하나의 이슈카드**로, 대화를 읽지 않아도 상황(접수-1차/AI해소-2차AI해소-3차상담원해소)을 파악하고 개입할 수 있어야 한다(**칸반보드**: 세션상태 / 관리자 지시메모 / 관리자 대화창 개입).
6. 모든 커뮤니케이션·처리내역이 **조직 지식으로 축적**되어 RAG로 환류되고, AI가 지속적으로 데이터를 축적·분석·개선하는 **순환구조**를 갖춘다.

---

## 1. 요구사항 분해 (Requirement Clusters)

> ID는 본 기능 로컬 스킴(`LCW-Rn`). SPEC의 FR 번호 확정은 PLN에서.

| ID | 요구 | 핵심 판정기준 |
|---|---|---|
| **LCW-R1** | 3단계 응대 파이프라인(시나리오→AI→상담원) + 단계별 "해소/승급" | 각 세션이 어느 단계에서 해소됐는지 기록·표시 |
| **LCW-R2** | 정책 기반 에스컬레이션(AI 금지 주제 → 사람 배정) | 신뢰도/모더레이션 외에 **주제(정책) 기반 강제 핸드오프** 규칙 존재 |
| **LCW-R3** | 이슈 상태 워크플로우(접수·진행·해결·반려·종료) + 배정·처리 트래킹 | 단일 상태머신 + 배정기록 + 처리이력(누가·언제·무엇을) |
| **LCW-R4** | 상태 변화의 고객 회신(상태 커뮤니케이션) | 각 전이마다 고객에게 적절한 안내 자동 발송 |
| **LCW-R5** | 시각적 관리 UI(칸반 이슈카드 + 워크플로우 대시보드 + 관리자 메모/개입 + 해결이슈·통계) | 대화 안 읽어도 카드로 상황 파악, 상태 컬럼 이동, 메모, 개입 |
| **LCW-R6** | 지식 순환 폐루프(처리내역→지식→AI 개선) + 요청유형별 프로세스 | 해결 데이터가 RAG로 환류되고 개선을 자동 유도 |

---

## 2. AS-IS (현재 구현)

세 갈래 코드 조사 결과 요약. (파일 인용은 대표만)

### 2.1 대화/AI/시나리오/RAG — `chat` 도메인
- **오케스트레이터** `chat.service.ts`: 동의게이트 → 턴저장 → 인텐트분류 → (주문근거) → **RAG 답변** `rag.service.ts`(FULLTEXT+Qdrant, RRF 융합, 인용) → **모더레이션 게이트**(필수, fail-safe=BLOCK) → 에스컬레이션 판정.
- **시나리오 엔진** `scenario.service.ts`: **결정형 단일턴 스크립트** `SCENARIOS` = `cancel_refund/cancel_order/refund_policy/return_exchange/shipping_policy/order_help/product_help_general`(EN/ES/KO, 테넌트 override). **다단계 상태머신 아님** — "스텝"은 follow-up 칩뿐. `cancel_order`는 안내문일 뿐 실제 취소 미수행.
- **상품추천** = RAG의 `product` 그룹 문서를 인용·링크로 노출(운영자 CSV 스토어프런트 링크). 재고/장바구니 인지 없음.
- **전송** = 폴링(5s), 실시간 push 없음.

### 2.2 에스컬레이션/배정/상태/알림 — `agent`/`inquiry`/`notification` 도메인
- **이슈/티켓 엔티티 없음.** 작업 단위는 **conversation**. `inquiries` 테이블은 `open/answered` 2상태 **스텁**이며 에스컬레이션/콘솔과 **미연결**, 배정·이력·updatedAt 없음.
- **대화 상태**: `CONVERSATION_STATUS = ai_active / waiting / agent / ended` + `escalated(0/1)`. 유일한 실상태머신.
- **에스컬레이션 트리거(존재)**: `low_confidence(<0.45)` / `moderation_blocked` / `user_request` → `WAITING` + `EVENTS.ESCALATION`. **주제(정책) 기반 강제 핸드오프 규칙은 없음.**
- **라우팅** `handoff-router.service.ts`: 대상 = AI설정의 `assigneeUserIds`(없으면 **전체 broadcast**), 영업시간 외 → **이메일 모드**. 라벨/부서 기반 자동배정 없음.
- **배정** = **pull 방식**: 상담원이 `accept()` 클릭 → `assignments`(type manual, active) + `status=agent`. **자동배정/이관(transfer)/재배정 없음**(enum `transferred` 미사용), `maxConcurrent` 미강제.
- **상태 목표 매핑**: 접수≈waiting, 진행≈agent/open, 해결≈answered/ended, **반려=대응물 없음**, 종료≈ended. 두 상태모델(대화 4상태 / inquiry 2상태) 분리·비연결.
- **고객 알림**: 상담원 답변 시 일반 "새 답변" push/in-app + 영업외 이메일. **상태변화 알림 없음**. email/sms는 **mock**(로그만), push만 실제.
- **감사**: 대화/상담원 경로는 `audit_logs`로 기록(view/accept/reply/end). inquiry는 무감사.

### 2.3 콘솔/대시보드/칸반/분석/지식 — `web`/`analytics`/`cjm`/`knowledge`
- **대시보드**(`/dashboard`): **통계 전용** KPI(activeChats, aiResolutionRate=ended&escalated0÷ended, todayNotifications, totalConversations/Orders) + 인기질문/연동상태/최근주문. 워크플로우·배정·SLA 뷰 없음.
- **라이브챗 콘솔**(`LiveChatPage.tsx`): **3열**(리스트/스레드/컨텍스트) + 필터탭 `all/queue/ended`. 상태는 4값 `StatusBadge`만. **세션 메모/지시노트 필드 없음**. **관리자 대화 개입 존재** ✅ (`accept`→moderated `message`→`end`, 감사). 우측 **AI Briefing**(요약/의도/감정/권고).
- **칸반/보드 없음**(drag/swimlane/board 전무).
- **분석**(`/statistics`): 렌즈(intent/cluster/keyword/document) × 기간 → 추세 + 토픽별 asked/**escalationRate**/no-source/confidence. 일별 스냅샷(`question_stat_daily`) 기반. 해결시간/SLA/재오픈/CSAT 없음.
- **cjm**: `cjm_events`(stage/eventType/session/customer) **수동 이벤트 로그만**, **시각화 프론트 없음**. → "stage" 개념의 씨앗.
- **지식순환**: (a) **best-answer→KB 캡처**(`KnowledgeCaptureModal`, master/director 한정, 즉시 임베딩) (b) **ai-coach 설정제안**(수동 승인). **자동 폐루프 아님** — 고-에스컬레이션 토픽이 캡처/코칭 태스크로 자동 연결되지 않음.

### 2.4 위젯(고객측)
- Notification Center에 **Payments/Shipping/Inquiries** 탭 UI는 존재(§B4 실측). 단, **이슈 상태와 연동된 발송 경로가 없어** Inquiries 탭이 이슈 상태로 채워지지 않음(§2.2). "내 주문" 데이터경로는 검증됨.

---

## 3. TO-BE (목표 상태)

핵심은 **Issue(티켓) 엔티티 신설**로 대화·문의·주문문의를 하나의 케이스로 통합하고, 그 위에 상태머신·배정·알림·칸반·지식순환을 얹는 것.

1. **Issue = 커뮤니케이션의 단일 단위(티켓).** 하나의 conversation(및 관련 order/inquiry)이 하나의 Issue로 승격. 티켓번호·유형·우선순위·SLA·해결사유·재오픈수 보유.
2. **응대 3단계 스탬프**를 Issue에 기록: 1차 시나리오 / 2차 AI / 3차 상담원 중 **어디서 해소됐는지** + 각 단계 타임스탬프.
3. **정책 라우팅**: 인텐트/주제 **deny-list**(예: 법적분쟁·손상클레임·결제/차지백·개인정보변경 등)는 신뢰도와 무관하게 **강제 3차 핸드오프** + 라벨/부서 자동배정.
4. **상태 워크플로우**: 접수 → 진행 → 해결 / 반려 → 종료 (+ 재오픈). 관리자·담당자가 전이 제어, 전이마다 **처리이력** 기록.
5. **고객 상태회신**: 각 전이마다 위젯 Inquiries 탭 + push(+이메일)로 **상태별 안내** 자동 발송.
6. **칸반 대시보드**: Issue 카드(상태 컬럼) + 단계 진행바(접수-1차/AI-2차AI-3차) + **지시메모** + **대화 개입** + 배정/SLA·경과시간. `/dashboard`는 워크플로우 중심으로 재편.
7. **지식 폐루프**: 해결(특히 3차) 데이터 → best-answer→KB 자동제안, 고-에스컬레이션 토픽 → 캡처/코칭 태스크 자동생성 → 재임베딩 → AI 2차 해소율 상승.
8. **요청유형별 프로세스**: 유형(주문상태/배송/취소/환불/제휴/기타)마다 파이프라인·자동배정·SLA·고객문구가 다르게 구성.

---

## 4. Gap 분석 (AS-IS → TO-BE)

| 영역 | AS-IS | 필요(Gap) |
|---|---|---|
| 케이스 단위 | conversation, inquiry 스텁 분리 | **Issue 엔티티** 신설(대화·주문·문의 통합, 티켓번호/유형/우선순위/SLA/해결사유) |
| 상태머신 | 대화 4상태 + inquiry 2상태 | **단일 라이프사이클**(접수·진행·해결·반려·종료 +재오픈), **반려 신설**, 해결≠종료 분리 |
| 응대 단계 기록 | 없음(상태만) | **tier 스탬프**(scenario/ai/agent) + 단계별 타임스탬프 |
| 정책 에스컬레이션 | 신뢰도/모더/요청뿐 | **주제 deny-list 강제 핸드오프** + 라벨/부서 라우팅 |
| 배정 | pull + broadcast alert | **자동배정(라벨/부서/스킬)** + 이관/재배정 + maxConcurrent 강제 |
| 고객 상태알림 | 일반 "새 답변"만 | **상태전이별 템플릿 알림**(Inquiries 탭 연동, push/email) |
| 시각화 | 3열 리스트 + 통계 | **칸반 이슈보드** + **워크플로우 대시보드** + **지시메모** |
| 관리자 개입 | 존재 ✅ | 재사용(카드→개입 진입) |
| 해결이슈 관리 | 없음 | 해결/종료 큐 + 해결시간/재오픈/CSAT 통계 |
| 지식순환 | 수동 캡처/코칭 | **분석→캡처/코칭 자동 브리지**(폐루프) |
| 감사/이력 | 대화측만 | **Issue 타임라인**(전이·배정·메모·개입 통합) |
| 전송 | 폴링 5s | (선택) SSE/websocket 실시간 |

---

## 5. 핵심 설계 방향 초안 (상세는 PLN)

### 5.1 Issue(티켓) 데이터모델 (초안)
`issues`(신규): `id, tenant_id, issue_no(테넌트별 시퀀스), conversation_id, session_id, customer_id, order_id(nullable), type(order_status|delivery|cancel|refund|partnership|other), status, resolved_tier(scenario|ai|agent|null), priority(low|normal|high|urgent), assignee_user_id, assignee_label/dept, sla_due_at, resolution_reason, reopen_count, created_at, updated_at, resolved_at, closed_at`.
`issue_events`(신규, 타임라인): `issue_id, actor(system|ai|user_id), type(created|assigned|status_changed|tier_advanced|memo|intervention|customer_notified|reopened), from_status, to_status, note, created_at`.
`issue_memos`(또는 issue_events.note로 흡수): 관리자 지시메모.
> conversation은 유지하되 Issue가 1:1로 감싼다. inquiry 스텁은 Issue로 흡수/폐기 검토.

### 5.2 상태머신 (초안)
```
접수(received) ─┬─▶ 진행(in_progress) ─┬─▶ 해결(resolved) ─▶ 종료(closed)
                │                        └─▶ 반려(rejected) ─▶ 종료(closed)
                └─(자동해소: 1차/2차)────▶ 해결(resolved) ─▶ 종료(closed)
         해결/반려 ─(고객 재문의)─▶ 재오픈 ─▶ 진행
```
- **tier 축(직교)**: scenario(1차)·ai(2차)·agent(3차). 1·2차 자동해소는 접수→해결 단축경로.
- 반려 = "AI/상담원이 처리 불가·범위밖"(예: 정책상 불가, 오분류) → 사유 필수.

### 5.3 3단계 파이프라인 & 정책 라우팅 (초안)
- 1차: 시나리오 스크립트(기존) → 유형 확정, 자동해소 가능하면 해결(tier=scenario).
- 2차: RAG·정책 AI(기존) → 해결(tier=ai) 또는 신뢰도/모더/**정책 deny-list** 시 승급.
- 3차: 정책 라우팅으로 **라벨/부서 자동배정**(consult/accounting/operations) → 상담원 처리.
- **정책 deny-list**: 테넌트별 설정(주제/인텐트 리스트). 매칭 시 신뢰도 무관 강제 3차 + 유형별 부서.

### 5.4 고객 상태회신 매핑 (초안)
| 전이 | 고객 안내(위젯 Inquiries + push) |
|---|---|
| 접수 | "요청이 접수되었습니다(#번호). 확인 중입니다." |
| 진행/배정 | "담당자가 배정되어 처리 중입니다." |
| 해결 | 해결 내용/답변 + (필요시)만족도 요청 |
| 반려 | 반려 사유 + 대안 안내 |
| 종료 | "처리가 완료되었습니다." |
> 위젯 Inquiries 탭(UI 존재)을 이슈 상태 피드로 연결. email/sms는 현재 mock → 실채널 연동은 별도 과제.

### 5.5 칸반/대시보드 UI 개념 (와이어프레임은 PLN)
- **칸반**: 컬럼 = 상태(접수·진행·해결·반려·종료). 카드 = Issue(고객/유형/우선순위/경과시간/**단계 진행바** 접수-1차-2차-3차/담당). 카드에서 지시메모·대화개입 진입. 드래그로 상태 전이(권한 체크).
- **워크플로우 대시보드**: 상태별 건수·병목·SLA 임박·미배정 큐·평균 해결시간·재오픈율(통계 편중 완화).
- 기존 3열 콘솔은 카드 상세(스레드+AI Briefing+개입)로 재활용.

### 5.6 지식 순환 폐루프 (초안)
`분석(question_stats escalationRate/no-source) → 자동 "지식갭 태스크" 생성 → best-answer→KB 캡처/ai-coach 제안(승인) → 재임베딩 → 2차 AI 해소율↑ → 에스컬레이션↓`. 3차 해결답변을 캡처 후보로 자동 제시. cjm_events를 stage 시각화·이슈 타임라인 근거로 활용.

---

## 6. 요청유형별 프로세스 (초안 매트릭스)

| 유형 | 1차 시나리오 | 2차 AI | 자동배정(3차) | 특이 |
|---|---|---|---|---|
| 주문상태 확인 | order_help + 주문근거 | 주문데이터 기반 답변 | 드묾 | 인증 필요(guest lookup) |
| 배송상태 확인 | shipping_policy + 트래킹 | 배송단계 안내 | 드묾 | 웹훅/동기화 연동 |
| 주문취소 | cancel_order 안내 | 정책 범위 답변 | accounting/operations | **실제 취소는 정책상 사람** 후보(deny-list) |
| 환불문의 | refund_policy/return_exchange | 정책 답변 | accounting | 금액/환불 → 사람 후보 |
| 제휴/문의(B2B) | **신규 시나리오 필요** | 범위밖 | biz dev/operations | 현재 affiliate 폼만 존재 |
| 기타/정책밖 | — | deny-list | 라벨별 | 강제 핸드오프 |

---

## 7. 단계별 로드맵 (Phase, 초안)

- **P1 — 이슈 코어**: `issues`/`issue_events` 엔티티 + conversation↔issue 승격 + 단일 상태머신(접수~종료, 반려) + tier 스탬프 + 감사/타임라인. (백엔드 중심)
- **P2 — 정책 라우팅 & 배정**: deny-list 정책, 라벨/부서 자동배정, 이관/재배정, maxConcurrent 강제.
- **P3 — 고객 상태회신**: 전이별 템플릿 + 위젯 Inquiries 탭 연동(push; email 실채널은 조건부).
- **P4 — 칸반/워크플로우 대시보드**: 이슈보드(상태 컬럼·단계 진행바·지시메모·개입) + 대시보드 재편 + 해결/통계.
- **P5 — 지식 폐루프**: 분석→캡처/코칭 자동 브리지 + 유형별 프로세스 정교화 + (선택)실시간 전송.

각 Phase는 REQ→PLN(와이어프레임+승인)→구현→TCR→RPT 준수.

---

## 8. 재사용 자산 (Build-on)
관리자 대화 개입(accept/moderated message/end, 감사) · 에스컬레이션 이벤트/알림(alert/Slack/email) · assignment 엔티티(active/transferred/released 스키마 존재) · question_stats(escalationRate/no-source) · cjm_events(stage) · best-answer→KB 캡처 · ai-coach 설정제안 · StatusBadge/3열 콘솔 · 상태별 복합인덱스(`idx_conv_tenant_status_id`).

---

## 9. 미결정 / 확인 필요 (Open Questions)
1. **Issue vs Conversation 관계**: 1:1 승격인가, 세션당 다중 이슈 허용인가? inquiry 스텁은 폐기/흡수?
2. **자동해소도 이슈 생성?** 1차/2차에서 즉시 해소되는 단순 Q&A도 티켓을 만들지, 임계(에스컬레이션/특정 유형) 이상만 만들지 → 카드 폭주 방지 정책.
3. **반려(rejected) 정의**: 어떤 경우 반려인가(정책 불가 / 오분류 / 스팸)? 고객 문구 톤.
4. **배정 축**: 라벨(consult/accounting/operations) 기준인가, 개인 지정인가, 부서 개념을 신설하나?
5. **SLA 정책**: 유형별 목표시간·영업시간 정의 필요.
6. **고객 채널**: 상태알림을 push만으로 충분? email 실발송(현재 mock) 활성화 범위·SMS 여부.
7. **실시간 전송**: 폴링 유지 vs SSE/websocket 도입 시점(P5 선택).
8. **제휴/B2B 처리주체**: 별도 폼/부서/워크플로우 분리 여부.
9. **지식 자동화 강도**: 캡처를 자동제안까지만(사람 승인) vs 일정 조건 자동승인.
10. **권한**: 상태 전이/반려/재배정 각 액션의 rank×label 권한 매트릭스.

---

## 10. 다음 단계
본 초안 검토·피드백 → 우선순위/미결정 확정 → **P1 PLN**(이슈 데이터모델·상태머신·API·마이그레이션 + 필요한 UI 와이어프레임) 작성 → 승인 후 구현.

---

## 11. 개정 (Rev.2, 2026-08-07) — 제품화(애드온) + 외부 헬프데스크 연동 모델

> 확정된 제품 맥락: ShopTalk = **아메바 "비트비즈#톡" 제품**. 본 워크플로우는 **기본기능 위의 유료 애드온**으로, **사용신청한 고객사에게만** 네이티브로 제공한다. 타 솔루션 사용사(예: **IVY USA = Gorgias**)는 채팅 대화방 리스트만 보고, **세션을 이슈티켓화할 때 외부 솔루션으로 전달(연동)**한다. → 이 절이 §0/§1/§3/§5/§9의 해당 부분을 보강·상위한다.

### 11.1 테넌트 3-모드 (엔타이틀먼트 기반)
| 모드 | 대상 | 제공 |
|---|---|---|
| **A. 네이티브 워크플로우** | 애드온 구독사 | 이슈 칸반·상태머신·에스컬레이션·KB 폐루프(§3~§6 전부) |
| **B. 외부 연동(브리지)** | 자체 헬프데스크 보유(IVY USA=Gorgias) | 채팅+AI 1차 응대 → 에스컬레이션 시 **외부 티켓 생성/전달**. 네이티브 칸반 미노출 |
| **C. 베이스** | 미신청·미연동 | 채팅 대화방 리스트만 |
- **엔타이틀먼트 ≠ 피처플래그**: 롤아웃 플래그와 별개로, **테넌트별 유료 애드온 엔타이틀먼트**를 **서버측에서** 판정(클라 게이팅은 UI 편의일 뿐). tenant/subscription 도메인 연계.
- **모드 배타성(불변식)**: 한 세션은 네이티브 **또는** 외부 중 **하나만 소유**. 외부 전달 시 세션을 "외부소유"로 마킹하고 네이티브 워크플로우 비활성 → 이중추적·상태충돌·루프 방지.

### 11.2 외부 헬프데스크 커넥터 (신규 요구, LCW-R7)
`integration` 도메인 확장. **프로바이더 추상 인터페이스**(Gorgias 우선; Zendesk/Front/Freshdesk 플러그인).
- **자격증명**: 테넌트별, 기존 `integration_credentials`(AES-256-GCM) 패턴 재사용.
- **전달(생성)**: `EVENTS.ESCALATION` 훅에서 외부 티켓 생성. **컨텍스트 패키징**(전체 대화록 + 에스컬레이션 사유 + 고객 + 주문) 필수.
- **멱등/중복방지**: 안정적 외부키로 dedupe, 재-에스컬레이션은 기존 open 티켓에 append vs 신규 생성 정책 결정.
- **상태 회신(선택, 단계적)** — 아래 3레벨 중 선택.

#### 11.2.1 Gorgias 연동 사실관계 (조사 확인)
- **생성**: `POST /api/tickets`(201), Basic Auth(계정 이메일+REST 토큰) 또는 OAuth2. `messages[]` **필수**(대화록을 순서대로, `from_agent`로 방향, `created_datetime`로 원 타임스탬프 보존), `customer.email`만 주고 `id` 생략 → **이메일 자동매칭/생성(dedup)**, `tags/assignee_user|team/status(open|closed)/priority/channel`. 커스텀/서드파티 채널 패턴 존재. 레이트 ~40 req/20s(키)·~80(OAuth) [수치 미공식, 헤더 확인 필요].
- **회신(웹훅=HTTP Integrations)**: `ticket-created / ticket-updated / ticket-message-created / customer-*`. 상태·배정·태그 변경 → **`ticket-updated`**.
- **설계 함정(핵심)**: 상담원 답변은 **이메일 채널로 되돌아옴** → 완전 양방향(상담원 답변을 위젯 채팅으로 릴레이)엔 **아웃바운드 메시지 브리지** 필요(단순 상태폴링으론 부족).

#### 11.2.2 연동 심도 3레벨 (기능검토 산출)
| 레벨 | 내용 | 고객경험 | 구현비용 |
|---|---|---|---|
| **L1 생성-only(단방향)** | 세션→Gorgias 티켓 생성. 이후 응대는 Gorgias(고객은 Gorgias 이메일로 응대받음) | 위젯 이탈, Gorgias로 이관 | 낮음 |
| **L2 상태 회신** | + `ticket-updated` 수신 → 위젯 Inquiries 탭/푸시로 **상태 알림** | 위젯에서 상태 확인 | 중 |
| **L3 완전 양방향** | + `ticket-message-created` 수신 → **상담원 답변을 위젯 채팅으로 릴레이**(아웃바운드 브리지) | 위젯에서 계속 대화 | 높음 |
> 권고: **L1로 출시 → L2 → (수요 시)L3**. 요구사항의 "상태회신"을 위젯으로 지키려면 최소 **L2** 필요(그렇지 않으면 상태회신은 Gorgias 네이티브 이메일에 의존).

### 11.3 개정 미결정 (§9에 추가)
11. **모드 B 상태회신 소스**: 위젯(L2/L3 동기화) vs 외부 네이티브 이메일 — 어디까지 약속하나.
12. **재-에스컬레이션 정책**: 기존 외부 티켓 append vs 신규.
13. **커넥터 우선순위**: Gorgias 이후 Zendesk/Front/Freshdesk 순서·범위. (Front=티켓 아닌 conversation, Freshdesk=자동화룰 웹훅 1000/h, Zendesk=API토큰 2027-04 폐지→OAuth)
14. **도그푸딩 공백**: IVY USA는 B모드라 **네이티브 칸반을 IVY USA로 검증 불가** → A모드 파일럿 테넌트 필요.

### 11.4 검증/롤아웃 함의
- **네이티브(A)**와 **커넥터(B)**는 **다른 고객군**을 검증한다. IVY USA E2E는 **B(Gorgias 전달)** 경로로, A(칸반)는 별도 파일럿으로.
- Phase 매핑 갱신: **P2에 "외부 커넥터(Gorgias L1)"를 신설**(에스컬레이션→외부 전달), L2 상태회신은 P3(고객 상태회신)와 합류, A모드 칸반은 P4 유지, 엔타이틀먼트 게이팅은 P1에 선반영.

---

## 12. Cafe24 연동 분석 (Rev.3, 2026-08-07) — Mode A 파일럿

> **철학 렌즈(적정기술·공유·개발·연결)**: 모드 A 파일럿 = 한국 Cafe24 몰 `amoebaorder.cafe24.com`(Shopify 아님). Cafe24 상품/주문/회원 로직은 **`btbz-shop-pmm`(2_project)에 구현완료** → **재설계가 아니라 자산 재사용(공유) + 지원용 델타만 개발**이 정답. 출처는 `btbz-shop-pmm/2_project/.../integration/cafe24/*` 및 그 `docs/*cafe24*`.

### 12.1 현 위치 — ShopTalk의 Cafe24 준비도 (이미 있는 것)
- `INTEGRATION_PROVIDER`에 **`cafe24`** 선언(shopify/woocommerce/odoo/haravan와 함께).
- `ecommerce-probe.util.ts`에 **Cafe24 연결테스트 구현**: `https://{mall}.cafe24api.com/api/v2/admin/store`(토큰), mall_id 정규화, SSRF를 `cafe24api.com`로 핀.
- 제네릭 `integration_credentials`(AES-256-GCM)로 `(tenant, cafe24)` 자격증명 저장 경로.
- 챗 AI 주문 그라운딩은 **provider-무관 `orders_cache`/OrderService**에 결합 — 단 **현재 이 캐시는 Shopify 동기화/웹훅만 채움**.
- `crypto.util`(AES-256-GCM 3-field) = btbz-shop-pmm `CryptoService`와 동형 → 토큰 암호저장 그대로 매핑.
> ⟹ **적정기술 결론**: Mode A는 "`orders_cache`(+고객)를 **Cafe24에서 채우는 어댑터**"를 추가하는 문제. 나머지 챗/이슈 스택은 그대로.

### 12.2 재사용 자산 (btbz-shop-pmm) — Lift vs Adapt
btbz-shop-pmm은 **NestJS + PostgreSQL(raw `pg`)**, ShopTalk은 **NestJS + MySQL/TypeORM** → 로직은 이식, 영속화는 재작성.
- **거의 그대로(로직=DB무관)**: `cafe24-host.util`(호스트 템플릿), `RealCafe24Adapter.request()`의 **레이트리밋/401/429/재시도·응답검증·페이징(offset→since_id)·`embed=items`**, OAuth 상태머신(단일사용 state·refresh 로테이션·access 인메모리 캐시)의 **설계**, `dto`(스코프·`MALL_ID_RE`).
- **적응 필요(배관)**: `pg`+SQL → TypeORM/MySQL 엔티티(`channel_oauth_state`, `token_encrypted/iv/tag` 3열), `TEXT[]`/`JSONB`/`RETURNING`/`now()+interval` → MySQL 등가(원자적 state 소비는 조건부 UPDATE→SELECT/락 트랜잭션), `CryptoService`→`crypto.util`, 데코레이터(`@Roles`→`@AdminOnly/@RequireRank`), `CAFE24_MODE` mock/real 팩토리(키 없이 가동 — 유지 권장).
> **공유의 핵심 가치 = "플랫폼 지식"**(OAuth 플로우·호스트 분리·레이트헤더·write-verify·PII/스코프 규율·KR 필드 quirk)이며 이건 깨끗이 이식된다. 배관은 기계적 재작성.

### 12.3 Cafe24 플랫폼 핵심 사실 (측정 기반)
- **호스트 분리**: authorize/consent = `https://{mall}.cafe24.com`, API/token = `https://{mall}.cafe24api.com/api/v2/admin` (둘 다 env 템플릿 오버라이드 가능).
- **OAuth**: 단일 **PMM 공개앱**(client_id/secret는 **서버 env**, 테넌트 입력은 `mall_id`뿐), Authorization Code. state=128bit CSRF **단일사용**(조건부 UPDATE로 원자 소비). 토큰교환 = Basic auth. **access ≈2h(인메모리)·refresh 14d(로테이션, 사용 시 재발급→암호화 재저장)**.
- **클라이언트**: `Authorization: Bearer`, `X-Cafe24-Api-Version`(스토어값 우선; 코드 기본 `2025-06-01`/OAuth 기본 `2026-03-01` 불일치 주의), 에러는 토큰 유출 방지 300자 절단.
- **레이트리밋**: `X-Api-Call-Limit "n/40"`, 35/40부터 선제 sleep 600ms; **429** → `X-Cafe24-Call-Remain`(초)만큼 sleep 후 **1회 재시도**; 401 → 캐시 무효화·refresh·1회 재시도.
- **스코프**: `mall.read_product|write_product|read_order|write_order`. 지원용은 최소 **`mall.read_order`** 필요(주문 그라운딩). **`mall.write_order`는 sensitive(실주문 변경)·감사대상**.
- **Gotcha**: 쓰기 후 조용히 무시 → **응답 재확인 필수**; 주문 **상태가 item-level**(헤더에 order_status 없음, 전체동일→그 코드 else `MIXED`); 상태변경은 코드 아닌 **동사**(`prepare/hold/unhold`, `cancel` 서버 denylist); 결제상태별 금액필드 상이(`payment_amount` vs `total_amount_due`); PII 규율(환불계좌·수령인·member_email 등 경계에서 폐기).

### 12.4 지원용 데이터 능력 & 갭 (Shopify Mode 대비)
| 영역 | Cafe24(PMM 기준) | 지원위젯 함의 | Shopify Mode 대비 |
|---|---|---|---|
| **주문 상태/금액/품목** | READ(동기화, SKU 해소) | 주문상태·구매내역·금액 그라운딩 가능 | 동등 |
| **배송/추적번호** | **미수집**(N30/N40 상태코드만) | "송장 추적" 불가 → **상태단계만 안내** | **열위**(Shopify는 송장/택배사) |
| **고객 식별** | **없음**(PMM 무-PII, 회원API 미사용) | 위젯 "내 주문" 바인딩 **불가** → **신규 필요** | **열위**(Shopify는 고객 연동) |
| **클레임(취소/반품/환불)** | **READ-only**(상태·사유·수량 표시, 채널금액) | AI/상담원은 **알림만, 실행 불가** → 채널관리자 핸드오프 | **열위**(Gorgias/Shopify는 실행) |
| **환불금액** | 채널 제공값 표시, **자체계산 금지**(쿠폰/적립/배송비 미포함) | 채널 숫자만 노출·정확액 유보 | 동일 원칙 |
| **상품/변형** | READ(정규 SKU↔채널품번↔상품명) | 상품조회·추천 그라운딩 양호 | 동등 |
- **가장 큰 갭 3개**: ① **고객 식별**(위젯 바인딩) ② **송장 추적** ③ **취소/환불 실행**. 셋 다 PMM이 *미션상 의도적으로* 안 한 것 — **Cafe24 자체는 회원/수령인/클레임 API를 노출**하므로, 지원 유즈케이스는 **동의 기반 + ShopTalk의 PII-at-rest 암호화(PRV-M6)** 위에서 *PMM 범위를 넘어 확장*할 수 있다. 단, 적정기술상 **단계적**으로.

### 12.5 플랫폼 어댑터 설계 (개발, 상세는 PLN)
- **공통 커머스 포트** 도입(또는 기존 ecommerce 추상 확장): `ShopifyAdapter`(기존) ∥ `Cafe24Adapter`(신규). 어댑터는 `orders_cache`(+customers)를 채운다.
- **Cafe24 동기화 = 스케줄 collect**(PMM처럼 date-window pull, `embed=items`, 멱등 upsert). **Cafe24는 실시간 웹훅 부재** → Shopify(웹훅)와 달리 **예약 동기화 중심**(적정기술: 무리한 실시간화 지양).
- 토큰/OAuth는 §12.2 설계를 MySQL로 이식(별도 `channel_integration`류 소형 테이블 or 기존 통합모델에 흡수 + `tenant_id`+`mall_id`+암호화 refresh).

### 12.6 상태 매핑 (신규 필요)
Cafe24 `N00 입금전 / N10 상품준비중 / N20 배송준비중 / N21 배송대기 / N22 배송보류 / N30 배송중 / N40 배송완료 / C00 취소신청 / MIXED` → ShopTalk `ORDER_STATUS_INTERNAL(paid/preparing/shipping/delivered)` + 이슈 tier/상태로 매핑(Shopify 매퍼와 대칭). item-level → 헤더 파생(전체동일 else MIXED). R**/E** 코드는 미측정 → `status_text` 폴백.

### 12.7 단계 & 선결조건
- **선결(프리렉)** — 진행상황:
  - ✅ **ShopTalk용 Cafe24 앱 등록 완료** — 개발자센터 앱 **`btbz#Talk`**, `client_id=W0cuersbLK0Gz1vyut8QjF`, App URL `https://shoptalk.amoeba.site/`, **Redirect URI `https://shoptalk.amoeba.site/api/v1/auth/cafe24/callback`**(ShopTalk 규칙 일치), TZ Asia/Seoul.
  - ✅ **스코프 부여(넓게, 의도적)** — Store admin: Orders(read+write)·Products(read+write)·Customer(read)·Shipping(read)·Supplier·Boards(rw)·Store·Promotions·Sales stats·Access analytics·Apps(rw); **Customer scope: Customer identifier(read)**. **아메바 파트너라 심사반려 위험 없음**, Cafe24 확장 기능 대비 넓게 확보(비트비즈 통합 표면). **⚠️ 적정기술은 grant가 아니라 usage에서**: P-A1 코드는 **read만 호출**(취소/환불 실행은 범위 밖); write grant는 후속 BitBiz 기능(주문상태/상품 push)용으로 대기.
  - ⏳ **client_secret → staging `.env` `CAFE24_*` 주입**(사용자), **콜백 라우트 구현**(P-A1), **`amoebaorder.cafe24.com` 설치·authorize**.
  - ✅ **서버 허용 IP `203.245.45.182/183` = 정상**(내 이전 "불일치" 플래그 철회): **스테이징은 Cafe24 호스팅에서 구동** → 해당 IP는 Cafe24 네트워크 egress로 의도된 값. (인프라·Cafe24 세부는 사용자=Cafe24 커머스/API센터 설계자 판단 신뢰 [[user-cafe24-expertise]])
- **갭 업데이트(중요)**: §12.4의 "고객 식별 없음"·"배송 추적 열위"는 **PMM 선택**이었을 뿐 — 본 앱은 **Customer(read)+Customer identifier(read)+Shipping(read)** 를 이미 확보 → **고객 식별·배송 조회가 플랫폼 레벨에서 가용**(구현만 남음, PMM이 안 쓴 API를 ShopTalk이 사용). 갭 #1·#2 실질 완화.
- **P-A1(모드 A 최소·적정기술)**: Cafe24 OAuth(이식) + **주문 동기화→`orders_cache`** + 상태매핑 + 상품조회. ⟹ 주문상태·구매내역·상품추천 그라운딩 동작. 취소/환불 = **알림-only**, 고객식별 = 주문번호 기반 임시.
- **P-A2**: Cafe24 **회원/고객 API 식별**(동의+PII 암호화) + **배송/추적 API**로 배송 그라운딩 보강.
- **취소/환불 실행**: 정책상 대체로 **사람/deny-list 핸드오프**(REQ §5.3)와 합치 → 기본 미실행. 필요 시 `mall.write_order`+Cafe24 클레임-create(PMM는 404로 미구현, 별도 조사) — 후순위.

### 12.8 Cafe24 미결정 (§9/§11.3에 추가)
15. **ShopTalk Cafe24 앱**: 신규 등록 vs PMM 앱 공유(제품/리다이렉트 상이 → 신규 권장).
16. **고객 식별 방식**: Cafe24 회원 API(동의+암호화) vs 주문번호+검증 — Mode A 위젯 "내 주문"의 근간.
17. **배송 추적**: Cafe24 배송/추적 API 도입 범위(송장/택배사).
18. **취소/환불 실행 여부**: 원칙 미실행(핸드오프)로 확정할지.
19. **플랫폼 표면**: Shopify와 달리 Cafe24는 예약 동기화만 — 반영 지연(분단위) 수용 범위.
