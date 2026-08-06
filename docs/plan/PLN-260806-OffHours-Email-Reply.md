# PLN — 오프아워 이메일 회신 + 상담 운영시간 설정화 (2026-08-06)

> 근거: `docs/analysis/REQ-260806-OffHours-Email-Reply.md`
> 스키마 변경: **1건** — `conversations.reply_channel varchar(16) NULL`
> (`sql/migration_conv_reply_channel.sql`, 배포 전 선적용)
> ⚠️ 구현은 본 PLN 승인 후 시작.

## 결정 제안 (D1~D5)

| # | 결정 | 제안 | 이유 |
|---|---|---|---|
| D1 | 설정 화면 위치 | **`/settings`(테넌트 설정)로 이동**, `/ai-setting`에는 안내 링크만 | 요구사항 명시("테넌트 설정 메뉴"). 화면을 둘로 복제하면 값이 어긋남 |
| D2 | 휴게시간 표현 | `businessHours.breaks: [{start,end}]` **배열** | 점심 외 구간(교육·마감)이 생겨도 스키마 변경 불필요. UI는 우선 1행 |
| D3 | 회신 발송 시점 | **상담사 답변 시 발송**(접수 즉시 확인메일 없음) | 요구의 "회신"에 해당. 접수 확인은 위젯 안내로 충족, 메일 물량·스팸 위험 최소화 |
| D4 | 이메일 수집 UI | 채팅 **인라인 카드**(AuthGate 패턴 재사용) | 모달은 sandbox iframe에서 이미 문제였음. 대화 흐름 유지 |
| D5 | 개인정보 처리 | 동의(GRANTED) 이후에만 수집, 카드에 용도 1줄 고지, 저장은 기존 암호화 경로 | 현행 채팅 게이트·PRV-M6와 동일 원칙 |

## Stage 1 — 운영시간 설정 (테넌트 설정 화면 + 휴게시간)

대상: `apps/api/src/domain/ai-engine/{entity/tenant-ai-config.entity.ts, handoff-router.service.ts}`,
`apps/web/src/domain/{settings/SettingsPage.tsx, ai-settings/HandoffSection.tsx}`, i18n(en/es/ko)

1. `HandoffConfig.businessHours`에 `breaks?: Array<{start:string; end:string}>` 추가(JSON 컬럼, 마이그레이션 불필요).
2. `withinBusinessHours()`: 근무 구간 안이어도 **breaks 구간에 걸리면 오프아워로 판정**.
   잘못된 값(형식 오류)은 현행처럼 무시(라우팅을 막지 않음).
3. 콘솔: Handoff 설정 UI를 `/settings`의 **"상담 연결" 카드**로 이동(기존 `/ai-setting` 섹션은 링크로 대체),
   휴게시간 입력 1행 추가.

```
┌ 상담 연결 (Live support routing) ─────────────────────┐
│ [✓] 업무시간 사용                                      │
│  타임존 [America/New_York ▾]                           │
│  근무   [09:00] ~ [18:00]   요일 [월][화][수][목][금]  │
│  휴게   [12:00] ~ [13:00]   (+ 구간 추가)              │
│                                                        │
│  오프아워 접수 메일함 [help@ivyusa.com            ]    │
│  오프아워 안내 문구(선택) EN/ES/KO ……                  │
│                                    [ 저장 ]            │
└────────────────────────────────────────────────────────┘
```

## Stage 2 — 위젯: 이메일 안내·수집

대상: `apps/widget/src/components/chat/{ChatTab.tsx, ContactEmailCard.tsx(신규)}`,
`apps/api/src/domain/{session,customer}`, i18n(en/es/ko)

1. 오프아워 안내 문구를 **회신 주소 포함**으로 변경:
   - 이메일 보유: `지금은 상담 시간이 아니에요. {email} 로 회신드릴게요.`
   - 미보유: `지금은 상담 시간이 아니에요. 회신받으실 이메일을 남겨주시면 업무 시간에 답변드릴게요.`
     (문구는 테넌트 오프아워 안내 override가 있으면 그것을 우선)
2. `POST /session/contact-email` (`@Public`, 세션 토큰 기준, 동의 GRANTED 필수):
   `CustomerService.createFromLead` 경로 재사용 → 삭제요청 억제 검사·암호화 저장·세션 바인딩.
   실패 코드: 동의 없음/형식 오류/삭제요청 이메일(E-코드 신규 1건).
3. 위젯 인라인 카드(요구 시에만 노출):

```
│ 🕘 지금은 상담 시간이 아니에요.                    │
│    회신받으실 이메일을 남겨주시면 업무 시간에     │
│    답변드릴게요.                                   │
│  ┌──────────────────────────────┐                 │
│  │ you@example.com              │   [ 저장 ]      │
│  └──────────────────────────────┘                 │
│  입력하신 주소는 이 문의 회신에만 사용됩니다.      │
```

## Stage 3 — 상담사 답변의 이메일 회신

대상: `apps/api/src/domain/{chat/entity/conversation.entity.ts, agent/agent.service.ts, agent/agent-alert.service.ts}`,
`sql/migration_conv_reply_channel.sql`

1. `conversations.reply_channel`(`null`|`email`): 오프아워 핸드오프 시 `email`로 표시.
2. 상담사 답변 저장 시 `reply_channel='email'`이고 고객 이메일이 있으면 **답변 본문을 고객에게 발송**
   (제목: `[IVY USA] 문의하신 내용에 대한 답변`, 본문: 답변 + 위젯 재방문 안내).
   - **모더레이션 통과 후** 발송(FR-069), 발송 실패는 경고 로그만(상담 흐름을 막지 않음).
   - 발송 사실을 시스템 메시지로 대화에 남겨 상담사가 중복 발송을 피하게 함.
3. 고객이 위젯으로 돌아와 대화를 이어가면 `reply_channel`을 `null`로 되돌림(실시간 응대로 복귀).

## 사이드 임팩트

| 영역 | 검토 | 판단 |
|---|---|---|
| 기존 `/ai-setting` Handoff 섹션 | 이동으로 링크만 남김 — 저장 API는 동일(`ai-config`) | 값 유실 없음 |
| 콘솔 저장 시 미지원 필드 | 현행 UI는 config를 통째로 덮어씀 → **breaks를 UI에 넣지 않으면 저장 시 소실** | Stage 1에서 UI 동시 반영 필수 |
| 개인정보 | 이메일 수집·발송 → 처리방침/DPA 대장 반영 필요 | Ops 항목으로 등록 |
| 이메일 발송량 | 상담사 답변 시 1건 — Gmail 한도 내 | 운영 전환 시 전용 발신 검토 |
| 모더레이션 | 아웃바운드 이메일도 예외 없음 | Stage 3에 포함 |

## 검증 계획 (TCR)

- 단위: breaks 판정(구간 내/외/오버나이트/형식오류), contact-email 저장(동의 없음·형식 오류·삭제요청 이메일),
  상담사 답변 이메일 발송 조건(reply_channel/이메일 유무/모더레이션 차단 시 미발송).
- 통합(스테이징): 오프아워 문의 → 안내·이메일 수집 → 콘솔 답변 → **실제 수신 확인**,
  업무시간 중 문의는 종전대로 상담사 라우팅, 점심시간(12–13 NY) 문의는 오프아워 처리.

## 승인 요청

1. D1~D5 제안대로 진행할지 (특히 **D1 설정 이동**, **D3 상담사 답변 시 발송**)
2. `conversations.reply_channel` 컬럼 추가(마이그레이션 1건) 승인
3. **테스트 메일 실제 발송 허용 여부** — 검증 시 `help@ivyusa.com`(접수 요약)과 지정 테스트 주소로
   실제 메일이 발송됩니다. 수신 확인용 주소를 지정해 주시면 그 주소로만 보내겠습니다.
