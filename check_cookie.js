const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const config = require('./config');

async function checkCookie() {
    console.log('🍪 Bắt đầu kiểm tra Cookie...');

    const cookiePath = path.resolve(__dirname, 'cookies.json');
    if (!fs.existsSync(cookiePath)) {
        console.error('❌ Lỗi: Không tìm thấy file cookies.json!');
        return;
    }

    let browser;
    try {
        const cookiesRaw = fs.readFileSync(cookiePath, 'utf8');
        let cookies;
        try {
            const parsed = JSON.parse(cookiesRaw);
            if (Array.isArray(parsed)) {
                cookies = parsed;
            } else if (parsed.cookies && Array.isArray(parsed.cookies)) {
                cookies = parsed.cookies;
            } else {
                console.error('❌ Lỗi định dạng cookies.json: Không phải Array!');
                return;
            }
        } catch (e) {
            console.error('❌ Lỗi cú pháp JSON trong file cookies.json');
            return;
        }

        // Tìm đường dẫn Chrome
        const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
        // Hoặc check file config nếu có
        const executablePath = fs.existsSync(chromePath) ? chromePath : config.chromePath;

        browser = await puppeteer.launch({
            executablePath: executablePath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: 'new', // Chạy ẩn để nhanh hơn
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // Load cookies
        await page.setCookie(...cookies);

        console.log('🔄 Đang thử truy cập Facebook Business Suite...');
        // Thử vào trang Business Inbox - trang này yêu cầu login cứng
        await page.goto('https://business.facebook.com/latest/inbox', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        const currentUrl = page.url();
        console.log(`📍 URL hiện tại: ${currentUrl}`);

        if (currentUrl.includes('login') || currentUrl.includes('checkpoint')) {
            console.log('❌ KẾT QUẢ: COOKIE ĐÃ CHẾT (HẾT HẠN HOẶC BỊ CHECKPOINT)!');
            console.log('👉 Hãy lấy lại Cookie mới từ J2Team Cookies và cập nhật vào file cookies.json');

            // Gửi email cảnh báo
            try {
                const { sendCookieAlert } = require('./utils/emailService');
                await sendCookieAlert(
                    '🚨 CẢNH BÁO KHẨN CẤP: Cookie Facebook đã CHẾT!',
                    `Script kiểm tra định kỳ phát hiện Cookie đã hết hạn hoặc bị checkpoint.\nURL hiện tại bị đẩy về: ${currentUrl}\nVui lòng cập nhật Cookie ngay trong server!`
                );
            } catch (mailErr) {
                console.error('Không thể gửi mail:', mailErr.message);
            }
        } else {
            // Kiểm tra xem có element đặc trưng của trang inbox không để chắc chắn 100%
            try {
                await page.waitForSelector('[role="navigation"]', { timeout: 5000 });
                console.log('✅ KẾT QUẢ: COOKIE VẪN SỐNG TỐT!');
            } catch (e) {
                console.log('⚠️ KẾT QUẢ: KHÔNG RÕ (Vào được URL nhưng giao diện lạ).');
                console.log('Có thể Cookie vẫn sống nhưng mạng chậm hoặc giao diện thay đổi.');
                console.log('URL cuối cùng: ' + currentUrl);
            }
        }

    } catch (error) {
        console.error('❌ Lỗi khi kiểm tra:', error.message);
    } finally {
        if (browser) await browser.close();
    }
}

checkCookie();
