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

## 3. 통합/수동 시나리오 (스테이징 배포 후 실행)

| # | 시나리오 | 기대 결과 | 결과 |
|---|---|---|---|
| M1 | 테넌트 A 위젯에서 상담원 호출 → 테넌트 B 콘솔 60초 관찰 | B에는 모달 미노출, A에만 노출 | ⬜ |
| M2 | B 콘솔에서 A의 alert id로 `POST /agent/alerts/{id}/ack` 직접 호출 | 404 + 서버 warn 로그 | ⬜ |
| M3 | 목록 행 렌더: 별칭 긴 세션·채널 배지 2종 이상 | 1줄 이름 전폭, 2줄 세션+배지, 잘림 없음 | ⬜ |
| M4 | 상태 배지: ai_active/waiting/agent/ended 각 1건 | 색상 구분 + 콘솔 언어 라벨 | ⬜ |
| M5 | `.doc`/`.xls` 실파일 콘솔 전송 → 위젯 수신 | 업로드 성공, 위젯에 파일 카드 | ⬜ |
| M6 | zip을 `.doc`로 개명해 업로드 | E5036 거부 | ⬜ |
| M7 | 대화방 코멘트 작성 → 같은 세션의 다른 대화방 확인 | 대화방 탭엔 없음(그 방 한정), 세션 탭 코멘트는 보임 | ⬜ |
| M8 | staff 계정으로 타인 코멘트 수정/삭제 시도 | 수정·삭제 버튼 미노출(+API 403) | ⬜ |
| M9 | 대화 열람만 반복 (브리핑 미생성) | LLM 호출 0 (자동 생성 없음) | ⬜ |
| M10 | [브리핑 생성] → 재진입 | 저장분 즉시 표시(모델 재호출 없음), 생성자·시각 표기 | ⬜ |
| M11 | 번역: ko 선택 → [번역] → 재차 ko 요청 | 1회만 모델 호출, 이후 저장분 | ⬜ |
| M12 | AI 엔진 다운 상태에서 [브리핑 생성] | 502/E5055 + 에러 토스트(수동 닫기), "브리핑 없음"으로 위장하지 않음 | ⬜ |

## 4. 엣지 케이스 (설계로 처리)

- 알림 `tenantId NULL`(레거시 행): 어느 테넌트에도 미노출 — 의도(누출보다 소실이 안전).
- 코멘트 2,000자 초과: DTO MaxLength 400 + 서버 slice 이중 방어.
- 메시지 0건 대화의 브리핑 생성: 400 (모델 미호출).
- 번역 대상 언어 대문자 입력(`KO`): 소문자로 정규화 저장.
- 코멘트 빈 문자열/공백만: 400, 저장 안 됨.
