# RPT-260809-Issue-Workflow-P5

이슈 워크플로우 **P5 — 지식 순환 폐루프** 구현 결과. **이로써 로드맵 P1~P5 전체 완결.**

- 근거: PLN-260809-Issue-Workflow-P5 (2026-08-09 승인, 결정 9 준수) · 테스트: TCR-260809-Issue-Workflow-P5
- PR #207(PLN) #208(구현) — CI pass·squash-merge, staging 2026-08-09 배포·검증(SQL 선적용)

## 1. 무엇이 생겼나
- **지식갭 제안 인박스**(`knowledge_gap_tasks`): 세 소스가 제안을 쌓고, 사람이 승인/기각 —
  자동 반영 경로 없음(결정 9). 멱등(테넌트+소스+참조키 unique), 기각·승인된 항목 재제안 없음.
  1. **일배치**(env `KNOWLEDGE_GAP_INTERVAL_HOURS`, 0=off): 최근 7일 question_stat_daily에서
     이관율 50%↑ 클러스터·no-source 3건↑ 인텐트를 지표와 함께 제안.
  2. **상담원 해결답변**: 이슈가 3차에서 해결되면 신규 `ISSUE_RESOLVED` 버스 이벤트로
     질문(PII 스크럽 제목)+답변 후보 제안 — Knowledge→Chat→Issue 모듈 그래프 무순환 유지.
- **승인 = 기존 파이프라인**: 콘솔에서 제목/본문 인라인 편집 후 승인하면 기존
  `createDocument`+임베딩·Qdrant 인덱싱이 그대로 실행(category faq, source knowledge_gap), 감사 기록.
- **콘솔**: /knowledge 상단 "지식 갭 제안" 카드(비었으면 미표시) — 소스 뱃지·지표·답변 미리보기·
  편집 후 승인·기각. en/es/ko.

## 2. 폐루프 연결도 (기배포 자산과의 결합)
```
질문 통계(question_stats) ─┐
상담원 해결(이슈 P1~P4)  ─┼→ 지식갭 제안 → [사람 승인] → KB 문서+임베딩
                           │                      ↓
      2차 AI 해소율↑ ←── RAG 인용 ←──────────────┘
      (에스컬레이션↓)     +답변재사용(동일질문 즉답)
```

## 3. 배포 상태
staging 2026-08-09 19:52 — 부트 정상·스키마 에러 0·gap-tasks 401 확인. 수동 스모크 E1~E5 잔여(TCR §3).

## 4. 로드맵 P1~P5 완결 요약
| Phase | 내용 | PR | 배포 |
|---|---|---|---|
| P1 | 티켓 코어(issues·상태머신·3-모드 엔타이틀먼트·콘솔 IssuePanel) | #192/#193 | 8/8 |
| P2 | deny-list·라벨 자동배정·maxConcurrent·이관·Gorgias L1 | #197/#198 | 8/9 |
| P3 | 고객 상태회신·위젯 문의 피드·Gorgias L2 웹훅 | #201/#202 | 8/9 |
| P4 | 칸반 보드·워크플로우 대시보드(계산형 SLA) | #205 | 8/9 |
| P5 | 지식 폐루프(제안→사람 승인→KB) | #208 | 8/9 |
- 파일럿: amoebaorder=native. IVY USA는 Gorgias 실 계정 검증 후 bridge 전환(사용자 확인 대기).
- 후속 백로그: L3(상담원 답변 위젯 릴레이), SLA 목표 콘솔 설정화, 보드 터치 드래그, 자동해소 tier 스탬프.
