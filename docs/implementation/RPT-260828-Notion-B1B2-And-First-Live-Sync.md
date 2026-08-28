# RPT-260828 노션 B1/B2 구현 + 폴백 결함 수정 + 첫 실 워크스페이스 동기화 성공 보고

- REQ: `docs/analysis/REQ-260828-Go2Joy-Notion-KB-Analysis.md` §8 (승인: "B1+B2를 지금 구현", B2=안①)
- TCR: `docs/test/TCR-260828-Notion-Sync-Error-Surfacing.md`
- FIX: `docs/bug-fix/FIX-260828-Notion-Page-Probe-Fallback.md`
- GUIDE: `docs/guide/GUIDE-260828-Go2Joy-Notion-Connection.md` (go2joy 안내 — 메일 발송 8/28)

## 배포 상태

| PR | 내용 | main | 스테이징 |
|---|---|---|---|
| **#423** | B1 실패 사유 저장·표시 + B2 대상 인지 테스트 | `7dd833f` | 8/28 배포 ✅ |
| **#424** | FIX 공유 페이지 폴백 미작동 | `4003292` | 8/28 배포 ✅ |

스키마 무변경(2건 모두), 부팅 `successfully started`·`/health` ok. 프로덕션 미배포.

## 타임라인 — 하루 안의 인과 사슬

1. **오전**: go2joy 동기화 404 — 페이지가 통합에 미공유(REQ-260828 분석·GUIDE 메일 발송).
2. **B1/B2 구현·배포**(#423): 실패 사유가 소스 행에 저장·표시되기 시작.
3. **스모크 S1에서 에러가 달라져 있음을 즉시 발견**: `is a page, not a database` — **go2joy가 그 사이 페이지를 공유 완료**했고, 새 에러는 **공유된 페이지의 실제 응답(400 validation_error)**. 404 전용 폴백은 공유된 페이지에서 도달 불가 코드였음 — mock이 못 잡던 결함을 실 워크스페이스가 즉시 검출, **B1의 사유 가시화가 진단 결정타**.
4. **FIX 배포**(#424) → 재동기화 → **첫 실 워크스페이스 동기화 성공**.

## 구현 내용

- **B1**: `SyncResult.error`(200자 클램프) — 예외 경로+빈 목록 가드 경로 모두 사유 저장, 콘솔 소스 행 표시, Notion 미공유 404는 Connections 안내 문구(6언어) 병기.
- **B2(안①)**: 노션 카드 [연결 테스트]가 활성 노션 소스 targetId 동봉 — "토큰 200+동기화 404" 오판 해소. 서버 무수정.
- **FIX**: `retrieveTarget` 폴백 조건에 `400 && "is a page, not a database"` 추가, 기타 400은 전파(회귀 테스트).

## 테스트 결과

- 유닛: syncerror 2 + 가드 사유 1 + 클라이언트 폴백 2 추가 — **전체 165 suites / 1,700+ 통과**, typecheck·build·i18n:check·실부팅 ✅.
- 스테이징 실측 (go2joy tenant 4, 스모크 계정 secrets 8/28):
  - S1/S2: 실패 사유가 `last_sync_result.error`로 저장·조회 확인("is a page, not a database" 원문).
  - S3: 대상 포함 테스트 `ok:false`+사유 → 수정 후 `ok:true "Page … is readable — 1 page(s)"`. S4: 토큰 전용 경로 유지.
  - **첫 실 동기화 성공**: `fetched 1 / created 1 / embedded 1 / elapsedMs 12,728 / truncated 1`.
  - 문서 2501 등록(카테고리="Hướng dẫn sử dụng Hotel Admin", 본문 7,356자 — 실제 베트남어 Hotel Admin 가이드), 상태 embedded.
  - **RAG 인용 확인**: "Làm thế nào để sử dụng Hotel Admin?" → 문서 2501 인용, 베트남어 답변 생성.
  - E2E 검증 매핑: E2(페이지 타깃 수집) ✅ · E4(미공유 404, 오전 실증) ✅ · E6/E7 부분(실문서 변환·12.7s 소요·truncated 계약 실동작) ✅. E1/E3(DB 타깃·100+커서)·E5(연결 해제 가드)는 잔여.

## 후속 조치 결과 (같은 날, "권장안대로 진행" 승인)

- **truncated 해소** — PR **#426**(`97aeb57`): `NOTION_MAX_REQUESTS_PER_PAGE`/`NOTION_MAX_PAGES_PER_SYNC`
  env 설정화(기본값 무변경, `envInt` 양수 검증, `.env.staging.example` 갱신). 스테이징 예산 120 →
  22,914자(여전히 truncated) → **200 → truncated 소멸, 25,224자 완전 수집**(50.7s, 30k 본문 상한 내).
  실측 소요 요청 ≈145회 — 기본 30은 대형 단일 페이지엔 부족함이 정량 확인됨.
- **카테고리 스코프** — 드리프트 카테고리 "Hướng dẫn sử dụng Hotel Admin"을 분류로 등록(id 155) 후
  `agent_ids=[10 Hotel Partner]` 지정. 3방향 검증: **Hotel Partner 인용 ✅ · Landing Guest 미인용 ✅ ·
  운영자 보기 정상 ✅**(8/26 null 반전 함정 무회귀).

## 후속 관찰·잔여

- 페이지가 30,000자 본문 상한에 근접하면(현재 25.2k) 그때는 예산이 아니라 **페이지 분할(하위 페이지화)**이 정답 — go2joy에 문서 성장 시 안내.
- E1/E3/E5 실검증, 노션 문서 수정 시 재동기화 운영 루틴(자동 동기화는 C3 백로그).
