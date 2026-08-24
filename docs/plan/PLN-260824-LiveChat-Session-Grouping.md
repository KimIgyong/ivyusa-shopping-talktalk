# PLN-260824 라이브챗 세션 그룹핑 (타임라인/프로젝트) 구현 계획

- 근거: `docs/analysis/REQ-260824-LiveChat-Session-Grouping.md` (아메바톡 Bound Chat 실구현 분석 포함)
- 원칙: 그룹은 **뷰**다 — 원본 세션/대화/메시지를 절대 변경하지 않는다. 유형(타임라인/프로젝트)은 구분자일 뿐 동작 분기가 없다.

## 핵심 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | **그룹핑 단위 = 세션(session_id)** | 세션:대화방=1:N이라 대화방 스냅샷(아메바톡 방식)은 종료 후 새 대화가 그룹 밖에 생김. 세션 단위면 과거+미래 대화가 자동 포함 — "동일 고객 모아보기" 목적에 부합 |
| D2 | 병합 피드는 **전역 message id 커서** 하나로 페이지네이션 | `messages.id`가 전역 AUTO_INCREMENT — 기존 콘솔 `beforeId` 방식 그대로, 정렬 정확·구현 최소 |
| D3 | 발신은 기존 `AgentService.sendMessage` **무수정 재사용** | 모더레이션·동의 게이트·감사·중복방지·통지 전부 상속. 그룹 계층은 "수신 세션 → 대화방 해석"만 담당 |
| D4 | 그룹 발신 V1은 **텍스트 전용** | 첨부 업로드가 대화방 귀속이라 수신자 변경 시 고아 첨부 발생. 첨부는 원 대화방에서 기존대로 가능 — 후속 확장 |
| D5 | 이력은 **audit_logs 재사용** (신규 history 테이블 없음) | 아메바톡의 BoundChatHistory 상당 — 기존 감사 축으로 충분(적정기술) |
| D6 | 최소 멤버 2 규칙 (미만이 되는 제거는 거부, 해제 안내) | 아메바톡 동일 가드 — 1개짜리 그룹은 의미 없음 |

## 스키마 — `sql/migration_chat_groups.sql`

```sql
CREATE TABLE IF NOT EXISTS chat_groups (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id  BIGINT       NOT NULL,
  kind       VARCHAR(16)  NOT NULL,            -- 'timeline' | 'project' (구분자)
  title      VARCHAR(100) NOT NULL,
  created_by BIGINT       NOT NULL,
  created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_cgroup_tenant (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_group_members (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  tenant_id  BIGINT      NOT NULL,
  group_id   BIGINT      NOT NULL,
  session_id BIGINT      NOT NULL,
  added_by   BIGINT      NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cgm_group_session (group_id, session_id),
  KEY idx_cgm_tenant_session (tenant_id, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

하드 삭제(해제 = 그룹+멤버십 삭제). 같은 세션이 여러 그룹에 속할 수 있음(그룹 내 중복만 유니크로 차단).

## API (`/agent`, `@RequireCapability(CONVERSATION_HANDLE)`, 전 쿼리 tenant 술어)

| 메서드/경로 | 동작 |
|---|---|
| `GET /agent/groups` | 그룹 목록: kind·title·memberCount·lastMessageAt(멤버 세션 대화들의 MAX(message id) 1쿼리 집계) |
| `POST /agent/groups` | `{kind, title, session_ids[]}` — 세션 ≥2·전부 자기 테넌트 검증 후 생성 |
| `GET /agent/groups/:id` | 그룹 + 멤버 상세: sessionId, 표시명(alias→고객명→세션라벨), channel, receiveOnly, targetConversationId(열린 대화방 ?? 최신 대화방) |
| `GET /agent/groups/:id/messages?before_id&limit` | **병합 피드**: 멤버 세션들의 conversation IN → `messages` id DESC limit+1, 메시지별 sessionId·표시명·채널·첨부 포함 |
| `POST /agent/groups/:id/messages` | `{session_id, body}` — session_id가 멤버인지 검증(E5058) → 열린/최신 대화방 해석 → `agentService.sendMessage` 그대로. 수신전용 채널 거부 |
| `PATCH /agent/groups/:id` | `{title?, kind?}` 수정 |
| `POST /agent/groups/:id/members` | `{session_ids[]}` 추가 (중복은 무시, 타 테넌트 404) |
| `DELETE /agent/groups/:id/members/:sessionId` | 제거 — 결과가 2 미만이면 E5057 거부 |
| `DELETE /agent/groups/:id` | **그룹 해제**(그룹+멤버십 삭제, audit) |

에러코드 신설: `E5056 GROUP_NOT_FOUND` · `E5057 GROUP_MIN_MEMBERS`(2 미만 불가) · `E5058 GROUP_RECIPIENT_INVALID`(멤버 아님/수신 불가 채널).
감사: `agent.group_created / group_updated / group_members_changed / group_dissolved / group_message_sent`(메타데이터에 제목·본문 미포함 — id·건수·kind만).

백엔드 신규 파일: `domain/agent/entity/chat-group.entity.ts`·`chat-group-member.entity.ts`·`chat-group.service.ts`(+spec)·컨트롤러 확장·매퍼. `ChatService.findOpenConversation/findLatestConversation` 재사용을 위해 세션→대화방 해석 헬퍼를 chat 도메인에서 노출(또는 동일 로직을 그룹 서비스에 최소 구현 — 순환 의존 피해서).

## 단계

| 단계 | 내용 | 산출 |
|---|---|---|
| W1 | 백엔드: 테이블·엔티티·서비스·API + 유닛 스펙(테넌시·최소멤버·수신자검증·병합 커서·해제) | SQL 2테이블, E5056~E5058 |
| W2 | 콘솔 목록: 선택 모드(체크박스+하단 바) + 그룹 만들기/기존 그룹에 추가 모달 + 목록 [그룹] 탭 | GroupCreateModal, 목록 개편 |
| W3 | 그룹 룸: 병합 트랜스크립트(세션 표기) + 수신자 선택 1:1 발신 + 그룹 설정(수정·멤버 제거·해제) | GroupRoom, GroupSettingsModal |
| W4 | i18n 6언어·토스트·SPEC §6.3/§7 갱신·TCR·RPT | 문서 |

## 와이어프레임

### ① 목록 — 선택 모드 & 그룹 만들기
```
┌ 세션 (12)  [전체|상담필요|종료|그룹]  [선택] ┐   선택 모드 진입 시:
│ ☐ 홍길동 ✎                                │  ┌──────────────────────────────┐
│   세션 4f9a2c   [위젯] [상담원중]            │  │ ☑ 홍길동   ☑ hong@x.com  ☐ 김민수│
│ ☐ hong@x.com                              │  │ 2개 선택                       │
│   세션 9b21ee   [텔레그램] [종료]            │  │ [그룹 만들기] [기존 그룹에 추가▾]  │
│ …                                         │  │ [취소]                        │
└───────────────────────────────────────────┘  └──────────────────────────────┘

┌ 그룹 만들기 ────────────────────────┐
│ 유형   (●) 타임라인 — 개인 고객의     │
│            세션 묶음                │
│        ( ) 프로젝트 — 고객사 관련     │
│            당사자들의 대화 묶음        │
│ 제목   [홍길동 님 반품 건        ]    │
│ 멤버   홍길동(위젯) · hong@x.com(텔레) │
│              [취소]  [만들기]        │
└────────────────────────────────────┘
```

### ② 목록 — [그룹] 탭
```
┌ 그룹 (3) ──────────────────────────┐
│ [타임라인] 홍길동 님 반품 건          │
│   멤버 2 · 마지막 메시지 5분 전       │
│ [프로젝트] ACME 입점 협의            │
│   멤버 4 · 마지막 메시지 어제         │
└────────────────────────────────────┘
```

### ③ 그룹 대화방 (병합 뷰 + 1:1 발신)
```
┌ [타임라인] 홍길동 님 반품 건   멤버 2 · ⚙ 설정 ┐
│ ── 8/22 ──────────────────────────────────  │
│ ┌ 홍길동 · 위젯 ┐                            │
│ │ 반품하고 싶어요                             │
│ ┌ AI → 홍길동 · 위젯 ┐                       │
│ │ 반품 절차는 …                              │
│ ── 8/24 ──────────────────────────────────  │
│ ┌ hong@x.com · 텔레그램 ┐                    │
│ │ 지난번 반품 건 어떻게 됐나요?                 │
│ ─────────────────────────────────────────── │
│ 수신 대상 [홍길동 (위젯) ▾]  ← 미선택 시 발신 불가│
│ [메시지 입력…                        ] [전송] │
└─────────────────────────────────────────────┘
```

### ④ 그룹 설정
```
┌ 그룹 설정 ──────────────────────────┐
│ 유형  [타임라인 ▾]   제목 [……    ]   │
│ 멤버                                │
│  · 홍길동 (위젯)          [제거]      │
│  · hong@x.com (텔레그램)  [제거]      │
│  (2명 미만이 되는 제거는 불가)          │
│ ────────────────────────────────── │
│ [그룹 해제]            [취소] [저장]  │
│  └ 해제해도 대화·메시지는 사라지지 않음  │
└────────────────────────────────────┘
```

## 부수영향 분석

- **원본 무변경**: conversations/sessions/messages 스키마·상태 불변. 그룹 발신은 일반 상담원 발신과 구별 불가(고객 입장 동일) — 위젯·외부 채널 영향 없음.
- 목록 컴포넌트 개편(선택 모드·그룹 탭)은 `LiveChatPage` 한정. 기존 단일 선택·딥링크(`?c=`) 동작 유지.
- 병합 피드 쿼리: `conversation_id IN (멤버 세션들의 대화)` + id 커서 — 멤버 수십 세션 규모에서 기존 인덱스(`idx_conv_session`, messages PK)로 충분.
- 세션 단위 그룹핑이라 멤버 세션에 새 대화가 생기면 그룹 뷰에 자동 유입 — 의도된 동작(REQ D1), TCR에 케이스 포함.
- 발신 대상 대화방이 `ended`인 경우: 현행 콘솔과 동일하게 발신 허용(별도 차단 없음 — 기존 동작 유지).

## 마이그레이션·검증 (MUST)

- `sql/migration_chat_groups.sql` + `migrations:manifest` + PR `## Migration`(스테이징 선적용, 롤백 `DROP TABLE chat_group_members; DROP TABLE chat_groups;`).
- 엔티티 추가 → 실부팅 확인. 신규 라우트 401/404 판별. 유닛: 그룹 CRUD·테넌시(교차 테넌트 세션 추가/조회/발신 전부 404)·최소멤버·수신자 검증·병합 커서 페이지네이션. **id 비교는 문자열 픽스처**(FIX-260824 교훈).

## 테스트 개요 (TCR에서 상세화)

유닛: 서비스 스펙 ~12케이스. 수동(스테이징): 위젯 세션 2개 생성→그룹핑→병합 뷰 확인→1:1 발신→각 위젯에 정확히 1건씩만 수신 확인→멤버 제거 가드→해제 후 원 대화 무손상.

## 범위 밖 (기록)

그룹 발신 첨부(D4), 그룹 단위 브리핑·코멘트, 자동 그룹핑 제안(동일 customer_id 감지), 그룹 읽음 처리, 다중 수신 발송, 고객사 엔티티.
