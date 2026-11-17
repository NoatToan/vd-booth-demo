# Feedback 16/11/2026: bảng sửa và evidence

**Nguồn:** email "Visa Direct demo experience"
- Natalie Liew, 16/11 17:22: góc nhìn design và branding.
- Chị Hoa Nguyen, 16/11 23:02: nội dung và luồng.

**Design:** 4 file `.fig` được gửi lại giống từng byte với `figma/fig/*.fig` (bản 10/11). Figma chưa được cập nhật theo feedback, nên mọi thay đổi trong app điện thoại nằm ở `scripts/gen/client-edits.json`. File này chỉ áp vào bản kiosk, mỗi dòng ghi rõ lý do.

**Evidence:** mỗi mục có ảnh before và after, chụp ở 1920×1080 (kiosk) và 414 px (màn điện thoại).

| Thư mục | Nguồn |
|---|---|
| `before/` | https://vd-booth-demo.vercel.app trước khi deploy (commit 4c31b5d) |
| `after-local/` | Server local (`tests/e2e/serve.mjs`) |
| `after-deployed/` | https://vd-booth-demo.vercel.app sau khi deploy |

Tên ảnh: `k…` là ảnh toàn màn kiosk, `s…` là riêng một màn điện thoại.

## Bảng sửa

| # | Ai | Cần sửa | Vị trí | Nguyên nhân | Done | Before | After (local) | After (deployed) |
|---|---|---|---|---|---|---|---|---|
| 1 | Natalie | Logo Visa ở màn chờ nhỏ lại | Màn chờ `.kv-logo`: rộng 268 → 168 px | Lỗi mình (làm theo poster KV, không theo demo reference) | ☑ | [before](before/k01-attract.jpg) | [after](after-local/k01-attract.jpg) | [after](after-deployed/k01-attract.jpg) |
| 2 | Natalie | Bỏ chữ "SEND · RECEIVE" ở màn chờ | Màn chờ | Góp ý phần tự thiết kế | ☑ | [before](before/k01-attract.jpg) | [after](after-local/k01-attract.jpg) | [after](after-deployed/k01-attract.jpg) |
| 3 | Natalie | Nút Back ở "Choose your journey" | Màn chọn journey, góc trên trái | Góp ý phần tự thiết kế | ☑ | [before](before/k03-home.jpg) | [after](after-local/k03-home.jpg) | [after](after-deployed/k03-home.jpg) |
| 4 | Natalie | Một logo Visa Direct thống nhất mọi trang | Góc phải trên: chọn journey, journey, Done | Thiếu asset | ☑ (tạm, xem quyết định Q1) | [before](before/k09-flow-receive.jpg) | [after](after-local/k09-flow-receive.jpg) | [after](after-deployed/k09-flow-receive.jpg) |
| 5 | Natalie | Nền Payments in Motion (như màn chờ) cho mọi trang | Nền chọn journey, journey, Done | Góp ý phần tự thiết kế | ☑ | [before](before/k04-flow-send.jpg) | [after](after-local/k04-flow-send.jpg) | [after](after-deployed/k04-flow-send.jpg) |
| 6 | Natalie | Individual receiver: không thấy nút để đi tiếp | receive-3 "Share", receive-5 "Download Receipt" giờ là nút đi tiếp, có vòng nhấp nháy | Góp ý phần tự thiết kế (Figma không có CTA, mình đặt nút Next ngoài điện thoại) | ☑ | [3](before/k06-receive-3.jpg) · [5](before/k06-receive-5.jpg) | [3](after-local/k06-receive-3.jpg) · [5](after-local/k06-receive-5.jpg) | [3](after-deployed/k06-receive-3.jpg) · [5](after-deployed/k06-receive-5.jpg) |
| 7 | Natalie | Logo Visa sai trong app, cần thay | Chữ "VISA" đổi thành logo Visa: send-11, receive-1, family-11/12/13, travel-5/6/7/8 (các màn E-seller đã bỏ theo mục 8) | Thay đổi mới so với Figma (Figma vẽ chữ VISA làm logo tạm) | ☑ | [send-11](before/s-send-11.jpg) · [receive-1](before/s-receive-1.jpg) · [family-13](before/s-family-13.jpg) · [travel-5](before/s-travel-5.jpg) | [send-11](after-local/s-send-11.jpg) · [receive-1](after-local/s-receive-1.jpg) · [family-13](after-local/s-family-13.jpg) · [travel-5](after-local/s-travel-5.jpg) | [send-11](after-deployed/s-send-11.jpg) · [receive-1](after-deployed/s-receive-1.jpg) · [family-13](after-deployed/s-family-13.jpg) · [travel-5](after-deployed/s-travel-5.jpg) |
| 8 | Hoa | Xoá trải nghiệm E-seller withdrawal | Bỏ khỏi màn chọn journey, link `?zone=vxbs-seller`, phím tắt và form lead | Thay đổi mới (scope) | ☑ | [home](before/k03-home.jpg) · [link](before/k08-link-vxbs-seller.jpg) | [home](after-local/k03-home.jpg) · [link](after-local/k08-link-vxbs-seller.jpg) | [home](after-deployed/k03-home.jpg) · [link](after-deployed/k08-link-vxbs-seller.jpg) |
| 9 | Hoa | "Individual receiver" → "Global account receive" | Thẻ journey, nhãn journey, Done, form lead, link mới `?zone=global-account` | Thay đổi mới | ☑ | [before](before/k04-done-receive.jpg) | [after](after-local/k04-done-receive.jpg) | [after](after-deployed/k04-done-receive.jpg) |
| 10 | Hoa | "Virtual account" → "US receiving account" | receive-3: "US Receiving Account Number" | Thay đổi mới | ☑ | [before](before/s-receive-3.jpg) | [after](after-local/s-receive-3.jpg) | [after](after-deployed/s-receive-3.jpg) |
| 11 | Hoa | Logo Visa ở góc dưới phải của thẻ | travel-6 (thẻ "Card connected"): Visa ↔ "DEBIT · DEMO" | Thay đổi mới | ☑ | [before](before/s-travel-6.jpg) | [after](after-local/s-travel-6.jpg) | [after](after-deployed/s-travel-6.jpg) |
| 12 | Hoa | Thêm dòng "Address" ở Travel wallet | travel-5: thêm ô "Billing address" (tự điền) | Thay đổi mới | ☑ | [before](before/s-travel-5.jpg) | [after](after-local/s-travel-5.jpg) | [after](after-deployed/s-travel-5.jpg) |
| 13 | Hoa | Bỏ màn chờ nạp, thay bằng thông báo nạp tiền Visa, rồi tới "Top-up complete" | Bỏ travel-10 "Funding in progress"; sau khi bấm Approve ở travel-9, thông báo Visa trượt xuống khoảng 3 giây rồi sang Top-up complete | Thay đổi mới | ☑ (tạm, xem quyết định Q2) | [travel-10](before/s-travel-10.jpg) · [sau Approve](before/k13-travel-after-issuer.jpg) | [sau Approve](after-local/k13-travel-after-issuer.jpg) | [sau Approve](after-deployed/k13-travel-after-issuer.jpg) |
| 14 | Hoa | F&F: ghi rõ đang ở góc nhìn của ai | Nhãn trên điện thoại: "Minh Anh (receiver) view" ở bước 1–7, "Sarah (sender) view" ở 8–15, "Back to Minh Anh (receiver) view" ở 16–18 | Thay đổi mới | ☑ | [1](before/k14-family-1.jpg) · [8](before/k14-family-8.jpg) · [16](before/k14-family-16.jpg) | [1](after-local/k14-family-1.jpg) · [8](after-local/k14-family-8.jpg) · [16](after-local/k14-family-16.jpg) | [1](after-deployed/k14-family-1.jpg) · [8](after-deployed/k14-family-8.jpg) · [16](after-deployed/k14-family-16.jpg) |
| 15 | Hoa | F&F: bỏ "Linked card – Visa Debit" | family-3 "Create a payment request" | Thay đổi mới | ☑ | [before](before/s-family-3.jpg) | [after](after-local/s-family-3.jpg) | [after](after-deployed/s-family-3.jpg) |
| 16 | Hoa | F&F: "Billing ZIP" → "Address" | family-11 "Pay with Visa": nhãn "Address", ô gợi ý "Street address", tự điền "1 Market St, San Francisco, CA" | Thay đổi mới | ☑ | [before](before/s-family-11.jpg) | [after](after-local/s-family-11.jpg) | [after](after-deployed/s-family-11.jpg) |

## Các điểm tôi tự chốt (anh xem lại)

Email đã lưu thiếu thư mục ảnh và 2 file đính kèm, nên những điểm sau tôi tự quyết theo ngữ cảnh. Mỗi điểm đều sửa lại được nhanh.

| | Điểm chưa rõ | Đã chốt | Khi có thông tin thì |
|---|---|---|---|
| Q1 | File "Visa Direct Logo White.png" của Natalie không có trên máy | Dùng logo Visa Direct vector đang có (`brand/visa-direct-lockup.svg`, lấy từ Figma Make) cho mọi trang | Thay file, sửa đúng 1 hằng số `BRAND_DIRECT` trong `app.js` |
| Q2 | Thiếu video "Travel wallet screen.mp4" | Bỏ "Funding in progress". Sau khi bấm Approve, hiện thông báo kiểu iOS: "Visa · Top-up complete · AUD 500.00 added as VND 8,500,000 to your XinChaoVietnam wallet", rồi sang Top-up complete | Chỉnh lại theo video (`screens/behaviors.js` travel-9, `screens/phone.css` `.fx-notify`) |
| Q3 | Ảnh 18: "card" nằm ở màn nào | travel-6: thẻ Visa duy nhất có hình dạng thẻ. Visa xuống góc dưới phải, "DEBIT · DEMO" lên góc trên phải | Thêm hoặc đổi màn trong `client-edits.json` |
| Q4 | Ảnh 19: thêm "Address" ở màn nào | travel-5 "Add Visa card", ô "Billing address" ngay dưới Cardholder name, cùng cách với mục 16 bên F&F | Như trên |
| Q5 | Chữ "Virtual account" | Đổi thành "US Receiving Account Number" (giữ "Number" để nhãn vẫn đúng nghĩa) | Sửa 1 dòng text |
| Q6 | Natalie "không tìm thấy nút" | Ngoài nút Next bên ngoài điện thoại, nút chính trong app ("Share" ở bước 3, "Download Receipt" ở bước 5) giờ cũng đi tiếp và có vòng nhấp nháy như mọi CTA. Nút "Copy" vẫn không làm gì | Đổi `go` trong `client-edits.json` |
| Q7 | Logo Visa nhỏ lại bao nhiêu | 168 px (trước là 268 px, đúng tỉ lệ poster KV). Không mở lại được file demo reference (`.make`) | Đổi 1 số trong `index.html` |
| Q8 | Xoá E-seller | Gỡ khỏi booth: màn chọn journey, link, phím tắt, form lead. Dữ liệu Figma và generator vẫn giữ để bật lại nhanh khi chị Hoa trao đổi xong với Amazon. Link cũ `?zone=vxbs-seller` mở màn chờ chung | Bỏ các dòng `drop` của collect trong `client-edits.json` và thêm `collect` vào `app.js` |
| Q9 | Logo VISA ở send-5 (Natalie không liệt kê) | Để nguyên, đúng danh sách của Natalie | Thêm 1 dòng `visaMark` |
| Q10 | Nền mới | Ảnh KV màn chờ làm nền mọi trang, bỏ các vệt sáng vẽ bằng CSS, làm mờ hơn animation tuyến tiền (Natalie nói đang nhiều chuyển động) | `index.html` `#stage`, `#bg` |
| Q11 | Thẻ journey còn 4 | 4 thẻ một hàng: SEND, rồi RECEIVE × 3 | `index.html` `.grp.g3` |

## Kiểm tra (test)

| Kiểm tra | Local | Deployed |
|---|---|---|
| Verify harness (bản Figma): 61 màn, text, hình học, style, pixel, flow | 61/61 hard-green · flow PASS (0/1514 lỗi) | Bản trên domain trùng bản local: màn điện thoại chênh 0,00 % pixel |
| E2E Playwright: pixel từng màn so với Figma, 4 journey bấm từ đầu đến Done, chỉnh sửa của khách, palette travel, offline, khôi phục lỗi, heartbeat, TV mode | 76 passed, 2 skipped (soak, lead live) | `app.js` trên domain đã có `global-account` |
| Soak 3 phút: các journey chạy liên tục | PASS: 16 vòng / 3 phút, 0 lỗi, heap −0,23 MB, DOM +0 | (chạy trên local) |
| Ảnh before/after: các màn không đổi phải giống hệt | send-5, travel-9, travel-11: chênh 0,00 % pixel | send-5, travel-9, travel-11: chênh 0,00 % so với local |
| Ảnh before/after: các màn có đổi | Chỉ khác ở đúng chỗ đã sửa (xem bảng) | Mọi màn điện thoại chênh 0,00 % so với local. Ảnh kiosk chênh ≤ 1,1 % do animation nền ngẫu nhiên |

## Regression (so với bản trước khi sửa, commit 4c31b5d)

Chi tiết từng màn trong `regression.json`. Ảnh mỗi màn điện thoại được chụp hết chiều cao, so pixel 3 bản: bản cũ (4c31b5d), bản mới chạy local, bản mới trên domain.

| Kiểm tra | Kết quả |
|---|---|
| 40 màn không nằm trong danh sách sửa | Giống hệt bản cũ (0 % pixel) cả local lẫn domain |
| 12 màn có chỉnh sửa | Chỉ khác ở chỗ đã sửa (0,02–5,6 %). receive-5 0 % là đúng, vì chỉ đổi nút bấm để đi tiếp, không đổi hình |
| 9 màn bị bỏ (collect-1→8, travel-10) | Không còn trên cả local lẫn domain |
| Domain so với local | 52/52 màn: 0 % |
| Thứ tự các bước journey | SEND, F&F: không đổi. RECEIVE: bước 3 và 5 đi tiếp bằng Share / Download Receipt. Travel: bỏ bước 10. E-seller: đã gỡ |
| Verify harness (bản Figma) | 61/61 hard-green, flow PASS |
| Cú pháp cho trình duyệt TV (Chromium 68+) | `app.js` và `behaviors.js` qua được kiểm tra ES2019. Không thêm cú pháp mới so với bản cũ |
| Link trên domain: 4 zone, link cũ `vxbs-individual`, `/lead/`, `/status/`, `/tvcheck/`, `sw.js` | Đều trả 200 |
| Form lead | 4 lựa chọn, có "Global account receive", không còn E-seller |
| `/api/leads` không có key | 401 (vẫn được bảo vệ) |
| Danh sách file offline (`sw-assets.json`) | Không thiếu file nào |

## Giải thích nguyên nhân (để hiểu vì sao có các mục này)

Booth gồm 2 phần:
- **Màn điện thoại:** lấy 100 % từ Figma của khách.
- **Shell (khung kiosk bao quanh):** màn chờ, màn chọn journey, cột các bước, nút Next, nền, màn Done có QR. Figma không có phần này (email 9/11 chị Hoa viết: "tham khảo bản demo đang có"), nên mình tự thiết kế.

Từ đó, mỗi mục thuộc một trong 4 nhóm:

| Nhóm | Nghĩa | Mục | Bài học |
|---|---|---|---|
| **Lỗi mình** | Có design hoặc reference nhưng mình làm lệch | 1 | Khi có nhiều nguồn tham chiếu (poster KV và demo Make), hỏi khách nguồn nào là chuẩn |
| **Góp ý phần tự thiết kế** | Figma không có, mình tự thiết kế, khách muốn khác | 2, 3, 5, 6 | Không phải lỗi. Lần sau đưa phần shell cho khách duyệt sớm |
| **Thiếu asset** | Lúc làm chưa có file chính thức, mình dùng bản tạm | 4 | Ghi rõ "tạm" trong bản giao để khách biết cần gửi file |
| **Thay đổi mới so với Figma** | Mình làm đúng Figma, nay khách đổi yêu cầu | 7–16 | Không phải lỗi. Figma vẫn là nguồn chuẩn; thay đổi của khách nằm riêng trong `client-edits.json`, khi Figma được cập nhật thì xoá dòng tương ứng |

Tổng: **1/16 là lỗi mình**. 15 mục còn lại là góp ý, asset mới hoặc yêu cầu mới.
