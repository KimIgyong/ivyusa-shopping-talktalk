# RPT-260814-KSR-Provider-Signed-Client

KSR(btbz-messenger relay) provider API v1을 HMAC 서명으로 소비하는 ShopTalk 클라이언트 구현 결과.

- 근거: REQ/PLN-260814 (2026-08-14 권장안 D1a·D2a·D3 승인) · 테스트: TCR-260814
- **PR #285** squash-merge → main `bbf674d`, staging 2026-08-14 배포 (부트 정상·에러 0)
- **스키마 변경 없음**. 서명 규격 컨포먼스(T1~T9, 함정 2종)는 8/14 사전 검증 완료

## 1. 무엇이 생겼나
| 항목 | 구현 |
|---|---|
| 서명 유틸 | `ksr-signature.util.ts` — canonical(`METHOD\n경로+쿼리 보낸 그대로\nts\nnonce\nsha256hex(body)`) + `v1=`HMAC-SHA256. **함정 2종을 테스트로 고정**(경로 재정렬·프리픽스 제거 = 다른 서명 / hex 64자 소문자). 헤더는 시도마다 신규 발급 — 재시도 재서명(논스 재사용 409 방지) |
| 어댑터 서명 모드 | `key_id`+`api_secret` 설정 시 읽기가 `/api/provider/v1`로 전환: `test()`=instance+**Expected-Customer 바인딩 검증**(E5101 명시)+회신 경로 프로브 · `pull()`=**채널 단위 `messages?since_id=` 증분 커서**(N+1·워터마크·타임스탬프 함정 소멸, truncated=갭 로깅, 행 단위 customerRef 불일치 시 pull 중단) · `confirm()`=`commands/:id` 단건 |
| 하이브리드(D1a) | 회신은 기존 운영자 계정 유지 — provider 표면에 쓰기 라우트가 아직 없음. 키 미설정 채널은 레거시 경로 무변경(D2a, 채널1 무중단) |
| 콘솔 | btbz_relay 채널 폼에 key_id/api_secret/expected_customer 3필드(MESSENGER_FIELDS 선언 + i18n en/es/ko) |
| 에러 문구 | E1101/1102/1103→credentials, E1104→시계 스큐, E5101→인스턴스 오지정, E5109→delivery 미활성 — 각각 조치처를 명시([[fail-classification-copy]]) |

## 2. 검증
- 단위 1,136/1,136(신규 14: 스펙 예시 벡터 포함) · 로컬 실통합(relay :8099): 연결+바인딩, 실데이터 7건 수신, 커서 증분(2차 0건), 커맨드 404=failed, E5101 명시 실패
- 스테이징: 배포·부트 정상, 메신저 sync/outbox 워커 가동, 에러 0 — **레거시 채널1 무회귀(S1) 확인**
- 발견 절차: consumer 키 발급 후 **provider delivery enable 필수**(E5109 게이트) — 운영 절차에 포함됨

## 3. 남은 일 (사용자/relay 측)
1. **스테이징 relay(127.0.0.1:8091) 관리자 로그인** — 기본 시드 비밀번호가 아님(변경돼 있음) → 사용자 확인 필요
2. relay 콘솔에서 consumer `shoptalk` 프로비저닝 확인 → 키 발급(read 3권한) → delivery enable
3. ShopTalk 콘솔 채널1(또는 복제 채널)에 key_id/secret(+expected_customer) 입력 → 연결 테스트 → 서명 모드 pull 검증(TCR §3 S2~S4)
4. (후속) KSR `send:replies` 라우트 공개 시 회신도 서명 전환 — 하이브리드 해소

## 4. 예방 패턴
- 외부 API의 열거값(origin 등)이 개방형이면 닫힌 맵 대신 부분일치+가시적 폴백('relay') — 미지 값이 조용히 오분류되지 않게.
- 서명 API 클라이언트는 **헤더 발급을 요청 함수 안에** 두어 재시도가 구조적으로 재서명되게 한다 — 밖에서 만들어 넘기면 재시도 409가 시한폭탄이 된다.
