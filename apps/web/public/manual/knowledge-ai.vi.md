# Sổ tay đăng ký tri thức·cài đặt AI ShopTalk — Pipeline tri thức và vận hành tiếp khách

> Phiên bản 1.0 · 2026-08-24 · Biên soạn dựa trên mã nguồn
> Đối tượng: người vận hành tenant · phụ trách CS (khuyến nghị master/director — Cài đặt AI chỉ dành cho cấp bậc cao)
> Bản trực tuyến: https://shoptalk.amoeba.site/manual (có bản HTML và bản dịch EN·VI)
> Ký hiệu: ✅ đã triển khai / 🟡 đang chuẩn bị·lộ trình. Tài liệu tiên quyết: [Sổ tay thiết lập nhanh](quick-setup.vi.md)

> ⚠ Bản dịch AI, đang chờ hiệu đính bởi người bản ngữ. Bản tiếng Hàn là bản chuẩn.

Mỗi chương được sắp xếp theo thứ tự **giải thích thuật ngữ → quy trình → 💡 mẹo vận hành**.

---

## Mục lục
0. [Hiểu pipeline trả lời của AI](#0-hiểu-pipeline-trả-lời-của-ai)
1. [Hiểu cấu trúc tri thức](#1-hiểu-cấu-trúc-tri-thức)
2. [Đăng ký tri thức](#2-đăng-ký-tri-thức)
3. [Kiểm chứng·quản lý chất lượng tri thức](#3-kiểm-chứngquản-lý-chất-lượng-tri-thức)
4. [Cài đặt AI](#4-cài-đặt-ai)
5. [Cài đặt tiếp khách live chat](#5-cài-đặt-tiếp-khách-live-chat)
6. [Vòng lặp kiểm chứng·cải thiện](#6-vòng-lặp-kiểm-chứngcải-thiện)
7. [Danh sách kiểm tra vận hành](#7-danh-sách-kiểm-tra-vận-hành)
8. [FAQ / Xử lý sự cố](#8-faq--xử-lý-sự-cố)

---

## 0. Hiểu pipeline trả lời của AI

Đây là toàn bộ luồng xử lý một tin nhắn của khách hàng. Mọi cài đặt trong tài liệu này đều
là việc điều chỉnh một điểm nào đó trong luồng này.

```
Tin nhắn của khách hàng
  │
  ▼
① Phân loại ý định ──── nếu cần đơn hàng·thông tin cá nhân → hướng dẫn xác minh danh tính (đăng nhập)
  │
  ▼
② Tìm kiếm tri thức (RAG) ── tìm căn cứ liên quan trong các tài liệu tri thức đã đăng ký
  │
  ▼
③ Tạo câu trả lời ──── soạn câu trả lời từ persona·quy tắc trả lời + căn cứ tìm được, tính độ tin cậy
  │
  ▼
④ Kiểm duyệt ─── kiểm tra quy tắc cấm (không đạt thì không hiển thị cho khách)
  │
  ▼
⑤ Rẽ nhánh: độ tin cậy đủ → trả lời khách hàng (+nguồn)
        độ tin cậy thấp / bị chặn / khách yêu cầu gặp người → hàng chờ nhân viên tư vấn (escalation)
```

- **Ngôn ngữ trả lời** theo ngôn ngữ phiên của khách hàng (en/es/ko/vi/ja/zh).
- Tin nhắn do nhân viên tư vấn gửi cũng đi qua ④ kiểm duyệt y hệt (không thể bỏ qua).

---

## 1. Hiểu cấu trúc tri thức

**Thuật ngữ**

| Thuật ngữ | Ý nghĩa |
|---|---|
| Tài liệu tri thức (document) | Một bài viết AI dùng làm căn cứ trả lời. Gồm tiêu đề·danh mục·nội dung |
| Embedding | Thao tác lập chỉ mục chuyển tài liệu thành vector tìm kiếm được. Tự động thực hiện khi đăng ký·sửa |
| RAG | Cách tìm tài liệu liên quan đến câu hỏi và chỉ tạo câu trả lời từ căn cứ đó |
| Nguồn (source) | Kết nối tự động lấy tài liệu từ bên ngoài (bảng tin·Google Drive·Notion) |
| Nhóm | Phân loại lớn của tài liệu: **Thông tin tư vấn** (chính sách·FAQ) / **Thông tin sản phẩm** (từ catalog) |
| Danh mục | Phân loại chi tiết dưới nhóm (faq, policy, product, warranty v.v. — có gợi ý tự động) |
| Đang bật/hiển thị (active) | Có nằm trong phạm vi tìm kiếm hay không. **Tài liệu tắt không được dùng làm căn cứ trả lời** |
| Độ tin cậy (confidence) | Chỉ số câu trả lời được căn cứ hỗ trợ đến đâu. Thấp thì chuyển tiếp nhân viên tư vấn |

Bố cục màn hình Kho tri thức (`/knowledge`): bên trái quản lý nguồn·tài liệu, bên phải cố
định **bảng QA tri thức** và **Rà soát mâu thuẫn**, nên có thể qua lại giữa đăng ký↔kiểm
chứng trong cùng một màn hình.

---

## 2. Đăng ký tri thức

### 2.1 Đăng ký·sửa tài liệu thủ công

**Quy trình**: thẻ tài liệu → **[Thêm tài liệu]** → nhập `tiêu đề` / `danh mục` / `nội dung` → lưu.
Bấm tiêu đề để mở cửa sổ chi tiết, và quản lý các mục sau trong **[Sửa]**:

| Trường | Công dụng |
|---|---|
| URL gốc | Liên kết tài liệu ngoài làm căn cứ (mở trực tiếp từ danh sách) |
| Hiệu lực từ | Ngày chính sách có hiệu lực |
| Chu kỳ rà soát (ngày) | Quá hạn thì danh sách hiển thị huy hiệu `stale` (cần rà soát) → §3.3 |
| Nội dung | Khi lưu sẽ **tự động embedding lại** (cập nhật chỉ mục tìm kiếm) |

💡 **Mẹo**
- 1 tài liệu = 1 chủ đề. Thay vì dồn "giao hàng+hoàn tiền+đổi hàng" vào một tài liệu, hãy
  tách ra đăng ký thì tìm kiếm mới chính xác.
- Đưa vào tiêu đề·nội dung **cách nói thực tế của khách hàng** ("giao hàng mất bao lâu",
  "khi nào được hoàn tiền"). Tìm kiếm dựa trên độ tương đồng nên càng gần từ ngữ của khách
  càng dễ khớp.
- Chính sách phiên bản cũ đừng xóa mà hãy **tắt công tắc hiển thị (vô hiệu)** để loại khỏi
  căn cứ. Lịch sử còn lại và dễ khôi phục.

### 2.2 Tri thức sản phẩm — đồng bộ danh mục sản phẩm · CSV · hướng dẫn sử dụng

**Thuật ngữ**

| Thuật ngữ | Ý nghĩa |
|---|---|
| Bộ nhớ đệm sản phẩm | Danh sách sản phẩm gốc đã đồng bộ từ nền tảng (Cafe24 v.v.) (kết quả đồng bộ sản phẩm ở màn hình cài đặt) |
| Đồng bộ danh mục sản phẩm | Thao tác chuyển bộ nhớ đệm sản phẩm → tài liệu tri thức sản phẩm. 2 bước **xem trước → thực thi** |
| Gộp biến thể | Gom các biến thể phân tách bằng gạch ngang như "Son-Đỏ/Son-Hồng" thành 1 sản phẩm đại diện |
| Giữ bản biên tập | Bảo toàn tài liệu sản phẩm đã được người vận hành chỉnh tay, không để đồng bộ ghi đè |
| Hướng dẫn sử dụng | Tài liệu cách dùng chung theo **loại sản phẩm** (ví dụ: "Cách dùng sản phẩm son môi") — là căn cứ trả lời riêng biệt với tài liệu sản phẩm |

**Quy trình ① Đồng bộ danh mục sản phẩm**: phần đầu thẻ tài liệu → **[Đồng bộ từ danh mục sản phẩm]**
1. **Xem trước** chạy trước — hiển thị số lượng đã quét và kết quả dự kiến (tạo mới / sửa /
   giữ bản biên tập / gộp hấp thu / không đổi / treo lại), ước lượng lô embedding, và danh
   sách mẫu các mục sẽ gộp.
2. Kiểm tra trong mẫu gộp xem **các sản phẩm khác nhau có bị gom nhầm thành một không** rồi bấm **[Thực thi]**.
3. Theo dõi 2 dòng tiến độ (soạn / embedding), sau khi xong kiểm tra **số mục embedding thất
   bại** trong bảng kết quả (mục thất bại không tìm kiếm được nên phải chạy lại).

**Quy trình ② Nhập CSV sản phẩm**: **[Nhập CSV sản phẩm]** → chọn tệp → kiểm tra thống kê
kết quả (đã phân tích/tạo/sửa/bỏ qua/không hợp lệ/đã embedding) và lỗi theo dòng (hiển thị
tối đa 20 mục). Tải lại cùng sản phẩm sẽ ghi đè (upsert).

**Quy trình ③ Hướng dẫn sử dụng**: thẻ *Hướng dẫn sử dụng* hiển thị huy hiệu đã viết/chưa
viết theo từng loại sản phẩm. **[Viết]** → lưu tiêu đề·nội dung (từ 20 ký tự trở lên).

💡 **Mẹo**
- **Nhất định phải xem trước.** Gộp sai (các dòng sản phẩm khác nhau bị gom chung) chỉ có
  thể bắt được ở bước xem trước, trước khi thực thi.
- Khi sản phẩm thay đổi trên nền tảng, phải chạy **2 bước theo thứ tự**: đồng bộ sản phẩm
  ở [Cài đặt gian hàng] → đồng bộ danh mục sản phẩm ở [Kho tri thức] thì mới phản ánh vào tri thức.
- Với cửa hàng có mô tả sản phẩm sơ sài, thẻ tag chính là nguyên liệu của tri thức — dọn
  gọn tag sản phẩm phía nền tảng sẽ nâng chất lượng câu trả lời.

### 2.3 Tích hợp nguồn ngoài (bảng tin · Google Drive · Notion)

**Thuật ngữ**

| Thuật ngữ | Ý nghĩa |
|---|---|
| Tài khoản dịch vụ | Tài khoản robot dùng cho tích hợp Google Drive. Phải chia sẻ thư mục cho email của tài khoản này thì mới đọc được |
| Integration | Đơn vị cho phép công cụ ngoài truy cập trong Notion. Cần "kết nối" vào trang đích |
| Số đếm kết quả đồng bộ | Số mục tạo·sửa·bỏ qua·ẩn. `dropped`/`truncated` là **cảnh báo có phần không lấy về được** |

**Quy trình**
1. **Đăng ký thông tin xác thực** (2 thẻ dưới bảng nguồn):
   - Google Drive: dán JSON khóa tài khoản dịch vụ → **chia sẻ thư mục đích cho email tài
     khoản dịch vụ** được hiển thị → [Kiểm tra kết nối]
   - Notion: đăng ký token (`ntn_…`) → trong Notion **kết nối integration** vào trang/DB đích → [Kiểm tra kết nối]
2. **[Thêm nguồn]** → chọn loại (board / gdrive / notion) → gdrive nhập `ID thư mục`,
   notion nhập `ID trang·DB hoặc URL chia sẻ`
3. Chạy **↻(đồng bộ)** trên hàng nguồn → kiểm tra số đếm kết quả ở cột *Đồng bộ lần cuối*

Loại được hỗ trợ: bảng tin (board) ✅ · Google Drive ✅ · Notion ✅ · repository có trong
danh sách thả xuống nhưng **chưa hỗ trợ** (huy hiệu "chưa sẵn sàng", đồng bộ bị tắt).

💡 **Mẹo**
- Nếu kết quả đồng bộ hiện cảnh báo đỏ **dropped/truncated**, nghĩa là trang quá lớn hoặc
  quá sâu nên một phần bị cắt. Hãy mở tài liệu đó kiểm tra phần cuối có nguyên vẹn không,
  và chia nhỏ bản gốc rồi đồng bộ lại.
- Nếu đồng bộ đột nhiên trả về **0 mục** (bị hủy chia sẻ thư mục, hủy kết nối integration
  v.v.), hệ thống giữ nguyên các tài liệu hiện có mà không ẩn chúng — hãy khôi phục kết nối trước.
- Bấm vào ô trạng thái của nguồn để bật↔tắt. Nguồn tắt chỉ dừng đồng bộ, các tài liệu đã
  lấy về vẫn còn.

---

## 3. Kiểm chứng·quản lý chất lượng tri thức

**Thuật ngữ**

| Thuật ngữ | Ý nghĩa |
|---|---|
| Bảng QA tri thức | Bảng thử nghiệm đặt câu hỏi với tri thức từ góc nhìn khách hàng (cố định bên phải) |
| Nguồn trích dẫn (citation) | Danh sách tài liệu làm căn cứ cho câu trả lời. Hiển thị kèm chỉ số độ tương đồng |
| Mâu thuẫn (conflict) | Trạng thái hai tài liệu bị phát hiện chứa **nội dung mâu thuẫn nhau** |
| stale | Huy hiệu tài liệu đã quá chu kỳ rà soát, cần xác nhận lại |
| Khoảng trống tri thức (gap) | Chủ đề khách đã hỏi nhưng tri thức không có câu trả lời — hệ thống đề xuất thành bản nháp tài liệu |
| Đề xuất câu trả lời (proposal) | Đề xuất nâng câu trả lời thực tế của nhân viên tư vấn thành tài liệu tri thức (bắt buộc người duyệt) |
| Revision | Ảnh chụp lịch sử thay đổi của tài liệu. Hỗ trợ xem diff và khôi phục |

### 3.1 Bảng QA tri thức — nhất định kiểm tra sau khi đăng ký

**Quy trình**: nhập câu hỏi → kiểm tra câu trả lời + **chỉ số độ tin cậy** + **danh sách
nguồn** (độ tương đồng theo tài liệu) → nếu tài liệu căn cứ sai thì bấm **[Sửa]** cạnh nguồn
(tài liệu đó mở ngay ở chế độ sửa) → sửa xong bấm **[Hỏi lại]** để kiểm tra lại.

💡 **Mẹo**
- Nếu câu trả lời hiện huy hiệu **bị kiểm duyệt chặn** nghĩa là vướng quy tắc cấm (§4.5) —
  đây là câu trả lời mà nếu là khách hàng thật thì đã không được hiển thị.
- Nếu nguồn có huy hiệu `conflicted`/`stale`, hãy xử lý tài liệu đó trước. Chủ đề có độ tin
  cậy thấp phần lớn là do thiếu tài liệu hoặc tài liệu xa rời từ ngữ của khách hàng.
- Mỗi khi đổi chính sách, thói quen ném "3 câu hỏi khách có thể hỏi" vào bảng QA là bài
  kiểm tra hồi quy rẻ nhất (tự động hóa xem §6.3 câu hỏi vàng).

### 3.2 Rà soát mâu thuẫn

**Quy trình**: bảng *Rà soát mâu thuẫn* bên phải → lọc trạng thái (chờ/đã xử lý/bỏ qua/thất
bại) → theo từng mục kiểm tra độ tương đồng·thời điểm phát hiện·lý do phán định của hai tài
liệu → chọn hành động:

| Hành động | Tác dụng |
|---|---|
| Theo A / Theo B | Giữ bên được chọn và tắt bên còn lại |
| Giữ cả hai | Phán định không phải mâu thuẫn — cả hai vẫn bật |
| Bỏ qua | Đóng mục mâu thuẫn này |
| Phán định lại | Sửa tài liệu xong yêu cầu đánh giá lại |

Có thể quét lại toàn bộ tài liệu bằng **[Quét lại]**.

💡 **Mẹo**: mâu thuẫn thường sinh ra do **khi sửa chính sách mà không gỡ phiên bản cũ**.
Đừng dừng ở "Theo A" — hãy ghi ngày hiệu lực (Hiệu lực từ) vào tài liệu được giữ để lần sửa
chính sách sau không lặp lại chuyện này.

### 3.3 Chu kỳ rà soát·quản lý stale / lịch sử thay đổi

- Đặt `chu kỳ rà soát (ngày)` trong phần sửa tài liệu; quá hạn thì danh sách gắn huy hiệu
  `stale`. Bấm **[Đánh dấu đã rà soát]** trong hộp trạng thái rà soát ở chi tiết tài liệu
  thì thời hạn được tính lại.
- Trong **tab lịch sử thay đổi** của cửa sổ chi tiết, có thể xem diff theo từng revision và **[Khôi phục]**.

💡 **Mẹo**: tài liệu hay thay đổi như phí giao hàng·khuyến mãi nên đặt chu kỳ rà soát ngắn
khoảng 30 ngày, tài liệu ổn định như thông báo pháp lý đặt dài — khi đó huy hiệu stale trở
thành danh sách việc cần làm thực thụ.

### 3.4 Hộp đề xuất khoảng trống tri thức · duyệt đề xuất câu trả lời (vòng khép kín)

- **Hộp đề xuất bổ sung tri thức** (đầu màn hình, chỉ hiện khi có mục): những chủ đề khách
  hỏi mà tri thức còn trống được tích lũy thành bản nháp tài liệu. **[Chấp nhận]** (sửa tiêu
  đề·nội dung rồi xác nhận) hoặc **[Bỏ qua]**.
- **Đề xuất câu trả lời** (hiện khi có mục chờ): đề xuất đưa câu trả lời thực tế của nhân
  viên tư vấn vào tri thức. Kiểm tra câu hỏi·câu trả lời·liên kết hội thoại nguồn rồi
  **[Duyệt]** hoặc **[Từ chối]** (bắt buộc ghi lý do).

💡 **Mẹo**: hai kênh này là con đường để tri thức tự lớn lên. Tạo thói quen dọn sạch mỗi
tuần một lần sẽ giảm nguyên nhân gốc của "AI cứ chuyển sang nhân viên tư vấn". Trước khi
duyệt, nhất định kiểm tra **thông tin cá nhân (mã đơn hàng·tên) không còn sót trong câu trả
lời** — tài liệu tri thức sẽ được tái sử dụng làm căn cứ cho câu trả lời của mọi khách hàng.

---

## 4. Cài đặt AI
*(Menu trái **[Cài đặt AI]** — quyền truy cập: master/director)*

**Thuật ngữ**

| Thuật ngữ | Ý nghĩa |
|---|---|
| Nhân viên AI (agent) | Đơn vị bot tư vấn có bộ persona·quy tắc riêng. Có thể tạo nhiều bot khác nhau cho từng kênh·trang |
| Nhân viên mặc định | Agent mà widget dùng khi không chỉ định riêng (luôn hoạt động) |
| Đoạn mã điểm vào | Đoạn mã cài đặt để mở widget với một agent cụ thể |
| Persona / quy tắc trả lời | Mô tả giọng điệu·nguyên tắc của bot / danh sách quy tắc nhất định phải tuân thủ (được nạp vào bước ③ pipeline §0) |
| Nút kịch bản | Nút menu nhanh dưới cùng của widget. Chọn trong 7 loại hành động |
| Chức năng AI (function) | 5 vị trí AI được dùng (chat/rag/summary/assist/moderation) — mỗi vị trí chỉ định một công cụ |
| Quy tắc kiểm duyệt | Quy tắc cấm kiểm tra tin nhắn gửi đi (bước ④ pipeline §0) |
| Tái sử dụng câu trả lời | Chức năng phát lại câu trả lời cũ đã duyệt cho cùng câu hỏi, không gọi LLM |
| Ghi chú thay đổi | Dòng ghi chú để lại khi lưu persona·quy tắc — tra cứu trong lịch sử thay đổi cài đặt |

### 4.1 Nhân viên AI (đa persona)

**Quy trình**: chọn một agent trong thẻ *Nhân viên AI* thì các thẻ persona·quy tắc trả lời
bên dưới chuyển thành **của agent đó**. Dùng **[Thêm nhân viên]** đặt tên·mã (chữ thường)
để tạo agent mới, và quản lý **[Đặt làm mặc định]** / công tắc hoạt động / **[Xóa]**. Sao
chép **đoạn mã điểm vào** của từng agent và cài lên trang·kênh cụ thể thì bot đó sẽ tiếp khách.

💡 **Mẹo**
- Agent được **gán một lần khi phiên bắt đầu** — đổi đoạn mã giữa chừng cũng không đổi bot
  của phiên đang diễn ra.
- Vào bằng mã không tồn tại thì tự động rơi về agent mặc định, nên widget không bao giờ chết.
- "Nhân viên AI" ở đây không liên quan đến tài khoản nhân viên tư vấn (con người). Tài
  khoản người thật nằm ở menu [Người dùng].

### 4.2 Persona·quy tắc trả lời

**Quy trình**: viết nội dung persona → nhập **ghi chú thay đổi** → lưu. Quy tắc trả lời
thêm từng dòng bằng [Thêm quy tắc] (dòng trống bị loại khi lưu).

💡 **Mẹo**
- Persona chứa danh tính·tông giọng ("thân thiện, súc tích, lịch sự"), quy tắc chứa **ràng
  buộc hành vi** ("không khẳng định hoàn tiền đã hoàn tất") — tách ra như vậy sẽ dễ quản lý.
  Thông tin sự thật (phí giao hàng v.v.) không đặt ở đây mà đưa vào **tài liệu tri thức** —
  persona không được tìm kiếm.
- Sau khi lưu, hiệu lực có thể mất tối đa 60 giây do bộ nhớ đệm.
- Trong thẻ *Lịch sử thay đổi* có thể mở phiên bản cũ và **[Nạp vào ô soạn thảo]**, nhưng
  chỉ nạp thì chưa áp dụng — **phải lưu** mới có hiệu lực.

### 4.3 Nút kịch bản

**Quy trình**: từng hàng chỉnh `nhãn` (tối đa 60 ký tự) / `hành động` / ô chọn `đang bật` /
thứ tự (↑↓). 7 loại hành động:

| Hành động | Hành vi thực tế trong widget |
|---|---|
| Tình trạng giao hàng | Câu trả lời cố định về chính sách giao hàng + nút tiếp theo |
| Hủy / Hoàn tiền | Câu trả lời cố định về hủy·hoàn tiền·trả hàng + nút tiếp theo |
| Hỗ trợ sản phẩm | Menu con (cách dùng·thành phần·hàng về lại v.v.) |
| Liên hệ hỗ trợ | Biểu mẫu để lại liên hệ — đường kết nối nhân viên tư vấn |
| Đơn hàng của tôi | Chuyển đến tab đơn hàng sau khi xác minh danh tính |
| Cộng tác viên | Thẻ giới thiệu hợp tác |
| Gửi tin nhắn | **Gửi nguyên văn nhãn làm câu hỏi** → AI trả lời dựa trên tri thức |

Bấm **[Sửa câu trả lời]** để chỉnh nội dung phản hồi theo từng hành động bằng **tab 6 ngôn
ngữ** (có chấm đánh dấu đã viết hay chưa) và cấu hình các nút tiếp theo (nhãn·hành động·URL).

💡 **Mẹo**
- Muốn biến câu hỏi thường gặp thành nút, hãy dùng hành động **Gửi tin nhắn** với nhãn là
  câu hỏi (ví dụ: "Điều kiện miễn phí giao hàng là gì?").
- Thay vì xóa nút, hãy bỏ chọn `đang bật` để ẩn — kích hoạt lại sẽ dễ. Khuyến nghị luôn bật
  **Liên hệ hỗ trợ** — khách không tìm được nhân viên tư vấn sẽ rời đi.
- Đảm bảo nội dung câu trả lời cố định và nội dung chính sách trong tài liệu tri thức
  **không lệch nhau** — khi sửa chính sách hãy cập nhật cùng lúc.

### 4.4 Chức năng AI (công cụ·tham số)

**Quy trình**: trên hàng của từng chức năng chọn công cụ áp dụng, nhập `temperature` (0~1)·
`max_tokens` rồi lưu riêng từng mục. Chức năng chưa chỉ định hiển thị huy hiệu
`kế thừa/mặc định/stub` cùng tên công cụ thực tế đang áp dụng.

Công dụng của 5 chức năng:

| Chức năng | Công dụng thực tế |
|---|---|
| chat | Điều khiển hội thoại như phân loại ý định tin nhắn khách hàng |
| rag | **Tạo câu trả lời dựa trên tri thức — phần chính của câu trả lời khách nhìn thấy** |
| summary | Tóm tắt hội thoại (lịch sử·bản tóm tắt khi chuyển tiếp) |
| assist | Hỗ trợ AI trong bảng điều khiển của nhân viên tư vấn |
| moderation | Phán định LLM cho quy tắc cấm dạng ngữ cảnh (context) |

**Chuỗi dự phòng**: công cụ đã chọn không dùng được → mặc định của tenant → mặc định của
nền tảng → **stub** (trả lời demo) — tự động hạ bậc theo thứ tự đó nên hội thoại không bị đứt.

💡 **Mẹo**
- **max_tokens** là trần độ dài câu trả lời — trả lời chat thì 512~1024 là đủ.
- ⚠️ **temperature không được áp dụng cho công cụ Anthropic (Claude).** Các mô hình Claude
  hiện hành từ chối tham số lấy mẫu nên hệ thống chủ đích không gửi. Nhập cũng bị bỏ qua;
  chỉ áp dụng cho các công cụ dòng OpenAI.
- Còn huy hiệu `stub` thì chưa phải chất lượng dịch vụ thật — đăng ký công cụ là quyền của
  quản trị viên nền tảng (`/admin/ai-engines`).
- Mô hình embedding cho tìm kiếm tri thức không có trong màn hình này — được máy chủ quản
  lý dùng chung cho mọi tenant.

### 4.5 Quy tắc kiểm duyệt (cấm)

**Quy trình**: **[Thêm quy tắc]** → chọn loại/phạm vi/hành động:

| Mục | Lựa chọn | Ý nghĩa |
|---|---|---|
| Loại | Từ / Cụm từ | Khớp chứa (không phân biệt hoa thường) |
| | Biểu thức chính quy | Khớp mẫu (ví dụ: `\bphẫu thuật\b`) |
| | Ngữ cảnh (LLM) | Viết "cần chặn cái gì" thành câu, AI sẽ phán định từng tin nhắn |
| Phạm vi | Chỉ AI / Chỉ nhân viên / Cả hai | Kiểm tra tin nhắn của bên gửi nào |
| Hành động | Chặn | Không gửi tin nhắn ra (nếu là câu trả lời AI thì chuyển sang chuyển tiếp nhân viên tư vấn) |
| | Che | Chỉ phần vướng bị xử lý thành ▇▇▇ rồi chuyển đi |
| | Diễn đạt lại | AI sửa thành câu an toàn rồi chuyển đi |

💡 **Mẹo**
- Cổng kiểm duyệt này **không thể tắt**, và nếu bản thân việc kiểm tra thất bại thì vì an
  toàn sẽ xử lý là **chặn**. Nếu tin nhắn của nhân viên tư vấn bị từ chối gửi (có thông báo
  chặn), hãy đổi cách diễn đạt rồi gửi lại.
- Loại ngữ cảnh (LLM) dùng công cụ của chức năng moderation — nếu đang stub thì không có
  chất lượng phán định, hãy dùng sau khi kết nối công cụ thật.
- Quy tắc từ khóa quá mức sẽ chặn cả câu trả lời bình thường. Khuyến nghị bắt đầu bằng
  **Che/Diễn đạt lại**, xem log rồi mới nâng lên chặn. Quy tắc có hiệu lực trong tối đa 60 giây.

### 4.6 Tái sử dụng câu trả lời

**Quy trình**: trong thẻ *Tái sử dụng câu trả lời* có thể tìm các cặp hỏi-đáp đã lưu (lọc
chỉ mục đang bật), sửa/xóa từng mục, hoặc **[Tắt tất cả]** (sau khi xác nhận) để dừng hàng loạt.

💡 **Mẹo**: câu trả lời tái sử dụng được gửi ngay cho cùng câu hỏi mà không gọi LLM nên
nhanh và rẻ, nhưng **khi chính sách thay đổi, câu trả lời cũ có thể vẫn được gửi nguyên
xi.** Hãy đưa việc tìm·sửa hoặc tắt các mục liên quan vào danh sách kiểm tra mỗi khi sửa
chính sách. Câu trả lời tái sử dụng vẫn phải qua kiểm duyệt.

---

## 5. Cài đặt tiếp khách live chat
*(Mục *Chuyển tiếp tư vấn* trên trang **[Cài đặt gian hàng]** — đã được chuyển từ màn hình Cài đặt AI sang đây)*

**Thuật ngữ**

| Thuật ngữ | Ý nghĩa |
|---|---|
| Escalation (chuyển tiếp) | Việc AI đẩy hội thoại sang hàng chờ nhân viên tư vấn |
| Handoff (chuyển tiếp tư vấn) | Bộ cài đặt quyết định phân công·thời gian·hướng dẫn sau khi chuyển tiếp |
| Giờ làm việc | Khung giờ nhân viên tư vấn tiếp khách. Ngoài khung này chuyển sang hướng dẫn ngoài giờ·tiếp nhận qua email |
| SLA | Thời gian mục tiêu phản hồi. Tiêu chuẩn đánh giá mức độ trễ trong bảng điều khiển live chat |
| Hàng chờ (waiting) | Trạng thái hội thoại đã chuyển tiếp đang đợi nhân viên tư vấn tiếp nhận |

### 5.1 Người phụ trách·giờ làm việc·hướng dẫn ngoài giờ

**Quy trình**: trong mục *Chuyển tiếp tư vấn*
1. **Chỉ định người phụ trách** — tích chọn nhân viên tư vấn sẽ nhận chuyển tiếp
2. Công tắc **Dùng giờ làm việc** → múi giờ·giờ bắt đầu/kết thúc·ngày trong tuần, khi cần thêm công tắc **giờ nghỉ**
3. **Email tiếp nhận ngoài giờ** — địa chỉ nhận câu hỏi ngoài giờ làm việc (hiển thị cảnh báo nếu chưa cấu hình SMTP)
4. **Nội dung hướng dẫn ngoài giờ** — viết theo từng tab ngôn ngữ
5. **SLA** — nhập mục tiêu phản hồi thường/khẩn cấp (giờ, 1~168h) — là tiêu chuẩn cho huy hiệu trễ ⚠️/🔥 trên bảng yêu cầu
6. **Chuyển tiếp bắt buộc theo chính sách (deny-list)** — đăng ký quy tắc từ khóa (phân tách
   bằng phẩy) + loại yêu cầu + nhãn phụ trách. Tin nhắn khớp sẽ được **chuyển thẳng đến
   nhân viên tư vấn mà không qua AI**, và yêu cầu (issue) được tạo sẽ tự động gán loại·nhãn

💡 **Mẹo**
- Đặt **múi giờ** của giờ làm việc chính xác theo cửa hàng — cửa hàng ở Mỹ mà để giờ Hàn
  Quốc thì hướng dẫn sẽ ngược hết.
- Muốn dùng tiếp nhận email ngoài giờ thì cấu hình SMTP máy chủ phải có trước. Thấy cảnh
  báo thì đề nghị quản trị viên nền tảng.
- Không chỉ định người phụ trách nào thì hội thoại chuyển tiếp chỉ dồn trong hàng chờ
  chung. Hãy chỉ định tối thiểu 1 người.

### 5.2 Hiểu điều kiện chuyển tiếp (escalation)

Các trường hợp AI chuyển sang nhân viên tư vấn:

| Kích hoạt | Hành vi |
|---|---|
| **Độ tin cậy thấp** | Kèm câu "Tôi kết nối bạn với nhân viên tư vấn nhé?" vào câu trả lời và đưa vào hàng chờ |
| **Bị kiểm duyệt chặn** | Không hiển thị câu trả lời AI, hướng dẫn kết nối nhân viên tư vấn rồi đưa vào hàng chờ |
| **Khách yêu cầu** | Nút kịch bản *Liên hệ hỗ trợ* hoặc yêu cầu rõ ràng → vào hàng chờ ngay |
| **Chuyển tiếp bắt buộc theo chính sách (deny-list)** | Tin nhắn khớp từ khóa đã đăng ký vào hàng chờ **ngay lập tức, không có phản hồi AI** — tin nhắn vẫn được lưu·hiển thị bình thường, và yêu cầu được đóng dấu loại·nhãn (đây không phải chức năng chặn tin nhắn) |

💡 **Mẹo**
- Ngưỡng độ tin cậy không điều chỉnh được trên màn hình (chính sách trong mã) — nếu chuyển
  tiếp xảy ra thường xuyên, cách ứng phó đúng không phải là chỉnh ngưỡng mà là **bổ sung tri
  thức** (xác định nguyên nhân bằng bảng QA §3.1).
- Xử lý hội thoại đã chuyển tiếp (tiếp nhận·bản tóm tắt AI·kết thúc·phân công lại) làm tại
  bảng điều khiển live chat (`/live-chat`) — xem chương live chat của sổ tay tổng hợp.

---

## 6. Vòng lặp kiểm chứng·cải thiện
*(Studio bên phải của **[Cài đặt AI]** + thẻ kiểm tra hồi quy)*

**Thuật ngữ**

| Thuật ngữ | Ý nghĩa |
|---|---|
| Xem thử | Bảng thử nghiệm trò chuyện với bot mà không tạo phiên khách hàng thật |
| Huấn luyện AI | Chức năng phản hồi bằng ngôn ngữ tự nhiên "hãy trả lời thế này" để nhận **đề xuất** thay đổi cấu hình, chỉ áp dụng khi được duyệt |
| Đề xuất (proposal) | Thẻ phương án thay đổi cấu hình do huấn luyện tạo ra. Có thể áp dụng/bỏ qua/hoàn tác |
| Câu hỏi vàng | Danh sách câu hỏi đại diện muốn liên tục theo dõi chất lượng trả lời (đầu vào của kiểm tra hồi quy) |
| Kiểm tra hồi quy | Sau khi đổi cấu hình·tri thức, chạy lại toàn bộ câu hỏi vàng để xác nhận câu trả lời không tệ đi |
| Đo độ dao động | Chức năng chạy lặp lại cùng câu hỏi để xem câu trả lời dao động đến đâu |

### 6.1 Xem thử

**Quy trình**: tab **Xem thử** của studio → chọn ngôn ngữ → **[Phiên mới]** → chọn chế độ
(khách hàng/nhân viên) rồi nhập tin nhắn. Phản hồi hiển thị **huy hiệu agent** phụ trách và
**trạng thái chuyển tiếp**. Bấm **[Huấn luyện câu này]** trên từng phản hồi để đính lượt hội
thoại đó vào phần huấn luyện.

💡 **Mẹo**: đã đổi cấu hình thì sau khi lưu phải bắt đầu bằng **[Phiên mới]** mới thấy hội
thoại với cấu hình mới. Hãy đổi ngôn ngữ để kiểm tra các câu hỏi chính — ngôn ngữ trả lời
theo ngôn ngữ phiên.

### 6.2 Huấn luyện AI

**Quy trình**: tab **Huấn luyện AI** → chọn chủ đề hoặc [Chủ đề mới] → kiểm tra lượt tham
chiếu đã đính từ Xem thử rồi ra chỉ dẫn bằng ngôn ngữ tự nhiên (ví dụ: "Hướng dẫn hoàn tiền
dài quá. Gói trong 3 câu") → xem xét nội dung thay đổi trong **thẻ đề xuất** được tạo →
**[Áp dụng]** / **[Bỏ qua]** / sau khi áp dụng có **[Hoàn tác]**.

💡 **Mẹo**
- Huấn luyện **không thay đổi gì nếu chưa được duyệt.** Hãy đọc nội dung thay đổi thực tế
  (diff persona·quy tắc) trên thẻ đề xuất rồi mới áp dụng.
- **Thông tin sự thật** kiểu "miễn phí giao hàng cho đơn từ 50.000 won" là việc của tài
  liệu tri thức, không phải của huấn luyện — huấn luyện là công cụ tinh chỉnh giọng điệu·quy
  tắc hành vi.
- Câu chữ hơi khác đi là dao động bình thường. **Độ tin cậy giảm·chuyển tiếp tăng** mới là
  tín hiệu bất thường thật sự.

### 6.3 Kiểm tra hồi quy (câu hỏi vàng)

**Quy trình**: thẻ *Kiểm tra hồi quy* → đăng ký câu hỏi vàng (10~20 câu đại diện) →
**[Chạy ngay]** → trong danh sách các lần chạy gần đây bấm **[So với lần trước]** để so
sánh song song thay đổi của câu trả lời. **[Đo độ dao động]** cho thấy mức dao động của
cùng một câu hỏi.

💡 **Mẹo**
- Đưa vào câu hỏi vàng: ① câu hỏi gắn trực tiếp với doanh thu (giao hàng·hoàn tiền) ② câu
  từng bị trả lời sai ③ câu thuộc diện chính sách sắp sửa đổi.
- Lấy việc chạy một lần **ngay sau khi thay đổi tri thức hàng loạt·đồng bộ danh mục sản
  phẩm·sửa persona** làm thói quen vận hành. Huy hiệu `truncated` trong kết quả nghĩa là số
  câu hỏi vượt trần thực thi nên chỉ chạy được một phần.

---

## 7. Danh sách kiểm tra vận hành

**Khi chính sách thay đổi** (ví dụ: sửa phí giao hàng)
- [ ] Sửa tài liệu tri thức liên quan (tự động embedding lại) + tắt phiên bản cũ
- [ ] Kiểm tra nội dung câu trả lời cố định của kịch bản (Tình trạng giao hàng·Hủy/Hoàn tiền)
- [ ] Tìm các mục tái sử dụng câu trả lời → sửa/tắt câu trả lời cũ
- [ ] Kiểm tra 3 câu hỏi đại diện bằng bảng QA → chạy hồi quy câu hỏi vàng
- [ ] Cập nhật ngày hiệu lực·chu kỳ rà soát của tài liệu

**Thói quen hằng tuần**
- [ ] Dọn hộp đề xuất bổ sung tri thức·đề xuất câu trả lời (§3.4)
- [ ] Xử lý các mục chờ trong Rà soát mâu thuẫn (§3.2)
- [ ] Rà soát tài liệu có huy hiệu `stale` (§3.3)
- [ ] Chủ đề hay bị chuyển tiếp trong live chat → bổ sung tri thức

---

## 8. FAQ / Xử lý sự cố

**Q. Đã đăng ký tài liệu mà AI không biết nội dung đó.**
Kiểm tra ① tài liệu có đang bật (hiển thị ON) không ② tài liệu có xuất hiện trong danh sách
nguồn của bảng QA không. Nếu không hiện, hãy bổ sung tiêu đề·nội dung bằng từ ngữ của khách
hàng. Cũng kiểm tra kết quả đồng bộ danh mục sản phẩm có mục embedding thất bại không.

**Q. AI cứ chuyển sang nhân viên tư vấn.**
Kiểm tra độ tin cậy·nguồn của câu hỏi đó trong bảng QA. Không có tài liệu căn cứ thì đăng
ký là lời giải; có mà độ tin cậy thấp thì tách nhỏ tài liệu và bổ sung từ ngữ.

**Q. Tin nhắn của nhân viên tư vấn bị từ chối gửi.**
Đó là kiểm duyệt chặn. Hãy đổi cách diễn đạt vướng quy tắc cấm (§4.5) rồi gửi lại. Nếu quy
tắc quá gắt, đề nghị master nới hành động (chặn→che).

**Q. Câu trả lời chỉ ra tiếng Anh.**
Ngôn ngữ trả lời theo **ngôn ngữ phiên của khách hàng**. Hãy chỉ định ngôn ngữ trong Xem
thử để kiểm tra. Viết persona bằng tiếng Hàn hay không không liên quan đến ngôn ngữ trả lời.

**Q. Đồng bộ Google Drive/Notion được 0 mục.**
Phần lớn là do chia sẻ thư mục (email tài khoản dịch vụ) hoặc kết nối integration Notion bị
đứt. Hãy làm lại từ [Kiểm tra kết nối] ở thẻ thông tin xác thực.

**Q. Áp dụng đề xuất huấn luyện xong câu trả lời trở nên kỳ lạ.**
Khôi phục bằng **[Hoàn tác]** trên thẻ đề xuất đó; cũng có thể mở phiên bản trước trong
*Lịch sử thay đổi*, nạp vào ô soạn thảo rồi lưu.

**Q. Cùng một câu hỏi mà câu trả lời mỗi lần hơi khác nhau.**
Là dao động bình thường của LLM (mức dao động xem bằng [Đo độ dao động] §6.3). Nếu khác
nhau không phải ở câu chữ mà ở **nội dung**, hãy nghi ngờ mâu thuẫn tri thức (§3.2). Lưu ý
điều chỉnh temperature không áp dụng cho công cụ Anthropic (§4.4).

---

*Tiên quyết: [Sổ tay thiết lập nhanh](quick-setup.vi.md) · tham chiếu toàn bộ màn hình:
[Sổ tay người dùng (tổng hợp)](user-manual.vi.md) · chuyên sâu cài đặt AI:
AI-SETTINGS-GUIDE · widget: hướng dẫn cài đặt widget*
