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

**Bước 3: Cập nhật vào hệ thống (Cách mới - Khuyên dùng)**
1.  Truy cập trang Quản trị: `http://<IP_Server>:4000/admin`.
2.  Bấm nút **"Cập nhật Cookies"** (màu vàng).
3.  Dán (Paste) toàn bộ đoạn mã vừa copy ở Bước 2 vào ô trống.
4.  Bấm **"Lưu Cookies"**. Hệ thống sẽ báo "Thành công".

**Cách 2: Cập nhật thủ công (Dành cho kỹ thuật)**
1.  Mở file có tên `cookies.json` trong thư mục phần mềm (bằng Notepad).
2.  Xóa sạch nội dung cũ bên trong và dán đoạn mã mới vào -> Lưu lại.

*Sau khi cập nhật (bằng bất kỳ cách nào), hệ thống sẽ tự động sử dụng chìa khóa mới ngay lập tức.*

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

## 5. Hướng dẫn quản lý Fanpage (Thêm/Sửa/Xóa)

Hệ thống đã tích hợp giao diện quản trị (Admin Panel) giúp bạn quản lý danh sách Fanpage dễ dàng mà không cần động vào mã nguồn.

### 5.1. Truy cập trang Quản trị
1.  **Đường dẫn:** `http://<IP_Server_Của_Bạn>:4000/admin` (hoặc đường dẫn Ngrok nếu dùng bản miễn phí).
2.  **Thông tin đăng nhập:**
    *   **Tên đăng nhập:** `admin`
    *   **Mật khẩu:** `admin123`

### 5.2. Các chức năng chính
*   **Thêm Page mới:** Bấm nút **"Thêm Page Mới"**, điền Tên Page, ID và Token. Các trường Google Sheet đã được để mặc định (ẩn đi), bạn không cần quan tâm.
*   **Sửa cấu hình:** Bấm biểu tượng 📝 (Sửa) trên dòng của Page đó để cập nhật lại Token nếu Page bị đổi Token.
*   **Xóa Page:** Bấm biểu tượng 🗑️ (Thùng rác) để gỡ bỏ Page khỏi hệ thống quét.

*Lưu ý: Sau khi bấm "Lưu", hệ thống sẽ tự động khởi động lại sau 2 giây để áp dụng thay đổi.*

---

## 6. Lưu ý kỹ thuật dành cho người cài đặt (SSH & CLI)

Nếu không thể truy cập giao diện Web, bạn vẫn có thể thao tác bằng dòng lệnh:

1.  **Sửa thủ công:** `cd` vào thư mục dự án -> `nano config.json`.
2.  **Xem Log (Lịch sử chạy):** Để xem hệ thống có đang quét hay không, gõ:
    ```bash
    pm2 logs fb-tool
    ```
3.  **Khởi động lại toàn bộ:**
    ```bash
    pm2 restart all
    ```

---

**Cần hỗ trợ kỹ thuật, liên hệ:** Nguyễn Đình Huy - 0867868546

