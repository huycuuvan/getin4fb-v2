# Facebook Messenger to Google Sheets Automation

Hệ thống tự động thu thập thông tin khách hàng từ Messenger và lưu vào Google Sheets.

## 1. Cấu trúc thư mục
- `server.js`: File chạy chính.
- `services/`: Chứa các module xử lý Facebook và Google Sheets.
- `config.json`: Cấu hình Token và ID.
- `service_account.json`: File chứng thực của Google.

## 2. Hướng dẫn cài đặt

### Bước 1: Chuẩn bị Google Sheets
1. Tạo một trang tính Google mới.
2. Tạo các cột tiêu đề tại hàng 1:
   - A: Thời gian
   - B: ID Khách (PSID)
   - C: Họ tên
   - D: Nội dung tin nhắn
   - E: Link Profile
   - F: Link Admin Chat
3. Chia sẻ quyền chỉnh sửa (Editor) cho Email của **Service Account** (có trong file `service_account.json`).

### Bước 2: Cấu hình Facebook App
1. Tạo App trên [Facebook Developers](https://developers.facebook.com/).
2. Thêm sản phẩm **Messenger**.
3. Lấy `Page Access Token` và `Page ID`.
4. Cài đặt Webhook trỏ tới URL của server bạn (ví dụ: `https://your-domain.com/webhook`).
5. Điền `Verify Token` tự chọn.

### Bước 3: Cập
## Cách sử dụng

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Cấu hình file `config.json`
Điền thông tin Page Access Token, Spreadsheet ID cho từng Page.

### 3. Cấu hình Google Service Account
Đặt file `service_account.json` vào thư mục gốc.

### 4. **MỚI: Đăng nhập Facebook để scraper hoạt động**
Để lấy được Link Profile thật của khách hàng, bạn cần đăng nhập Facebook một lần:

```bash
node scripts/login.js
```

- Một cửa sổ Chrome sẽ mở ra
- Đăng nhập Facebook bằng tay (khuyến nghị dùng nick clone, không dùng nick chính)
- Sau khi đăng nhập xong, quay lại terminal và nhấn ENTER
- Cookies sẽ được lưu vào file `cookies.json`

**Lưu ý**: 
- Chỉ cần login 1 lần, cookies sẽ được lưu lại
- Nếu cookies hết hạn, chạy lại `node scripts/login.js`
- Scraper sẽ tự động dùng cookies này để lấy profile link

### 5. Chạy server
```bash
node server.js
```

### 6. Cấu hình Webhook trên Facebook
- Callback URL: `https://your-domain.com/webhook`
- Verify Token: Giá trị trong `config.json`
- Subscribe các Page cần theo dõi

## Cách hoạt động

1. **Nhận tin nhắn**: Facebook gửi webhook về server
2. **Lấy tên khách hàng**: Gọi API qua Message ID
3. **Lấy Profile Link**: 
   - Thử parse từ API (thường thất bại)
   - Dùng Puppeteer scrape từ `mbasic.facebook.com` (cần cookies)
   - Fallback: Dùng PSID (không click được)
4. **Tạo Link Admin Chat**: Link vào Business Suite
5. **Lưu vào Google Sheets**: Tự động append dữ liệu
cuối cùng của Google Sheets.

## 4. Test thử
Bạn có thể dùng file `test_webhook.js` để giả lập một tin nhắn gửi đến (Cần chạy server trước):
```bash
node test_webhook.js
```
