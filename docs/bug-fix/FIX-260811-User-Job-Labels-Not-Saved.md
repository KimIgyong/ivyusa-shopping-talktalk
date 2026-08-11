# FIX-260811 — 사용자 직무라벨이 "저장 안 됨"으로 보이는 버그

- 증상: `/users` 편집에서 직무라벨을 체크·저장해도 목록/편집에 반영 안 됨. 여러 번 재현.
- 영향: 모든 테넌트의 모든 사용자 — labelCodes가 항상 빈 배열로 조회됨.

## 근본 원인 (증상 아닌 원인)
라이브 로그로 확정:
```
[UserService] updateLabels tenant=1 user=2 codes=[consult]
[HTTP] PATCH /api/v1/users/2/labels -> 200
```
→ **쓰기는 정상**(요청 도달·200·코드 `consult` 수신, DB `user_job_labels`에 (2,1) 존재 확인). 그런데 `GET /users` 응답은 `labelCodes: []`.

**bigint-PK-as-string 함정**: `JobLabel.id`는 `@PrimaryGeneratedColumn({type:'bigint'})` — TypeORM이 **문자열 "1"** 로 돌려줌(`@PrimaryGeneratedColumn`은 transformer 미지원). 반면 `UserJobLabel.jobLabelId`는 `bigintTransformer` 적용 → **숫자 1**. `loadLabelCodes`가
```
const codeById = new Map(labels.map((l) => [l.id, l.code]));  // key "1"(string)
const code = codeById.get(link.jobLabelId);                    // get 1(number) → undefined
```
로 조인 → 항상 미스 → 모든 코드 유실 → `labelCodes: []`.

## 수정 (최소·정확)
`loadLabelCodes`의 조인 키를 양쪽 `String()` 정규화 (`apps/api/src/domain/user/user.service.ts`):
```
const codeById = new Map(labels.map((l) => [String(l.id), l.code]));
const code = codeById.get(String(link.jobLabelId));
```
`JobLabel.id`에 transformer를 다는 건 `@PrimaryGeneratedColumn`이 거부 → 스키마의 다른 bigint PK와 동일하게 두고, 조인부에서 정규화. 엔티티에는 함정 주석 추가.

## 예방 패턴 (일반화 → 메모리)
**bigint PK(문자열)와 transformer 적용 FK(숫자)를 Map/Set/비교로 조인할 땐 반드시 양쪽을 `String()` 정규화**하라. 타입은 `number`라 컴파일은 통과하지만 런타임 표현이 갈려 조용히 미스한다. 테스트 픽스처도 실제(문자열) id를 써야 잡힌다 → 회귀 테스트 `user.service.labels.spec.ts`(JobLabel.id='1' string, jobLabelId=1 number → labelCodes=['consult']).

## 검증
- 회귀 테스트 2건 통과(수정 없으면 첫 케이스 실패).
- 배포 후 실사용자(id 2) 편집→라벨 체크→저장→목록 반영 확인 예정.
- PR #TBD, staging 배포.
