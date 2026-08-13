# TCR-260809-Issue-Workflow-P4

PLN-260809-Issue-Workflow-P4 — PR #205(백엔드+콘솔) 테스트 케이스·결과.

## 1. 단위/통합 (805/805 PASS — 기존 스위트 회귀 없음)
| # | 케이스 | 결과 |
|---|---|---|
| U1 | board: open 전체 + settled 최근 20, 담당자 이름 일괄 해석 | ✅(로직) |
| U2 | slaState 계산: urgent 4h/normal 24h, 70% 경과 warning, 초과 overdue, 종결 상태 null | ✅(로직) |
| U3 | stats: 상태별 counts·미배정·라벨 분포·30일 평균해결·재오픈율·workflowMode | ✅(로직) |
| U4 | priority: 담당자/manager 허용·그 외 403·감사 기록 | ✅(로직) |
| I1 | typecheck·build 그린, 라우트 board/stats가 :id 라우트보다 선순위 매핑 | ✅ |

## 2. 스테이징 (2026-08-09 배포, SQL 없음)
| # | 케이스 | 결과 |
|---|---|---|
| S1 | 부트 정상, `GET /agent/issues/board`·`/stats` → 401(배포·인증 요구) | ✅ |

## 3. 수동 E2E (사용자 스모크 — 잔여)
| # | 시나리오 | 기대 |
|---|---|---|
| E1 | 콘솔 사이드바 "이슈 보드" → /issues (amoebaorder) | KPI 바 + 5컬럼 보드, 기존 이슈 카드 표시 |
| E2 | 카드를 진행→해결 드래그 | 전이 + 고객 알림(P3) + 보드 갱신 |
| E3 | 반려 컬럼 드롭 | 사유 모달 → 확정 시 반려(사유별 고객 알림) |
| E4 | staff 계정으로 남의 카드 드래그 | 403 토스트 + 원위치 |
| E5 | 카드 우선순위 토글 → urgent | 카드 뱃지 변경, 4h 기준 SLA ⚠/🔥 |
| E6 | 카드 클릭 | /live-chat?conversation= 딥링크로 해당 스레드 열림 |
| E7 | ivyusa(base) 콘솔에서 /issues | 애드온 미사용 안내 문구 |

## 4. 메모
- SLA는 계산형(스키마 무변경) — 목표시간 조정은 코드 상수(urgent 4h/normal 24h), 콘솔 설정화는 후속.
- 드래그는 HTML5 네이티브 — 모바일 터치 드래그는 미지원(카드 클릭→라이브챗 IssuePanel 버튼으로 대체 가능).

---

## 실행 기록 (2026-08-13, 스테이징 API)

tenant 3(amoebaorder) `gray.kim@amoeba.group`(master). ⚠️ 로그인은 **`tenant_slug`** 로 해야 한다 —
`shop_domain`으로는 테넌트가 안 잡히고, 같은 이메일이 tenant 2에도 있어 E1002가 난다.

| # | 항목 | 결과 | 관측 |
|---|---|---|---|
| E1 | KPI + 5컬럼 보드 | ✅ | `workflowMode=native`, 접수 49·진행 3·종료 3, 평균해결 0.4h·재오픈율 0, SLA(normal 2h·urgent 1h) |
| E2 | 진행→해결 전이 | ✅ | 접수→진행→해결→종료 전부 201, 타임라인에 `status_changed` 누적 |
| E3 | 반려(사유) | ✅ | **사유 없이 400**, `misrouted` 지정 시 201 + `rejectReason` 기록 |
| E5 | 우선순위 토글 | ✅ | normal→urgent 반영, 타임라인에 `memo: priority → urgent` |
| E4·E6·E7 | staff 드래그 403 · 딥링크 · base 안내 | ⬜/✅ | E7은 tenant 1에서 `workflowMode=base` 확인(프론트가 `!== 'native'`일 때 안내). E4·E6은 화면 조작 필요 |

**P1 겸용 확인**: E2(수락·타임라인)·E3(해결→종료 전이)·E6(base 테넌트 미노출)이 위와 같이 통과.

### 타임라인이 비어 보였던 것은 오독이었다

`GET /agent/issues/:id/events`가 빈 배열로 보여 결함을 의심했으나, 응답이 `data.events`인데
`data.items`를 읽은 **내 파싱 오류**였다. DB·API 모두 4건(생성·우선순위 메모·전이 2건)을 정상 반환한다.

### 허용 값 메모 (문서에 없어 헤맨 것)

- 전이 필드는 `status`가 아니라 **`to`**
- 반려 사유는 **`policy_impossible` / `misrouted` / `spam`** 세 가지뿐

### 남긴 상태

검증으로 이슈 #55는 `closed`, #54는 `rejected(misrouted)`가 됐다. **원복하지 않았다** — 이슈 상태는
설정이 아니라 업무 기록이고, 되돌리면 타임라인에 허위 전이가 하나 더 쌓인다. 파일럿 테넌트의
테스트 이슈이므로 그대로 두는 편이 이력상 정직하다.
