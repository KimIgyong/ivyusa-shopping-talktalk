# RPT-260826-Relay-Source-Labeling

btbz 릴레이 출처 표기 — 구현·백필 결과

- 완료일: 2026-08-26
- 선행: [REQ](../analysis/REQ-260826-Relay-Source-Labeling.md) · [PLN](../plan/PLN-260826-Relay-Source-Labeling.md)

## 1. 배포 상태

| PR | 내용 | 커밋 | 스테이징 |
|---|---|---|---|
| #399 | 매핑 8종 확장 + `wechat` 콘솔 등록 + 백필 스크립트 | `8b24f1c` | ✅ 2026-08-26 |

**스키마 변경 없음.** 백필은 데이터 마이그레이션이며 **스테이징 실행 완료**(아래).
프로덕션 미적용.

## 2. 무엇이 문제였나

파이프라인·저장소·콘솔 뱃지는 이미 다 있었고, **어댑터의 매핑 표가 2종만** 알고 있었습니다.
릴레이 실호출 결과 채널 유형은 **8종**이었습니다(대화 165건 표본).

```
relay_kakao_pc 63 · relay_sms 54 │ relay_zalo 18 · relay_line 9 · relay_wechat 9
                                 │ relay_viber 6 · relay_telegram 3 · relay_whatsapp 3
      우리가 아는 2종                     나머지 6종 = 전부 'relay' (표본의 29%)
```

## 3. 구현

- **세그먼트 단위 대조**로 매핑합니다(접두사 제거 후 통과 아님). `relay_kakaostory`는
  `relay`로 남습니다 — `includes('kakao')`였다면 카카오스토리를 카카오톡으로 집어삼켰을
  것이고, 이는 `fulfil`이 `Unfulfilled`에 걸리던 함정과 같은 모양입니다.
- **모르는 값은 `relay` 유지 + 값마다 한 번 경고 로그.** 남의 뱃지를 빌려 쓰는 것보다
  모호한 편이 낫지만, 전에는 릴레이에 채널이 추가돼도 **아무것도 실패하지 않아서** 보이지
  않았습니다.
- `wechat`만 콘솔에 없어서 색상·필터·6개 언어 라벨(ko=위챗)을 등록했습니다.

## 4. 백필 결과 (스테이징 실행)

```
node apps/api/dist/database/backfill-relay-subchannel.js [--dry-run]
```

| 항목 | 값 |
|---|---|
| 실행 | 2026-08-26 (dry-run → 본실행) |
| 대상 | `sub_channel='relay'` 스레드 **32건** |
| 갱신 | **32건** (thread + conversation + session 동반) |
| 미매핑 잔여 | 0 |
| 릴레이가 모르는 대화 | 0 |
| 재실행(멱등) | 대상 0건 |

**적용 후 분포**

```
channel_threads   kakao 44 · sms 36 · zalo 12 · line 6 · wechat 6 · viber 4 · telegram 2 · whatsapp 2
conversations     widget 239 · kakao 60 · sms 47 · zalo 12 · line 6 · wechat 6 · viber 4 · telegram 2 · whatsapp 2
sessions          (conversations와 동일하게 이동 확인)
```

`relay`는 **0건**이 됐습니다.

## 5. 검증

| # | 항목 | 결과 |
|---|---|---|
| R1 | 8종 매핑 | ✅ 단위 테스트 |
| R2 | 모르는 유형 → relay + 경고 1회 | ✅ |
| R3 | 세그먼트 대조(`relay_kakaostory` → relay) | ✅ |
| R4 | dry-run 무쓰기 | ✅ 32건 예고, 변경 없음 |
| R5 | 본실행 3개 테이블 동반 갱신 | ✅ |
| R6 | 재실행 멱등 | ✅ 대상 0 |
| R7 | 콘솔 번들에 위챗 라벨 | ✅ `index-BnB9fFyU.js` |
| R8 | 6개 언어 | ✅ `i18n:check` |
| — | 단위 156 suites / **1,658 tests** | ✅ |

## 6. 잔여

| # | 항목 |
|---|---|
| R-1 | 콘솔 육안 확인 — 뱃지 색상 8종 + 채널 필터에 위챗 |
| R-2 | 프로덕션 배포 후 같은 백필 1회 필요 |
| R-3 | 기기 출처(`device_label`·`own_msisdn`) 표기는 합의대로 범위 밖 |
| R-4 | 통계 비교 시 주의 — 채널별 과거 수치가 이 시점부터 정확해집니다(더 맞는 방향) |
