# HƯỚNG DẪN CÀI ĐẶT SERVER LÊN VPS (UBUNTU) TỪ CON SỐ 0

Tài liệu này hướng dẫn kỹ thuật viên cài đặt môi trường và mã nguồn lên một VPS trắng (Ubuntu).

---

## 1. Cập nhật hệ thống và Cài đặt thư viện cần thiết
Đăng nhập vào VPS quyền root, sau đó chạy lần lượt các lệnh sau:

### 1.1. Cập nhật VPS
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2. Cài đặt các thư viện lõi cho Chrome (Puppeteer)
Vì Web Scraper dùng trình duyệt Chrome ẩn danh, ta cần cài đủ bộ thư viện sau (Copy nguyên khối paste vào terminal):

```bash
sudo apt-get install -y ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils zip unzip
```

---

## 2. Cài đặt NodeJS (Môi trường chạy code)
Sử dụng Node.js phiên bản 18 hoặc 20 LTS.

```bash
# Tải setup Node 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Cài đặt Node
sudo apt-get install -y nodejs

# Kiểm tra cài thành công chưa (Hiện version là ok)
node -v
npm -v
```

---

## 3. Cài đặt PM2 (Công cụ quản lý tiến trình)
PM2 giúp code tự khởi động lại nếu bị lỗi hoặc server reboot.

```bash
sudo npm install -g pm2
```

---

## 4. Cài đặt Ngrok (Tạo đường dẫn HTTPS)
Vì khách hàng không có Domain riêng, ta dùng Ngrok để tạo đường link HTTPS cho Facebook Webhook.

### 4.1. Cài Ngrok
```bash
# Tải Ngrok về
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz

# Giải nén
sudo tar xvzf ngrok-v3-stable-linux-amd64.tgz -C /usr/local/bin

# Kiểm tra
ngrok version
```

### 4.2. Cấu hình Token (BẮT BUỘC)
*Lưu ý: Bạn cần có tài khoản Ngrok (đăng ký tại ngrok.com). Sau đó lấy Authtoken.*

```bash
# Chạy lệnh này (thay TOKEN_CUA_BAN bằng token thật)
ngrok config add-authtoken TOKEN_CUA_BAN_CUA_KHACH
```

---

## 5. Tải Code từ GitHub và Cài đặt

Thay vì upload thủ công, chúng ta sẽ kéo code trực tiếp từ GitHub.

### 5.1. Cài đặt Git và xác thực (Nếu kho code là Private)
Nếu repo của bạn là **Public**, bỏ qua bước tạo key, chỉ cần clone.
Nếu repo là **Private**, làm như sau để tạo Deploy Key:

1.  **Cài Git:**
    ```bash
    sudo apt install git -y
    ```
2.  **Tạo SSH Key trên VPS:**
    ```bash
    ssh-keygen -t rsa -b 4096 -C "vps-key"
    # Bấm Enter liên tục cho đến khi xong
    cat ~/.ssh/id_rsa.pub
    ```
3.  **Thêm Key vào GitHub:**
    *   Copy đoạn mã (`ssh-rsa AAAA...`) vừa hiện ra.
    *   Vào repo GitHub -> **Settings** -> **Deploy keys** -> **Add deploy key**.
    *   Dán key vào và tick "Allow write access" (nếu cần), rồi Save.

### 5.2. Clone Code về VPS
Giả sử link repo git của bạn là `git@github.com:username/repo-name.git` (Chọn SSH Clone link).

```bash
# Di chuyển ra thư mục gốc
cd /root

# Clone code
git clone git@github.com:username/repo-name.git getlinkfb

# Vào thư mục
cd getlinkfb

# Cài đặt thư viện
npm install
```

*Lỗi Chromium: Nếu báo lỗi Chromium khi npm install, hãy chắc chắn bước 1.2 đã chạy xong.*

### 5.3. Tạo file cấu hình
Vì trên Git thường không up file config nhạy cảm, bạn cần tạo lại chúng trên VPS:

1.  **Tạo `config.json`:**
    ```bash
    nano config.json
    # Paste nội dung config vào -> Ctrl+O -> Enter -> Ctrl+X
    ```
2.  **Tạo `cookies.json`:**
    ```bash
    nano cookies.json
    # Paste cookies vào (hoặc để trống [] nếu chưa có) -> Save
    ```

---

## 6. Khởi chạy hệ thống

Chúng ta sẽ dùng PM2 để chạy cả Code Server và Ngrok.

### 6.1. Chạy Server Code
```bash
# Chạy file server
pm2 start server.js --name "fb-tool" --watch --ignore-watch="node_modules"
```
*Lưu ý: Cờ `--watch` giúp server tự khởi động lại khi cập nhật file `cookies.json`.*

### 6.2. Chạy Ngrok
```bash
# Chạy Ngrok mở port 4000 (Port của tool)
pm2 start "ngrok http 4000" --name ngrok
```

### 6.3. Lưu trạng thái (Để khởi động cùng VPS)
```bash
pm2 save
pm2 startup
```

---

## 7. Lấy Link Webhook để Cấu hình Facebook

Sau khi chạy Ngrok, bạn cần lấy cái link HTTPS mà Ngrok cấp cho.

1.  **Cách 1:** Xem log của ngrok trên PM2 (hơi khó nhìn).
2.  **Cách 2:** Truy cập Dashboard của Ngrok trên web (ngrok.com) -> Mục **Edges** hoặc **Endpoints** để xem link đang chạy.
    *   Ví dụ link sẽ có dạng: `https://abcd-1234.ngrok-free.app`
3.  URL Webhook cần điền vào Facebook App:
    *   Link: `https://abcd-1234.ngrok-free.app/webhook`
    *   Verify Token: Lấy trong file `config.json` (mặc định là `11130904`).

**LƯU Ý QUAN TRỌNG VỀ NGROK FREE:**
Nếu dùng bản miễn phí, mỗi lần reset Ngrok, **tên miền sẽ bị đổi**. Bạn phải vào Facebook App cập nhật lại link Webhook mới.
-> **Khuyên dùng:** Vào Dashboard Ngrok -> **Cloud Edge** -> **Domains** -> Claim 1 cái **Free Static Domain**. Sau đó chạy lệnh ngrok với domain đó để cố định link:
```bash
# Ví dụ nếu có domain tĩnh là 'my-app.ngrok-free.app'
pm2 delete ngrok
pm2 start "ngrok http --domain=my-app.ngrok-free.app 4000" --name ngrok
```
