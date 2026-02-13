# Debug Guide - Facebook Scraper

## Tổng quan
Hệ thống đã được tích hợp debug logging và screenshot tự động để phát hiện lỗi login redirect.

## Cấu trúc Debug

### 1. Screenshots tự động
Mỗi lần scrape sẽ tạo ra các file trong thư mục `debug_screenshots/`:

**Format tên file:** `[timestamp]_[psid_8_ký_tự]_[step].png`

**Các bước được chụp:**
- `01_after_navigation.png` - Ngay sau khi load trang Business Suite
- `02_after_select_conversation.png` - Sau khi chọn conversation
- `03_after_open_detail_panel.png` - Sau khi mở panel chi tiết
- `04_final.png` - Screenshot cuối cùng trước khi kết thúc
- `ERROR_login_redirect.png` - Khi phát hiện redirect về trang login
- `ERROR_exception.png` - Khi có exception xảy ra

### 2. HTML Snapshot
Mỗi lần scrape cũng lưu HTML của trang:
- `[timestamp]_[psid]_page.html` - Toàn bộ HTML để phân tích offline

### 3. Console Logging

#### Server.js logs:
```
[Queue] ⏳ Starting scrape for [Name] (PSID: [psid])...
[Queue] 📊 Current queue depth: processing
[Queue] ✅ Scrape completed for [psid]. Result: Success/Failed
[Queue] 📝 Profile Link: [link]
[Queue] 👤 Customer Name: [name]
[Server] 🔍 Processing scraped info...
[Server] ⚠️ WARNING: Scraped link is a login redirect!
[Server] ⚠️ Scraper returned NULL - will use fallback PSID link
```

#### Scraper.js logs:
```
[Scraper][timestamp_psid] Starting scrape for PSID: [psid], Name: [name], PageID: [pageId]
[Scraper][timestamp_psid] Loading [N] cookies
[Scraper][timestamp_psid] Navigating to: [url]
[Scraper][timestamp_psid] Current URL after navigation: [url]
[Scraper][timestamp_psid] Screenshot saved: [path]
[Scraper][timestamp_psid] HTML saved: [path]
[Scraper][timestamp_psid] ❌ Cookies expired - redirected to login page
[Scraper][timestamp_psid] Step 2: Selecting conversation for: [name]
[Scraper][timestamp_psid] Step 3: Opening detail panel...
[Scraper][timestamp_psid] Step 4: Extracting profile link and name...
[Scraper][timestamp_psid] Extracted info: {...}
[Scraper][timestamp_psid] Step 5: Moving conversation to inbox...
[Scraper][timestamp_psid] ✅ Scraping completed successfully
[Scraper][timestamp_psid] Browser closed
```

## Cách phân tích lỗi

### Lỗi Login Redirect (Cookies expired)
**Dấu hiệu:**
- Log: `❌ Cookies expired - redirected to login page`
- Screenshot: `ERROR_login_redirect.png` hiển thị trang login Facebook
- Profile link trong Google Sheets chứa `/login?next=`

**Nguyên nhân:**
1. Cookies đã hết hạn
2. Facebook phát hiện hoạt động bất thường
3. Session bị invalidate

**Giải pháp:**
1. Cập nhật cookies mới từ J2TEAM Cookie
2. Kiểm tra xem tài khoản Facebook có bị checkpoint không
3. Giảm tần suất scraping (tăng delay)

### Lỗi Timeout
**Dấu hiệu:**
- Log: `⚠️ Timeout waiting for conversation panel`
- Screenshot cho thấy trang chưa load xong

**Giải pháp:**
1. Tăng timeout trong code
2. Kiểm tra tốc độ mạng
3. Kiểm tra xem Facebook có thay đổi UI không

### Lỗi Extract Profile Link Failed
**Dấu hiệu:**
- Log: `Extracted info: { profileLink: null, customerName: ... }`
- Screenshot `04_final.png` không hiển thị profile link

**Giải pháp:**
1. Kiểm tra HTML snapshot để xem cấu trúc DOM
2. Cập nhật selector nếu Facebook thay đổi UI
3. Kiểm tra blacklist có chặn nhầm link hợp lệ không

## Monitoring thời gian thực

### Xem logs:
```bash
# Windows PowerShell
Get-Content -Path "path\to\logfile.txt" -Wait -Tail 50

# Hoặc chạy server với output
node server.js
```

### Kiểm tra screenshots:
```bash
# Mở thư mục debug
explorer d:\getlinkfb-v2\debug_screenshots

# Hoặc list files mới nhất
Get-ChildItem d:\getlinkfb-v2\debug_screenshots | Sort-Object LastWriteTime -Descending | Select-Object -First 10
```

## Cleanup

Để tránh đầy ổ cứng, nên xóa screenshots cũ định kỳ:

```bash
# Xóa screenshots cũ hơn 7 ngày
Get-ChildItem d:\getlinkfb-v2\debug_screenshots -Recurse | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-7)} | Remove-Item

# Xóa tất cả screenshots (cẩn thận!)
Remove-Item d:\getlinkfb-v2\debug_screenshots\* -Force
```

## Tips Debug

1. **So sánh screenshots:** Mở 2 screenshots cùng lúc để thấy sự khác biệt
2. **Kiểm tra HTML:** Dùng browser để mở file HTML và inspect DOM
3. **Pattern matching:** Tìm pattern trong logs để phát hiện lỗi lặp lại
4. **Timestamp correlation:** Dùng timestamp để match logs với screenshots

## Liên hệ
Nếu gặp lỗi lạ, hãy gửi kèm:
- Console logs
- Screenshots từ thư mục debug
- HTML snapshot
- Thời gian xảy ra lỗi
