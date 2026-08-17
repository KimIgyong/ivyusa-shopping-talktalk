# TCR-260817-HEIC-Attachment-Support

HEIC/HEIF 첨부 수용 테스트 케이스. 근거: `PLN-260817-HEIC-Attachment-Support.md` §6

- 작성일: 2026-08-17
- 대상 브랜치: `feature/heic-attachment-support`
- 픽스처: `apps/api/src/domain/attachment/__fixtures__/sample.heic`
  — 합성 그라디언트를 플랫폼 인코더로 HEIC(HEVC) 인코딩한 640×480 / 3.6KB.
  저작권 있는 이미지를 리포에 넣지 않기 위해 직접 생성했고, **Exif 박스를 포함**하고 있어
  EXIF 제거 검증에 그대로 쓴다.

## 1. 단위 테스트 (자동, 실행 완료)

`apps/api/src/domain/attachment/heic-conversion.spec.ts` — 12건

| ID | 케이스 | 검증 내용 | 결과 |
|---|---|---|---|
| U-1 | ftyp brand 수용 | 실제 HEIC가 `{ext:heic, decoder:heif}`로 해석 | ✅ |
| U-2 | declared mime 관용 | `.heic` + `image/heif` 조합 수용(iOS 경로차) | ✅ |
| U-3 | 위장 PNG 거절 | 확장자 `.heic` + PNG 매직바이트 → null | ✅ |
| U-4 | 위장 MP4 거절 | 같은 `ftyp` 헤더, brand `isom` → null | ✅ |
| U-5 | 파일명 재기술 | `IMG_0001.HEIC`→`IMG_0001.jpg`, 확장자 없는 이름도 처리 | ✅ |
| U-6 | **변환 저장** | mime `image/jpeg`, 경로 `*.jpg`, 썸네일 생성, 640×480 기록, 저장 바이트가 JPEG 매직 | ✅ |
| U-7 | **EXIF 제거** | 산출 JPEG의 `metadata().exif` = undefined | ✅ |
| U-8 | 픽셀 상한 | 상한 0.1MP 설정 시 0.3MP 파일 → **E5043** | ✅ |
| U-9 | 손상 파일 fail-closed | 헤더만 남기고 페이로드 파괴 → 예외, **DB 행 0건** | ✅ |
| U-10 | 디코더 미주입 | 서비스에 디코더가 없으면 → **E5042**(폴백 저장 없음) | ✅ |
| U-11 | 킬 스위치 | `ATTACHMENT_ALLOW_HEIC=false` → E5036 | ✅ |
| U-12 | AVIF 정책 | AVIF 업로드가 **JPEG로** 저장(AV1 재인코딩 회피) | ✅ |
| U-13 | 동시 디코드 | 3건 동시 업로드가 워커 풀(2)을 통과, 파일 3개 생성 | ✅ |

`apps/api/src/domain/messenger/messenger-ingest.service.spec.ts` — 신규 2건

| ID | 케이스 | 검증 내용 | 결과 |
|---|---|---|---|
| U-14 | 인바운드 실패 자리표시 | store 실패 시 `system` 메시지 기록, **세션 언어(KO)** 문구, 본문 메시지는 정상 처리 | ✅ |
| U-15 | 성공 시 침묵 | 정상 저장이면 system 메시지 없음, attachmentIds 전달 | ✅ |

**회귀**: API 전체 스위트 `117 suites / 1,249 tests` 통과(기존 1,246 + 신규 3 파일 단위 증가분).
기존 jpg/png/webp/gif 경로(`attachment.service.spec.ts`)와 아웃박스·텔레그램 첨부
스펙 전부 무회귀.

## 2. 빌드·타입

| 항목 | 결과 |
|---|---|
| `turbo run typecheck` | ✅ 9/9 |
| `turbo run build` | ✅ 6/6 |
| 워커 방출 확인 | ✅ `apps/api/dist/domain/attachment/heic-decode.worker.js` |
| dist 워커 실제 디코드 | ✅ 640×480 42ms, RGBA 1,228,800 bytes |

## 3. 성능 실측 (PLN §1 스파이크 + 본 구현)

| 대상 | 환경 | 결과 |
|---|---|---|
| 12MP HEIC(1.05MB) | node:20-alpine **x86_64/musl**(배포 타깃) | decode 845~956ms · jpeg 110ms · thumb 25ms = **≈1.0s** |
| 동일 | arm64 macOS | 총 ≈0.38s |
| 36MP HEIC(25MB) | arm64 | decode 2.4s, RSS 771MB → **픽셀 상한 근거** |
| 12MP AVIF(13.8MB, 사진성 노이즈) | arm64 | **AV1 재인코딩 3,763ms** vs **JPEG 1,027ms** → AVIF도 JPEG 저장으로 확정 |
| RSS 추이 | x86_64, 5회 반복 | 70MB → 290MB 부근 평탄화(WASM 힙 재사용) |

## 4. 스테이징 스모크 (배포 후 수행 — 미실행)

| ID | 시나리오 | 기대 |
|---|---|---|
| S-1 | 위젯에서 `.heic` 첨부 → 전송 | 위젯·콘솔 양쪽에 썸네일, 라이트박스 확대 |
| S-2 | 콘솔에서 `.heic` 첨부 → 발신 | 고객 위젯에 표시 |
| S-3 | **5장 동시 업로드 중 다른 API 응답성** | `/health` 등이 막히지 않음(워커 스레드 검증의 핵심) |
| S-4 | 변환 로그 계측 | `attachment.convert heic→jpeg … decode=…ms` 라인 존재 |
| S-5 | 손상 HEIC 업로드 | 위젯에 "JPEG로 다시 보내주세요" 오류, 저장 안 됨 |
| S-6 | 50MP 초과 이미지 | E5043 거절 |
| S-7 | 킬 스위치 | `ATTACHMENT_ALLOW_HEIC=false` + 재기동 → `.heic` 거절 |
| S-8 | 재배포 후 잔존 | 변환 저장분이 볼륨에 유지(S-10 재확인) |
| S-9 | 인바운드 실패 자리표시 | Gmail로 미지원 첨부 → 대화에 안내 + 고객 채널 발신 |
| S-10 | **실기기 iOS** | 사진앱/파일앱/Chrome iOS/인앱 브라우저 경로별 업로드 성공 — REQ T-1 매트릭스 겸함 |

## 5. 알려진 한계

- **라이브포토·버스트**: 컨테이너의 첫 이미지만 저장(PLN 비범위).
- **HEIC 저장(출력)** 미지원 — 입력 전용.
- **워커 타임아웃 15초**: 그보다 느린 초대형 이미지는 E5042로 떨어진다(픽셀 상한이 먼저 걸리는 게 정상).
- S-3는 로컬에서 재현하기 어려워 스테이징 실측이 필요하다.
