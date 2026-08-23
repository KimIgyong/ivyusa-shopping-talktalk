# RPT-260824 — /manual 매뉴얼 사이트 (카드뷰 · md/html · ko/en/vi)

| | |
|---|---|
| 문서 ID | RPT-260824-Manual-Site-Trilingual |
| 작성일 | 2026-08-24 |
| 선행 | REQ/PLN-260824-Manual-Site-Trilingual (PLN 승인: 2026-08-24) · TCR-260824 동명 |
| 변경 성격 | 정적 문서 + 소규모 코드 2건 — **스키마 변경 없음(마이그레이션 불필요)** |

## 1. 무엇이 바뀌었나

`https://shoptalk.amoeba.site/manual`에서 매뉴얼 3종을 카드뷰로 제공. 각 매뉴얼은
md·html 2형식 × ko/en/vi 3언어(총 18문서 + 인덱스). 정적 파일은 `apps/web/public/manual/`
에 커밋되어 Vite가 dist로 복사, 웹 컨테이너 nginx가 SPA 폴백보다 먼저 서빙.

## 2. 파일 목록

| 구분 | 파일 |
|---|---|
| 신규 (정적 사이트) | `apps/web/public/manual/index.html` + `{quick-setup,knowledge-ai,user-manual}.{ko,en,vi}.{md,html}` (19개) |
| 코드 | `docker/staging/nginx.web.conf` — `.md` → `text/markdown; charset=utf-8` location 추가 · `apps/api/src/global/constant/reserved-slug.constant.ts` — `'manual'` 예약 |
| 문서 | REQ/PLN/TCR/RPT-260824-Manual-Site-Trilingual · `docs/guide` 원본 3종에 온라인판 링크+사본 동반 갱신 규칙 명시 · `[반려](…)` 마크다운 오파싱 1건 수정 |

## 3. 구현 메모

- ko html은 아티팩트 디자인 재사용(quick-setup/knowledge-ai) + user-manual 신규 제작.
  전 페이지 공통 아이덴티티(브랜드 블루, Gothic A1/IBM Plex Sans KR, 라이트/다크 토큰).
- 카드뷰: 언어 토글(ko/en/vi)이 카드 문구와 링크 대상(`{doc}.{lang}.{fmt}`)을 함께 전환,
  localStorage 기억 + 브라우저 언어 초기값. en/vi 선택 시 "AI 번역 초안" 고지 표시.
- en/vi 번역은 병렬 서브에이전트 2개가 콘솔 i18n 리소스(`apps/web/src/i18n/locales/{en,vi}`)의
  실제 UI 라벨을 대조해 생성. 전수 자체검사(잔여 한글 0·태그 균형·교차 링크) + 본 세션
  표본 재검증. vi 특기: 상담원을 콘솔의 "nhân viên" 대신 중의성 없는 "nhân viên tư vấn"으로
  통일(원어민 검수 시 확인 항목).
- nginx `.md` location은 `types {}`를 location 스코프로 한정해 전역 MIME 맵을 보존.

## 4. 테스트 결과

TCR-260824 §1 T1~T9 전부 통과(파일 세트 19·dist 복사·API 타입체크·링크 전수 0깨짐·
잔여 한글 0·HTML 종결·언어 내비). §2 T10~T15는 스테이징 배포 후 확인 항목.

## 5. 배포 상태

| 항목 | 상태 |
|---|---|
| PR | **#337** (`KimIgyong/user-manual`) — 매뉴얼 본문 작성분과 같은 PR에 후속 커밋으로 포함 |
| 마이그레이션 | 해당 없음 (sql/·entity 변경 없음) |
| 스테이징 | **미배포** — 머지 후 서버에서 `deploy-staging.sh` (web·api 이미지 재빌드 필요, nginx.web.conf는 web 이미지에 포함) |
| 배포 검증 | TCR §2: `/manual/` 200 · `.md` Content-Type · 18문서 전수 200 · 슬러그 `manual` 예약 · SPA 회귀 |

## 6. 잔여 과제

- en/vi 원어민 검수 (P1 — 각 문서에 초안 고지 유지 중)
- `docs/guide` 원본 개정 시 `public/manual` 사본·번역판 동반 갱신 규칙 준수 (원본 상단에 명시)
- 프로덕션 배포 시 동일 nginx conf 반영 확인
