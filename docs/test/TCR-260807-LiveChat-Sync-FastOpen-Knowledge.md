# TCR — /live-chat 싱크 · 빠른 로딩 · 모범답안 지식화 (2026-08-07)

> 근거: `docs/plan/PLN-260807-LiveChat-Sync-FastOpen-Knowledge.md` (승인 2026-08-07, 권장안)

## 1. 단위 테스트 (apps/api)

| ID | 케이스 | 결과 |
|---|---|---|
| U1 | `listMessages` 최신 페이지를 **오름차순**으로 반환(저장소는 DESC 조회) | PASS |
| U2 | limit+1 프로브로 `hasMore` 판정 | PASS |
| U3 | `beforeId` 지정 시 그보다 오래된 블록 조회 | PASS |
| U4 | 비정상적으로 큰 limit은 200으로 캡 | PASS |

전체 **56 suites / 573 tests PASS**, typecheck·build 통과, API 실부팅 확인.

## 2. 통합 시나리오 (스테이징)

| ID | 시나리오 | 기대 |
|---|---|---|
| S1 | 대화 최초 오픈 | **1초 미만**(종전 5~8초). 브리핑은 "요약 생성 중…" 후 도착 |
| S2 | `GET /agent/conversations/:id` 응답 | `briefing` 없음, `hasMore` 포함 |
| S3 | `GET /agent/conversations/:id/briefing` | 요약 반환(2회차부터 캐시로 즉답) |
| S4 | 싱크 버튼 | 즉시 최신 대화 반영, 진행 중 아이콘 회전 |
| S5 | 30건 초과 대화 | 상단 [이전 대화 더보기] 노출 → 클릭 시 이전 블록 prepend |
| S6 | AI 답변 말풍선 | 지식 권한자에게만 [지식으로 저장] 노출 |
| S7 | 세션 105 제휴문의로 모범답안 저장 | KB 문서 생성 + 임베딩(status embedded), `source_url`에 대화 링크 |
| S8 | 저장 후 위젯에서 유사 질문 | 새 지식이 인용되어 답변(에스컬레이션 아님) |
| S9 | 권한 없는 상담사(MANAGER/STAFF) | 버튼 미노출(서버도 403) |

## 3. 엣지 케이스

| ID | 케이스 | 처리 |
|---|---|---|
| E1 | 5초 폴링과 더보기 충돌 | 이전 블록은 React Query 캐시 밖 상태로 보관 — 폴링이 덮어쓰지 않음 |
| E2 | 대화 전환 | 더보기로 불러온 이력 초기화 |
| E3 | 브리핑 실패/지연 | 대화 표시에 영향 없음(별도 쿼리), 실패 시 "요약 없음" |
| E4 | 잘못된 `doc_group` 값 | `@IsIn(counsel|product)`로 400 |
| E5 | 임베딩 실패 | 문서는 pending 저장 + 백오프 재시도(현행 파이프라인) |

## 4. 실행 기록

- 2026-08-07: U1~U4 PASS. S1~S9는 스테이징 배포 후 실측 — 결과는 RPT.
- **2026-08-13: S1~S9 실측 완료 — 7건 실측 통과, 2건(S4·S9) 코드 확인.**
  결과는 `docs/implementation/RPT-260813-LiveChat-Sync-FastOpen-Knowledge.md`.
  핵심: 대화 열기 **0.37초**(종전 5~8초), 브리핑은 분리되어 1회차 7.35초 → 이후 0.3초 캐시.
  ⚠️ 이 기록이 6일 늦은 이유와 재발 방지는 그 RPT §4 참조.
