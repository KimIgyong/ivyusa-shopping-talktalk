# TCR-260828 — go2joy 운영지식 영어·베트남어 번역 입력 테스트

- 근거: `docs/plan/PLN-260828-KB-Go2joy-Ops-EN-VI-Translation.md`
- 범위: 신규 서버 코드 없음(변환 스크립트 + 데이터) — 단위 테스트 대상은 변환 결과 검증

## 1. 변환 스크립트 (`convert-go2joy-kb.mjs --lang`)

| # | 케이스 | 결과 |
|---|---|---|
| C1 | 무인자(기존 ko 호출 호환) → 20건, 무접미사 키, 한국어 카테고리 | ✅ |
| C2 | `--lang en` → 20건, `GTJ-*-EN`, 카테고리 5종(Dashboard/Review Management/Room Type Management/Reports/Reference) | ✅ |
| C3 | `--lang vi` → 20건, `GTJ-*-VI`, 카테고리 5종(Bảng điều khiển/Quản lý đánh giá/Quản lý loại phòng/Báo cáo/Tài liệu tham khảo) | ✅ |
| C4 | 본문 100자 미만 아티클 0건(en·vi) — 헤딩 경계 규칙이 번역 md에서도 유지 | ✅ |
| C5 | 부록(용어집·상태값) 언어별 헤딩 매칭 → GTJ-GLS-01/STA-01 + 접미사 | ✅ |

## 2. 스테이징 적재 (go2joy, 기존 일괄등록 API — 서버 배포 없음)

| # | 시나리오 | 결과 |
|---|---|---|
| S1 | en CSV 업로드(operation) → `created:20, embedded:20, invalid:0` | ✅ |
| S2 | vi CSV 업로드(operation) → `created:20, embedded:20, invalid:0` | ✅ |
| S3 | en 재업로드 → `skipped:20, created:0` (멱등, ko 20건과 키 충돌 없음) | ✅ |
| S4 | `categories/counts?group=operation` → **카테고리 15종 · 문서 60건** 정확 | ✅ |

## 3. ask 스모크 — 언어 일치 인용

| 질문(언어) | 1순위 인용 | 유사도 | 판정 |
|---|---|---|---|
| "How many times can I reply to a customer review?" (EN) | `Reply to a Review` (-EN) | 0.589 | ✅ 정답·영문 문서 |
| "Tôi có thể trả lời đánh giá của khách bao nhiêu lần?" (VI) | `Trả lời đánh giá (Reply to a Review)` (-VI) | 0.594 | ✅ 정답·베트남어 문서 |
| "Làm thế nào để dừng chương trình flash sale?" (VI) | `Dừng Flash Sale (Stop Flash Sale)` (-VI) | 0.696 | ✅ 정답 |
| "How is Net Revenue calculated?" (EN) | `View Dashboard` (-EN) + `Glossary` (-EN) | 0.445/0.427 | ✅ 공식 정확 |
| "리뷰 답글은 몇 번 등록할 수 있나요?" (KO, 회귀) | `리뷰 답글 등록` (ko 원본) | 0.573 | ✅ 기존 동작 유지(EN 문서는 0.477로 후순위) |

## 4. 엣지·리스크 확인

- 번역쌍 충돌 스캔: 선제 스캔 미실행(PLN D5) — 수동 스캔 시 dismiss로 영구 제외 가능함을
  코드로 확인(스캔은 콘솔 수동 전용, 크론 없음).
- "보완 필요" 3건은 en(`Pending update`)·vi(`Cần bổ sung`)로 표기 번역해 활성 등록(D7).
- ko 질문에 en 문서가 2순위로 낮은 유사도 등장 — 다국어 임베딩의 기대 동작이며 1순위
  인용은 언어 일치 유지.
