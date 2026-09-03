# Go2Joy — danh bạ link khách sạn (thu ngày 2026-08-25)

Nguồn: listing công khai trên `go2joy.vn/vi-vn` (đọc DOM qua browser, không crawl diện rộng).
Kèm tài liệu phân tích: `docs/analysis/REQ-260825-Go2Joy-ChatAgent-BizModel.md` §9.5.

## Cách link được dựng

```
https://go2joy.vn/vi-vn/hotel/{slug}-{id}          id = "100004" + hotelSn
hotelSn lấy từ đường dẫn ảnh:  s3.go2joy.vn/350w/hotel/{hotelSn}/...
```

- **Chỉ `id` quyết định**, `slug` là trang trí — slug sai + id đúng vẫn mở đúng khách sạn;
  slug đúng mà thiếu id thì bị đẩy về trang chủ.
- Đường dẫn cũ `/vi-vn/hoteldetail/{slug}-{id}` **301** sang `/vi-vn/hotel/{slug}-{id}`.
- **Phép thử tính hợp lệ** (không cần tải trang, tiết kiệm request):
  URL đúng → `301`, giữ nguyên path, chỉ thêm `?startDate=…&endDate=…`.
  URL sai → `302` về `https://go2joy.vn/vi-vn`.
  Đã kiểm chứng bằng URL đối chứng bịa ra: `khong-ton-tai-999999999` → 302.

Trạng thái verify: **22/80 link đã test HTTP thật, 22/22 VALID** (12 ở nhóm trọng tâm §9.5.1 +
10 mẫu ngẫu nhiên). 58 link còn lại dựng theo cùng công thức, chưa test từng cái.

---

## A. Nhóm trọng tâm — khách sạn có website riêng (đã verify từng link)

### Khách Sạn Sạch — website: http://khachsansach.vn/
| Khách sạn | Quận | Link Go2Joy |
|---|---|---|
| Sạch Hotel - Hoa Cúc (4.6 — 209 review) | Phú Nhuận | https://go2joy.vn/vi-vn/hotel/sach-hotel-hoa-cuc-100004938 |
| Sạch Hotel - Phan Xích Long (4.8 — 157) | Phú Nhuận | https://go2joy.vn/vi-vn/hotel/sach-hotel-phan-xich-long-10000432659 |

### Lá Hotel — website: https://lahotel.vn/ (WordPress + WooCommerce, wp-json mở, đã dùng Crisp)
| Khách sạn | Quận | Link Go2Joy |
|---|---|---|
| Lá Hotel Bình Tân (4.9 — 5.571) | Bình Tân | https://go2joy.vn/vi-vn/hotel/la-hotel-binh-tan-10000410431 |
| Lá Hotel Trương Công Định (4.9 — 1.580) | Tân Bình | https://go2joy.vn/vi-vn/hotel/la-hotel-truong-cong-dinh-10000434631 |
| Lá Hotel Thoại Ngọc Hầu (4.9 — 1.651) | Tân Phú | https://go2joy.vn/vi-vn/hotel/la-hotel-thoai-ngoc-hau-10000435777 |
| Lá Hotel Nguyễn Văn Dung (4.9 — 1.219) | Gò Vấp | https://go2joy.vn/vi-vn/hotel/la-hotel-nguyen-van-dung-10000437342 |
| Lá Hotel Gò Vấp | Gò Vấp | https://go2joy.vn/vi-vn/hotel/la-hotel-go-vap-1000041130 |
| Lá Hotel (chi nhánh gốc) | — | https://go2joy.vn/vi-vn/hotel/la-hotel-1000041067 |

### Đào Tiên Hotel — website: https://www.daotienhotel.com/ (Wix, 13 chi nhánh)
| Khách sạn | Quận | Link Go2Joy |
|---|---|---|
| Đào Tiên Hotel Trường Chinh (4.8 — 1.869) | Tân Bình | https://go2joy.vn/vi-vn/hotel/dao-tien-hotel-truong-chinh-10000435426 |
| Đào Tiên Hotel Bình Thạnh (4.9 — 1.996) | Bình Thạnh | https://go2joy.vn/vi-vn/hotel/dao-tien-hotel-binh-thanh-10000433469 |
| Đào Tiên 3 Hotel | — | https://go2joy.vn/vi-vn/hotel/dao-tien-3-hotel-1000043254 |

### Đức Đạt Hotel — ⛔ domain `hotelducdat.com` đã mất (nay là site người lớn), không có domain thay thế
| Khách sạn | Quận | Link Go2Joy |
|---|---|---|
| Đức Đạt Hotel (4.7 — 5.655) | Gò Vấp | https://go2joy.vn/vi-vn/hotel/duc-dat-hotel-1000041003 |
| Đức Đạt 2 Hotel | — | https://go2joy.vn/vi-vn/hotel/duc-dat-2-hotel-1000041764 |
| Hoàng Quân Hotel - Đức Đạt Luxury (4.8 — 5.181) | Gò Vấp | https://go2joy.vn/vi-vn/hotel/hoang-quan-hotel-duc-dat-luxury-1000041135 |

---

## B. Toàn bộ listing thu được (80 khách sạn, TP.HCM)

Dấu ✅ = đã test HTTP thật.

| # | Khách sạn | Quận | Link Go2Joy | Verify |
|---|---|---|---|---|
| 1 | Linh Ngọc Châu Motel | Bình Tân | https://go2joy.vn/vi-vn/hotel/linh-ngoc-chau-motel-10000435643 | |
| 2 | Đức Phúc Hotel | Quận 12 | https://go2joy.vn/vi-vn/hotel/duc-phuc-hotel-10000432417 | |
| 3 | Bình Hưng Hotel | Tân Bình | https://go2joy.vn/vi-vn/hotel/binh-hung-hotel-1000044517 | |
| 4 | Sạch Hotel - Hoa Cúc | Phú Nhuận | https://go2joy.vn/vi-vn/hotel/sach-hotel-hoa-cuc-100004938 | ✅ |
| 5 | Sạch Hotel - Phan Xích Long | Phú Nhuận | https://go2joy.vn/vi-vn/hotel/sach-hotel-phan-xich-long-10000432659 | ✅ |
| 6 | Tuấn Anh 2 Hotel | Tân Bình | https://go2joy.vn/vi-vn/hotel/tuan-anh-10000442498 | |
| 7 | Anna Hotel | Quận 3 | https://go2joy.vn/vi-vn/hotel/anna-hotel-10000435509 | |
| 8 | Lá Hotel Bình Tân | Bình Tân | https://go2joy.vn/vi-vn/hotel/la-hotel-binh-tan-10000410431 | ✅ |
| 9 | Cosy Hotel | Gò Vấp | https://go2joy.vn/vi-vn/hotel/cosy-hotel-10000434891 | ✅ |
| 10 | Đức Đạt Hotel | Gò Vấp | https://go2joy.vn/vi-vn/hotel/duc-dat-hotel-1000041003 | ✅ |
| 11 | Passion Lux - Cloud Passion Hotel | Tân Bình | https://go2joy.vn/vi-vn/hotel/passion-lux-cloud-passion-hotel-10000435630 | |
| 12 | Amy Hotel | Bình Chánh | https://go2joy.vn/vi-vn/hotel/amy-hotel-1000042050 | ✅ |
| 13 | Ngọc San San Hotel | Bình Chánh | https://go2joy.vn/vi-vn/hotel/ngoc-san-san-hotel-10000431690 | |
| 14 | Minh Ngọc Hotel | Bình Chánh | https://go2joy.vn/vi-vn/hotel/minh-ngoc-hotel-10000435480 | |
| 15 | Lux Hotel | Bình Chánh | https://go2joy.vn/vi-vn/hotel/lux-hotel-1000043598 | |
| 16 | Prince Hotel | Gò Vấp | https://go2joy.vn/vi-vn/hotel/prince-hotel-10000431146 | |
| 17 | Hoàng Quân Hotel - Đức Đạt Luxury | Gò Vấp | https://go2joy.vn/vi-vn/hotel/hoang-quan-hotel-duc-dat-luxury-1000041135 | ✅ |
| 18 | Trần Long Hotel | Quận 12 | https://go2joy.vn/vi-vn/hotel/tran-long-hotel-10000434628 | |
| 19 | Rose Hotel | Bình Chánh | https://go2joy.vn/vi-vn/hotel/rose-hotel-1000041058 | ✅ |
| 20 | Khách Sạn Sao Mai | Phú Nhuận | https://go2joy.vn/vi-vn/hotel/khach-san-sao-mai-1000046535 | |
| 21 | Amana Hotel - Trung Sơn | Bình Chánh | https://go2joy.vn/vi-vn/hotel/amana-hotel-trung-son-10000443089 | |
| 22 | Chill Hotel | Bình Thạnh | https://go2joy.vn/vi-vn/hotel/chill-hotel-10000413009 | ✅ |
| 23 | Chaud Hotel | Gò Vấp | https://go2joy.vn/vi-vn/hotel/chaud-hotel-10000443372 | |
| 24 | Centoria Hotel | Gò Vấp | https://go2joy.vn/vi-vn/hotel/centoria-hotel-10000443016 | |
| 25 | New Sunny Hotel | Gò Vấp | https://go2joy.vn/vi-vn/hotel/new-sunny-hotel-10000443376 | |
| 26 | Đào Tiên Hotel Trường Chinh | Tân Bình | https://go2joy.vn/vi-vn/hotel/dao-tien-hotel-truong-chinh-10000435426 | ✅ |
| 27 | B&k Hotel | Quận 10 | https://go2joy.vn/vi-vn/hotel/bk-hotel-10000435120 | ✅ |
| 28 | Lalala Inn | Quận 3 | https://go2joy.vn/vi-vn/hotel/lalala-inn-10000435110 | |
| 29 | Lá Hotel Trương Công Định | Tân Bình | https://go2joy.vn/vi-vn/hotel/la-hotel-truong-cong-dinh-10000434631 | ✅ |
| 30 | Phúc Hưng Hotel | Tân Bình | https://go2joy.vn/vi-vn/hotel/phuc-hung-hotel-10000434023 | |
| 31 | The Passion Suites | Quận 1 | https://go2joy.vn/vi-vn/hotel/the-passion-suites-10000433849 | ✅ |
| 32 | GREEN RIVERSIDE HOTEL | Tân Bình | https://go2joy.vn/vi-vn/hotel/green-riverside-hotel-10000433825 | |
| 33 | Thao Dien Apartment | Quận 2 | https://go2joy.vn/vi-vn/hotel/thao-dien-apartment-10000433657 | |
| 34 | The Passion Hotel & Apartment | Tân Bình | https://go2joy.vn/vi-vn/hotel/the-passion-hotel-apartment-10000433475 | |
| 35 | Đào Tiên Hotel Bình Thạnh | Bình Thạnh | https://go2joy.vn/vi-vn/hotel/dao-tien-hotel-binh-thanh-10000433469 | ✅ |
| 36 | Solana Garden Hotel | Gò Vấp | https://go2joy.vn/vi-vn/hotel/solana-garden-hotel-10000433339 | |
| 37 | Kim Anh Hotel | Bình Chánh | https://go2joy.vn/vi-vn/hotel/kim-anh-hotel-10000433110 | |
| 38 | Bình Triệu Hotel | Bình Thạnh | https://go2joy.vn/vi-vn/hotel/binh-trieu-hotel-10000432654 | |
| 39 | Cozrum Homes – Spring Residence | Bình Thạnh | https://go2joy.vn/vi-vn/hotel/cozrum-homes-spring-residence-10000432198 | |
| 40 | Palas House | Tân Bình | https://go2joy.vn/vi-vn/hotel/palas-house-10000432187 | |
| 41 | Như Ý Hotel Tân Phú | Tân Phú | https://go2joy.vn/vi-vn/hotel/nhu-y-hotel-tan-phu-10000431691 | |
| 42 | Bảo Long 1 Hotel | Gò Vấp | https://go2joy.vn/vi-vn/hotel/bao-long-10000431683 | |
| 43 | Bảo Long 2 Hotel | Gò Vấp | https://go2joy.vn/vi-vn/hotel/bao-long-10000431682 | |
| 44 | COLE HOTEL & APARTMENT | Tân Bình | https://go2joy.vn/vi-vn/hotel/cole-hotel-apartment-10000431637 | |
| 45 | Thảo Nguyên Hotel | Thủ Đức | https://go2joy.vn/vi-vn/hotel/thao-nguyen-hotel-10000431422 | |
| 46 | Cactusland Hotel Tân Bình | Tân Bình | https://go2joy.vn/vi-vn/hotel/cactusland-hotel-tan-binh-10000431153 | |
| 47 | YOURS Phú Nhuận | Phú Nhuận | https://go2joy.vn/vi-vn/hotel/yours-phu-nhuan-10000431150 | |
| 48 | Warm Way 3 Apartments | Quận 7 | https://go2joy.vn/vi-vn/hotel/warm-way-10000431144 | ✅ |
| 49 | Seawa Hideaway Saigon | Quận 2 | https://go2joy.vn/vi-vn/hotel/seawa-hideaway-saigon-10000435891 | |
| 50 | Tân Hoàng Yến Hotel | Gò Vấp | https://go2joy.vn/vi-vn/hotel/tan-hoang-yen-hotel-10000435448 | |
| 51 | La Maison En Adagio - Sleep And Heal | Quận 1 | https://go2joy.vn/vi-vn/hotel/la-maison-en-adagio-sleep-and-heal-10000435447 | |
| 52 | Sài Gòn Heat Hotel | Thủ Đức | https://go2joy.vn/vi-vn/hotel/sai-gon-heat-hotel-10000435439 | |
| 53 | Đào Gia 2 Apartment | Quận 7 | https://go2joy.vn/vi-vn/hotel/dao-gia-10000435434 | |
| 54 | Ánh Sao Hotel | Bình Tân | https://go2joy.vn/vi-vn/hotel/anh-sao-hotel-10000435433 | |
| 55 | A25 Premium Hotel - 65G Nguyễn Thái Học | Quận 1 | https://go2joy.vn/vi-vn/hotel/a25-premium-hotel-10000435123 | |
| 56 | Romance Hotel | Thủ Đức | https://go2joy.vn/vi-vn/hotel/romance-hotel-10000435116 | |
| 57 | Hotel Minh Quang | Quận 10 | https://go2joy.vn/vi-vn/hotel/hotel-minh-quang-10000435112 | |
| 58 | Khách Sạn Thy Thảo | Quận 10 | https://go2joy.vn/vi-vn/hotel/khach-san-thy-thao-10000435103 | ✅ |
| 59 | Hoàng Long Hotel | Bình Chánh | https://go2joy.vn/vi-vn/hotel/hoang-long-hotel-10000434918 | |
| 60 | Hà Bảo Châu Hotel Tự Lập | Tân Bình | https://go2joy.vn/vi-vn/hotel/ha-bao-chau-hotel-tu-lap-10000434915 | |
| 61 | Ara Gem Hotel | Bình Thạnh | https://go2joy.vn/vi-vn/hotel/ara-gem-hotel-10000434914 | |
| 62 | Trung Mai Hotel | Tân Bình | https://go2joy.vn/vi-vn/hotel/trung-mai-hotel-10000434641 | |
| 63 | Hoàng Long Hotel By Cozrum | Quận 10 | https://go2joy.vn/vi-vn/hotel/hoang-long-hotel-by-cozrum-10000434640 | |
| 64 | Ly Ly Hotel 2 | Bình Tân | https://go2joy.vn/vi-vn/hotel/ly-ly-hotel-10000434629 | |
| 65 | Mimosa Hotel | Quận 10 | https://go2joy.vn/vi-vn/hotel/mimosa-hotel-10000434454 | |
| 66 | Hà Bảo Châu Hotel Lê Tấn Quốc | Tân Bình | https://go2joy.vn/vi-vn/hotel/ha-bao-chau-hotel-le-tan-quoc-10000434077 | |
| 67 | Duy Khang Hotel | Bình Chánh | https://go2joy.vn/vi-vn/hotel/duy-khang-hotel-10000434067 | |
| 68 | Happy Hotel Bình Tân | Bình Tân | https://go2joy.vn/vi-vn/hotel/happy-hotel-binh-tan-10000433975 | |
| 69 | Love Luxury Hotel Bà Điểm | Hóc Môn | https://go2joy.vn/vi-vn/hotel/love-luxury-hotel-ba-diem-10000435625 | |
| 70 | Bảo Minh Grand HM Hotel | Hóc Môn | https://go2joy.vn/vi-vn/hotel/bao-minh-grand-hm-hotel-10000435125 | |
| 71 | Ngôi Sao Nhỏ Hotel | Bình Chánh | https://go2joy.vn/vi-vn/hotel/ngoi-sao-nho-hotel-10000435520 | |
| 72 | Secret Garden Hotel Bến Thành | Quận 1 | https://go2joy.vn/vi-vn/hotel/secret-garden-hotel-ben-thanh-10000435570 | ✅ |
| 73 | Midas Hotel 3 | Bình Thạnh | https://go2joy.vn/vi-vn/hotel/midas-hotel-10000435571 | |
| 74 | Lá Hotel Thoại Ngọc Hầu | Tân Phú | https://go2joy.vn/vi-vn/hotel/la-hotel-thoai-ngoc-hau-10000435777 | ✅ |
| 75 | Đông Như 5 Hotel | Gò Vấp | https://go2joy.vn/vi-vn/hotel/dong-nhu-10000437215 | |
| 76 | Bin Bin Hotel 16 – Near Bui Vien | Quận 1 | https://go2joy.vn/vi-vn/hotel/bin-bin-hotel-10000437164 | |
| 77 | Cinenest Home | Tân Bình | https://go2joy.vn/vi-vn/hotel/cinenest-home-10000436016 | |
| 78 | Stayin' Vibe Home | Quận 11 | https://go2joy.vn/vi-vn/hotel/stayin-vibe-home-10000435893 | |
| 79 | Venus Secret Hotel | Bình Tân | https://go2joy.vn/vi-vn/hotel/venus-secret-hotel-10000435782 | |
| 80 | Pynt Hotel Vạn Kiếp | Bình Thạnh | https://go2joy.vn/vi-vn/hotel/pynt-hotel-van-kiep-10000435663 | |
| 81 | Friday Hi Hotel | Quận 10 | https://go2joy.vn/vi-vn/hotel/friday-hi-hotel-10000434054 | ✅ |
| 82 | Lá Hotel Nguyễn Văn Dung | Gò Vấp | https://go2joy.vn/vi-vn/hotel/la-hotel-nguyen-van-dung-10000437342 | ✅ |
| 83 | Lá Hotel Gò Vấp | Gò Vấp | https://go2joy.vn/vi-vn/hotel/la-hotel-go-vap-1000041130 | ✅ |
| 84 | Lá Hotel (gốc) | — | https://go2joy.vn/vi-vn/hotel/la-hotel-1000041067 | ✅ |
| 85 | Đào Tiên 3 Hotel | — | https://go2joy.vn/vi-vn/hotel/dao-tien-3-hotel-1000043254 | ✅ |
| 86 | Đức Đạt 2 Hotel | — | https://go2joy.vn/vi-vn/hotel/duc-dat-2-hotel-1000041764 | ✅ |

## Ghi chú độ chính xác
- Tên/quận đọc từ card listing nên một số tên bị rút gọn ở phần hậu tố số (ví dụ *Bảo Long 1/2*,
  *Ly Ly Hotel 2*, *Midas Hotel 3* → slug mất số). **Không ảnh hưởng** vì slug không quyết định.
- Vài dòng quận bị lệch do card không hiển thị quận (đã chỉnh tay khi đối chiếu được).
- Đây là snapshot listing trang chủ ngày 2026-08-25 (Flash Sale / Ưu đãi / gợi ý), **không phải
  toàn bộ mạng lưới** — Go2Joy công bố 5.500–10.000 khách sạn.
