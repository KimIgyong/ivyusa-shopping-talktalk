# TCR-260828 노션 동기화 실패 사유 표시(B1) + 대상 인지 연결 테스트(B2) — 테스트 케이스

- 근거: `docs/analysis/REQ-260828-Go2Joy-Notion-KB-Analysis.md` §8 (B2=안① 채택 — 서버 무수정)

## 1. 유닛 (자동)

| # | 파일 | 케이스 | 기대 |
|---|---|---|---|
| U1 | `knowledge.service.syncerror.spec.ts` (신규) | sync throw 시 | `recordSyncState('failed', {…, error})` — 200자 클램프, 원 예외는 호출자로 전파 |
| U2 | 〃 | Notion 404 메시지 | error에 원문("Could not find page …") 보존 |
| U3 | `source-sync.service.spec.ts` (확장) | 빈 목록 가드 발동 | `guardedEmpty=true` + **error에 사유 문자열** 동반 |
| — | 회귀 | 전체 스위트 | **165 suites / 1,700 tests 통과**, typecheck·build·i18n:check(6언어)·실부팅 ✅ |

## 2. 스테이징 스모크 (배포 후)

| # | 시나리오 | 기대 |
|---|---|---|
| S1 | go2joy 소스 7 재동기화(아직 미공유 상태) | 실패하되 `last_sync_result.error`에 Notion 원문 저장 — **실제 결함 상황이 그대로 테스트 케이스** |
| S2 | 콘솔 소스 행 | 실패 시각 아래 error 문구 + "Connections에 통합 추가" 안내(notionShareHint) 표시 |
| S3 | 카드 [연결 테스트] (notion 소스 존재) | target_id 동봉 → `ok:false` + 공유 안내 메시지 (토큰만 200이던 오판 해소) |
| S4 | 카드 [연결 테스트] (notion 소스 없는 테넌트) | 현행 토큰 전용 동작 유지 |
| S5 | 정상 동기화(공유 완료 후) | error 미저장, 기존 카운트 표시 무회귀 |

결과는 RPT-260828에 기록.
