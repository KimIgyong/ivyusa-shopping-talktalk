# TCR-260824 라이브챗 콘솔 개선 5종 — 테스트 케이스 & 결과

- 근거: `docs/plan/PLN-260824-LiveChat-Console-Enhancements.md`
- 실행 환경: 로컬(dev, MySQL :3316) — 2026-08-24

## 1. 유닛 테스트 (자동, Jest)

전체 스위트: **133 suites / 1,462 tests 통과** (신규 21 케이스 포함, 회귀 0).

### S1 — `agent-alert.service.spec.ts` (신설, 5케이스)
| # | 케이스 | 결과 |
|---|---|---|
| U1 | list의 두 분기(브로드캐스트+지명) 모두 tenantId 술어 포함 | ✅ |
| U2 | tenant 없는 호출자는 조회 없이 빈 배열 | ✅ |
| U3 | 타 테넌트 알림 ack → 404 (row 부재와 동일 응답) + save 미호출 | ✅ |
| U4 | 자기 테넌트 ack 정상 (status/ackedBy 기록) | ✅ |
| U5 | 에스컬레이션 중복방지 조회에 tenantId 포함 | ✅ |

### S3 — `file-type.util.spec.ts` (1케이스 추가)
| # | 케이스 | 결과 |
|---|---|---|
| U6 | OLE2 매직의 `.doc`/`.xls` 수용, zip을 `.doc`로 개명한 파일은 거부 | ✅ |

### S4 — `chat-comment.service.spec.ts` (신설, 7케이스)
| # | 케이스 | 결과 |
|---|---|---|
| U7 | listFor가 [대화방 스코프 + 세션 스코프]를 tenant 술어와 함께 조회 | ✅ |
| U8 | 타 테넌트 대화방 → 404, 코멘트 조회 자체를 안 함 | ✅ |
| U9 | 세션 스코프 저장: sessionId 설정·conversationId NULL·trim | ✅ |
| U10 | 대화방 스코프 저장: conversationId 설정·sessionId NULL | ✅ |
| U11 | 타인 코멘트 수정 거부(E5054) | ✅ |
| U12 | 타인 코멘트 삭제: staff 거부·master 허용 | ✅ |
| U13 | 타 테넌트 코멘트 id → not found | ✅ |

### S5 — `briefing.service.spec.ts` (신설, 6케이스)
| # | 케이스 | 결과 |
|---|---|---|
| U14 | latest는 저장분 조회만, 모델 호출 0회, 대화방 소유 선검증 | ✅ |
| U15 | generate가 lastMessageId·requestedBy와 함께 저장 | ✅ |
| U16 | 모델 실패 시 빈 브리핑이 아니라 예외(E5055) 표면화 | ✅ |
| U17 | 저장된 번역 재사용 — 모델 호출 0회 | ✅ |
| U18 | 신규 번역이 소문자 lang 키로 저장(`KO`→`ko`) | ✅ |
| U19 | 시스템 언어 외(`fr`) 거부, 모델 호출 없음 | ✅ |

## 2. 빌드·부팅 검증 (자동)

| 항목 | 결과 |
|---|---|
| `npm run typecheck` (9 tasks) | ✅ 전체 통과 |
| `npm run build` (6 tasks: api/web/widget/types/common) | ✅ 전체 통과 |
| `npm run i18n:check` | ✅ es/ko/vi/ja/zh 모두 complete |
| 실부팅 (`node dist/main.js`, dev DB) | ✅ `Nest application successfully started` |
| 엔티티→테이블 자동 생성이 `sql/` 정의와 일치 (인덱스 포함) | ✅ chat_comments·conversation_briefings 확인 |
| 신규 라우트 무인증 응답 | ✅ comments/briefing/translate 3종 모두 401 (404 아님) |

## 3. 통합/수동 시나리오 — **스테이징 실행 완료 2026-08-24** (API 기반, 샌드박스 대화 #365)

| # | 시나리오 | 기대 결과 | 결과 |
|---|---|---|---|
| M1 | 테넌트 2 브로드캐스트 알림 행 삽입 후 테넌트 1 `GET /agent/alerts` | 타 테넌트 행 미노출 | ✅ 자기 테넌트 알림(368)만 반환 |
| M2 | 테넌트 1 토큰으로 테넌트 2 alert ack | 404 + 서버 warn, 행 불변 | ✅ 404, 행 status=new 유지 (자기 alert ack는 200) |
| M3 | 목록 행 2줄 렌더 | 1줄 이름 전폭, 2줄 세션+배지 | ✅* 배포 번들에 신규 마크업·문구 포함 확인 — 실화면 육안 확인 권장 |
| M4 | 상태 배지 색·라벨 | 색상 구분 + 콘솔 언어 라벨 | ✅* M3과 동일 방식 확인 |
| M5 | `.doc`/`.xls`(실 OLE2 바이트) 콘솔 전송 → 위젯 수신 | 업로드·전송·파일 카드 | ✅ kind=file·정확한 MIME 저장, 에이전트 발신 후 **위젯 대화 조회에 서명 URL 포함 수신** |
| M6 | zip을 `.doc`로 개명해 업로드 | E5036 거부 | ✅ E5036 |
| M7 | 코멘트 작성·목록·수정·삭제 (양 스코프) | 스코프별 저장·표시, 본인 수정 | ✅ **결함 1건 발견→수정**: JWT 문자열 userId로 본인 수정이 E5054 거부 (FIX-260824, PR #350 배포 후 재검증 통과) |
| M8 | 타인 코멘트 수정/삭제 권한 | 403 (staff), master 삭제 허용 | △ 유닛(U11·U12·신규 문자열 회귀)으로 대체 — E5054 경로는 실서버에서 관측됨 |
| M9 | 대화 열람만 반복 | LLM 호출 0 | ✅ `{briefing:null}` 반환, 생성 없음 |
| M10 | 브리핑 생성 → 재진입 | 저장·즉시 표시 | ✅ 생성 4.2s(실 LLM)·저장, 재조회 0.25s(모델 미호출), 생성자/시각 포함 |
| M11 | 동일 언어 번역 2회 | 1회만 모델 호출 | ✅ 1회 5.0s / 2회 0.23s 동일 본문, `fr`은 400 거부 |
| M12 | AI 엔진 다운 시 생성 | E5055 표면화 | △ 유닛 U16으로 대체 (스테이징 엔진 강제 다운 불가) |

> 실행 메모: dev@amoeba.group 비밀번호 드리프트로 일회성 재시드(SEED_DEMO_DATA=false) 후 비밀번호 변경(신규 값은 `secrets/staging-server.md`). 스모크 산출물(대화 365 종료, 테스트 알림/코멘트) 정리 완료. M3/M4의 실화면 육안 확인과 M8 staff 실계정 확인은 운영자 확인 권장 항목으로 남김.

## 4. 엣지 케이스 (설계로 처리)

- 알림 `tenantId NULL`(레거시 행): 어느 테넌트에도 미노출 — 의도(누출보다 소실이 안전).
- 코멘트 2,000자 초과: DTO MaxLength 400 + 서버 slice 이중 방어.
- 메시지 0건 대화의 브리핑 생성: 400 (모델 미호출).
- 번역 대상 언어 대문자 입력(`KO`): 소문자로 정규화 저장.
- 코멘트 빈 문자열/공백만: 400, 저장 안 됨.
