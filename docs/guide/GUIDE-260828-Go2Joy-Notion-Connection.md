# GUIDE-260828 go2joy 노션 지식 연동 — 페이지 공유 요청 안내 (KO/VI)

- 대상: go2joy 노션 워크스페이스 관리자 (통합 "Truc connection" 소유자)
- 근거: `docs/analysis/REQ-260828-Go2Joy-Notion-KB-Analysis.md` §9
- 목적: 노션 페이지를 ShopTalk 지식으로 등록하기 위한 **go2joy 측 1가지 조치**(페이지에 통합 연결) 요청과, 완료 후 진행 절차·제약 안내

---

## 1. 현재 상황 / Tình trạng hiện tại

**KO** — 노션 연동에 필요한 요소는 이미 준비되어 있습니다.

| 항목 | 상태 |
|---|---|
| 노션 통합 토큰("Truc connection") 등록 | ✅ 완료 — 토큰 유효 확인됨 |
| 지식 소스 등록 (대상: "Hướng dẫn sử dụng Hotel Admin" 페이지) | ✅ 완료 |
| 데이터 가져오기(동기화) | ❌ **실패** — 8/28 시도 |

실패 원인은 시스템 문제가 아니라, **노션에서 해당 페이지가 통합 "Truc connection"에 공유(연결)되어 있지 않기 때문**입니다. Notion API가 다음 오류를 반환했습니다:

> Could not find page with ID: 8968fee0-…. Make sure the relevant pages and databases are **shared with your integration "Truc connection"**.

**VI** — Các bước cấu hình phía ShopTalk đã hoàn tất (token hợp lệ, nguồn tri thức đã đăng ký). Đồng bộ thất bại vì **trang Notion chưa được kết nối (share) với integration "Truc connection"**. Đây là thao tác chỉ thực hiện được từ phía quản trị Notion của go2joy.

---

## 2. 요청 사항 — 노션에서 페이지에 통합 연결 / Việc cần làm trên Notion

⏱ 소요 약 1분, 노션 화면에서만 진행합니다. / Chỉ mất ~1 phút, thao tác ngay trong Notion.

**KO**
1. 노션에서 대상 페이지 **"Hướng dẫn sử dụng Hotel Admin"** 을 엽니다.
2. 페이지 **우측 상단의 `⋯`(더보기) 메뉴**를 클릭합니다.
3. 메뉴 아래쪽의 **`연결(Connections)`** 항목으로 이동합니다.
4. 검색란에 **`Truc connection`** 을 입력해 선택하고, 액세스 허용을 **확인**합니다.
5. 완료되면 `⋯ → 연결` 목록에 "Truc connection"이 표시됩니다.

**VI**
1. Mở trang **"Hướng dẫn sử dụng Hotel Admin"** trong Notion.
2. Bấm menu **`⋯` ở góc trên bên phải** của trang.
3. Chọn mục **`Connections`** (Kết nối) ở phần dưới của menu.
4. Gõ tìm **`Truc connection`**, chọn nó và **xác nhận** cấp quyền truy cập.
5. Sau khi xong, "Truc connection" sẽ hiển thị trong danh sách `⋯ → Connections` của trang.

> 📌 **하위 페이지는 자동 상속됩니다** — 이 페이지 아래에 있는 하위 페이지들은 별도 연결이 필요 없습니다.
> 📌 Các trang con bên trong sẽ **tự động kế thừa** quyền — không cần kết nối từng trang con.

### 함께 확인해 주세요 / Vui lòng kiểm tra thêm

- **워크스페이스 일치**: 통합 "Truc connection"이 설치된 워크스페이스와 이 페이지가 있는 워크스페이스가 **같아야** 합니다. 페이지가 다른 워크스페이스에 있다면, 그 워크스페이스에서 통합을 새로 만들고 새 토큰을 저희에게 전달해 주세요.
  / Integration và trang phải nằm **cùng một workspace**. Nếu khác workspace, cần tạo integration trong workspace đó và gửi lại token mới cho chúng tôi.
- **통합 권한**: notion.so/my-integrations 에서 "Truc connection"의 Capabilities에 **Read content**가 켜져 있는지 확인해 주세요(쓰기 권한은 불필요 — 저희는 읽기만 합니다).
  / Trong phần Capabilities của integration, **Read content** phải được bật (không cần quyền ghi — hệ thống chỉ đọc).

---

## 3. 완료 후 진행 절차 / Sau khi hoàn tất

**KO** — 연결 완료를 알려주시면 저희가 순서대로 진행·확인합니다.
1. 콘솔에서 대상 도달 테스트 → **재동기화 실행** (go2joy 측 추가 작업 없음)
2. 페이지 본문이 지식 문서로 등록되고 자동으로 검색 색인(임베딩)됩니다.
3. go2joy 챗위젯에서 해당 내용 질문 시 **답변에 근거로 인용**되는 것까지 확인 후 결과를 회신드립니다.

**VI** — Sau khi kết nối xong, vui lòng báo cho chúng tôi. Chúng tôi sẽ chạy lại đồng bộ, nội dung trang sẽ được đăng ký làm tri thức và AI của widget sẽ trích dẫn khi khách hỏi. Không cần thao tác gì thêm từ phía go2joy.

---

## 4. 수집 범위와 제약 — 미리 알아두실 사항 / Phạm vi thu thập & giới hạn

| 항목 / Mục | 내용 / Nội dung |
|---|---|
| 수집 범위 / Phạm vi | 대상 페이지 **본문 + 바로 아래 1단계 하위 페이지**. 더 깊은 중첩(하위의 하위)은 수집되지 않음 / Trang chính + **các trang con cấp 1**; trang lồng sâu hơn sẽ không được thu thập |
| 권장 구조 / Cấu trúc khuyến nghị | 깊은 중첩 구조라면 1단계로 펼치거나, 항목이 많으면 **노션 데이터베이스**(행별 1문서로 수집) 사용 권장 / Nếu cấu trúc sâu, nên trải phẳng 1 cấp hoặc dùng **Notion database** (mỗi hàng = 1 tài liệu) |
| 텍스트만 수집 / Chỉ văn bản | 문단·제목·리스트·토글·표·코드 등 텍스트는 수집. **이미지·첨부파일·임베드는 수집되지 않음** / Hình ảnh, tệp đính kèm, embed **không** được thu thập |
| 분량 한도 / Giới hạn | 1회 동기화 최대 200페이지, 페이지당 본문 약 30,000자 / Tối đa 200 trang mỗi lần đồng bộ, ~30.000 ký tự mỗi trang |
| 수정 반영 / Cập nhật | 노션에서 내용을 수정해도 **자동 반영되지 않음** — 수정 후 알려주시면 재동기화합니다(변경분만 갱신) / Chỉnh sửa trên Notion **không tự động** cập nhật — vui lòng báo để chúng tôi đồng bộ lại |
| 페이지 삭제 시 / Khi xóa trang | 지식에서 삭제되지 않고 **노출 중지(숨김)** 처리 — 실수 삭제에도 안전 / Trang bị xóa sẽ được **ẩn** khỏi tri thức, không bị xóa vĩnh viễn |
| 보안 / Bảo mật | 토큰은 암호화 저장, 읽기 전용 접근. 연결한 페이지(및 그 하위)만 접근 가능 — 워크스페이스의 다른 페이지는 볼 수 없음 / Token được mã hóa, chỉ đọc; hệ thống chỉ truy cập được trang đã kết nối và trang con của nó |

---

## 5. 회신 요청 / Phản hồi cần thiết

**KO** — 아래 2가지를 회신해 주세요.
1. ✅ "Truc connection" 연결 완료 여부 (완료 시 `⋯ → 연결` 목록 스크린샷 1장이면 확인이 빠릅니다)
2. 대상 페이지의 워크스페이스가 통합 설치 워크스페이스와 같은지 여부

**VI** — Vui lòng phản hồi: ① đã thêm "Truc connection" vào Connections của trang (kèm 1 ảnh chụp màn hình danh sách Connections nếu có thể), ② trang có nằm cùng workspace với integration hay không.

문의: ShopTalk 운영팀 (기존 연락 채널) / Liên hệ: đội vận hành ShopTalk (kênh liên lạc hiện có).
