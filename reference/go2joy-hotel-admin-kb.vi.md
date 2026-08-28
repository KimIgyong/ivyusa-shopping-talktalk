---
doc_id: GTJ-KB-HOTEL-ADMIN-VI
title: Hướng dẫn sử dụng Admin dành cho Đối tác Khách sạn Go2Joy (Tiếng Việt)
version: 1.0
status: draft
last_updated: 2026-08-28
source: Dịch từ reference/go2joy-hotel-admin-kb.md (bản gốc tiếng Hàn, v1.0)
audience: Đối tác khách sạn / Nhân viên CSKH / Chatbot RAG
language: vi
---

# Cơ sở tri thức Admin Đối tác Khách sạn Go2Joy (Tiếng Việt)

> **Mục đích của tài liệu**
> Tài liệu hướng dẫn admin dành cho đối tác khách sạn được tái cấu trúc thành
> các bài viết KB theo đơn vị tác vụ (task). Mỗi bài viết được soạn để có thể
> tìm kiếm và trích dẫn độc lập, dùng ngay cho RAG và tư vấn khách hàng.
>
> **Mẫu bài viết**: `Mục đích → Đường dẫn → Các bước → Lưu ý → Liên quan`
> **Quy tắc ID bài viết**: `GTJ-{KHU VỰC}-{SỐ}` (giữ nguyên ID như bản gốc tiếng Hàn)

---

# 1. Bảng điều khiển (Dashboard)

## GTJ-DSH-01 · Xem Bảng điều khiển (View Dashboard)

**Mục đích / Purpose**
Theo dõi lượng đặt phòng, hiệu quả vận hành và đánh giá của khách hàng trên một màn hình duy nhất.

**Đường dẫn / Path**
`Admin > Bảng điều khiển (Dashboard)`

**Các mục trên Dashboard**

### 1) Tổng quan đặt phòng (Booking Overview)
Tóm tắt và xem chi tiết tình hình đặt phòng theo ngày dựa trên hai tiêu chí:

- **Theo loại đặt phòng (Booking Type)** — Theo giờ (Hourly) / Qua đêm (Overnight) / Theo ngày (Daily)
- **Theo trạng thái đặt phòng (Booking Status)**

### 2) Chỉ số hiệu quả khách sạn (Hotel Performance)

| Chỉ số | Metric (EN) | Định nghĩa |
|---|---|---|
| Số khách truy cập | Visitors | Số khách hàng đã truy cập (xem) khách sạn trong khoảng thời gian được chọn |
| Lượt xem | Views | Số lượt truy cập/xem trang của khách sạn |
| Số lượt đặt phòng | Bookings | Số lượt đặt phòng hoàn tất thành công |
| Số lượt nhận phòng | Check-ins | Số lượt nhận phòng thực tế |
| Doanh thu ròng | Net Revenue | Giá phòng + phụ thu − khuyến mãi của khách sạn |
| Tiền đã nhận | Payments Received | Tổng số tiền khách hàng thực trả cho các đặt phòng đã hoàn tất |

> **Công thức doanh thu ròng / Net Revenue formula**
> `Net Revenue = Giá phòng (Room Rate) + Phụ thu (Surcharges) − Khuyến mãi khách sạn (Hotel Promotions)`

### 3) Tổng quan đánh giá (Reviews Overview)
Hiển thị thông tin tóm tắt các đánh giá khách hàng đã đăng cho khách sạn.

**Lưu ý / Notes**
- `Visitors` (số khách truy cập) và `Views` (lượt xem) là hai chỉ số khác nhau: Visitors đếm **số khách hàng**, Views đếm **số lượt xem**.
- `Net Revenue` (doanh thu ròng) và `Payments Received` (tiền đã nhận) có cơ sở tính khác nhau — cần phân biệt khi trả lời các câu hỏi về đối soát.

**Liên quan / Related**
`GTJ-REV-01`

---

# 2. Quản lý đánh giá (Review Management)

## GTJ-REV-01 · Trả lời đánh giá (Reply to a Review)

**Mục đích / Purpose**
Khách sạn đăng câu trả lời cho đánh giá của khách hàng.

**Đường dẫn / Path**
`Admin > Quản lý đánh giá (Review Management)`

**Các bước / Steps**

1. Tại đánh giá cần trả lời, chọn **[Trả lời / Reply]**
2. Nhập nội dung trả lời
3. Gửi trả lời và xác nhận **thông báo thành công** của hệ thống

**Lưu ý / Notes**
- ⚠️ **Mỗi đánh giá (bình luận) chỉ được trả lời 1 lần duy nhất.**
- Sau khi đăng, câu trả lời không thể sửa hoặc đăng lại — hãy kiểm tra kỹ nội dung trước khi gửi.

**Liên quan / Related**
`GTJ-DSH-01` (Tổng quan đánh giá)

---

# 3. Quản lý loại phòng (Room Type Management)

## 3.1 Cài đặt giảm giá trực tiếp (Direct Discount Settings)

### GTJ-DIS-01 · Tạo / Sửa chương trình giảm giá trực tiếp (Create / Edit a Direct Discount Program)

**Mục đích / Purpose**
Tạo hoặc chỉnh sửa chương trình giảm giá phòng trực tiếp áp dụng trong một khoảng thời gian hoặc vào những ngày cụ thể.

**Đường dẫn / Path**
`Admin > Quản lý loại phòng > Cài đặt giảm giá trực tiếp (Direct Discount Settings)`

**Các bước / Steps**

**BƯỚC 1. Nhập thông tin chung (Enter General Information)**

- **Tên chương trình (Program name)** — tối đa **100 ký tự**
- **Thời gian áp dụng (Availability period)** — chọn **một** trong hai:
  - Chạy theo khoảng thời gian (Run by period)
  - Chạy vào ngày đặc biệt (Run on special days)
- **Chọn khách sạn tham gia (Select participating hotels)** — chọn các khách sạn áp dụng
- Chọn **[Tiếp tục / Continue]**

**BƯỚC 2. Thiết lập giảm giá (Set up discounts)**

- **Cài đặt từng phòng (Individual room settings)** — đặt mức giảm cho từng phòng
- **Cài đặt hàng loạt (Bulk settings)** — áp dụng cùng một mức giảm cho nhiều phòng cùng lúc
- **Thêm khách sạn tham gia (Add participating hotels)** — thêm khách sạn vào chương trình
- **Sửa giá đã giảm (Edit discounted prices)** — vẫn có thể sửa giá giảm sau khi chương trình đã được thiết lập

**Lưu ý / Notes**
- Tên chương trình không được vượt quá 100 ký tự.
- Thời gian áp dụng chỉ chọn được một trong hai: `theo khoảng thời gian` hoặc `ngày đặc biệt` (không chọn đồng thời).
- **Vẫn có thể sửa giá giảm** ngay cả khi đã hoàn tất thiết lập chương trình.

**Liên quan / Related**
`GTJ-DIS-02`, `GTJ-DIS-03`, `GTJ-DIS-04`

---

### GTJ-DIS-02 · Tìm kiếm chương trình giảm giá trực tiếp (Search Direct Discount Programs)

**Mục đích / Purpose**
Tìm kiếm các chương trình giảm giá trực tiếp đã đăng ký theo tên hoặc trạng thái.

**Đường dẫn / Path**
`Admin > Quản lý loại phòng > Cài đặt giảm giá trực tiếp > Danh sách`

**Các bước / Steps**

**A. Tìm theo tên chương trình (Search by name)**
1. Nhập tên chương trình
2. Nhấn **[Tìm kiếm / Search]**

**B. Tìm theo trạng thái (Search by Status)**
1. Chọn trạng thái (Status)
2. Nhấn **[Tìm kiếm / Search]**

**Liên quan / Related**
`GTJ-DIS-03`

---

### GTJ-DIS-03 · Xem danh sách chương trình giảm giá (View Discount Program List)

**Mục đích / Purpose**
Xem danh sách các chương trình giảm giá trực tiếp đã đăng ký và thông tin của từng mục.

**Các cột hiển thị / List Columns**

| Cột | Column (EN) | Mô tả |
|---|---|---|
| Tên chương trình | Program name | Tên chương trình đã đăng ký |
| Trạng thái | Status | Gồm 3 loại: **Đang chạy (Running) / Đã dừng (Stopped) / Đã hết hạn (Expired)** |
| Số khách sạn tham gia | Number of participating hotels | Số khách sạn nằm trong chương trình |
| Đối tượng áp dụng | Applicable bookings | Áp dụng cho các đặt phòng có ngày lưu trú (stay date) cụ thể |
| Người tạo | Creator | Người dùng đã tạo chương trình |

**Lưu ý / Notes**
- Giảm giá được áp dụng theo **ngày lưu trú (stay date)**, không phải ngày đặt phòng.

**Liên quan / Related**
`GTJ-DIS-02`, `GTJ-DIS-04`

---

### GTJ-DIS-04 · Dừng chương trình giảm giá trực tiếp (Stop a Direct Discount Program)

**Mục đích / Purpose**
Dừng một chương trình giảm giá trực tiếp đang chạy.

**Các bước / Steps**

1. Trong danh sách, chọn **[Dừng chương trình / Stop Program]** ở chương trình cần dừng
2. Trong cửa sổ xác nhận, nhấn **[Dừng chương trình / Stop Program]** một lần nữa để xác nhận

**Lưu ý / Notes**
- ⚠️ Nút **[Dừng chương trình]** chỉ hiển thị với chương trình đang ở trạng thái **Đang chạy (Running)**.
- Phải nhấn thêm một lần trong cửa sổ xác nhận thì việc dừng mới có hiệu lực (xác nhận 2 bước).

**Liên quan / Related**
`GTJ-DIS-03`

---

## 3.2 Cài đặt Flash Sale (Flash Sale Settings)

### GTJ-FLS-01 · Thiết lập Flash Sale theo giờ (Set Up Hourly Flash Sale)

**Mục đích / Purpose**
Tạo chương trình flash sale cho phòng theo giờ (Hourly).

**Đường dẫn / Path**
`Admin > Quản lý loại phòng > Danh sách loại phòng theo giờ (Hourly)`

**Các bước / Steps**

1. Vào danh sách loại phòng theo giờ (Hourly)
2. Chọn **[Thiết lập Flash Sale / Set up Flash Sale]**
3. Kiểm tra cửa sổ thiết lập flash sale
4. Chọn **[Tạo chương trình / Create Program]**
5. Xác nhận **thông báo thành công** của hệ thống

**Lưu ý / Notes**
- Với flash sale theo giờ, **việc thiết lập giá là tùy chọn (optional)**.
  *(Điều kiện chi tiết không được ghi trong tài liệu gốc — cần bổ sung.)*

**Liên quan / Related**
`GTJ-FLS-02`, `GTJ-FLS-03`

---

### GTJ-FLS-02 · Thiết lập Flash Sale qua đêm (Set Up Overnight Flash Sale)

**Mục đích / Purpose**
Tạo chương trình flash sale cho phòng qua đêm (Overnight).

**Đường dẫn / Path**
`Admin > Quản lý loại phòng > Tab [Qua đêm / Overnight]`

**Các bước / Steps**

1. Chọn tab **[Qua đêm / Overnight]**
2. Chọn **[Thiết lập Flash Sale / Flash Sale Setup]**
3. Kiểm tra cửa sổ thiết lập flash sale
4. Chọn **[Tạo chương trình / Create Program]**
5. Xác nhận **thông báo thành công** của hệ thống

**Liên quan / Related**
`GTJ-FLS-01`, `GTJ-FLS-03`

---

### GTJ-FLS-03 · Dừng Flash Sale (Stop Flash Sale)

**Mục đích / Purpose**
Dừng chương trình flash sale đang diễn ra.

**Các bước / Steps**

1. Trên **Dòng thời gian (Timeline)**, chọn **Loại phòng (Room Type)** và **Loại đặt phòng (Booking Type)** cần dừng
2. Kiểm tra thông tin chi tiết của chương trình flash sale
3. Chọn **[Dừng chương trình / Stop Program]**
4. Xác nhận **thông báo thành công** của hệ thống

**Lưu ý / Notes**
- Việc dừng được thực hiện trên **màn hình Timeline**. Phải chọn cả loại phòng và loại đặt phòng thì chi tiết chương trình mới mở ra.

**Liên quan / Related**
`GTJ-FLS-01`, `GTJ-FLS-02`

---

## 3.3 Cài đặt phụ thu (Surcharge Settings) — *Cần bổ sung (Updating)*

### GTJ-SUR-01 · Thiết lập phụ thu (Set Up Surcharges)

**Mục đích / Purpose**
Thiết lập phụ thu cho một phòng cụ thể theo điều kiện khoảng thời gian và ngày trong tuần.

**Đường dẫn / Path**
`Cài đặt phòng (Room Settings) > phòng tương ứng > Phụ thu (Surcharges)`

**Các bước / Steps**

1. Vào `Cài đặt phòng > phòng tương ứng > Phụ thu`
2. Chọn **thời gian áp dụng phụ thu** — ngày bắt đầu/kết thúc và các ngày trong tuần áp dụng
3. Nhập **mức phụ thu** — theo **tỷ lệ (%)** hoặc **số tiền cố định**
4. Chọn **[Tạo lịch / Create Schedule]**
5. Chọn **[Lưu / Save]**

**Lưu ý / Notes**
- ⚠️ **Khuyến nghị**: không gộp nhiều điều kiện vào một phụ thu — **tạo riêng từng phụ thu theo từng điều kiện**. Về sau sẽ dễ xóa, dễ sửa hơn.
- Mức phụ thu nhập theo một trong hai cách: tỷ lệ (%) hoặc số tiền cố định.
- 🔧 Mục này được đánh dấu **Updating** trong tài liệu gốc — cần kiểm chứng lại trước khi coi là chính thức.

**Liên quan / Related**
`GTJ-SUR-02`, `GTJ-DSH-01` (Phụ thu nằm trong công thức doanh thu ròng)

---

### GTJ-SUR-02 · Xóa phụ thu (Delete Surcharges)

**Mục đích / Purpose**
Xóa một thiết lập phụ thu đã đăng ký.

**Đường dẫn / Path**
`Cài đặt phòng (Room Settings) > phòng tương ứng > Phụ thu (Surcharges)`

**Các bước / Steps**

1. Vào `Cài đặt phòng > phòng tương ứng > Phụ thu`
2. Chọn **[Xóa / Delete]**
3. Xác nhận **thông báo thành công** của hệ thống

**Lưu ý / Notes**
- 🔧 Mục này được đánh dấu **Updating** trong tài liệu gốc — cần kiểm chứng lại trước khi coi là chính thức.

**Liên quan / Related**
`GTJ-SUR-01`

---

## 3.4 Khóa phòng nhanh (Quick Room Lock)

### GTJ-QLK-01 · Thiết lập khóa phòng nhanh (Set Up Quick Room Lock)

**Mục đích / Purpose**
Chặn bán phòng ngay lập tức tính từ thời điểm hiện tại (ví dụ: phòng đột ngột không thể sử dụng).

**Các bước / Steps**

1. Chọn **[Khóa phòng nhanh / Quick Room Lock]**
2. Chọn **loại đặt phòng (Booking Type)** cần khóa
3. Chọn **khoảng thời gian** cần khóa — hệ thống mặc định là **thời điểm hiện tại / hôm nay**
4. Kiểm tra chi tiết khóa phòng
5. Chọn **[Thêm lịch khóa / Add Lock Schedule]**

**Lưu ý / Notes**
- Vì giá trị mặc định là **thời điểm hiện tại / hôm nay**, khi khóa lịch trong tương lai phải chỉnh lại khoảng thời gian.
- Với các đợt khóa dài ngày có kế hoạch trước, nên dùng `GTJ-LCK-01~03` (Cài đặt khóa phòng).

**Liên quan / Related**
`GTJ-QLK-02`, `GTJ-LCK-01`

---

### GTJ-QLK-02 · Hủy khóa phòng nhanh (Delete Quick Room Lock)

**Mục đích / Purpose**
Xóa khóa phòng nhanh đã thiết lập.

**Các bước / Steps**

1. Chọn **[Cài đặt khóa phòng / Room Lock Settings]**
2. Tìm mục khóa nhanh tương ứng trong danh sách **Lịch sử khóa phòng (Room Lock History)**
3. Chọn biểu tượng 🗑️ **xóa**
4. Chọn **[Xác nhận / Confirm]**

**Lưu ý / Notes**
- Việc **hủy khóa nhanh thực hiện tại màn hình [Cài đặt khóa phòng]** — màn hình thiết lập và màn hình hủy là khác nhau.

**Liên quan / Related**
`GTJ-QLK-01`, `GTJ-LCK-04`

---

## 3.5 Cài đặt khóa phòng (Room Lock Settings)

> Chung: các mục lựa chọn thay đổi tùy theo loại đặt phòng (Theo giờ / Theo ngày / Qua đêm).

### GTJ-LCK-01 · Khóa phòng – Theo giờ (Room Lock – Hourly)

**Các bước / Steps**

1. Chọn **khách sạn**
2. Chọn **loại phòng (Room Type)**
3. Ở loại đặt phòng, chọn **[Theo giờ / Hourly]**
4. Chọn **khoảng ngày + khung giờ (time slots)**
5. Chọn **[Thêm lịch khóa / Add Lock Schedule]**
6. Xác nhận **thông báo thành công** của hệ thống

**Lưu ý / Notes**
- Khóa theo giờ phải chỉ định **cả khoảng ngày lẫn khung giờ** — đây là điểm khác với các loại đặt phòng còn lại.

---

### GTJ-LCK-02 · Khóa phòng – Theo ngày (Room Lock – By Day)

**Các bước / Steps**

1. Chọn **khách sạn**
2. Chọn **loại phòng (Room Type)**
3. Ở loại đặt phòng, chọn **[Theo ngày / By Day]**
4. Chọn **ngày**
5. Chọn **[Thêm chặn phòng / Add Room Block]**
6. Xác nhận **thông báo thành công** của hệ thống

---

### GTJ-LCK-03 · Khóa phòng – Qua đêm (Room Lock – Overnight)

**Các bước / Steps**

1. Chọn **khách sạn**
2. Chọn **loại phòng (Room Type)**
3. Ở loại đặt phòng, chọn **[Qua đêm / Overnight]**
4. Chọn **ngày**
5. Chọn **[Thêm chặn phòng / Add Room Block]**
6. Xác nhận **thông báo thành công** của hệ thống

---

### GTJ-LCK-04 · Hủy cài đặt khóa phòng (Delete Room Lock Settings)

**Các bước / Steps**

1. Chọn **[Cài đặt khóa phòng / Room Lock Settings]**
2. Chọn **biểu tượng [Xóa / Delete]** ở mục khóa cần hủy
3. Xác nhận **thông báo thành công** của hệ thống

**Liên quan / Related**
`GTJ-LCK-01`, `GTJ-LCK-02`, `GTJ-LCK-03`, `GTJ-QLK-02`

---

# 4. Báo cáo (Reports)

## GTJ-RPT-01 · Tải báo cáo "Phòng giá sốc" (Download "Shock-Discount Room" Report) — *Cần bổ sung (Updating)*

**Mục đích / Purpose**
Tải xuống báo cáo liên quan đến các phòng giá sốc (Shock-Discount).

**Trạng thái hiện tại / Status**
🔧 Trong tài liệu gốc, mục này chỉ được đánh dấu **Updating** và chưa có quy trình chi tiết.

**Cần xác nhận / To Be Confirmed**
- Đường dẫn truy cập
- Điều kiện tra cứu (khoảng thời gian, khách sạn, loại phòng, v.v.)
- Định dạng tệp tải xuống và định nghĩa các cột
- Điều kiện phân quyền

---

# 5. Bảng thuật ngữ (Glossary)

| Thuật ngữ (VI) | Term (EN) | Định nghĩa |
|---|---|---|
| Theo giờ | Hourly | Loại đặt phòng sử dụng theo đơn vị giờ |
| Qua đêm | Overnight | Loại đặt phòng lưu trú qua đêm |
| Theo ngày | Daily / By Day | Loại đặt phòng theo đơn vị ngày |
| Doanh thu ròng | Net Revenue | Giá phòng + phụ thu − khuyến mãi của khách sạn |
| Tiền đã nhận | Payments Received | Tổng số tiền khách thực trả cho các đặt phòng đã hoàn tất |
| Giảm giá trực tiếp | Direct Discount | Chương trình giảm giá phòng do khách sạn tự thiết lập, theo khoảng thời gian hoặc ngày cụ thể |
| Flash Sale | Flash Sale | Chương trình giảm giá tập trung trong thời gian ngắn (thiết lập riêng cho Theo giờ / Qua đêm) |
| Phụ thu | Surcharge | Khoản thu thêm cho phòng theo điều kiện thời gian, ngày trong tuần (tỷ lệ hoặc cố định) |
| Khóa phòng nhanh | Quick Room Lock | Chức năng chặn bán phòng ngay lập tức tính từ thời điểm hiện tại |
| Khóa phòng | Room Lock / Room Block | Chức năng chặn bán phòng trong khoảng thời gian chỉ định |
| Dòng thời gian | Timeline | Màn hình xem và thao tác tình trạng chương trình theo phòng, loại đặt phòng |
| Phòng giá sốc | Shock-Discount Room | Phòng đang áp dụng khuyến mãi giá sốc |

---

# 6. Định nghĩa trạng thái (Status Values)

## Trạng thái chương trình giảm giá trực tiếp (Direct Discount Program Status)

| Trạng thái (VI) | Status (EN) | Ý nghĩa | Hiện nút Dừng |
|---|---|---|---|
| Đang chạy | Running | Chương trình đang được áp dụng | ✅ hiện |
| Đã dừng | Stopped | Chương trình do người vận hành dừng thủ công | ❌ không hiện |
| Đã hết hạn | Expired | Chương trình đã hết thời gian áp dụng | ❌ không hiện |
