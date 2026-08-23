# Widget trò chuyện·hỗ trợ khách hàng ShopTalk — Sổ tay người dùng (tổng hợp)

> Phiên bản 2.0.0 · Bản đầu 2026-07-01 · **Sửa đổi toàn diện 2026-08-24** (dựa trên mã nguồn)
> Đối tượng: người vận hành tenant · nhân viên tư vấn · quản trị viên nền tảng
> Quy ước ký hiệu: **✅ đã triển khai / 🟡 đang chuẩn bị·lộ trình**. Ghi trung thực theo mã nguồn thực tế.
>
> ⚠ Bản dịch AI, đang chờ hiệu đính bởi người bản ngữ. Bản tiếng Hàn là bản chuẩn.
>
> Người mở tenant lần đầu hãy bắt đầu từ [Sổ tay thiết lập nhanh](quick-setup.vi.md),
> người muốn tinh chỉnh tri thức·AI xem [Sổ tay đăng ký tri thức·cài đặt AI](knowledge-ai.vi.md).
> Tài liệu này là **sổ tay tham chiếu lướt qua toàn bộ các màn hình**.

---

## Mục lục
1. [Bắt đầu (đăng nhập·vai trò·menu)](#1-bắt-đầu)
2. [Widget khách hàng](#2-widget-khách-hàng)
3. [Luồng trả lời của AI (tóm tắt)](#3-luồng-trả-lời-của-ai-tóm-tắt)
4. [Bảng điều khiển live chat](#4-bảng-điều-khiển-live-chat)
5. [Bảng yêu cầu](#5-bảng-yêu-cầu)
6. [Lịch sử hội thoại](#6-lịch-sử-hội-thoại)
7. [Nhật ký công việc](#7-nhật-ký-công-việc)
8. [Thống kê câu hỏi](#8-thống-kê-câu-hỏi)
9. [Tổng quan](#9-tổng-quan)
10. [Khách hàng·đơn hàng·sản phẩm](#10-khách-hàngđơn-hàngsản-phẩm)
11. [Chiến dịch](#11-chiến-dịch)
12. [Đánh giá](#12-đánh-giá)
13. [Tri thức·cài đặt AI (liên kết)](#13-tri-thứccài-đặt-ai)
14. [Cài đặt (liên kết)](#14-cài-đặt)
15. [Thông báo quyền riêng tư·Trang của tôi](#15-thông-báo-quyền-riêng-tưtrang-của-tôi)
16. [Bảng điều khiển quản trị viên nền tảng](#16-bảng-điều-khiển-quản-trị-viên-nền-tảng)
17. [FAQ / Xử lý sự cố](#17-faq--xử-lý-sự-cố)

---

## 1. Bắt đầu

### 1.1 Truy cập bảng điều khiển
- Bảng điều khiển tenant: `https://shoptalk.amoeba.site/<slug>` — địa chỉ đăng nhập riêng theo từng cửa hàng.
- Quản trị viên nền tảng: `/admin/login`.
- Đăng nhập bằng email + mật khẩu (JWT). Tài khoản được mời đăng nhập lần đầu bằng **mật
  khẩu tạm thời** rồi qua bước **đổi bắt buộc** (từ 10 ký tự·3 loại ký tự·cấm mật khẩu phổ biến).
- master/director và quản trị viên hệ thống bị bắt buộc đăng ký **MFA (TOTP)** (trước ngày
  hiệu lực có biểu ngữ gia hạn → sau ngày hiệu lực có hộp thoại chặn). Khi đăng ký, 10 mã
  khôi phục chỉ hiển thị **một lần duy nhất**.
- Toàn bộ quy trình onboarding: [Sổ tay thiết lập nhanh chương 1~2](quick-setup.vi.md).

### 1.2 Vai trò·quyền hạn (RBAC)
- **Cấp bậc (rank)**: master · director · manager · staff / **Nhãn công việc**: consult (tư vấn) ·
  accounting (kế toán) · operations (vận hành). Quản trị viên hệ thống: super · admin.
- Hiển thị menu theo **2 tầng**: ① menu mà quản trị viên nền tảng cung cấp cho tenant (mặc
  định theo gói + ngoại lệ) → ② quyền theo cấp bậc do master của tenant quy định + ngoại lệ
  theo người dùng (thẻ *Quyền truy cập menu* trong [Cài đặt gian hàng]). Nhập URL trực tiếp
  cũng bị máy chủ kiểm tra lại và chặn.
- Chính sách hiển thị theo chủ sở hữu (ACL) áp dụng bổ sung bên trên quyền chức năng.

### 1.3 Menu bảng điều khiển
Bấm logo ở thanh bên sẽ mở **danh sách thẻ các màn hình truy cập được** (`/menu`).

| Menu | Đường dẫn | Công dụng |
|---|---|---|
| Tổng quan | `/dashboard` | KPI·câu hỏi phổ biến·trạng thái tích hợp |
| Trò chuyện trực tiếp | `/live-chat` | Tư vấn thời gian thực·xử lý chuyển tiếp |
| Bảng yêu cầu | `/issues` | Bảng kanban ticket yêu cầu (tenant dùng quy trình native) |
| Lịch sử hội thoại | `/history` | Tra cứu hội thoại cũ·kiểm tra căn cứ |
| Nhật ký công việc | `/work-log` | Truy vết kiểm tra thao tác của nhân viên tư vấn |
| Thống kê | `/statistics` | Thống kê câu hỏi của khách hàng |
| Cài đặt AI | `/ai-setting` | Agent·persona·quy tắc·kịch bản·công cụ·kiểm duyệt·huấn luyện |
| Kho tri thức | `/knowledge` | Tài liệu tri thức·nguồn·kiểm chứng |
| Khách hàng / Đơn hàng / Sản phẩm | `/customers` `/orders` `/products` | Tra cứu·quản lý dữ liệu đệm |
| Chiến dịch / Đánh giá | `/campaigns` `/reviews` | Quản lý gửi tin·đánh giá |
| Người dùng | `/users` | Mời thành viên·cấp bậc·nhãn |
| Cài đặt gian hàng | `/settings` | Tích hợp·widget·chuyển tiếp tư vấn·quyền menu |
| Thông báo quyền riêng tư | `/privacy-notice` | URL chính sách·phiên bản đồng ý |
| Trang của tôi | `/my-page` | Hồ sơ·mật khẩu·MFA |
| Quản trị | `/admin/*` | Quản lý nền tảng (chỉ quản trị viên hệ thống) |

---

## 2. Widget khách hàng

### 2.1 Bố cục màn hình
- **Launcher** trên trang cửa hàng (vị trí·kích thước·biểu tượng theo cài đặt chủ đề của
  tenant) → bấm để mở bảng (toàn màn hình trên di động / thẻ nổi trên desktop).
- Phần đầu: tên hiển thị của cửa hàng (hoặc logo), **chuyển ngôn ngữ** (6 thứ tiếng
  en/es/ko/vi/ja/zh — khi chuyển, ngôn ngữ phiên cũng được cập nhật lên máy chủ nên ngôn
  ngữ trả lời của AI đổi theo), cài đặt (bánh răng), đóng.
- **Tab**: Thông báo / Đơn hàng / Trò chuyện — tab nào hiện, theo thứ tự·vị trí nào
  (trên/dưới) theo cài đặt của tenant. Chỉ còn 1 tab thì thanh tab tự ẩn.

### 2.2 Tab thông báo·đơn hàng
- Chip của tab thông báo: `Tất cả · Sự kiện` / chip của tab đơn hàng: `Đơn hàng (danh sách
  đơn) · Giao hàng · Đánh giá · Yêu cầu`. **Tắt một tab thì các chip của nó được hấp thu
  vào tab còn lại** — tắt tab không làm mất chức năng.
- Mỗi mục: biểu tượng·tiêu đề·huy hiệu trạng thái·nội dung·thời gian tương đối·chấm chưa
  đọc. Mục chưa đọc mới nhất được làm nổi bật.
- **Chi tiết đơn hàng**: sản phẩm·tổng tiền·bậc theo dõi giao hàng·**tra cứu vận chuyển**·
  **hỏi về đơn này** (đưa mã đơn hàng vào chat)·**viết đánh giá** theo từng sản phẩm (sao
  1~5 + nhận xét).
- Danh sách đơn hàng nội tuyến chỉ hiển thị giai đoạn gần đây; "Xem thêm" dẫn đến trang cá
  nhân của chính cửa hàng (Cafe24 là trang danh sách đơn, còn lại là trang tài khoản).

### 2.3 Tab trò chuyện
- Trên cùng: **thông báo tư vấn bằng AI** + liên kết **kết thúc tư vấn** (chỉ khi đang diễn ra).
- **Biểu ngữ đồng ý**: hiển thị khi vào lần đầu hoặc khi phiên bản thông báo thay đổi.
  Trước khi đồng ý, các chức năng cần thông tin cá nhân bị hạn chế.
- **Nút kịch bản**: menu nhanh do tenant cấu hình (mặc định 6 loại). Hỗ trợ sản phẩm mở
  menu con (cách dùng·thành phần·đổi/trả·hàng về lại). Sau câu trả lời có các chip nhanh
  (đơn của tôi/giao hàng/trả hàng/kết nối nhân viên tư vấn).
- **Xác minh danh tính (AuthGate)** 2 cách: ① đăng nhập cửa hàng — redirect (mặc định) hoặc
  popup theo cài đặt của tenant, tự xử lý đường dẫn đăng nhập Cafe24/Shopify, khi quay lại
  widget tự mở lại ② tra cứu đơn không cần tài khoản — mã đơn hàng+email (có giới hạn số lần).
- **Đính kèm**: ảnh ≤10MB (gồm HEIC — tự chuyển đổi) / tệp ≤20MB (pdf·txt·csv·docx·xlsx),
  tối đa 5 tệp mỗi tin nhắn. Có thể gửi chỉ tệp không kèm chữ.
- **Chỉ báo chờ** 3 loại: AI đang soạn / nhân viên tư vấn đang trả lời / chờ chuyển tiếp
  (chưa có nhân viên tư vấn được phân công).
- **Kết thúc·mức độ hài lòng**: khách kết thúc thì sau xác nhận sẽ hiển thị đã kết thúc.
  Hội thoại đã kết thúc hiển thị thẻ **mức độ hài lòng (5 mức emoji = 1~5 điểm)** trong
  vòng 24 giờ. Gửi tin nhắn mới sẽ bắt đầu phiên tư vấn mới.

### 2.4 Cài đặt (bánh răng)
- **Quản lý đồng ý**: xem trạng thái·thời điểm·phiên bản, rút lại (xác nhận 2 bước — rút
  lại thì dừng tư vấn), đồng ý lại.
- Sau khi đăng nhập: **từ chối nhận marketing** (một công tắc duy nhất — từ chối khuyến
  mãi·phiếu giảm giá·mời đánh giá; thông báo đơn hàng·giao hàng vẫn gửi bình thường),
  **từ chối bán·chia sẻ dữ liệu** (CCPA/CPRA), **xuất dữ liệu của tôi** (tải JSON),
  **xóa dữ liệu của tôi** (xác nhận 2 bước — hoàn tất thì widget về trạng thái đăng xuất).
- Ma trận nhận tin theo danh mục×kênh đã bị gỡ khỏi widget và chuyển sang **chính sách của
  cửa hàng (cài đặt kênh thông báo trong bảng điều khiển)**.

---

## 3. Luồng trả lời của AI (tóm tắt)

```
Tin nhắn khách hàng → phân loại ý định (cần thông tin cá nhân → hướng dẫn xác minh danh tính)
  → khớp chuyển tiếp bắt buộc theo chính sách (deny-list) → chuyển thẳng nhân viên tư vấn, không qua AI
  → tìm kiếm tri thức (RAG) → tạo câu trả lời (persona+quy tắc, tính độ tin cậy) → kiểm duyệt
  → độ tin cậy đủ: trả lời khách + nguồn / thiếu·bị chặn·khách yêu cầu: hàng chờ nhân viên tư vấn
```

- Tin nhắn do nhân viên tư vấn gửi cũng qua kiểm duyệt y hệt (không thể bỏ qua, lỗi thì chặn).
- Cách điều chỉnh từng điểm trong pipeline: [Sổ tay tri thức·AI](knowledge-ai.vi.md).

---

## 4. Bảng điều khiển live chat
*(`/live-chat` · người có nhãn consult)*

Bố cục 3 cột: **hàng chờ (trái) — hội thoại (giữa) — ngữ cảnh (phải)**. Danh sách tự làm
mới mỗi 5 giây.

### 4.1 Hàng chờ (trái)
- Phạm vi: **Tất cả / Cần nhân viên / Đã kết thúc** (mặc định Tất cả — hội thoại AI đang
  tiếp cũng hiển thị).
- Lọc kênh: widget·Telegram·Viber·Zalo·LINE·WhatsApp·Kakao·SMS·email. Tìm theo tên/email khách.
- Mỗi hàng: **bí danh phiên** (nhân viên tư vấn sửa được nội tuyến; chưa đặt thì tên
  khách→email→ID phiên), huy hiệu kênh·trạng thái, chip "tự động trả lời OFF", tin nhắn
  cuối, thời gian trôi qua từ khi mở/trả lời cuối.

### 4.2 Hội thoại (giữa)
- **Điều khiển tự động trả lời** ở phần đầu: `theo mặc định kênh / tự động / duyệt rồi gửi
  / tắt` + huy hiệu trạng thái hiện tại (AI đang trả lời / nhân viên trả lời / chờ duyệt).
  Hội thoại đã được nhân viên tư vấn tiếp nhận thì việc nhân viên trả lời được ưu tiên bất
  kể cài đặt này.
- Nút: **[Nhận]** (tiếp nhận — gán phụ trách), **[Trả về AI]** (chỉ khi ở trạng thái nhân
  viên — giao hội thoại lại cho AI, có hộp xác nhận), **[Kết thúc]**, **[Đồng bộ]** (làm
  mới thủ công).
- **Chế độ duyệt rồi gửi**: bản nháp của AI hiện trong bảng có thể chỉnh sửa (kèm độ tin
  cậy), bấm **[Duyệt gửi]** thì gửi đi dưới danh nghĩa nhân viên tư vấn (kiểm duyệt·kiểm
  tra áp dụng như nhau). Cũng có thể [Hủy bỏ].
- **Soạn tin nhắn**: văn bản + đính kèm (cùng hạn mức với widget khách — ảnh 10MB/tệp
  20MB/tối đa 5). Gửi bị từ chối nghĩa là kiểm duyệt chặn — đổi cách diễn đạt rồi thử lại.
  **Kênh SMS chỉ nhận** nên ô soạn bị tắt.
- Dưới bong bóng trả lời AI có **[Lưu câu trả lời này vào kho tri thức]** (chỉ
  master/director): chụp câu trả lời thành bản nháp tài liệu tri thức.
- Tin nhắn cũ tải bằng "Tải tin nhắn cũ hơn".

### 4.3 Ngữ cảnh (phải)
- **Tóm tắt của AI**: tóm tắt hội thoại đến hiện tại·ý định·cảm xúc·hành động khuyến nghị.
- **Tra cứu tri thức**: hỏi trực tiếp kho tri thức ngay trong hội thoại (một cú bấm dùng
  tin nhắn cuối của khách) → xem câu trả lời·nguồn (huy hiệu stale/mâu thuẫn, lối tắt đến
  tài liệu) → **[Gửi cho khách] / [Sửa rồi gửi] (điền vào ô soạn) / [Đề xuất vào kho tri
  thức]** (đăng ký chờ người phụ trách tri thức duyệt).
- **Thẻ khách hàng**: tên·email·điện thoại·hạng + **liên kết khách hàng** (tìm và nối) /
  **tạo khách hàng**.
- Thẻ **đơn hàng gần đây**.
- **Bảng yêu cầu** (tenant quy trình native): số yêu cầu·trạng thái·loại·số lần mở lại,
  [Giải quyết]/[Từ chối] (bắt buộc lý do: không thể theo chính sách/phân công sai/spam),
  chọn phân công lại, dòng thời gian sự kiện.

### 4.4 Cảnh báo chuyển tiếp·tự động kết thúc
- **Cảnh báo escalation**: khi có chuyển tiếp mới, dù đang ở đâu trong bảng điều khiển,
  trong 10 giây sẽ hiện hộp thoại thông báo (lý do: độ tin cậy thấp/kiểm duyệt chặn/khách
  yêu cầu) và bấm [Mở hội thoại] để vào ngay.
- **Tự động kết thúc hội thoại bị bỏ quên** (hành vi máy chủ, chỉ kênh widget): cả hai bên
  im lặng 30 phút thì gửi "Còn gì tôi có thể giúp thêm không?", không phản hồi trong 1 phút
  thì kết thúc. Hội thoại quá 7 ngày được kết thúc lặng lẽ. Hội thoại đang chờ hồi âm email
  không bị tự động kết thúc.

---

## 5. Bảng yêu cầu
*(`/issues` · chỉ tenant có chế độ quy trình **native** — nếu không, chỉ hiển thị thông báo)*

Là **bảng kanban** quản lý yêu cầu dưới dạng ticket (issue).

- Cột: `Đã tiếp nhận → Đang xử lý → Đã giải quyết / Đã từ chối → Đã đóng` (chỉ kéo được các
  bước di chuyển hợp lệ — di chuyển sai sẽ bật về. Môi trường cảm ứng dùng hộp chọn di
  chuyển trên thẻ).
- KPI trên cùng: tiếp nhận·đang xử lý·**chưa phân công**·thời gian giải quyết trung
  bình·tỷ lệ mở lại (làm mới 30 giây).
- Thẻ: số yêu cầu·loại·**huy hiệu SLA (⚠️ sắp trễ / 🔥 quá hạn)**·số lần mở lại·bí danh
  phiên·câu cuối của khách·người phụ trách (huy hiệu nhãn+tên hoặc chưa phân công)·**công
  tắc khẩn cấp/thường**.
- **Từ chối** bắt buộc lý do (không thể theo chính sách/phân công sai/spam + ghi chú). Sau
  giải quyết/từ chối có thể mở lại.
- Bấm thẻ → xem trước 10 lượt hội thoại gần nhất (chỉ đọc, việc xem được ghi vào kiểm tra)
  → [Mở phiên] để vào live chat.
- Giờ chuẩn SLA đặt tại mục Chuyển tiếp tư vấn trong [Cài đặt gian hàng] (thường/khẩn cấp, 1~168 giờ).

---

## 6. Lịch sử hội thoại
*(`/history`)*

- Bộ lọc: khoảng thời gian · người phụ trách (có nhãn consult) · trạng thái · có
  escalation hay không · **tìm trong nội dung tin nhắn** (chạy bằng nút tìm — việc tra cứu
  thuộc diện ghi kiểm tra) · bao gồm hội thoại xem thử hay không.
- Bấm hàng → hộp thoại toàn văn hội thoại: khách/người phụ trách/kênh/**ngôn ngữ**/meta bắt
  đầu·kết thúc + bong bóng theo từng phát ngôn. **Mỗi câu trả lời AI hiển thị chip tài liệu
  căn cứ (tiêu đề+độ tương đồng, bấm để đến tài liệu tri thức) và huy hiệu độ tin cậy**,
  nên truy được vì sao trả lời như vậy. Tại thời điểm chuyển tiếp có huy hiệu lý do.
- Việc tra cứu được ghi vào kiểm tra (thông báo ở cuối hộp thoại). Xuất dữ liệu (CSV v.v.) 🟡 chưa có.

---

## 7. Nhật ký công việc
*(`/work-log`)*

Truy vết kiểm tra thao tác của nhân viên tư vấn (lăng kính nhân viên của cùng kho lưu với
nhật ký kiểm tra của quản trị viên).
Bộ lọc: khoảng thời gian·nhân viên tư vấn·hành động (nhận/gửi tin nhắn/liên kết khách/tạo
khách/kết thúc/xem hội thoại/xem toàn văn).
Cột: thời gian·nhân viên tư vấn·hành động·đối tượng·kết quả (thành công/thất bại).

---

## 8. Thống kê câu hỏi
*(`/statistics`)*

Tổng hợp câu hỏi của khách hàng theo 4 tab chiều — **ý định / tài liệu / từ khóa / cụm**
(mặc định 30 ngày gần nhất, ảnh chụp theo ngày).

- Biểu đồ xu hướng (số câu hỏi theo ngày) + bảng: nhãn·số câu hỏi·tỷ trọng·**tỷ lệ
  escalation**·**không có nguồn**·**độ tin cậy trung bình**.
- **Dấu ⚠ chú ý**: hàng có tỷ lệ escalation từ 25% trở lên hoặc độ tin cậy trung bình thấp
  — hãy dùng làm **danh sách cần bổ sung tri thức**. Ở tab tài liệu, bấm hàng để đến tài
  liệu tri thức tương ứng.

---

## 9. Tổng quan
*(`/dashboard`)*

- 6 KPI (mỗi cái liên kết đến màn hình tương ứng): tư vấn đang diễn ra · thông báo hôm nay
  · tỷ lệ AI tự giải quyết · Top N chưa giải quyết · tổng hội thoại · tổng đơn hàng.
- Xếp hạng **câu hỏi phổ biến**, **trạng thái tích hợp** (huy hiệu theo nhà cung cấp),
  **5 đơn hàng gần nhất**.

---

## 10. Khách hàng·đơn hàng·sản phẩm

### 10.1 Khách hàng (`/customers`)
Danh sách (tên·email·**hạng**·số đơn·tổng chi tiêu·ngày tham gia) + tìm theo email. Thứ duy
nhất sửa được là **đổi hạng** (guest/subscriber/regular). Hạng được dùng để phân loại khách
trong widget·tiếp khách bằng AI.

### 10.2 Đơn hàng (`/orders`)
Danh sách chỉ đọc các đơn hàng đồng bộ từ nền tảng (mã đơn·trạng thái·số tiền·số sản phẩm·ngày).

### 10.3 Sản phẩm (`/products`)
Tra cứu catalog sản phẩm đã đồng bộ (gồm cả sản phẩm lưu trữ).
- KPI: tổng·đang bán·lưu trữ·**số đã vào kho tri thức** (kèm thời điểm đồng bộ cuối).
- Huy hiệu **đã vào kho tri thức hay chưa** trong danh sách rất quan trọng — sản phẩm
  `chưa có` là sản phẩm **AI không thể dùng trong câu trả lời.** Kiểm tra mô tả·tag·SKU
  trong hộp thoại chi tiết. Sản phẩm hoàn toàn không có mô tả sẽ không được chuyển thành
  tri thức (ghi rõ trong chi tiết).
- Quy trình đưa vào tri thức (đồng bộ danh mục sản phẩm): [Sổ tay tri thức·AI chương 2.2](knowledge-ai.vi.md).

---

## 11. Chiến dịch
*(`/campaigns` · operations)*

- Trường khi tạo: tên · **kênh (email / sms / kakao)** · tin nhắn · **liên kết** (không /
  handle sản phẩm / URL https — tính hợp lệ kiểm tra tại thời điểm gửi).
- Bấm **[Gửi]** trong danh sách sẽ **gửi ngay lập tức (không có hộp xác nhận)** — hãy cẩn thận.
- 🟡 Gửi theo lịch·giao diện xây dựng đối tượng nằm trong lộ trình. Hiện tại là luồng tạo → gửi ngay.

---

## 12. Đánh giá
*(`/reviews`)*

Danh sách quản lý đánh giá sản phẩm khách để lại qua widget (khách·mục đơn hàng·số
sao·nội dung·trạng thái).
Hành động duy nhất là **ẩn ↔ bỏ ẩn** — ẩn rồi thì **chính người viết vẫn tiếp tục nhìn
thấy** (chỉ loại khỏi hiển thị trên cửa hàng).

---

## 13. Tri thức·cài đặt AI

Toàn bộ: đăng ký tri thức (thủ công/catalog/CSV/nguồn ngoài), kiểm chứng (bảng QA·rà soát
mâu thuẫn·đề xuất khoảng trống), cài đặt AI (agent·persona·quy tắc·kịch bản·công cụ·kiểm
duyệt·tái sử dụng câu trả lời), vòng lặp cải thiện (xem thử·huấn luyện·kiểm tra hồi quy)
được tổng hợp trong **[Sổ tay đăng ký tri thức·cài đặt AI](knowledge-ai.vi.md)**. Giải
thích chuyên sâu theo màn hình xem AI-SETTINGS-GUIDE.

Tóm tắt điểm cốt lõi:
- AI **chỉ trả lời từ các tài liệu tri thức đang bật**. Chuyển tiếp thường xuyên nghĩa là
  thiếu tri thức.
- Mọi tin nhắn gửi đi (AI·nhân viên tư vấn) đều qua kiểm duyệt. Khi lỗi sẽ **chặn** một
  cách an toàn.
- Huấn luyện AI·thay đổi cấu hình đi qua **cổng phê duyệt** — hãy xem xét đề xuất rồi mới
  áp dụng.

## 14. Cài đặt

Tích hợp nền tảng (Cafe24 OAuth·Shopify·Odoo v.v.), cài đặt widget·nội dung·tab·chủ đề,
chính sách kênh thông báo, **chuyển tiếp tư vấn (người phụ trách·giờ làm việc·email ngoài
giờ·SLA·chuyển tiếp bắt buộc theo chính sách)**, quyền truy cập menu — tất cả nằm trong
`/settings`.
→ [Sổ tay thiết lập nhanh chương 3~4](quick-setup.vi.md) ·
hướng dẫn cài đặt widget

---

## 15. Thông báo quyền riêng tư·Trang của tôi

- **Thông báo quyền riêng tư** (`/privacy-notice`, master/director): quản lý URL chính sách
  xử lý và **phiên bản thông báo đồng ý**. ⚠️ **Nâng phiên bản sẽ hiển thị lại biểu ngữ
  đồng ý cho tất cả khách hàng**, nên chỉ nâng khi thực sự thay đổi nội dung thông báo.
- **Trang của tôi** (`/my-page`): hồ sơ (cấp bậc·nhãn·workspace), đổi mật khẩu, đăng ký/gỡ MFA.

---

## 16. Bảng điều khiển quản trị viên nền tảng
*(`/admin/*` · quản trị viên hệ thống)*

| Màn hình | Đường dẫn | Công dụng |
|---|---|---|
| Tổng quan | `/admin` | Số tenant·trạng thái tích hợp |
| Gian hàng | `/admin/tenants` | Tạo (tên·slug·tên miền·gói) · **menu được cung cấp** · tạm ngưng/kích hoạt |
| Người dùng của tenant | `/admin/tenants/…/users` | Mời · **cấp mật khẩu tạm thời (hiển thị 1 lần·không gửi mail)** · đặt lại MFA · tạm ngưng |
| Công cụ AI | `/admin/ai-engines` | Đăng ký công cụ (nhà cung cấp·mô hình·khóa API)·quản lý kích hoạt — tenant chọn theo từng chức năng |
| Nhật ký kiểm tra | `/admin/audit` | Truy vết thao tác đặc quyền (cấp mật khẩu tạm·đổi quyền·xem PII v.v.) |

Chi tiết quy trình mở tenant: [Sổ tay thiết lập nhanh chương 1](quick-setup.vi.md).

---

## 17. FAQ / Xử lý sự cố

**Q. Bot cứ chuyển sang nhân viên tư vấn.**
Thiếu tri thức là nguyên nhân phổ biến nhất. Xác định nguyên nhân bằng các hàng ⚠ trong
Thống kê (`/statistics`) và bảng QA tri thức, rồi bổ sung tài liệu. Cũng kiểm tra xem từ
khóa đó có nằm trong deny-list (chuyển tiếp bắt buộc theo chính sách) không — trường hợp
này AI bị bỏ qua một cách có chủ đích.

**Q. Câu trả lời của nhân viên tư vấn không gửi được.**
Là kiểm duyệt chặn. Đổi cách diễn đạt rồi thử lại; nếu quy tắc quá gắt, đề nghị master điều chỉnh.

**Q. Hội thoại tự nhiên kết thúc.**
Là tự động kết thúc hội thoại bị bỏ quên (30 phút im lặng → nhắc → kết thúc, §4.4). Khách
gửi tin nhắn lại sẽ bắt đầu phiên tư vấn mới.

**Q. Không thấy bảng yêu cầu.**
Chỉ dành cho tenant có chế độ quy trình native. Nếu menu hoàn toàn không có, hãy kiểm tra
menu được cung cấp/quyền theo cấp bậc (2 tầng).

**Q. Đã đổi cài đặt widget mà không thấy phản ánh.**
Widget đọc cấu hình mới từ **phiên tiếp theo của khách hàng**. Hãy đóng-mở lại widget hoặc
làm mới trang.

**Q. Khách không nhận được thông báo (email v.v.).**
Kiểm tra theo thứ tự: ① kênh đó có đang bật trong chính sách kênh thông báo của bảng điều
khiển không ② khách có từ chối nhận marketing không (chỉ ảnh hưởng loại khuyến mãi). Kênh
mà cửa hàng đã tắt thì khách không thể tự bật.

**Q. Đã đổi temperature mà câu trả lời vẫn vậy.**
Công cụ Anthropic (Claude) không áp dụng temperature (mô hình từ chối nên không gửi). Chỉ
max_tokens có hiệu lực.

**Q. Không có khóa AI mà vẫn hoạt động.**
Đó là câu trả lời demo của bộ chuyển đổi stub. Trước khi vận hành thật nhất định phải đăng
ký·chỉ định công cụ thật.

**Q. Đã ẩn đánh giá mà khách vẫn thấy.**
Bình thường — ẩn chỉ loại khỏi hiển thị trên cửa hàng, còn với chính người viết thì vẫn giữ.

---

*Tài liệu liên quan: [Sổ tay thiết lập nhanh](quick-setup.vi.md) ·
[Sổ tay đăng ký tri thức·cài đặt AI](knowledge-ai.vi.md) ·
hướng dẫn cài đặt widget · AI-SETTINGS-GUIDE ·
tài liệu giới thiệu dịch vụ · SPEC.md*
