# TCR — /live-chat 목록 개선 (2026-08-07)

> 근거: `docs/plan/PLN-260807-LiveChat-List-Active-Customer-Time.md` (승인 2026-08-07)

## 1. 단위 테스트 (apps/api)

| ID | 케이스 | 결과 |
|---|---|---|
| U1 | `scope='all'` → `ai_active + waiting + agent` 조회 | PASS |
| U2 | `scope='queue'` → `waiting + agent` | PASS |
| U3 | `scope='ended'` → `ended` | PASS |
| U4 | q 없음 → 세션 필터 미적용 | PASS |
| U5 | q 매칭 → `session_id IN (...)` 조건 추가 | PASS |
| U6 | q 무매칭 → 대화 조회 자체를 생략하고 빈 페이지 | PASS |
| U7 | `toSessionResponse`가 이름/이메일 연락처를 전달 | PASS |

전체 **53 suites / 553 tests PASS**, typecheck·build 통과, API 실부팅 확인.

## 2. 통합 시나리오 (스테이징)

| ID | 시나리오 | 기대 |
|---|---|---|
| S1 | `/live-chat` 진입(기본 필터=전체) | **진행중(ai_active) 대화 포함**, 최신 활동 순으로 정렬 |
| S2 | 최근 대화(예: 94번) | **목록 최상단**에 노출 |
| S3 | 이름이 매핑된 고객 행 | 고객명 + 하단에 `Session xxxxxx` 병기 |
| S4 | 이름 없이 이메일만 있는 고객(93번) | **이메일 표기** + 세션 라벨 병기 |
| S5 | 고객 정보가 전혀 없는 대화 | 종전대로 `Session xxxxxx`만 |
| S6 | 필터 `상담 필요` | waiting/agent만, `종료`는 ended만 |
| S7 | 대화창 열기 | 메시지별 **HH:mm** 표시, 날짜가 바뀌는 지점에 날짜 구분선 |
| S8 | 검색 + 필터 동시 사용 | 두 조건이 함께 적용 |
| S9 | 5초 폴링 | 필터별 캐시 키 분리로 필터 전환 즉시 반영 |

## 3. 엣지 케이스

| ID | 케이스 | 처리 |
|---|---|---|
| E1 | 메시지가 하나도 없는 대화 | 마지막 활동 정렬에서 개설 순(id) 보조 정렬로 밀림, 시간 칸은 "답변 없음" |
| E2 | 대화 건수 증가(진행중 포함) | 기본 페이지 크기 50 |
| E3 | 이메일 노출 | 이름이 없을 때만. 콘솔 고객 패널과 동일 수준(PLN D3 승인) |
| E4 | 정렬 비용 | 상관 서브쿼리 `MAX(m.id)` + `idx_msg_conv` — 배포 후 응답시간 확인 |

## 4. 실행 기록

- 2026-08-07: U1~U7 PASS. S1~S9은 스테이징 배포 후 실측 — 결과는 RPT.
