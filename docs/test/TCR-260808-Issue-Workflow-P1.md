# TCR-260808-Issue-Workflow-P1

PLN-260808-Issue-Workflow-P1 — PR #192(백엔드+SQL)/#193(콘솔 UI) 테스트 케이스·결과.

## 1. 단위 (jest — 790/790 PASS, 이슈 스위트 9케이스 신규)
| # | 케이스 | 결과 |
|---|---|---|
| U1 | 에스컬레이션 승격: received 생성, issue_no=max+1, intent→type 매핑 | ✅ |
| U2 | 엔타이틀먼트: non-native(bridge/base) 테넌트는 no-op (서버 판정, §11.1) | ✅ |
| U3 | 1:1 유지: open 이슈 존재 시 재사용(신규 생성·전이 없음) | ✅ |
| U4 | 재-에스컬레이션: settled 이슈 reopen(in_progress, reopen_count++) | ✅ |
| U5 | 담당자(staff) 본인 이슈 해결 가능, resolvedTier=agent 스탬프 | ✅ |
| U6 | 비담당 staff 금지 / manager 허용 (결정 10) | ✅ |
| U7 | 반려: manager 전용 + 사유 코드 필수 (결정 3) | ✅ |
| U8 | 상태머신 밖 전이 차단 (closed→resolved 등) | ✅ |
| U9 | 대화 종료 훅: resolved→closed, open 이슈는 유지 | ✅ |

## 2. 로컬 통합
| # | 케이스 | 결과 |
|---|---|---|
| I1 | `sql/260808-issues-p1.sql` dev 적용(issues/issue_events/workflow_mode) | ✅ |
| I2 | 신규 엔티티 실부트 successfully started + IssueController 라우트 매핑 | ✅ |

## 3. 스테이징 (2026-08-08 18:36 배포)
| # | 케이스 | 결과 |
|---|---|---|
| S1 | SQL 선적용 → 배포 (마이그레이션 순서 준수) | ✅ |
| S2 | 부트 정상·스키마 에러 0 / `/agent/issues/*` 401(배포 확인) | ✅ |
| S3 | 파일럿 지정: tenant 3(amoebaorder) `workflow_mode='native'`, 1·2번 base 유지 | ✅ |

## 4. 수동 E2E (사용자 스모크 — 잔여)
| # | 시나리오 | 기대 |
|---|---|---|
| E1 | amoebaorder 몰 위젯에서 "상담원 연결"(또는 저신뢰 질문) | 콘솔 라이브챗 스레드 헤더에 `#1 접수` 뱃지 생성 |
| E2 | 상담원 수락 | `진행중` + 타임라인에 배정·이관 이벤트 |
| E3 | 해결 버튼 → 대화 종료 | `해결`→`종료` 자동 전이 |
| E4 | 반려(사유 선택) — staff 계정으로 시도 | staff 거부(403), manager 이상만 가능 |
| E5 | 같은 세션에서 재에스컬레이션 | 동일 이슈 재오픈(reopen ×1) |
| E6 | ivyusa(base) 테넌트 콘솔 | 이슈 UI 완전 미노출(기존 화면 불변) |

## 5. 메모
- 시나리오/AI 자동해소 tier 스탬프·deny-list 강제 티켓·SLA는 P2 이후.
- 위젯(고객) 상태회신은 P3 — 현재 고객 화면 변화 없음.
