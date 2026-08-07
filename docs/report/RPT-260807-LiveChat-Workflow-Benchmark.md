# RPT-260807 — 라이브챗 이슈 워크플로우: 도입 장단점 & 유사 시스템 비교분석
# Live-Chat Issue Workflow — Pros/Cons & Competitive Benchmark

> 짝문서: `docs/analysis/REQ-260807-LiveChat-Issue-Workflow.md` (요구사항 초안).
> 본 리포트는 그 기능을 **구현했을 때의 장단점**과 **유사 시스템 비교**를 통해 의사결정을 돕는다.
> 외부 수치는 2025–2026 벤더 문서 + 2차 분석 기반의 **방향값**이며, 가격/기능은 자주 바뀐다.
> 미확인 항목은 `[미확인]`으로 표기. 작성일 2026-08-07.

---

## 0. 핵심 결론 (Executive Summary)

1. **만들 가치는 있다 — 단, 두 가지 목적이 겹친다.** ① IVY USA 자체 CS 운영 개선(디플렉션·SLA·투명성) ② **ShopTalk 제품 경쟁력**(이 워크플로우 자체가 멀티테넌트로 파는 기능). 어느 쪽이 우선인지가 Build/Buy 판단을 가른다(§2, 미결정).
2. **전략적 발견 2개 (차별화 레인):**
   - **칸반-바이-상태를 앞세운 대형 벤더가 없다.** 전부 인박스/필터뷰 UX. → 우리 **칸반 이슈보드는 진짜 차별점**이 될 수 있다(테이블스테이크 아님).
   - **지식 폐루프는 강자들도 아직 미완/재편 중.** Zendesk는 Content Cues를 2025-05 폐기, Intercom "Fin Flywheel"만이 완성형. → **KB 순환을 1급 기능으로 만들면 차별화** 가능.
3. **벤치마크 대상은 Channel Talk(채널톡).** KR 시장에서 인박스+AI에이전트(ALF)+KB+커머스(네이버/Shopify)를 이미 다 한다. 우리의 차별화는 "또 하나의 라이브챗"이 아니라 **멀티테넌트 Shopify 네이티브 + KR/US 이중언어 + 정직한 해소 폐루프**여야 한다.
4. **지표는 디플렉션(허수)이 아니라 해소율+재오픈율+CSAT로.** 업계가 그쪽으로 수렴 중.
5. **권고:** 린(lean)한 상태세트 + 고객노출 라벨 분리, KB 순환을 Fin-Flywheel식으로, 칸반을 의도적 차별점으로, 실제 Shopify 주문액션(취소/환불)까지 — 단계적으로. (§5)

---

## 1. 구현 시 장점 / 단점 (우리 맥락 기준)

### 1.1 장점
- **디플렉션 → 만족도·전환↑, 상담원 부하↓.** 단순 반복(주문/배송/취소/환불)을 1·2차가 흡수. (이커머스 성숙 AI 디플렉션 벤치 **55–75%**, 해소율 상위 **80%+** — Fin 데이터)
- **칸반 이슈카드 → 대화 안 읽고 상황 파악.** 병목·미배정·SLA 임박을 한눈에 → 개입 정확·신속, 지연·누락 방지. (게다가 경쟁사가 안 하는 영역)
- **단일 상태 워크플로우(접수~종료+반려) → 추적·책임·재오픈 관리.** 현재 `ended`가 해결/이탈을 뭉뚱그리는 문제 해소, 해소율이 **추정→실측**으로.
- **상태회신 → "블랙홀 문의" 제거.** 티켓형 툴의 기대 동작(인박스형은 안 함) → 투명성으로 신뢰.
- **KB 폐루프의 복리효과.** Intercom 자체 데이터: **해소율 편차는 거의 전적으로 KB 상태가 결정**, 출시 전 2–4주 KB 정비로 **+12%p**. 우리 Qdrant/KB 투자에 정면 부합.
- **제품 차별화로 직결 + 바닥부터 아님.** 관리자 개입·에스컬레이션·RAG·best-answer→KB·cjm stage 등 재사용 자산 다수.

### 1.2 단점 / 리스크 / 비용
- **범위·복잡도 큼.** 이슈 엔티티+상태머신+마이그레이션+칸반 UI+알림+권한 → 5 Phase. 전이 정합성·이관·재오픈·멀티테넌트 격리·3개국어 엣지케이스.
- **카드 폭주 리스크.** 자동해소 단순 Q&A까지 티켓화하면 칸반 무의미 → "무엇을 승격하나" 정책이 성패(§REQ 미결정 #2).
- **AI 오답·과신뢰.** 정책 deny-list·모더레이션 필수(있음)지만 지속 튜닝 부담. **벤더 해소율은 천장** — 독립 테스트는 Fin 실운영 **45–53%**로 낮게 보고. 과신뢰 금물.
- **고객채널 미완.** 상태회신 email/sms가 현재 **mock**(push만 실발송) → 실효성이 채널연동에 종속.
- **실시간성.** 폴링 5s → 대량 트래픽 지연·부하(SSE/websocket은 P5).
- **팀·테스트 성숙도.** 상태머신/마이그레이션은 회귀 위험↑ → 테스트 투자 필요(CI 게이트는 최근 도입).
- **커머스 액션 격차.** 시나리오 "취소"가 실제 취소를 안 함 → Gorgias/Re:amaze는 티켓에서 환불/취소 실행(이게 그들의 해자). 따라잡으려면 실제 주문액션 구현 비용.

---

## 2. Build vs Buy

| 상황 | 합리적 선택 |
|---|---|
| **일반 쇼핑몰(자사 CS만)** | **Buy.** Gorgias(Shopify 네이티브) 또는 채널톡이 이미 이 워크플로우를 제공 → 구축비·유지비 대비 저렴·빠름. |
| **ShopTalk = 이 기능을 파는 멀티테넌트 제품** | **Build.** Buy가 대안이 아님. 저들은 **경쟁자이자 기능 벤치마크**. 질문은 "도입 여부"가 아니라 **"어디까지 따라잡고 무엇으로 차별화"**. |

> ⚠️ **의사결정 필요:** 이 개선안이 **IVY USA 자체 운영용**인지, **ShopTalk 제품 기능**인지에 따라 결론이 갈린다. 자체 운영용이라면 Gorgias/채널톡 구독이 더 합리적일 수 있음을 명시한다. 이하 §3–§5는 **제품(Build) 전제**로 벤치마크한다.

---

## 3. 유사 시스템 비교 매트릭스

범례: ●=강함/네이티브 · ◐=부분/애드온 · ○=약함/없음 · —=해당없음. 가격은 2025–2026 방향값.

| 시스템 | 상태 라이프사이클 | 칸반/보드 | AI 자율해소(그라운딩) | KB 개선 폐루프 | 라우팅·SLA | Shopify 주문액션 | 상태변화 고객알림 | 다국어 | AI 가격모델 |
|---|---|---|---|---|---|---|---|---|---|
| **Gorgias** | Open/Closed/Snoozed (○ 단순) | ○ [미확인] | ● (Guidance=RAG, Skills/Actions) | ◐ (피드백·코칭) | ● 룰/매크로/SLA | ● **환불·취소·수정 from 티켓** | ◐ | ◐ [미확인 수] | **건당** ~$0.9–1.5/해소 (+티켓 이중과금 논란) |
| **Intercom Fin** | Open/In progress/Waiting/Resolved | ○ (인박스) | ● (Help Center RAG, 42–50%↑) | ● **Fin Flywheel(콘텐츠/데이터/액션 갭+임팩트)** ★ | ● Workflows/SLA | ◐ (앱연동, 네이티브 아님)[미확인] | ◐ | ● 45+ [미확인] | **건당** $0.99/outcome (+좌석) |
| **Zendesk** | New/Open/Pending/On-hold/Solved/Closed (● 최다) + 커스텀 | ○ (Views) [미확인] | ● (AI agents, 카피럿) | ◐ **재편중**(Content Cues 폐기→Knowledge Copilot EAP) | ● 스킬/옴니/SLA·재오픈 재무장 | ◐ (앱) | ● (On-hold만 비노출) | ● | **건당** ~$1.5–2/해소[3자] +좌석 |
| **Freshdesk** | Open/Pending/Resolved/Closed + 커스텀·**고객노출 라벨 분리** ★ | ○ (Freshservice만 보드) | ● Freddy Agent (헬프센터+URL) | ◐ [미확인] | ◐ (라운드로빈·SLA는 Pro) | ◐ | ● (고객 라벨) | ● | 코파일럿 **좌석** $29 + 에이전트 **세션** ~$49/100 |
| **Front** | Open/Snoozed/Archived(+티켓상태 별도) | ○ (탭/인박스) | ● Autopilot Resolve (KB+대화이력) | ◐ (Topics 갭) [미확인] | ● 룰/SLA/Topics | ◐ | ○ (이메일 네이티브)[미확인] | ● | **좌석** $65–99 (AI 애드온) |
| **Channel Talk(채널톡)** ★KR | Assignee+status, 미배정 큐, **동시처리 상한** | ○ (인박스) | ● **ALF v2**(문서/시트/웹/PDF RAG, 팩트체크, in-chat 액션) | ◐ (KB 업로드·Quick Publish) | ● Operator·자동배정 캡 | ◐ (Shopify 앱 + **네이버 스마트스토어**) | ◐ | ● KR/JP/US | **AU 사용량**(1AU=$0.001, 티어 번들) +좌석 |
| **Naver TalkTalk(네이버 톡톡)** | ○ (메시징 채널, 티켓 없음) | — | ◐ (챗봇 API, DIY) | ○ | ○ (얇음) | ● 스마트스토어 | ○ | KR | 채널 무료(커머스 종속) |
| *Re:amaze / Crisp / Tidio* | Responded/Done/On-hold · Open/Done/Snooze · 티켓+SLA | ○ | ● (KB RAG, Lyro ~67%) | ◐ | ◐ | ●(Re:amaze) / ◐ | ◐ | ● 45–48개 | 유저당 / 정액 무제한(Crisp $295) / 메터드 애드온 |
| **ShopTalk (현재)** | ai_active/waiting/agent/ended +escalated (○) | ○ **없음** | ● RAG+정책+모더 (에스컬레이션 존재) | ◐ best-answer→KB(수동)+ai-coach | ◐ 알림 broadcast, **자동배정 없음** | ◐ 조회·동기화(취소/환불 액션 없음) | ○ 일반 "새 답변"만 | ● **en/es/ko** | — |
| **ShopTalk (REQ-260807 목표)** | 접수/진행/해결/반려/종료 +tier(1/2/3차) ● | ● **칸반(차별점)** | ● +정책 deny-list 라우팅 | ● **분석→캡처/코칭 자동 폐루프** | ● 라벨/부서 자동배정·SLA | ◐→● (주문액션 로드맵) | ● 전이별 템플릿(Inquiries 탭) | ● en/es/ko | (제품화 시 사용량 메터드 검토) |

★ = 특히 참고할 강점. `[미확인]` 항목은 §8 확인.

---

## 4. 카테고리별 인사이트 (우리에게 주는 시사점)

**(a) 상태 라이프사이클** — Zendesk 6단계가 최다지만, Front/Kustomer/Help Scout는 **3상태(open/pending/closed류)로도 충분**함을 증명. **Freshdesk의 "내부 라벨 ≠ 고객노출 라벨"** 패턴은 저비용·고가치 → 우리 접수/진행/해결/반려/종료에 **고객용 문구를 별도로 매핑**(REQ §5.4와 합치).

**(b) AI 이분화** — 업계가 **자율 에이전트(건당 과금)** vs **코파일럿(좌석당 과금)**으로 명확히 분리. 우리 AiGateway+모더레이션이 그대로 매핑되므로, **명명도 시장 관용어("AI Agent" vs "Copilot")**를 따르면 이해도↑.

**(c) 칸반** — 헤드라인 벤더 누구도 앞세우지 않음(진짜 상태보드는 ITSM인 Freshservice뿐). → **우리 칸반 이슈보드는 의도적 차별점.** 단, 카드 폭주 방지 정책이 전제.

**(d) KB 폐루프 — 최대 기회** — **Intercom "Fin Flywheel"이 골드스탠다드**: Fin이 못 푼 대화를 리뷰→**콘텐츠 갭/데이터 갭/액션 갭** 3종을 **임팩트 점수**로 주간 추천→수락/완료/거절 학습. 우리는 현재 "수동 캡처 버튼"뿐이므로, **이 플라이휠 구조로 격상**(고에스컬레이션 토픽 자동 갭 태스크화)하면 강자와도 대등한 차별점. (Zendesk조차 재편 중 = 지금이 기회)

**(e) 지표 — 허수 주의** — **디플렉션은 vanity metric**으로 비판받는 추세. **해소율(관련성+정확성+미핸드오프) + 재오픈율 + CSAT** 삼각으로 설계. 벤치: 해소율 벤더값 **76%**↔독립 **45–53%**(범위로 인용), **FCR ~70%**, **CSAT 85%+**, 이커머스 디플렉션 **55–75%**.

**(f) 에스컬레이션 베스트프랙티스** — 명시적 트리거(요청/저신뢰/결제·보안·환불/부정감정/조사필요) + **컨텍스트 보존(재질문 0)** + **HITL 2모드(실시간 개입/전송전 검토)** + **투명 안내(다음단계·ETA)** + **피드백 루프**(칸반은 운영이자 **AI 학습데이터**). 우리 설계에 그대로 반영.

**(g) 커머스 액션 깊이** — Gorgias/Re:amaze의 해자 = **티켓에서 환불·취소·주문수정 실행**. 우리 시나리오는 "취소 안내"만 → **실제 주문액션**을 (기존 Shopify 연동 위에) 붙이면 이커머스 특화 강점. (Naver 종속인 네이버톡톡이 못 하는 것)

**(h) KR 맥락** — **채널톡 = 레퍼런스 구현**(인박스/Assignee/Operator/자동배정캡/ALF/KB/커머스). **네이버톡톡 = 제품 논지 검증**(메시징 채널일 뿐, 티켓/칸반/AI루프 = 우리 부가가치). 향후 **Kakao 상담톡 브리지** 고려.

---

## 5. REQ-260807에 대한 반영 권고 (Delta)

1. **상태모델 확정 + 고객노출 라벨 분리**(Freshdesk 패턴). 3~5 상태로 린하게, 자동해소는 단축경로.
2. **KB 순환을 Fin-Flywheel식 1급 기능으로.** 단순 캡처 버튼 → 콘텐츠/데이터/액션 갭 + 임팩트 점수 + 수락/거절 학습. (analytics escalationRate와 연결)
3. **지표 대시보드는 해소율/재오픈/CSAT 중심**(디플렉션 보조). CSAT 수집 신설.
4. **실제 Shopify 주문액션(취소/환불) 로드맵화** — 이커머스 차별점, 기존 연동 위에.
5. **칸반을 의도적 차별점으로 마케팅**(경쟁사 부재 영역).
6. **에스컬레이션 컨텍스트 패키징 + HITL 2모드 + 피드백 루프** 명문화.
7. **(제품화 시) 사용량 메터드 AI 과금 신호** 반영(채널톡 AU·Gorgias 건당). 단 이중과금 인상 회피.
8. **명명 시장정렬**: "AI Agent"(자율) / "Copilot"(상담원보조).

---

## 6. 리스크 & 완화 · 성공지표(KPI)

| 리스크 | 완화 |
|---|---|
| 카드 폭주 | 승격 정책(에스컬레이션/특정 유형/재오픈만 티켓화), 자동해소는 로그만 |
| AI 오답·과신뢰 | deny-list+모더레이션(있음), 신뢰도 임계 튜닝, 재오픈율 감사 |
| 상태회신 실효성(mock 채널) | push 우선 + 위젯 Inquiries 탭, email 실발송은 별도 과제 |
| 상태머신 회귀 | 전이 단위 테스트, 마이그레이션 사전적용(pre-deploy-check) |
| 실시간성 | 폴링 유지 → 트래픽 임계 시 SSE(P5) |

**KPI 목표(초안):** AI 해소율(관련+정확+미핸드오프) 추적 시작 → 단계적 상향, **재오픈율↓**, **CSAT 85%+ 지향**, FCR ~70% 참고, 미배정 대기시간·SLA 준수율.

---

## 7. 권고

- **제품(Build) 전제라면 진행 권고** — 단 §5의 델타(특히 KB 플라이휠·칸반·정직한 지표·주문액션)를 REQ에 반영하고 **P1(이슈 코어)부터 단계적**으로. 칸반과 KB 폐루프를 **의도적 차별점**으로 배치.
- **자체 운영용이라면** Gorgias/채널톡 구독과의 TCO 비교를 먼저 할 것(Build 정당화 약함).
- **선결 결정(REQ §9와 동일):** ① 목적(제품 vs 자체운영) ② 티켓 승격 범위 ③ 배정 축(라벨/부서) ④ 반려 정의·고객채널.

---

## 8. 출처 & 확인 필요(미확인) 항목

**주요 출처(대표):** Gorgias(AI Agent/pricing/Shopify actions docs), Intercom Fin(ticket states/SLA/Optimize-Fin "Recommendations"), Zendesk(ticket lifecycle/SLA/Content Cues 폐기/Knowledge Copilot), Freshdesk(custom statuses/handover), Front(status/Autopilot), Channel Talk(Inbox/ALF/Workflow/2025-11 pricing/Smart Store 연동), Naver TalkTalk(Partner Center/Chatbot API), Kakao(상담톡/Chatbot scenario), 지표(fin.ai resolution-vs-deflection, Lorikeet/IrisAgent, SQM FCR).

**미확인/주의:**
1. 칸반 부재는 "문서 미기재" 추론이지 벤더의 명시적 부정 아님(Gorgias/Zendesk/Front).
2. Zendesk 건당가($1.5–2), 채널톡 좌석 실단가 = 3자/미공개 → 인용 전 벤더 확인.
3. Intercom Shopify 주문액션 네이티브 깊이, 다국어 정확 개수 미확인.
4. Fin 해소율 67%↔76%↔독립 45–53% = **점이 아니라 범위로** 인용.
5. Freshdesk 칸반은 Freshservice(ITSM) 한정 가능성.
6. 모든 가격 2025–2026 스냅샷, 변동성 큼.

---

## 9. 개정 (Rev.2, 2026-08-07) — 애드온 제품 + 외부 연동 허브 관점

> 확정 맥락: 본 워크플로우는 **비트비즈#톡의 유료 애드온**(사용신청사만 네이티브). 타 솔루션 사용사(IVY USA=Gorgias)는 대화 리스트만 + **세션→외부 티켓 전달**. 이는 §2 Build/Buy와 §1 장단점을 다음과 같이 **상위/보강**한다.

### 9.1 Build vs Buy 재정의 → "대체가 아니라 연동 허브"
이전 이분법(제품 Build vs 자체운영 Buy)은 **틀렸다**. 실제 모델은 **3-모드 애드온**:
- **A 네이티브**(구독사) / **B 외부브리지**(Gorgias 등으로 전달) / **C 베이스**(리스트만).
- ShopTalk은 **Gorgias 대체재가 아니라 그 앞단의 AI 1차응대 + 라우터**. 인큐번트는 **경쟁자이자 *연동 타깃*(보완재)**.

### 9.2 개정 장점 (이 모델이 더 강함)
- **도입 마찰↓·TAM↑**: 쓰던 헬프데스크를 안 버려도 됨 → rip-and-replace 아님. B로 넓게, A로 업셀.
- **매출 2면 + 업셀 경로**: ① 네이티브 애드온 구독 ② AI/채팅+커넥터. **B→A** 전환.
- **연동=해자·고착**: Gorgias/Zendesk에 티켓을 먹여주는 AI 레이어 → 이탈 어려움.
- **AI 디플렉션이 전 모드 공통 이득**: B모드도 티켓 생성 *전* AI가 1차 해소 → **고객사의 Gorgias 건당과금 절감**이 직접 세일즈 포인트.
- **기존 자산 재사용**: `EVENTS.ESCALATION`=전달 훅, `integration_credentials`(AES-GCM)=커넥터 자격증명.

### 9.3 개정 단점/리스크 (연동 특유)
- **커넥터 유지보수(외부별)**: API·인증·레이트 상이 → Gorgias 우선, 확장형.
- **소유권/모드 배타성**: 전달 후 세션은 외부 소유(불변식). 어기면 상태충돌·루프.
- **양방향 상태동기화 복잡도 + split-brain**: 요구 "상태회신"을 B에서 지키려면 **Gorgias→우리 상태 웹훅** 필요. 안 하면 상태회신은 Gorgias 이메일에 의존(위젯 Inquiries 미반영).
- **완전 양방향의 숨은 비용**: Gorgias 상담원 답변은 **이메일 채널로 회귀** → 답변을 위젯에 릴레이하려면 **아웃바운드 브리지**(L3) 필요.
- **중복 티켓**: 이메일 매칭 + 멱등키로 dedupe, 재-에스컬레이션 append/신규 정책.
- **엔타이틀먼트 배관**: 테넌트 애드온 엔타이틀먼트(서버 판정) + UI 게이팅 신설.
- **도그푸딩 공백**: IVY USA는 B모드 → **네이티브 칸반을 IVY USA로 검증 불가**, A는 별도 파일럿.

### 9.4 외부 커넥터 기능검토 (연동 타깃 사실관계 + 3레벨)
**연동 타깃으로서의 헬프데스크** (create-ticket API + 상태 웹훅 = forward-and-sync 가능?):

| 타깃 | 티켓 생성 | 상태/답변 웹훅 | 특이/함정 |
|---|---|---|---|
| **Gorgias** ★ | `POST /api/tickets`(Basic/OAuth), `messages[]`필수, `customer.email`로 dedup, tags/assignee/status(open\|closed) | HTTP Integrations: `ticket-created/updated/message-created` | **상담원 답변=이메일 채널 회귀** → L3엔 아웃바운드 브리지 필요. 레이트 ~40/20s[미공식] |
| **Zendesk** | `POST /api/v2/tickets`(comments) | Webhooks API + 트리거(상태변경) | **API 토큰 2027-04 폐지→OAuth** |
| **Front** | conversations/messages(`api2.frontapp.com`) | HMAC 웹훅(message.*, conversation.assigned…) | "티켓" 아닌 **conversation** 모델 |
| **Freshdesk** | `POST /api/v2/tickets`(키인증) | **자동화룰 웹훅**(구독API 아님), ~1000/h | 상태동기 우회적 |

**연동 심도 3레벨(권고: L1→L2→(수요시)L3):**
- **L1 생성-only**: 세션→외부 티켓. 이후 Gorgias가 응대(고객은 Gorgias 이메일). 위젯 이탈. *구현 낮음.*
- **L2 상태 회신**: +`ticket-updated` 수신 → 위젯 Inquiries/푸시로 상태 알림. *요구 "상태회신"의 최소선.*
- **L3 완전 양방향**: +`ticket-message-created` → 상담원 답변을 위젯 채팅으로 릴레이(아웃바운드 브리지). *최고 비용.*

**연동 함정(공통):** 중복티켓(이메일매칭+멱등), 컨텍스트 유실/루프(생성 시 전체 대화록+사유 첨부), **소유권 단일화**(전달 후 헬프데스크가 상태 소유, 우리는 read-only/notify) — 양방향 동기화의 고전적 함정.

### 9.5 매트릭스 갱신 메모
§3 매트릭스의 Gorgias/Zendesk/Front/Freshdesk 행은 이제 **"경쟁자"이자 "연동 타깃"** 이중 역할로 읽는다. ShopTalk(목표) 행에 **"외부 커넥터(LCW-R7)"** 를 추가 기능으로 반영.

### 9.6 개정 권고
- **진행 권고(제품)** — 단 **B(Gorgias 커넥터 L1)를 P2 초기 산출로 우선**(IVY USA가 즉시 수혜·검증), 네이티브 칸반(A)은 **별도 파일럿 테넌트**로 병행. 상태회신은 **L2**를 목표로.
- **엔타이틀먼트 게이팅을 P1에 선반영**(모드 A/B/C 판정).
- 선결 결정 추가(REQ §11.3): 모드 B 상태회신 소스(위젯 vs 이메일), 재-에스컬레이션 정책, 커넥터 우선순위, A모드 파일럿 대상.

**추가 출처(연동):** Gorgias [create-ticket](https://developers.gorgias.com/reference/create-ticket)·[third-party channel](https://developers.gorgias.com/docs/receive-and-respond-to-tickets-from-a-third-party-app)·[webhooks(eesel)](https://www.eesel.ai/blog/gorgias-webhooks); Zendesk [creating-tickets](https://developer.zendesk.com/documentation/ticketing/managing-tickets/creating-and-updating-tickets/)·[webhooks](https://developer.zendesk.com/api-reference/webhooks/webhooks-api/webhooks/); Front [events](https://dev.frontapp.com/reference/events); Freshdesk [webhooks](https://support.freshdesk.com/support/solutions/articles/132589-using-webhooks-in-automation-rules); 엔타이틀먼트 [LaunchDarkly](https://launchdarkly.com/blog/how-to-manage-entitlements-with-feature-flags/).
**추가 미확인:** Gorgias 레이트리밋 정확수치(3자), create API의 snoozed 상태 노출(open/closed만 확인) → 구현 전 공식문서/라이브 헤더 확인.
