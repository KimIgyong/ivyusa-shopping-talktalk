# REQ-260824 — /manual 매뉴얼 사이트 (카드뷰 · md/html · ko/en/vi 3개 언어)

| | |
|---|---|
| 문서 ID | REQ-260824-Manual-Site-Trilingual |
| 작성일 | 2026-08-24 |
| 선행 | REQ/PLN/RPT-260824-User-Manual-Setup-Knowledge-AI (PR #337 — 매뉴얼 3종 ko 작성 완료) |

## 1. 요구사항 (원문 요약)

`https://shoptalk.amoeba.site/manual` 아래에:
- 매뉴얼 3종(① 간단 세팅 ② 지식 등록·AI 설정 ③ 통합 사용자 매뉴얼)을 **카드뷰**로 배치
- 각 매뉴얼은 **md와 html 두 형식**으로 서비스
- 모든 매뉴얼은 **영문/베트남어/한국어 3개 언어** 제공

## 2. AS-IS

- 매뉴얼 3종은 **ko md만** 존재(`docs/guide/`, PR #337). ①②는 ko HTML(아티팩트용 디자인)
  보유, ③은 HTML 없음. en은 ③ 구버전(v1.1.0)뿐, vi는 전무.
- `shoptalk.amoeba.site`는 메인 nginx가 `/widget`(위젯 컨테이너), `/app`(PWA 컨테이너),
  `/api`(API), `/`(웹 콘솔 컨테이너)로 프록시. 웹 컨테이너는 `apps/web/dist`를 정적 서빙
  (SPA 히스토리 폴백 `try_files $uri $uri/ /index.html`).
- `apps/web`에는 `public/` 디렉터리가 없음(Vite는 존재 시 dist로 그대로 복사).
- `/manual` 경로 관련 제약 2건:
  1. **nginx MIME**: `.md`가 mime.types에 없어 `application/octet-stream`으로 다운로드됨
     → 브라우저에서 보이려면 `text/markdown`(또는 text/plain) 지정 필요.
  2. **슬러그 충돌**: 웹 라우터가 `/<slug>`를 테넌트 로그인으로 해석. 정적 파일이 먼저
     매칭되므로 서빙엔 문제없지만, 테넌트가 슬러그 `manual`을 가지면 로그인 페이지가
     가려짐 → `RESERVED_TENANT_SLUGS`에 `manual` 추가 필요.

## 3. TO-BE

```
/manual/                      ← 카드뷰 인덱스 (언어 전환 ko/en/vi)
/manual/quick-setup.{ko,en,vi}.{md,html}     ① 간단 세팅
/manual/knowledge-ai.{ko,en,vi}.{md,html}    ② 지식·AI 설정
/manual/user-manual.{ko,en,vi}.{md,html}     ③ 통합 매뉴얼
```
- 총 3문서 × 3언어 × 2형식 = **18개 파일 + 인덱스 1개**.
- 소스는 `apps/web/public/manual/`에 커밋 → 웹 이미지 빌드에 포함 → 배포로 서비스.
- `docs/guide/`의 ko md가 원본(source of truth). `public/manual/`의 ko md는 사본이며,
  매뉴얼 개정 시 함께 갱신(경로를 RPT·가이드 상단에 명시).

## 4. 제약·원칙

- en/vi 번역은 AI 번역 초안 — **원어민 검수 전** 상태임을 각 문서 상단에 표기
  (i18n 6종 도입 때와 동일한 방침).
- html은 기존 아티팩트 디자인(브랜드 블루·라이트/다크)을 재사용해 세 문서·세 언어가
  한 세트로 보이게 함.
- 콘솔 인증과 무관한 **공개 문서**로 서비스(로그인 불필요) — 내용은 이미 공개 가능한
  운영 매뉴얼이며 자격증명·비밀값 없음.
- 배포: 웹 컨테이너(정적+nginx conf) + API 컨테이너(예약 슬러그 1줄) 재빌드.
  스키마 변경 없음 → 마이그레이션 불필요.
