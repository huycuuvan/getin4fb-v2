# HƯỚNG DẪN VẬN HÀNH HỆ THỐNG QUÉT INFO KHÁCH HÀNG

Tài liệu này hướng dẫn cách duy trì hoạt động cho hệ thống tự động lấy Link Facebook và Số điện thoại khách hàng từ Page đổ về Google Sheet.

!!! QUAN TRỌNG: Vì hệ thống đóng vai trò như một người dùng thật đi "soi" tin nhắn, nên nó cần **"Chìa khóa" (Cookies)** để đăng nhập. Nếu chìa khóa này hết hạn, phần mềm sẽ không lấy được link.

---

## 1. Chuẩn bị (Chỉ làm 1 lần)

Để an toàn cho Fanpage chính, bạn nên chuẩn bị:
1.  **Một nick Facebook phụ (Nick Clone)**.
2.  Set nick phụ này làm **Biên tập viên (Editor)** của các Page cần quét.
3.  Đăng nhập nick phụ này trên trình duyệt Chrome/Cốc Cốc máy tính.

*Lý do: Không nên dùng nick Admin chính chủ, phòng trường hợp Facebook bắt check-point (xác minh danh tính) thì không ảnh hưởng verify page.*

---

## 2. Cách lấy "Chìa khóa" (Cookies) - Làm định kỳ

Đây là bước quan trọng nhất. Nếu hệ thống báo lỗi hoặc không ra Link khách hàng, 99% là do Cookies bị lỗi hoặc hết hạn.

**Bước 1: Cài tiện ích lấy Cookies**
- Tải và cài đặt tiện ích **J2TEAM Cookies** (hoặc *Get token cookie cookie*) trên Chrome Store.
- Link: [Tìm trên Google "J2TEAM Cookies"]

**Bước 2: Lấy Cookies**
1.  Truy cập `facebook.com` bằng nick phụ ở trên.
2.  Bấm vào biểu tượng tiện ích **J2TEAM Cookies** trên thanh công cụ.
3.  Chọn nút **Export** (Xuất) -> Chọn **JSON**.
4.  Máy sẽ copy một đoạn mã dài vào bộ nhớ tạm (Clipboard).

**Bước 3: Cập nhật vào phần mềm**
1.  Mở file có tên `cookies.json` trong thư mục phần mềm (bằng Notepad).
2.  Xóa sạch nội dung cũ bên trong.
3.  Dán (Paste) đoạn mã vừa copy ở Bước 2 vào.
4.  Bấm **Save (Lưu lại)**.

*Sau khi lưu file, hệ thống sẽ tự động cập nhật lại chìa khóa mới. Bạn không cần làm gì thêm.*

---

## 3. Các lưu ý "Sống còn" để tool chạy ổn định

1.  **Tuyệt đối KHÔNG đăng xuất (Log out)** nick phụ trên trình duyệt máy tính sau khi đã lấy Cookies. Nếu bạn bấm Đăng xuất, mã Cookies cũ sẽ chết ngay lập tức. Chỉ cần tắt tab đi là được.
2.  **Nick phụ phải vào được Business Suite:** Đảm bảo nick đó khi truy cập `business.facebook.com` phải nhìn thấy được tin nhắn của Page.
3.  **Thay đổi mạng/địa điểm:** Nếu VPS (máy chủ) đặt ở nước ngoài hoặc địa điểm lạ, lần đầu nick phụ đăng nhập có thể bị Facebook khóa tạm (Checkpoint). Bạn cần mở nick đó trên máy tính, xác nhận "Đó là tôi" để mở khóa, sau đó lấy lại Cookies mới.

---

## 4. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| **Không thấy Link Profile về Sheet** | Cookies hết hạn hoặc Nick bị Checkpoint | Làm lại mục **"2. Cách lấy Chìa khóa"**. |
| **Vẫn có SĐT nhưng thiếu Link** | Khách chưa phản hồi hoặc mạng chậm | Hệ thống sẽ tự thử lại, không cần can thiệp. |
| **Dữ liệu Google Sheet không nhảy** | Google Sheet bị đầy hoặc lỗi mạng | Kiểm tra lại file Sheet, xóa bớt dòng trống bên dưới. |

---

## 5. Hướng dẫn thêm Fanpage Mới (Dành cho người biết kỹ thuật)

Để thêm một Page mới vào hệ thống, bạn cần truy cập vào Server và sửa file cấu hình.

**Bước 1: Chuẩn bị thông tin**
- **Page ID** của trang mới.
- **Page Access Token** (Lấy từ Facebook Developer - Graph API).
- **ID Google Sheet** muốn đổ dữ liệu về.

**Bước 2: Truy cập Server**
1. Mở phần mềm SSH (ví dụ: Putty hoặc Terminal).
2. Kết nối vào Server: `ssh root@<IP_CUA_BAN>`
3. Nhập mật khẩu.

**Bước 3: Truy cập thư mục phần mềm**
Gõ lệnh sau để vào thư mục chứa code (Ví dụ thư mục là `getlinkfb`):
```bash
cd getlinkfb
```

**Bước 4: Sửa file cấu hình**
Dùng trình soạn thảo `nano` để mở file:
```bash
nano config.json
```
- Di chuyển mũi tên xuống phần `"pages": { ... }`.
- Copy một đoạn cấu hình của Page cũ và dán thêm vào dưới cùng (nhớ có dấu phẩy `,` ngăn cách giữa các pages).
- Sửa lại `Page ID`, `Token`, `Tên Page` cho đúng.
- Bấm **Ctrl + O** -> **Enter** để Lưu.
- Bấm **Ctrl + X** để Thoát.

**Bước 5: Khởi động lại hệ thống**
Gõ lệnh sau để hệ thống nhận cấu hình mới:
```bash
pm2 restart all
```
*(Nếu thấy hiện chữ `online` màu xanh là thành công)*

---

**Cần hỗ trợ kỹ thuật, liên hệ:** Nguyễn Đình Huy - 0867868546
