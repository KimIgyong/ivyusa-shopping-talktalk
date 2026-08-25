# TCR-260824-AI-Usage-And-Settings-Split

AI 사용량 계측 + 설정 6분할 — 테스트 케이스

- 근거: `REQ-260824-AI-Usage-And-Settings-Split` / `PLN-260824-AI-Usage-And-Settings-Split`
- 대상: PR #364(A 계측, `cffc083`) · PR #365(B 분할, `f3dd467`)

## 1. 단위 테스트 (자동, 1,716건 전체 통과)

### 1-1. 사용량 기록 (`ai-usage.service.spec.ts`, 8건)
| ID | 케이스 | 기대 |
|---|---|---|
| U-1 | 같은 날 두 번째 호출 | `ON DUPLICATE KEY UPDATE`로 **누적**(`calls = calls + 1`). 읽고-쓰면 같은 초에 끝난 두 대화 중 하나가 사라진다 |
| U-2 | `feature` 미지정 | function 이름으로 기록 — 버리지 않는다 |
| U-3 | stub 폴백 | `stub_calls`·`failures` 각 1, 토큰 0 |
| U-4 | 기간 합산 | 일별 행을 더해 주·월을 만든다(별도 테이블 없음) |
| U-5 | 청구 주체 분리 | tenant 100 / platform 40 — **합산하지 않는다** |
| U-6 | 계측 이전 기간 조회 | `since`로 집계 시작일 반환 |
| U-7 | 삭제된 엔진의 과거 사용량 | `engine_id` NULL이어도 provider/model로 조회됨 |
| U-8 | `ownerOf` | null → platform, 숫자 → tenant |

### 1-2. 메뉴 권한 (`menu-access.spec.ts`)
| ID | 케이스 | 기대 |
|---|---|---|
| M-1 | 전수 `Record<MenuCode,…>` 픽스처 | 새 코드 6개를 요구 — **타입 시스템이 누락을 컴파일 에러로 잡았다** |
| M-2 | 6개 화면의 capability | 기존 `settings`를 그대로 상속 — 분할로 누가 더 보거나 덜 보지 않는다 |

## 2. 배포 검증 (스테이징, 2026-08-24)

### 2-1. A 계측 (PR #364)
| ID | 확인 | 결과 |
|---|---|---|
| S-1 | **SQL 선적용** | `ai_usage_daily` 생성 후 코드 배포 — 순서 준수 |
| S-2 | 컬럼 | 16개, 유니크 `uk_ai_usage`, 조회 인덱스 |
| S-3 | 부팅·라우트 | `successfully started`, `/tenants/me/ai-engines/usage` 401 |
| S-4 | **실제 대화로 계측** | go2joy 위젯에 실제 질문 → 3개 feature 행 생성 |
| S-5 | 기능 분리 | `chat_answer`(rag) · `chat_rewrite`(chat) · `moderation` |
| S-6 | 청구 주체 | 전부 `engine_owner=tenant` — go2joy 자기 엔진 |
| S-7 | 토큰 누적 | 재질문 시 같은 행에 `calls` 증가(3회 누적 확인) |

### 2-2. 계측이 즉시 잡아낸 결함 2건 ⚠️
첫 호출에서 **`stub_calls=1`**이 함께 찍혔습니다. 응답은 왔지만 실제로는 stub이 답한 것이었고,
계측이 없었다면 그럴듯한 답변을 보고 정상으로 넘어갔을 상황입니다.

| ID | 결함 | 원인 | 조치 |
|---|---|---|---|
| S-8 | `Failed to parse URL from go2joy` | 엔진 행의 `endpoint`에 `go2joy`가 들어가 있었음(직접 INSERT 시 발생) | `endpoint=NULL`로 정정 |
| S-9 | `Anthropic API error 401` | 저장된 키가 10자짜리 비밀번호 형태로 바뀌어 있었음(암호문 136→38바이트) | 키 재저장, 원인은 §2-4 |
| S-10 | 정정 후 재확인 | 실제 Claude 응답, 최근 60초 **폴백 0건** | — |

### 2-3. B 분할 (PR #365)
| ID | 확인 | 결과 |
|---|---|---|
| S-11 | 배포 전 저장 예외 재확인 | `tenant_menus`/`tenant_role_menus`/`tenant_user_menus` 모두 **0건** — 이관 불필요 |
| S-12 | API가 새 코드를 아는가 | `menu.types.js`에 `settings_basic/widget/platforms/marketing/messengers/etc` |
| S-13 | 콘솔 청크 | 6개 페이지 + 리다이렉트용 `SettingsPage` |
| S-14 | 부팅·컨테이너 age | healthy, 11초 |

### 2-4. 자동완성 결함 (PR #365에서 수정)
AI 엔진 API 키 입력란에 `autoComplete="off"`가 없었습니다. 바로 옆 자격증명 다이얼로그는
이미 그 가드를 갖고 있었습니다. 비밀번호 관리자가 콘솔 로그인을 제안하고 그대로 저장되면
**동작하던 프로바이더 키가 로그인 값으로 교체**되며, 증상은 몇 시간 뒤의 401뿐입니다.
S-9의 가장 유력한 설명입니다.

## 3. 수동 스모크 (남음 — 사람 필요)

| ID | 시나리오 | 확인할 것 |
|---|---|---|
| H-1 | `/settings` 진입 | `/settings/basic`으로 리다이렉트되는지 |
| H-2 | 좌측 메뉴 | **설정 1줄**만 있는지(#367로 변경) |
| H-2b | 설정 탭 7개 | 좁은 화면에서 가로 스크롤되는지, 권한 없는 탭이 **자리도 없이** 빠지는지 |
| H-2c | `/privacy-notice` 북마크 | `/settings/privacy`로 넘어가는지 |
| H-3 | 6개 페이지 각각 | 옮겨온 카드가 이전과 동일하게 저장되는지 |
| H-4 | AI 사용량 카드 | 기간 프리셋 5종 · 집계축 4종 전환 |
| H-5 | 집계 시작일 문구 | 계측 이전 기간 선택 시 "그 이전은 측정되지 않았습니다" |
| H-6 | stub 경고 | 폴백이 있던 기간에 경고 줄이 뜨는지 |
| H-7 | 자체 개발 연동 | 웹훅 주소 복사, 시크릿 저장, 교체 경고 문구 |
| H-8 | AI 키 입력란 | 비밀번호 관리자가 더 이상 자동완성하지 않는지 |
| H-9 | 6개 언어 | 신규 문구가 각 언어로(vi/ja/zh는 β) |

## 4. 잔여
- **R1.** §3 전체(콘솔 실화면).
- **R2.** 계측은 **2026-08-24부터** 데이터가 존재합니다. 그 이전 사용량은 없습니다(소급 불가).
- ~~**R3.**~~ 메뉴 구조 — **해소(2026-08-25, #367)**: 평면 6줄 → 메뉴 1줄 + 탭 7개.
  배포본 검증: 메뉴 번들에 하위 코드 없음, 레이아웃 청크에 `settings_*` 6개 유지(탭별 권한 판정 살아 있음),
  탭 경로 7개(`privacy` 포함).
