# TCR-260817-Multilang-VI-JA-ZH

`PLN-260817-Multilang-VI-JA-ZH.md` 구현(W0~W5)의 테스트 케이스.
자동 테스트는 `npm test` + `npm run i18n:check`로 실행됨. 수동 항목은 스테이징 배포 후 수행.

## 1. 단위 테스트 (자동, 실행 완료)

| # | 대상 | 케이스 | 결과 |
|---|---|---|---|
| U-1 | `packages/types/.../language.spec.ts` | 6개 언어 등록 순서, 코드↔세션값 대문자 대응, 중복 없음 | ✅ 23 pass |
| U-2 | 동 | `reviewed:false`가 vi/ja/zh 3개만 | ✅ |
| U-3 | 동 | `sessionLanguageForLocale`: ko·es-ES·vi-VN·ja-JP·zh-CN·EN-us 매핑 | ✅ |
| U-4 | 동 | **`zh-TW`/`zh-Hant-HK` → ZH**(간체 폴백, D1의 의도된 결과) | ✅ |
| U-5 | 동 | 미등록(`th-TH`)·빈 문자열·undefined → null | ✅ |
| U-6 | 동 | `sessionLanguageForTimezone`: Seoul→KO, america/*→EN, Ho_Chi_Minh→VI, Tokyo→JA, Shanghai→ZH, Europe/Berlin→null | ✅ |
| U-7 | 동 | `localized()`: 요청 언어 우선 → EN 폴백 → 빈 문자열(undefined 아님) | ✅ |
| U-8 | `keyword.util.spec.ts` | 일본어 가나+한자 런 2-gram, 조사(`ます`) 불용어 제거 | ✅ 14 pass |
| U-9 | 동 | 중국어 2-gram, `什么` 불용어 제거 | ✅ |
| U-10 | 동 | **공백 없는 언어에서 문장 전체가 1토큰이 되지 않음**(모든 텀 길이 2) — G5 회귀 방지 | ✅ |
| U-11 | 동 | 일본어 문장 속 라틴 주문번호(`ab1234`) 보존 | ✅ |
| U-12 | 동 | 베트남어 공백 토큰화 + 불용어(`tôi`, `muốn`) 제거 | ✅ |
| U-13 | `session.service.spec.ts` | vi-VN/ja/zh-CN 세션 생성 시 language=VI/JA/ZH, th-TH→EN | ✅ 34 pass |
| U-14 | `messenger-ingest.service.spec.ts` | 로케일 힌트 vi/vi-VN/ja-JP/zh-CN/zh-TW→각 언어, th-TH→EN | ✅ 13 pass |
| U-15 | 전체 회귀 | 기존 en/es/ko 동작 무변화 | ✅ api 966 / types 33 / common 13 pass |

## 2. 통합 검사 (자동, 실행 완료)

| # | 케이스 | 결과 |
|---|---|---|
| I-1 | `npm run i18n:check` — 4개 앱 × 5개 언어 대 영어 기준 | ✅ es·ko·vi·ja·zh **complete** (누락/잉여/빈 값 0) |
| I-2 | `npm run typecheck` (turbo 9 tasks) | ✅ |
| I-3 | 위젯 프로덕션 빌드 | ✅ 419KB(gzip 136KB) |
| I-4 | 콘솔 프로덕션 빌드(`import.meta.glob` 전환 후) | ✅ |
| I-5 | PWA 프로덕션 빌드 | ✅ |
| I-6 | 모바일(Expo) 타입체크 | ✅ |
| I-7 | API 실기동 부팅 | ✅ `Nest application successfully started` |

## 3. 수동 스모크 (스테이징 배포 후 — 미실행)

| # | 시나리오 | 기대 결과 |
|---|---|---|
| S-1 | 위젯을 `navigator.language='vi-VN'` 브라우저에서 오픈 | UI·AI 응답 모두 베트남어, 헤더에 `🌐 VI` |
| S-2 | 위젯 헤더 언어 드롭다운 열기 (데스크톱 380px / 모바일 전폭) | 6개 항목이 원어명으로 표시, 넘침·잘림 없음, 현재 언어에 ✓ |
| S-3 | 드롭다운 키보드·외부클릭 | Esc·바깥 클릭으로 닫힘 |
| S-4 | 위젯에서 언어 변경 → 서버 반영 | `session.language` 갱신, 새로고침 후 유지 |
| S-5 | 일본어 세션으로 시나리오 버튼 3종(취소/환불·배송·상품) | 일본어 스크립트 응답 + 후속 칩 일본어 |
| S-6 | 중국어 세션에서 상담원 이관 | 이관 안내·근무시간외 안내가 중국어 |
| S-7 | 콘솔 헤더 언어 드롭다운 | 6개 + vi/ja/zh에 β, 하단 각주 노출 |
| S-8 | 콘솔을 일본어로 전환 후 주요 화면 순회 | 대시보드·라이브챗·지식·설정·AI설정에 영어 잔존 없음 |
| S-9 | 설정 > 위젯 문구 6개 언어 탭 | 좁은 폭에서 줄바꿈(잘림 없음), 입력된 언어에 점 표시 |
| S-10 | 설정 > 타임존 선택 | 5개 존(뉴욕·서울·호치민·도쿄·상하이) 노출, 저장 후 신규 세션 기본 언어 반영 |
| S-11 | AI설정 > 시나리오/이관 문구 탭 | 6탭 + 점 표시, 언어별 저장·복원 정상 |
| S-12 | 지식 QA·미리보기 언어 선택 | 6개 원어명, 선택 언어로 응답 |
| S-13 | 일·중 한자 렌더링 | 일본어 화면에서 한국식 자형 혼입 없음(`<html lang>` 확인) |
| S-14 | 질문 통계(일·중 대화 발생 후 24h) | 키워드가 2글자 단위로 집계, 문장 통째 항목 없음 |
| S-15 | 기존 en/es/ko 화면 회귀 | 문구·레이아웃 변화 없음 |

## 4. 번역 검수 대기 (⚠️ 원어민 확인 필요)

LLM 초벌 번역(D3)이므로 아래는 **오역 시 분쟁 소지**가 있어 우선 검수 대상.
`reviewed: false` → 검수 완료 시 `packages/types/src/common/language.ts`에서 `true`로 전환.

| 우선순위 | 대상 | 파일 |
|---|---|---|
| **P0** | 환불 정책·기간, 반품/교환 조건(30일·gently used·파이널세일) | `apps/api/.../chat/scenario.service.ts` (refund_policy, return_exchange, cancel_order) |
| **P0** | 개인정보 처리 동의 문구 | `chat.service.ts` consentRequired · `messenger-ingest.service.ts` CONSENT_NOTICE · 위젯 `chat.consent.*` |
| **P0** | 근무시간외·이메일 회신 안내 | `chat.service.ts` offHoursNeedEmail · `handoff-router.service.ts` |
| P1 | 이슈 상태 안내(반려 사유 3종 포함) | `issue/issue-notice.ts` |
| P1 | 배송 단계 라벨 4종 | `packages/types/src/domain/status-map.ts` |
| P2 | 콘솔 UI 전반(1,455키) | `apps/web/src/i18n/locales/{vi,ja,zh}/` |
| P2 | 앱 UI(위젯 180 · 모바일 123 · PWA 129) | 각 `locales/{vi,ja,zh}.ts` |

## 5. 엣지 케이스 확인 결과

| 케이스 | 동작 | 확인 |
|---|---|---|
| 신규 언어 문구를 입력하지 않은 테넌트 | `?? EN` 폴백으로 영어 노출, 편집 UI에 점 없음으로 표시 | 설계상 보장(U-7) |
| 미등록 로케일(`th`) | EN 폴백 | U-5·U-14 |
| 번체 중국어 사용자 | 간체 노출(문서화된 동작) | U-4 |
| `answer_reuse.lang` varchar(5) | 'ZH' 2자 → 여유 | 스키마 무변경 |
| 상담원 프로필 `languages` varchar(64) | 6개 CSV=17자 | 여유 |
| 언어 목록 재선언 | `i18n:check`가 기준 대비 차이를 실패로 보고 | I-1 |
