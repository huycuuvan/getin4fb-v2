/**
 * Script để đăng nhập Facebook và lưu cookies
 * Chạy: node scripts/login.js
 * 
 * Sau khi chạy, một cửa sổ Chrome sẽ mở ra.
 * Bạn đăng nhập Facebook bằng tay, sau đó nhấn Enter trong terminal.
 * Cookies sẽ được lưu vào file cookies.json
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const COOKIES_PATH = path.resolve(__dirname, '../cookies.json');

async function login() {
    console.log('🚀 Khởi động trình duyệt...');

    const browser = await puppeteer.launch({
        headless: false, // Hiển thị trình duyệt để bạn đăng nhập
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    console.log('📱 Đang mở Facebook...');
    await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle2' });

    console.log('\n===========================================');
    console.log('👉 Hãy đăng nhập Facebook trong cửa sổ Chrome vừa mở');
    console.log('👉 Sau khi đăng nhập xong, quay lại đây và nhấn ENTER');
    console.log('===========================================\n');

    // Đợi người dùng nhấn Enter
    await waitForEnter();

    console.log('💾 Đang lưu cookies...');
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));

    console.log(`✅ Đã lưu cookies vào: ${COOKIES_PATH}`);
    console.log('✅ Bây giờ bạn có thể chạy server và scraper sẽ tự động dùng cookies này!');

    await browser.close();
}

function waitForEnter() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('Nhấn ENTER khi đã đăng nhập xong...', () => {
            rl.close();
            resolve();
        });
    });
}

login().catch(err => {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
});
