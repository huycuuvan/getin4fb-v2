const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const COOKIES_PATH = path.resolve(__dirname, '../cookies.json');

/**
 * Lấy Profile Link và Tên thật từ Business Suite
 */
async function scrapeProfileLink(psid, senderName, pageId) {
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        if (fs.existsSync(COOKIES_PATH)) {
            let cookiesData = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));

            // Xử lý định dạng J2TEAM Cookies (Object chứa trường cookies)
            // Nếu là mảng thì dùng luôn, nếu là Object có key 'cookies' thì lấy key đó
            const cookies = Array.isArray(cookiesData) ? cookiesData : (cookiesData.cookies || []);

            if (cookies.length === 0) {
                console.warn('[Scraper] ⚠️ Cookies file is empty or invalid format.');
                return null;
            }

            await page.setCookie(...cookies);
        } else {
            console.warn('[Scraper] ⚠️ No cookies.json found.');
            return null;
        }

        const businessInboxUrl = `https://business.facebook.com/latest/inbox/all?asset_id=${pageId}&selected_item_id=${psid}`;
        await page.goto(businessInboxUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        const currentUrl = page.url();
        if (currentUrl.includes('facebook.com/login')) {
            console.error('[Scraper] ❌ Cookies expired.');
            return null;
        }

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Step 2: Chọn cuộc hội thoại
        await page.evaluate((targetName) => {
            const genericNames = ['người dùng facebook', 'facebook user', 'người dùng messenger'];
            const targetLower = (targetName || '').toLowerCase(); // Tên cần tìm (đã lower)

            // Hàm chuẩn hóa chuỗi (bỏ dấu) để so sánh mượt hơn (nếu cần)
            function normalize(str) {
                return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            }

            // 1. Kiểm tra xem cuộc hội thoại hiện tại (đã mở sẵn) có đúng là người này không?
            // (Thường selector header sẽ nằm ở vị trí chính giữa panel)
            const headerNameEl = document.querySelector('div[role="main"] h2 span, div[role="main"] h2');
            if (headerNameEl) {
                const currentHeader = normalize(headerNameEl.textContent);
                // So sánh tương đối
                if (currentHeader.includes(normalize(targetName)) || normalize(targetName).includes(currentHeader)) {
                    // Đã đúng người, không cần click gì cả
                    return;
                }
            }

            // 2. Nếu chưa đúng, tìm trong danh sách bên trái
            const rows = Array.from(document.querySelectorAll('[role="row"], [data-testid*="conversation"]'));
            let bestRow = null;

            if (targetName && !genericNames.includes(targetLower)) {
                for (const row of rows) {
                    const text = (row.textContent || '').toLowerCase();
                    // So sánh tên (có dấu và không dấu nếu kỹ, ở đây dùng includes cơ bản trước)
                    if (text.includes(targetLower)) {
                        bestRow = row;
                        break;
                    }
                }
            }

            // 3. Click vào Avatar hoặc Tên trong row đó
            if (bestRow) {
                const subElements = Array.from(bestRow.querySelectorAll('span, div, img'));
                const elementToClick = subElements.find(el => {
                    const style = window.getComputedStyle(el);
                    const isName = el.textContent.length > 2 && (style.fontWeight === 'bold' || style.fontWeight === '700' || el.className.includes('x1vvvo52'));
                    const isAvatar = el.tagName === 'IMG' || (el.className && el.className.includes('avatar'));
                    return isName || isAvatar;
                });

                if (elementToClick) {
                    elementToClick.click();
                } else {
                    bestRow.click();
                }
            } else {
                // WARN: Không tìm thấy row nào match tên. 
                // TRƯỚC ĐÂY: Fallback click row đầu tiên -> Gây sai lệch.
                // GIỜ: Bỏ qua, chấp nhận lấy thông tin của "Conversation hiện tại" (có thể sai) hoặc trả về null sau này.
                // Tốt nhất là không click bừa.
                console.warn(`[Scraper-Browser] matchRow: No row found for name "${targetName}". Staying on current view.`);
            }
        }, senderName);

        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 3: Mở Panel thông tin
        await page.evaluate((name) => {
            const els = Array.from(document.querySelectorAll('span, div, a'));
            const target = els.find(el => el.textContent.trim() === name || el.textContent.trim() === 'Người dùng Messenger');
            if (target) target.click();
        }, senderName);

        await new Promise(resolve => setTimeout(resolve, 4000));

        // Step 4: Lấy Link & Tên (Lọc kỹ để né link Help/System)
        const info = await page.evaluate(async () => {
            let extractedName = null;
            const nameEl = document.querySelector('div[role="heading"][aria-level="3"], div[role="main"] h2');
            if (nameEl) extractedName = nameEl.textContent.trim();

            const links = Array.from(document.querySelectorAll('a'));

            // Blacklist các link hệ thống của Facebook
            const systemPaths = ['/help/', '/policies/', '/legal/', '/about/', '/settings/', '/notifications/', '/messages/', '/ads/', '/business/'];

            let bestLink = null;

            for (const link of links) {
                const href = link.href || '';
                const text = link.textContent.toLowerCase();

                // ƯU TIÊN 1: Nút "Xem trang cá nhân" chính thống
                if (text.includes('xem trang cá nhân') || text.includes('view profile')) {
                    return { profileLink: href, customerName: extractedName };
                }

                if (href.includes('facebook.com/') && !href.includes('/latest/')) {
                    // Kiểm tra xem có nằm trong Blacklist không
                    const isSystem = systemPaths.some(p => href.includes(p));
                    if (isSystem) continue;

                    // Nếu là profile.php?id= thì lấy luôn (Ưu tiên 2)
                    if (href.includes('profile.php?id=')) {
                        bestLink = href;
                        continue;
                    }

                    // Ưu tiên 3: Link username (thường ngắn và không có nhiều dấu /)
                    const pathParts = new URL(href).pathname.split('/').filter(p => p);
                    if (pathParts.length === 1 && pathParts[0].length > 4) {
                        bestLink = href;
                    }
                }
            }
            return { profileLink: bestLink, customerName: extractedName };
        });

        // Step 5 & 6: Lôi khách ra Inbox (NỀN TẢNG QUAN TRỌNG)
        try {
            const actionResult = await page.evaluate(() => {
                const inboxTerms = ['thư mục chính', 'move to main', 'hộp thư đến', 'move to inbox', 'bỏ lưu trữ', 'unarchive'];
                const unreadTerms = ['chưa đọc', 'unread', 'chưa xong'];
                const danger = ['xong', 'done', 'tích', 'complete', 'archive'];

                const findAndClick = (terms) => {
                    const all = Array.from(document.querySelectorAll('div[role="button"], span, div'));
                    for (const el of all) {
                        if (el.children.length > 3 || el.textContent.length > 30) continue;
                        const label = (el.getAttribute('aria-label') || '').toLowerCase();
                        const title = (el.getAttribute('title') || el.title || '').toLowerCase();
                        const txt = el.textContent.toLowerCase();
                        const ctx = (label + ' ' + title + ' ' + txt).trim();
                        if (terms.some(t => ctx.includes(t)) && !danger.some(d => ctx.includes(d) && !ctx.includes('chưa'))) {
                            el.click();
                            return ctx;
                        }
                    }
                    return null;
                };

                let doneAction = findAndClick(inboxTerms);
                if (doneAction) return { type: 'INBOX', details: doneAction };

                doneAction = findAndClick(unreadTerms);
                if (doneAction) return { type: 'UNREAD', details: doneAction };

                const more = document.querySelector('div[aria-label*="Xem thêm" i], div[aria-label*="More" i]');
                if (more) { more.click(); return { type: 'MORE' }; }
                return { type: 'NONE' };
            });

            if (actionResult.type === 'MORE') {
                await new Promise(r => setTimeout(r, 1000));
                const menuAction = await page.evaluate(() => {
                    const terms = ['thư mục chính', 'hộp thư đến', 'chưa đọc', 'bỏ lưu trữ'];
                    const items = Array.from(document.querySelectorAll('div[role="menuitem"], span, div'));
                    for (const item of items) {
                        if (item.textContent.length > 30) continue;
                        const ctx = (item.textContent + ' ' + (item.getAttribute('aria-label') || '')).toLowerCase();
                        if (terms.some(t => ctx.includes(t))) {
                            item.click();
                            return ctx;
                        }
                    }
                    return null;
                });
                if (menuAction) console.log(`[Scraper] ✅ Bấm trong Menu: ${menuAction}`);
            } else if (actionResult.type !== 'NONE') {
                console.log(`[Scraper] ✅ Hành động: ${actionResult.type} (${actionResult.details})`);
            }
        } catch (err) { }

        return info;
    } catch (e) {
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { scrapeProfileLink };
