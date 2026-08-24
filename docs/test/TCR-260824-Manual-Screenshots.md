# TCR-260824 — HTML 매뉴얼 스크린캡처 검증

| | |
|---|---|
| 문서 ID | TCR-260824-Manual-Screenshots |
| 작성일 | 2026-08-24 |
| 대상 | PLN-260824-Manual-Screenshots 구현분 |

## 1. 로컬 검증 (실행 완료)

| # | 케이스 | 결과 |
|---|---|---|
| T1 | 캡처 소스 무결성 — 로컬 dev + 시드/기존 데모 데이터, MFA 없음, 실PII 없음 (계정: dev/admin 로컬 비번 변경, 데모 사용자 2건 생성 — 로컬 한정) | ✅ |
| T2 | 이미지 세트 — `img/` 30개 (ko 16 + en 14), JPEG q80, 총 3.0MB | ✅ |
| T3 | figure 삽입 — quick-setup 10 / knowledge-ai 5 / user-manual 5 × ko·en·vi (총 60), CSS 1회/파일 | ✅ grep 전수 |
| T4 | 깨진 이미지 참조 0건 (9개 html의 `src="img/*"` 전수 대조) | ✅ |
| T5 | HTML 구조 — 10개 html `</html>` 종결 유지 | ✅ |
| T6 | Vite 빌드 — `dist/manual/img` 30개 복사, 빌드 그린 | ✅ |
| T7 | en/vi 이미지 정책 — en 캡처 사용, 유일한 ko 캡처(widget-consent)는 캡션에 UI 언어 주석, vi 첫 en-figure에 "영어 UI" 주석 | ✅ 에이전트+표본 |

## 2. 배포 후 확인 (스테이징)

| # | 케이스 | 기대 |
|---|---|---|
| T8 | `GET /manual/img/dashboard.ko.jpg` | 200, image/jpeg |
| T9 | `/manual/quick-setup.ko.html` 렌더 — figure 10개 표시(테두리·캡션), 레이아웃 깨짐 없음 | 브라우저 확인 |
| T10 | en/vi 페이지 각 1개 표본 렌더 | 브라우저 확인 |

## 3. 알려진 편차

- 지식 화면 캡처는 **PR #341(지식 분류 체계 테넌트화) 이전 코드** 기준 — 차이는 사용법
  가이드 카드 하단부에 국한(캡처 프레임 밖), 소스·QA·문서 영역은 동일.
- 상담원 연결(Agent handoff) 캡처에 표시된 담당 상담원 배지는 로컬 데모 값.
- 시나리오 버튼 라벨은 테넌트 저장값(영문)이 그대로 보임 — 실제 동작과 일치.
