# PLN-260826 라이브챗 핀 고정 · 고객 메시지 액션 4종 구현 계획

- 근거: `docs/analysis/REQ-260826-LiveChat-Message-Actions.md`

## 핵심 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | 핀 = `conversations.pinned_at/pinned_by` 컬럼(테넌트 공유, 최대 3) | 정렬 키가 **SQL ORDER BY 단계**에 있어야 페이지네이션이 안 깨짐 — 컬럼 방식이면 조인 없이 `ISNULL(pinned_at), pinned_at DESC` 선두 삽입으로 끝. 사이드 테이블(개인 핀)은 조인+distinct 부작용 |
| D2 | 액션 노출 판정 = `!(status==='ai_active' && autoReplyEffective && autoReplyMode!=='approve')` | AutoReplyControl과 동일 의미론 + **approve 모드는 상담원이 최종 발송하므로 "자동응답 아님"으로 간주**(effective만으로는 auto/approve 구분 불가 — AS-IS 확인). ended·waiting·agent·AI OFF 전부 노출 |
| D3 | 액션열은 버블 **바깥 우측**(행 래퍼에 `group`, hover/focus 시 표시), `sender==='user'`만 | 고객 버블(bg-gray-100) 내부는 4아이콘이 비좁음; 기존 타임스탬프가 버블 옆에 서는 구조와 동형. `!outbound` 게이트는 system도 잡으므로 금지(AS-IS 함정) |
| D4 | 답글 인용 = **인용 칩**(컴포저 위, X 제거) + 발송 시 `> 발췌\n\n` 프리픽스 조립 | 컴포저가 한 줄 `<input>`이라 draft에 개행 주입 불가(AS-IS). 칩 방식은 입력 UX 불변·무스키마 |
| D5 | 메시지 번역 = 서버 온디맨드 + **Redis 24h 캐시**(`msgtr:{id}:{lang}`) + 클라 react-query 캐시 | 상담원 여러 명이 같은 메시지를 눌러도 LLM 1회. DB 미저장(새로고침 소실은 아메바와 동일한 수용 한계). 프롬프트 언어명 맵은 briefing.service에서 export 재사용 |
| D6 | 메시지 이슈 등록 = `createManual` 확장 — 발췌·메모를 note로: 이슈 없으면 CREATED note, 있으면 **MEMO 이벤트 append** | `uk_issue_conv`(대화당 1이슈) 불변. `issue_events.note`=varchar(500) → 발췌 ≤120자·메모 ≤300자 클램프(서버가 메시지 본문을 직접 조회해 발췌 — 클라 위조 불가). message_id 컬럼 추가는 범위 밖 |

## 스키마 — `sql/260826-conversation-pin.sql`

```sql
ALTER TABLE conversations
  ADD COLUMN pinned_at DATETIME(6) NULL,
  ADD COLUMN pinned_by BIGINT NULL,
  ADD INDEX idx_conv_tenant_pinned (tenant_id, pinned_at);
```
롤백: 컬럼 2 DROP + 인덱스 DROP. 엔티티에 동일 컬럼+@Index 동반(주의: dev synchronize 드롭 함정). manifest 갱신.

## W1. 백엔드

1. **핀**: `PATCH /agent/conversations/:id/pin {pinned}` — 핀 설정 시 테넌트 활성 핀 count ≥3이면 **E5060 `PIN_LIMIT_REACHED`**(409) + warn. 해제는 무조건 허용. 감사 `agent.conversation_pinned`. `listSessions` ORDER BY 선두에 `ISNULL(c.pinned_at) ASC, c.pinned_at DESC` 삽입(기존 MAX(id)는 addOrderBy로 강등, 그룹/검색 경로 무변경). `toSessionResponse`에 `pinned`/`pinnedAt` 추가(⚠️ 기존 지역변수 `pinned`=AI 에이전트 핀과 이름 충돌 — `queuePinned`로 명명).
2. **메시지 번역**: `POST /agent/messages/:id/translate {lang}` — `msgRepo.findOne({id, tenantId})` 소유 검증(messages에 tenant_id 있음) → Redis 캐시 조회 → miss 시 `aiGateway.complete(ASSIST, 번역 프롬프트)`(briefing.translate와 동일 문법, 언어 6종 검증=VALIDATION, 실패=E5055) → 캐시 저장 → `{messageId, lang, text}`.
3. **이슈 등록 확장**: `FileIssueRequest`에 `message_id?`(IsInt)·`memo?`(≤300자) 추가. `AgentService.fileIssue` → 메시지 소유(대화 일치) 검증 후 발췌 생성 → `IssueService.createManual(..., {excerpt, memo})`: 신규면 CREATED note=`[고객] "발췌" · 메모`, **기존 이슈면 MEMO 이벤트 append**(응답에 `appended: true`로 구분 — 토스트 문구 분기).
4. 유닛: 핀 한도/해제/정렬 키·테넌시, 번역 캐시 히트·언어 거부·소유 검증, 이슈 신규 note/기존 append/발췌 클램프. (id 비교 문자열 픽스처.)

## W2. 프런트

- **목록**: 행 배지 클러스터에 핀 아이콘(핀됨=채움·상시 표시, 미핀=호버 시 표시·클릭 토글), E5060 토스트. 핀 행 상단 정렬은 서버 순서 그대로(클라 재정렬 없음). 상세 헤더에도 핀 토글.
- **버블 액션열**: 행 래퍼 `group` + 고객 버블 우측에 `[번역][지식][답글][이슈]` 아이콘 4종(`opacity-0 group-hover:opacity-100 focus-within:opacity-100`), D2 판정식으로 렌더 게이트.
- **번역**: 아이콘 → 위로 열리는 팝오버(언어 6종 원클릭, 기본=콘솔 언어, 로딩 스피너) → 버블 아래 틴트 서브버블(라벨 "{언어}로 번역됨" + X, 언어별 스택). react-query 키 `['msg-tr', tenantKey, id, lang]`.
- **지식조회**: `setKbQuestion(m.body)` + KB 카드 ref 스크롤·포커스.
- **답글**: 인용 칩 state `{messageId, excerpt}` — 컴포저 위 칩(₩"> 발췌…" + X), `onSend`에서 `> 발췌\n\n` + draft 조립, 발송/취소 시 칩 해제.
- **이슈 모달 확장**: 기존 유형 셀렉트에 + **대상 메시지 발췌**(읽기 전용, message_id 지정 시) + **메모 textarea**(≤300자). 헤더 [이슈로 등록] 버튼은 메시지 미지정 경로로 유지(하위 호환). IssuePanel 타임라인 note를 `whitespace-pre-line`으로(발췌+메모 줄바꿈 표시).

## W3. i18n(6언어 ~20키) · TCR · RPT · SPEC §6.3(핀 컬럼)

## 와이어프레임

### ① 목록 행 — 핀
```
┌ 📌 홍길동 ✎                    〔Livy〕 │  ← 핀됨: 채운 핀 아이콘(클릭=해제), 항상 상단
│   세션 4f9a2c   [위젯] [상담원중]        │
├ ───────────────────────────────────── │
│ 김민수 ✎              (호버시 📍)〔Livy〕│  ← 미핀: 호버 시 아이콘 표시(클릭=핀, 4번째면 토스트)
```

### ② 고객 버블 호버 액션열 + 번역
```
┌ 배송이 언제 오나요? ┐ [🌐][📖][↩][🏷]  10:12   ← user 버블 + 호버 액션열(번역/지식/답글/이슈)
                       ┌ 언어 선택 ─────┐
                       │ 한국어 · English │  ← 원클릭 번역 팝오버
                       │ Tiếng Việt · …  │
                       └─────────────────┘
┌ 배송이 언제 오나요? ┐
│ 한국어로 번역됨    ✕ │  ← 인라인 서브버블(원문 유지, 언어별 스택)
│ (번역 결과)          │
```

### ③ 답글 인용 칩 + ④ 메시지 이슈 모달
```
┌ ↩ "배송이 언제 오나요?…"  ✕ ┐   ┌ 이슈로 등록 ──────────────────┐
│ [답변 입력…          ] [전송] │   │ 대상 메시지: "배송이 언제…"     │
└─────────────────────────────┘   │ 유형 [배송 ▾]                  │
  발송문: > 배송이 언제 오나요?…      │ 메모 [3회째 동일 문의        ]  │
         (작성한 답변)              │ 이미 이슈가 있으면 메모로 추가됨  │
                                  │  [취소] [등록]                 │
                                  └───────────────────────────────┘
```

## 부수영향

- 목록 ORDER BY 선두 변경 — 핀 없는 테넌트는 `ISNULL(pinned_at)`이 전 행 동률이라 기존 순서 그대로(무회귀). 인덱스 추가로 count/정렬 비용 무해.
- 번역은 새 LLM 소비처 — 사용량 계측은 aiGateway가 자동 수행(feature 문자열은 구현 시 계측 모듈의 허용 형식 확인 후 확정).
- 이슈 note 형식은 문자열 규약(파서 없음 — 아메바의 포맷 파싱 함정 회피, 표시 전용).
- 트랜스크립트 버블 구조 변경은 액션열 추가뿐(기존 지식 캡처 버튼·첨부·타임스탬프 불변).

## 검증 계획

유닛 ~12케이스 + 스테이징: 핀 3개→4번째 거부→해제, 목록 상단 고정·필터 병행, 번역(캐시 1회 호출 확인), KB 주입, 인용 발송문에 프리픽스 포함(위젯 수신 확인), 이슈 신규/기존-append 각 1회(타임라인 표시), AI 자동응답 중 대화에서 액션 미노출.
