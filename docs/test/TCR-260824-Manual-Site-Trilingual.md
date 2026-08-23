# TCR-260824 — /manual 매뉴얼 사이트 검증

| | |
|---|---|
| 문서 ID | TCR-260824-Manual-Site-Trilingual |
| 작성일 | 2026-08-24 |
| 대상 | PLN-260824-Manual-Site-Trilingual 구현분 |

## 1. 정적 산출물 검증 (로컬, 실행 완료)

| # | 케이스 | 방법 | 결과 |
|---|---|---|---|
| T1 | 파일 세트 완전성 | `apps/web/public/manual/` 파일 수 = 인덱스 1 + 3문서×3언어×2형식 = 19 | ✅ 19개 |
| T2 | Vite 빌드 포함 | `turbo build --filter=@ivy/web` 후 `dist/manual/` 파일 수 | ✅ 19개 복사 |
| T3 | API 타입체크 | 예약 슬러그 `manual` 추가 후 `turbo typecheck --filter=@ivy/api` | ✅ 통과 |
| T4 | 내부 링크 전수 | html `href`·md `[..](..)`의 로컬 대상 실존 확인(스크립트) | ✅ 0건 깨짐 (T5의 1건 수정 후) |
| T5 | 마크다운 오파싱 | `[반려](사유 필수: …)`가 링크로 파싱되던 결함 → 공백 삽입으로 수정(공개 사본+`docs/guide` 원본) | ✅ 수정 |
| T6 | 번역 잔여 한글 | en/vi 12파일 grep — 한글 시퀀스 0건(언어 전환 라벨 `한국어` 제외) | ✅ |
| T7 | HTML 구조 | 10개 html 모두 `</html>` 종결, en/vi는 ko의 CSS/구조 그대로(태그 균형 에이전트 검사) | ✅ |
| T8 | 언어 내비 | 각 html pagenav: 목록 링크·타언어 2링크·현재 언어 표시·MD 원문 링크 | ✅ (표본+에이전트 전수) |
| T9 | 카드뷰 언어 토글 | index.html JS: data-doc/data-fmt로 링크 재조합, localStorage 기억, navigator.language 초기값, en/vi에 번역 초안 고지 표시 | ✅ 코드 리뷰 (브라우저 실측은 배포 후 T12) |

## 2. 배포 후 확인 항목 (스테이징, 배포 시 실행)

| # | 케이스 | 기대 |
|---|---|---|
| T10 | `GET /manual/` | 200, 카드뷰 렌더 (404면 웹 이미지 미배포) |
| T11 | `GET /manual/quick-setup.ko.md` | 200 + `Content-Type: text/markdown; charset=utf-8` (octet-stream이면 nginx conf 미반영) |
| T12 | 카드뷰에서 EN/VI 토글 → 카드 링크가 `.en.*`/`.vi.*`로 변경, 새로고침 후 언어 유지 | 동작 |
| T13 | 18개 문서 URL 전수 200 | `for l in ko en vi; for d in quick-setup knowledge-ai user-manual; for f in md html` |
| T14 | 어드민에서 슬러그 `manual`로 테넌트 생성 시도 | 예약어 처리(`manual-shop` 파생 또는 거부) |
| T15 | 콘솔 SPA 회귀 | `/`(랜딩)·`/<slug>` 로그인·`/dashboard` 정상 (정적 서빙 추가로 인한 회귀 없음) |

## 3. 에지 케이스 메모

- `/manual`(슬래시 없음): nginx `try_files $uri $uri/` + `index index.html`로 처리.
- 다크 모드: 세 문서·인덱스 모두 토큰 기반 3상태(light/dark/system) — 뷰어 테마 자동.
- en/vi는 AI 번역 초안 — 각 문서 상단 + 카드뷰 하단에 고지. 원어민 검수는 백로그.
