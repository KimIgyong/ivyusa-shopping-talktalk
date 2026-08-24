# PLN-260824 — HTML 매뉴얼 스크린캡처 추가 계획

| | |
|---|---|
| 문서 ID | PLN-260824-Manual-Screenshots |
| 작성일 | 2026-08-24 |
| 선행 | REQ-260824-Manual-Screenshots |
| UI 영향 | 매뉴얼 HTML 페이지에 figure(캡처+캡션) 블록 추가 — 콘솔/위젯 앱 변경 없음 |

## 1. figure 배치 와이어프레임

각 캡처는 해당 절의 절차 설명 **바로 아래**에 카드형 figure로 들어간다.

```
### 1.1 새 테넌트 생성                      ← 기존 h3
<본문 표·설명 그대로>
┌─ figure ────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │  (스크린캡처 — 테두리·라운드 처리)   │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│  그림 1. 테넌트 목록과 [새 테넌트] 모달  │  ← figcaption, muted
└─────────────────────────────────────────┘
```
- CSS: `figure.shot{border:1px solid var(--line);border-radius:12px;overflow:hidden;
  background:var(--card)}` + `img{max-width:100%;display:block}` + caption(muted, 13px).
- `loading="lazy"`, `alt` = 캡션과 동일 의미(각 언어).

## 2. 캡처 목록 (12장, 로컬 dev 시드 데이터·라이트 테마·폭 1600px)

| # | 파일 (img/) | 화면 | 들어가는 매뉴얼·절 |
|---|---|---|---|
| S1 | admin-tenants.jpg | /admin/tenants 목록 + [새 테넌트] 모달 | ① 1.1 |
| S2 | admin-temp-password.jpg | 사용자 초대 → 임시 비밀번호 모달 | ① 1.3 |
| S3 | tenant-login.jpg | /<slug> 테넌트 로그인 화면 | ① 2.1 |
| S4 | settings-stores.jpg | /settings 스토어 연동 타일 + 모달 | ① 3장 |
| S5 | settings-widget.jpg | /settings 위젯 카드(설치 가이드·테마) | ① 4장 |
| S6 | widget-launcher.jpg | 고객 위젯(런처+패널 열림) | ① 4.1 / ③ 2장 |
| S7 | ai-setting.jpg | /ai-setting 전경(카드+우측 스튜디오) | ① 5장 / ② 4장 |
| S8 | knowledge.jpg | /knowledge 전경(문서·소스+우측 QA) | ① 6장 / ② 2장 |
| S9 | knowledge-qa.jpg | 지식 QA 패널 답변+출처 확대 | ② 3.1 |
| S10 | handoff-settings.jpg | /settings 상담 전환 섹션 | ② 5장 |
| S11 | dashboard.jpg | /dashboard | ③ 9장 |
| S12 | live-chat.jpg | /live-chat 3열 화면 | ③ 4장 |

삽입 수: ① 간단 세팅 7곳 · ② 지식·AI 5곳 · ③ 통합 4곳 (일부 이미지 재사용).

## 3. 단계 계획

| 단계 | 작업 |
|---|---|
| W1 | 로컬 dev 기동(db:up→seed→dev) → Chrome으로 12장 캡처(뷰포트 통일) → 크롭·리사이즈·JPEG 최적화 → `apps/web/public/manual/img/` |
| W2 | ko HTML 3종에 figure 삽입(+figure CSS) |
| W3 | en/vi HTML 6종에 동일 삽입(캡션·alt만 각 언어) — 이미지는 오픈 이슈 O1 결정에 따름 |
| W4 | 검증: 로컬 빌드 dist 포함·용량 합계·이미지 경로 전수, RPT + PR + 스테이징 배포·확인 |

## 4. 부수 영향

- 콘솔/위젯 코드 변경 없음. md 버전 변경 없음. 스키마·마이그레이션 없음.
- 저장소·이미지 용량: 12장 × ~200KB ≈ 2~3MB (dist·이미지 빌드 시간 영향 미미).
- `docs/guide` 원본(md)은 그대로 — html 전용 요소이므로 "사본 동반 갱신" 규칙에
  "img는 html 전용" 예외를 명시.

## 5. 오픈 이슈 (승인 시 결정)

| # | 질문 | 결정 (2026-08-24 승인 시) |
|---|---|---|
| O1 | 캡처 UI 언어 | **ko + en 2세트**(24장) — ko 매뉴얼엔 ko 콘솔 캡처, en/vi 매뉴얼엔 en 콘솔 캡처. 파일명 `img/{name}.{ko,en}.jpg` |
| O2 | 위젯 캡처(S6) | 로컬 위젯(:5174) 데모 화면 사용 (스테이징 실몰 화면은 PII 위험) — 승인됨 |
