# RPT — 정책 문서 KB 등록 파이프라인 구현 보고서

- 작성일: 2026-07-31
- 브랜치: `feature/kb-policy-import` (base: `feature/kb-vector-hybrid` — PR #31 위 적층)
- 근거: `docs/analysis/AN-PolicyDoc-KB-Registration-20260731.md` §3.2 **옵션 A**
  (파싱 → title 멱등 등록, 검수 전 비활성)
- 원본: Google Docs 「미국 자사몰 통합 정책서 / TALK TALK CHAT-BOT V3」
  최종본 KR/ENG 탭 (docId `1QIJjQMIwz6WkAdMmOJmECgBrDpxUtrpilFeuclQKeKc`)

---

## 1. 산출물

| 구분 | 파일 | 내용 |
|---|---|---|
| 데이터 | `apps/api/src/database/data/kb-policy-ko.json` | KR 정책 112건 (17.5K자) |
| 데이터 | `apps/api/src/database/data/kb-policy-en.json` | EN 정책 112건 (37.4K자) |
| 임포터 | `apps/api/src/database/kb-import.ts` | `npm run kb:import [-- --tenant=N] [--activate]` |
| 스크립트 | `apps/api/package.json` · 루트 `package.json` | `kb:import` 등록 |

### 파싱 규칙 (등록 방안 문서 준수)
- 등록 단위: 최심 헤딩(`###`, 없으면 `##`) 1개 = KB 1행. KR/EN **분리 등록**(언어 교차 검색은
  Voyage 임베딩 담당, 키워드 레그는 언어별 매칭)
- **제외**: §0(AI 답변 기준)·§10(챗봇 운영정책) — 행동 규칙 → 페르소나/응답 규칙 소관,
  §11(FAQ 메타 기준), §12(미확정 충돌 항목)
- category 매핑: 대분류 기준 `policy_legal/membership/professional/beautizen/roundtable/b2b/safety/fraud`,
  §2는 중분류 세분 `policy_shipping/return/cancellation/claims/payment/promotion`
- title = `"{번호} {항목명}"` (KR/EN 자연 상이 → 테넌트 내 유일키로 사용)
- KR/EN 카테고리 분포 **완전 대칭**(112=112) — 구조 파싱 정합성 교차 확인됨

### 임포터 동작
- `(tenant_id, title)` 멱등 upsert: 신규 → **active=0**(검수 게이트) + status=pending,
  내용/카테고리 변경 → 갱신 + 재임베딩 대기, 동일 → skip
- 종료 시 `reindexAll()`로 pending 전량 임베딩(Qdrant 동기화 포함)
- `--activate`: 데이터 파일에 존재하는 title 전체를 active=1 + Qdrant payload 반영
  (검수 승인 후 1회 실행)

## 2. 로컬(dev) 검증 결과 — 전 항목 통과

| 검증 | 결과 |
|---|---|
| 1차 임포트 | ✅ 224 created(112 KO+112 EN), 224/224 임베딩, 실패 0 |
| 2차 임포트(멱등성) | ✅ 224 skipped, 재임베딩 0 |
| Qdrant 포인트 | ✅ 236 (시드 12 + 정책 224) |
| 검수 게이트 | ✅ 활성화 전 검색 미노출 ("배송비 얼마인가요" → 0건) |
| `--activate` | ✅ 224건 활성화 + Qdrant 반영 |
| 활성화 후 검색 스팟체크 | ✅ "배송비 얼마인가요"→`2.1.3 배송비`, "free shipping threshold"→`2.1.3 Shipping Rates…`(정확 일치), "Beautizen 프로그램"→`5.1/5.2` |
| build / typecheck | ✅ 통과 |

## 3. 검수(리뷰) 절차 안내 — 스테이징 적용 전

1. 스테이징에서 `npm run kb:import --workspace=@ivy/api` (active=0 상태로 등록)
2. **문서 오너 검수**: 관리 콘솔 `/knowledge` 목록에서 224건 내용 확인
   (특히 §12 관련 미확정 정책이 반영된 항목, Beautizen "준비중" 문구 등 운영 결정 최신화)
3. 검수 완료 후 `npm run kb:import --workspace=@ivy/api -- --activate`
4. 원본 문서 개정 시: 파서 재실행 → JSON 갱신 → `kb:import` 재실행(변경분만 갱신·재임베딩)

## 4. 참고·제약

- **시드 KB 12건과 내용 중복 가능성**: 기존 시드 CS-policy 문서(영문)와 §2 정책이 주제 중복.
  스테이징 정식 운영 시 시드 데모 KB의 비활성/삭제 여부는 운영 결정 필요.
- 파서(`parse_policy.py`)는 세션 산출물로 저장소에 미포함 — 문서 개정 주기가 생기면
  Google Docs 내보내기 → 파서 실행을 정례화(옵션 C: Drive 동기화)로 승격 검토.
- 임베딩은 현재 stub — **Voyage 키 설정 후 `kb:reindex --force`로 전량 실임베딩** 필요
  (교차언어 검색은 그 시점부터 유효).
- `content` 선두 400~800자에 "기본 답변"이 오도록 하는 큐레이션(§3.1 권고)은 원문 구조를
  보존한 이번 자동 파싱에는 미적용 — 검수 단계에서 항목별 조정 가능(원문 다수가 이미
  기본 답변을 본문 내 포함).
