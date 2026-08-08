# TCR-260808-Widget-Greetings-EndChat-AnswerReuse

PLN-260808-Widget-Greetings-EndChat-AnswerReuse (PR #174 A, #175 B, #176 C1, #177 C2) 테스트 케이스·결과.

## 1. 단위 테스트 (jest — 73 suites / 763 tests PASS)

### Track A (문구 설정화)
| # | 케이스 | 위치 | 결과 |
|---|---|---|---|
| A1 | widget_copy 병합: 언어별 필드 폴딩·trim·빈값 드롭 | tenant.service.spec | ✅ |
| A2 | PATCH 시맨틱: undefined 유지·''/null 클리어·전부 비면 null | 〃 | ✅ |
| A3 | privacyNotice displayName 해석: 설정값 우선, 없으면 tenant.name | session.service.spec | ✅ |
| A4 | SessionResponse 계약에 widgetCopy 포함 | session.mapper.spec | ✅ |

### Track B (상담종료)
| # | 케이스 | 위치 | 결과 |
|---|---|---|---|
| B1 | endBySession: ENDED+endedAt + active 배정 release | chat.service.end.spec | ✅ |
| B2 | open 대화 없음 → no-op 200 (이중 클릭 안전) | 〃 | ✅ |

### Track C (답변 재사용)
| # | 케이스 | 위치 | 결과 |
|---|---|---|---|
| C1 | 임계값(0.92) 이상 히트 시 재생, 미만 miss | answer-reuse.service.spec | ✅ |
| C2 | stub 임베딩이면 조회·적재 모두 거부(의사벡터 노이즈) | 〃 | ✅ |
| C3 | TTL(30d) 초과 항목 read-time 비활성+miss | 〃 | ✅ |
| C4 | fail-open: embed/Qdrant 오류 → null(LLM 경로), 예외 없음 | 〃 | ✅ |
| C5 | 적재 필터: 주문맥락/무인용/저신뢰 거부, 중복(≥0.95) 스킵, 테넌트 캡 | 〃 | ✅ |
| C6 | DSAR: source_message 기준 행+벡터 포인트 삭제 | 〃 | ✅ |
| C7 | 기존 채팅 스펙 회귀 없음(생성자 말미 추가+옵셔널 가드 방식) | chat.service.*.spec | ✅ |

## 2. 로컬 통합
| # | 케이스 | 결과 |
|---|---|---|
| I1 | SQL 2건 dev MySQL 적용(테이블/컬럼 생성) | ✅ |
| I2 | 신규 엔티티(widget_copy JSON·answer_reuse) 실부트 successfully started | ✅ |
| I3 | typecheck/build 전체 그린, CI 4개 PR pass | ✅ |

## 3. 스테이징 검증 (2026-08-08 15:24 배포 직후)
| # | 케이스 | 결과 |
|---|---|---|
| S1 | SQL 2건 선적용(widget_copy 컬럼·answer_reuse 테이블 확인) → 코드 배포 | ✅ |
| S2 | 부트 successfully started, 스키마 에러 0, **ReuseQdrantService가 reuse_questions 컬렉션 생성** | ✅ |
| S3 | `/session/ensure`(amoebaorder) 응답에 `widgetCopy{displayName:"amoebaorder"}` — IVY USA 하드코딩 누출 해소 확인 | ✅ |
| S4 | `POST /chat/end` 라우트 live(가짜 토큰 → E3001) / `GET /admin/answer-reuse` → 401(배포·인증 요구) | ✅ |

## 4. 수동 E2E (사용자 스모크 — 잔여)
| # | 시나리오 | 기대 |
|---|---|---|
| E1 | /settings 위젯 카드에서 표시이름·첫방문·로그인 인사(KO) 저장 → 몰에서 위젯 오픈 | 헤더=표시이름, 설정 문구 표시(치환 {shop}/{name}) |
| E2 | 로그인(Cafe24) 후 채팅 오픈 | "{이름}님 반갑습니다…" 인사(대화 중 로그인 시 1회 버블) |
| E3 | "상담 종료" 클릭→확인 | 종료 안내 표시, 새 메시지 → 새 상담; 콘솔 라이브챗 목록 ended 반영 |
| E4 | 콘솔에서 상담원이 종료 | 위젯에도 종료 안내(폴링 ≤5s) |
| E5 | 동일 질문 2회(스테이징 실 LLM) | 2회째 응답 즉시(수백 ms), 콘솔 /ai-setting 답변 재사용 목록에 항목+히트 1 |
| E6 | 재사용 항목 답변 편집→저장→동일 질문 | 편집된 답변으로 재생 |
| E7 | 전체 비활성화 → 동일 질문 | LLM 경로 복귀 |

## 5. 엣지 케이스 메모
- 문구 미설정 테넌트: 기본문 {shop}=tenant.name 폴백(1테넌트 name 미설정 시 위젯 appName 최종 폴백).
- 재사용은 세션 언어 일치만 매칭 — KO 질문이 EN 항목에 안 붙음.
- 재사용 답변도 모더레이션 통과(BLOCKED 시 해당 항목 자동 비활성) — FR-069 비우회 유지.
- 주문 관련 질문(needsOrderData)은 조회·적재 모두 제외(개인 맥락).
