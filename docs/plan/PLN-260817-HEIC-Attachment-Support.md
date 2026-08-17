# PLN-260817-HEIC-Attachment-Support

HEIC/HEIF 첨부 수용 구현 계획. 근거 요구: `docs/analysis/REQ-260817-HEIC-Attachment-Support.md`

- 작성일: 2026-08-17
- 기준 코드: `origin/main` `6d7edec`
- 결정 사항 반영: Q-1 원본 미보관 / Q-2 파일명 `.jpg` 통일 / Q-3 JPEG q82 / Q-4 픽셀 상한 50MP /
  Q-5 인바운드 실패 자리표시 / Q-6 AVIF 동시 개방 (사용자 승인 2026-08-17)
- **UI 변경 있음** → §4 와이어프레임

---

## 0. 결론 — 안 A(WASM 디코더) 확정, 단 워커 스레드 필수

REQ §3.1의 A/B 중 **A(libheif WASM + sharp 재인코딩)** 로 간다. 스파이크(§1)에서 A가
동작하고 EXIF도 확실히 제거됨을 확인했다. 다만 **12MP 한 장에 약 1초**가 들고 그 시간은
**순수 CPU 동기 구간**이라, 요청 스레드에서 그대로 돌리면 첨부 한 장이 API 전체를 1초씩
멈춰 세운다(5장이면 5초). 그래서 A안은 "패키지 추가"가 아니라 **워커 스레드 + 동시 실행
상한**까지가 한 세트다.

## 1. 스파이크 결과 (T-2, 2026-08-17 실측)

배포 타깃과 동일 조건(`node:20-alpine`, x86_64/musl, 스테이징 호스트의 일회용 컨테이너)에서
`libheif-js@1.19.8` + `sharp@0.33.5`로 측정. 표본은 애플 인코더로 만든 4032×3024(12MP,
1.05MB, `ftyp` brand `heic`) — 아이폰 사진과 같은 규격.

| 구간 | x86_64/musl (배포 타깃) | 참고: arm64 macOS |
|---|---|---|
| HEIC 디코드 | **845~956ms** | 325~389ms |
| JPEG q82 재인코딩 | 109~117ms | 35~42ms |
| 320px webp 썸네일 | 24~25ms | 12ms |
| **합계 / 장** | **≈ 1.0초** | ≈ 0.38초 |
| 산출 JPEG | 0.66MB | 동일 |
| RSS | 70MB → **290MB 부근에서 평탄화**(WASM 힙 재사용) | 77 → 466MB |
| EXIF/ICC | `exif:false, icc:false` — **재인코딩으로 확실히 제거** | 동일 |

추가 측정 — **6016×6016(36MP, 25MB)**: 디코드 2.4초, RSS **771MB**.
→ 용량 상한(10MB)만으로는 자원 보호가 안 된다는 REQ FR-7의 근거가 수치로 확인됐다.

호스트 여건: **4 vCPU / 32GB**, `ivy_api_staging` 상시 RSS 약 120MB, 메모리 제한 미설정.

부수 확인:
- `libheif-js`는 **의존성 0, CommonJS `require` 가능**(패키지 6.1MB) — NestJS CJS 빌드와 충돌 없음.
- `heic-decode`(래퍼)는 얇지만 얻는 게 적어 **`libheif-js` 직접 사용**(디코더 인스턴스 수명을
  우리가 통제해야 워커 재사용이 된다).

---

## 2. 설계

### 2.1 변환 파이프라인

```
store(file)                      [attachment.service.ts]
  │
  ├─ resolveType()               [file-type.util.ts]  ← heic/heif/avif 스펙 추가
  │    · 확장자 heic|heif|avif
  │    · sniff: offset 4 'ftyp' + brand(heic/heix/hevc/hevx/heim/heis/mif1/msf1/avif)
  │    · declaredMime image/heic|image/heif|image/avif 허용
  │
  ├─ 용량 상한(기존 10MB)
  │
  └─ processImage(buffer, ext)
       ├─ ext ∈ {heic,heif} ?  ─── yes ──▶ ImageDecodeService.toRaw(buffer)   ★신규
       │                                     └─ worker pool(2) → libheif WASM
       │                                        · 픽셀 상한 50MP 초과 → E5037
       │                                        · 타임아웃 15초 → 실패
       │                                     ▶ raw RGBA
       │                                     ▶ sharp(raw).jpeg(q82)  = 저장 원본
       │                                     ▶ sharp(jpeg).resize(320).webp = 썸네일
       │                                     ▶ ext='jpg', mime='image/jpeg'  ★재기술
       │
       └─ no ──▶ 기존 경로(sharp 단독) 그대로
```

핵심 설계점 셋:

1. **저장 타입이 바뀐다.** heic로 들어와 jpg로 저장되므로 `storagePath`(`{uuid}.jpg`)·`mime`·
   `size`·`checksum`은 **변환 결과 기준**이어야 한다. 지금 `store()`는 입력 `type.ext`로
   경로를 만들고 있어 이 부분을 "변환 후 타입"으로 한 번 접어줘야 한다.
2. **HEIC는 fail-open 하지 않는다.** 기존 `processImage`는 디코드 실패 시 "원본 저장, 썸네일
   없음"으로 넘어간다. HEIC에서 그렇게 하면 **EXIF가 살아있는 원본이 저장**된다(REQ §1.2-3).
   HEIC 경로만 **fail-closed**: 실패하면 저장하지 않고 E5042로 거절한다.
   `sharp` 자체가 없는 환경(lazy-load 실패)에서도 HEIC는 **거절**한다.
3. **워커 스레드.** `worker_threads` 풀 크기 2(4 vCPU의 절반), 초과 요청은 큐 대기, 장당
   타임아웃 15초. 워커는 프로세스 수명 동안 재사용해 WASM 힙 재할당을 피한다(§1 평탄화 근거).
   워커 2개 × 약 300MB = 최대 600MB 상주 → 32GB 호스트에서 안전.

### 2.2 실패를 보이게 (FR-5)

| 경로 | 지금 | 변경 후 |
|---|---|---|
| 위젯 업로드 | 확장자 거절 토스트 | 변환 실패 시 사유 있는 토스트 + 재시도 |
| 콘솔 업로드 | 동일 | 동일 |
| 외부 메신저 인바운드 | `warn` 한 줄, 화면엔 아무것도 없음 | 대화에 **system 메시지 1건** 기록 |

> ⚠️ 부수영향(§5-4): `system` 메시지는 아웃박스 필터(`senderType !== USER` && 인바운드 매핑
> 없음)를 통과하므로 **고객 채널로도 발신된다.** 이건 막을 게 아니라 살릴 지점이다 —
> 문구를 상담원 메모가 아니라 **고객이 읽고 다시 보낼 수 있는 안내**로 쓰고
> `session.language`로 현지화한다. "조용한 손실 금지"의 완성형.

### 2.3 신규 에러코드

| 코드 | 상수 | 의미 |
|---|---|---|
| `E5042` | `ATTACHMENT_DECODE_FAILED` | 이미지 디코드/변환 실패 (손상·미지원 코덱·타임아웃) |
| `E5043` | `ATTACHMENT_PIXELS_EXCEEDED` | 픽셀 수 상한(50MP) 초과 |

(E5035~E5041이 첨부 블록으로 이미 할당돼 있어 그 뒤를 잇는다 — dev-kit §2.4 순차 할당.)

---

## 3. 단계 계획 (WBS)

| 단계 | 내용 | 주요 파일 | 크기 |
|---|---|---|---|
| **W1** | 타입 정책 개방 — heic/heif/avif 스펙 + ftyp brand sniff, 에러코드 2종 | `attachment/file-type.util.ts`, `global/constant/error-code.constant.ts` | S |
| **W2** | 디코드 서비스 — `image-decode.service.ts` + `heic-decode.worker.js`(워커 풀 2, 타임아웃 15초, 픽셀 상한 50MP), `libheif-js` 의존성 추가 | `attachment/` 신규 2파일, `apps/api/package.json` | M |
| **W3** | 저장 경로 통합 — `processImage` heic 분기, 변환 후 ext/mime/size/checksum 재기술, HEIC fail-closed | `attachment/attachment.service.ts` | M |
| **W4** | 클라이언트 개방 — 화이트리스트·`accept` 4곳 + 변환 실패/처리 중 문구 i18n(en/es/ko × 2앱) | `widget/hooks/useAttachmentUpload.ts:10`, `widget/components/chat/ChatTab.tsx:553`, `web/domain/live-chat/useAgentUpload.ts:9`, `web/domain/live-chat/LiveChatPage.tsx:650`, `widget/i18n/locales/{en,es,ko}.ts`, `web/i18n/locales/{en,es,ko}/livechat.json` | S |
| **W5** | 인바운드 실패 가시화 — `storeInboundAttachments` catch에서 system 메시지 기록(언어별 문구) | `messenger/messenger-ingest.service.ts:254` | S |
| **W6** | 계측 — 확장자별 거절/변환 소요시간 로그(`attachment.convert` 라인), 4xx 침묵 보완 | `attachment.service.ts`, `attachment.controller.ts` | S |
| **W7** | 테스트 + 문서 — 단위/통합(§6), TCR, RPT | `*.spec.ts`, `docs/test/`, `docs/implementation/` | M |

W1~W3이 서버 코어(하나의 PR), W4~W6이 표면(같은 PR로 묶어도 되지만 리뷰 단위는 분리), W7은 마감.
**전체 1 PR 권장** — 부분 배포하면 "클라이언트는 열렸는데 서버가 못 받는" 조합이 생긴다.

---

## 4. 와이어프레임 (UI 변경분)

### 4.1 위젯 — 업로드 후 "처리 중" 상태 (신규)

지금은 업로드 진행바가 100%가 되면 바로 전송 가능 상태다. HEIC는 업로드가 끝난 뒤 **서버에서
1초 내외 변환**이 더 걸리므로, 진행바가 100%에서 멈춰 있으면 고장으로 보인다. 100% 이후를
"처리 중"으로 구분해 보여준다.

```
┌──────────────────────────────── 위젯(380px) ─┐
│ ...대화 내용...                              │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ [🖼] IMG_0001.HEIC                       │ │
│ │      ████████████████████████ 100%       │ │  ← 업로드 완료
│ │      처리 중…                            │ │  ← ★신규 (변환 대기)
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ [📎] [메시지를 입력하세요        ] [전송]│ │  ← 전송 버튼 비활성(처리 중)
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### 4.2 위젯/콘솔 — 변환 실패 (신규 문구)

```
┌──────────────────────────────── 위젯(380px) ─┐
│ ┌──────────────────────────────────────────┐ │
│ │ [!] IMG_0001.HEIC                        │ │  ← 붉은 테두리(기존 error 스타일 재사용)
│ │     이 사진은 처리할 수 없습니다.        │ │
│ │     JPEG로 다시 보내주세요.        [ x ] │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```
기존 `pending` 항목의 에러 스타일(`border-red-300 bg-red-50`)을 그대로 쓰고 문구만 신규
(`chat.attachment.convertFailed`). 콘솔도 동일 구조, `livechat:attachment.convertFailed`.

### 4.3 콘솔 대화방 — 인바운드 변환 실패 자리표시 (신규)

```
┌───────────────────────── 라이브챗 대화방 ─────────────────────────┐
│                                                                   │
│  ┌────────────────────────────┐                                   │
│  │ 반품하고 싶어요             │  09:12   ← 고객(텔레그램)          │
│  └────────────────────────────┘                                   │
│                                                                   │
│            ┌─────────────────────────────────────────┐            │
│            │ ⚠ 고객이 보낸 사진을 열 수 없었습니다.  │  09:12     │
│            │   (지원하지 않는 형식 · IMG_0001.HEIC)  │            │
│            └─────────────────────────────────────────┘            │
│              ↑ system 메시지 — 기존 system 스타일 재사용           │
│                (LiveChatPage.tsx:535 분기)                        │
│                                                                   │
│  · 같은 문구가 고객 채널로도 발신된다(§2.2) → 고객 대상 표현:      │
│    "사진을 열 수 없었습니다. JPEG로 다시 보내주시겠어요?"          │
└───────────────────────────────────────────────────────────────────┘
```

성공 경로(HEIC가 정상 변환된 경우)는 **화면 변화가 없다** — 기존 썸네일·라이트박스가
그대로 동작한다. 그게 이 계획의 목표다.

---

## 5. 부수영향 분석

| # | 영역 | 영향 | 대응 |
|---|---|---|---|
| 1 | 기존 jpg/png/gif/webp 업로드 | `store()`의 ext/mime 재기술 리팩터가 **모든 이미지 경로를 지나간다** | 기존 4포맷 회귀 테스트를 W3 착수 전에 먼저 고정(§6 U-5) |
| 2 | 애니메이션 GIF | 현재 "재인코딩 안 함" 예외가 같은 분기 안에 있음 | 분기 재작성 시 GIF 예외 보존 확인(U-6) |
| 3 | 서명 URL / 다운로드 라우트 | 저장 mime이 `image/jpeg`로 바뀌므로 replay 헤더도 jpeg | 일관됨. 별도 작업 없음 |
| 4 | 아웃박스(외부 채널 발신) | system 메시지가 고객에게도 나간다(§2.2) | 문구를 고객용으로 작성 + 현지화. 의도된 동작으로 확정 |
| 5 | 외부 채널로 보내는 첨부 | 변환 결과가 JPEG이므로 텔레그램/Gmail 호환성은 **개선** | 없음 |
| 6 | 리텐션·테넌트 삭제·DSAR | 파일 경로 규칙 불변(`{tenant}/{YYYYMM}/{uuid}.{ext}`) | 영향 없음 |
| 7 | DB 스키마 | 원본 포맷을 별도 컬럼에 남기지 **않기로 결정**(Q-1) | **스키마 변경 없음 → SQL 선적용 불필요.** PR에 Migration 섹션 불필요 |
| 8 | 위젯 번들 | 변환은 서버에서만 → 번들 증가 **0** | 빌드 후 크기 확인만 |
| 9 | API 이미지 크기 | `libheif-js` 6.1MB 추가 | 수용 |
| 10 | API 메모리 | 워커 2개 상주 시 최대 +600MB(§1) | 호스트 32GB, 현재 사용 3.3GB → 여유. 단 컨테이너 메모리 제한이 없는 상태이므로 **모니터링 항목으로 등록** |
| 11 | nginx `client_max_body_size 25m` | 변경 없음 | 없음 |
| 12 | 이미지 모더레이션 | 범위 밖(원래 없음) | 변화 없음 |
| 13 | 프로덕션 | 아직 미배포 — 이번 작업은 staging 기준 | 프로덕션 배포 시 §7 동일 절차 |

---

## 6. 테스트 개요 (상세는 TCR에서)

**단위**
- U-1 `resolveType`: `ftyp heic/heix/mif1/avif` brand 수용, 위장 파일(확장자 heic + PNG 바이트) 거절
- U-2 픽셀 상한: 50MP 초과 → E5043
- U-3 디코드 실패 → E5042, **파일이 디스크에 남지 않음**
- U-4 변환 결과: 저장 ext `jpg`, mime `image/jpeg`, checksum이 변환본 기준
- U-5 회귀: jpg/png/webp 기존 경로 불변
- U-6 회귀: 애니메이션 GIF 원본 보존
- U-7 워커 타임아웃 → E5042(무한 대기 없음)
- U-8 sharp 부재 시 HEIC 거절(fail-closed), 그러나 기존 포맷은 기존대로 동작

**통합**
- I-1 위젯 업로드 → 전송 → 위젯·콘솔 양쪽 썸네일
- I-2 콘솔 업로드 → 위젯 표시 → 외부 채널 발신
- I-3 인바운드(HEIC) → 변환 성공 → 콘솔 표시
- I-4 인바운드(손상 HEIC) → system 메시지 기록 + 고객 채널 안내 발신
- I-5 **EXIF 검증**: GPS EXIF가 박힌 HEIC 업로드 → 저장본 `exif:false`(스파이크에서 이미 확인, 회귀 고정)

**스모크(스테이징)**
- S-1 실제 아이폰에서 위젯 첨부(파일 앱 경유 .heic) → 콘솔 표시
- S-2 변환 소요시간이 로그 계측(W6)에 남는가
- S-3 5장 동시 업로드 시 API 응답성(다른 API가 막히지 않는가) ← 워커 스레드 검증의 핵심
- S-4 재배포 후에도 변환본 유지(볼륨, S-10 재확인)
- **T-1(REQ)** iOS 경로별 실제 업로드 포맷 매트릭스 — 실기기 필요, 사용자 확인 요청

---

## 7. 배포 계획

- **스키마 변경 없음**(§5-7) → SQL 선적용 불필요, PR에 Migration 섹션 불필요
- 배포 순서: main 머지 → `deploy-staging.sh`(api/web/widget 재생성)
- 배포 확인: 부팅 로그 `Nest application successfully started` + 컨테이너 STATUS + HEIC 업로드 1건
- **롤백**: env `ATTACHMENT_ALLOW_HEIC=false`(기본 true) 한 줄로 화이트리스트를 되돌린다.
  코드 롤백 없이 기능만 끌 수 있어야 한다(REQ C-8). 변환 실패가 급증하거나 메모리가 튀면 즉시 사용
- 리스크가 남는 지점: **동시 변환 부하**. S-3에서 확인하고, 부족하면 워커 풀 크기를
  env(`HEIC_WORKERS`, 기본 2)로 조정

---

## 8. 승인 요청

| 확인 항목 | 계획값 |
|---|---|
| 구현 방식 | 안 A(WASM 디코드) + 워커 스레드 2 |
| 변환 정책 | HEIC/HEIF → JPEG q82 저장, 원본 미보관, 파일명 `.jpg` 통일 |
| 상한 | 용량 10MB(기존) + **픽셀 50MP**(신규) |
| 실패 정책 | HEIC는 fail-closed(저장 안 함) + 사용자에게 보이는 실패 |
| 인바운드 실패 | system 메시지 기록 **및 고객 채널로 안내 발신** |
| AVIF | 함께 개방(추가 비용 0) |
| 배포 | 스키마 변경 없음, env 플래그로 롤백 |

위 내용으로 **W1~W7 구현 착수 승인**을 요청합니다. (승인 전 구현 착수 없음 — CLAUDE.md §7)

---

## 9. 관련 문서

- `docs/analysis/REQ-260817-HEIC-Attachment-Support.md` — 본 계획의 요구
- `docs/plan/PLN-260814-Chat-Attachments.md` — §5 타입 정책, §7 SI-10(EXIF), SI-1(빈 본문 아웃박스)
- `docs/implementation/RPT-260814-Chat-Attachments.md` — §8 R-6(출처), §9 예방 패턴
