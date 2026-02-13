const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Debug directory for screenshots
const DEBUG_DIR = path.resolve(__dirname, '../debug_screenshots');
if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

const COOKIES_PATH = path.resolve(__dirname, '../cookies.json');

/**
 * Lấy Profile Link và Tên thật từ Business Suite
 */
async function scrapeProfileLink(psid, senderName, pageId) {
    let browser = null;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const debugPrefix = `${timestamp}_${psid.substring(0, 8)}`;

    console.log(`[Scraper][${debugPrefix}] Starting scrape for PSID: ${psid}, Name: ${senderName}, PageID: ${pageId}`);

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
                console.warn(`[Scraper][${debugPrefix}] ⚠️ Cookies file is empty or invalid format.`);
                return null;
            }

            console.log(`[Scraper][${debugPrefix}] Loading ${cookies.length} cookies`);
            await page.setCookie(...cookies);
        } else {
            console.warn(`[Scraper][${debugPrefix}] ⚠️ No cookies.json found.`);
            return null;
        }

        const businessInboxUrl = `https://business.facebook.com/latest/inbox/all?asset_id=${pageId}&selected_item_id=${psid}`;
        console.log(`[Scraper][${debugPrefix}] Navigating to: ${businessInboxUrl}`);

        await page.goto(businessInboxUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        const currentUrl = page.url();
        console.log(`[Scraper][${debugPrefix}] Current URL after navigation: ${currentUrl}`);

        if (currentUrl.includes('facebook.com/login')) {
            console.error(`[Scraper][${debugPrefix}] ❌ Cookies expired - redirected to login page`);
            const screenshotPath = path.join(DEBUG_DIR, `${debugPrefix}_ERROR_login_redirect.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.error(`[Scraper][${debugPrefix}] Login page screenshot saved: ${screenshotPath}`);
            return null;
        }

        // Đợi 1 chút cho load trang (vẫn cần vì NetworkIdle2 không đảm bảo panel đã render)
        console.log(`[Scraper][${debugPrefix}] Waiting for page to fully render...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 2: Chọn cuộc hội thoại
        console.log(`[Scraper][${debugPrefix}] Step 2: Selecting conversation for: ${senderName}`);
        await page.evaluate((targetName) => {
            const genericNames = ['người dùng facebook', 'facebook user', 'người dùng messenger'];
            const targetLower = (targetName || '').toLowerCase(); // Tên cần tìm (đã lower)

            // Hàm chuẩn hóa chuỗi (bỏ dấu) để so sánh mượt hơn
            function normalize(str) {
                return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            }

            // 1. Kiểm tra xem cuộc hội thoại hiện tại (đã mở sẵn) có đúng là người này không?
            const headerNameEl = document.querySelector('div[role="main"] h2 span, div[role="main"] h2');
            if (headerNameEl) {
                const currentHeader = normalize(headerNameEl.textContent);
                if (currentHeader.includes(normalize(targetName)) || normalize(targetName).includes(currentHeader)) {
                    return; // Đã đúng người
                }
            }

            // 2. Tìm trong danh sách bên trái
            const rows = Array.from(document.querySelectorAll('[role="row"], [data-testid*="conversation"]'));
            let bestRow = null;

            if (targetName && !genericNames.includes(targetLower)) {
                for (const row of rows) {
                    const text = (row.textContent || '').toLowerCase();
                    if (text.includes(targetLower)) {
                        bestRow = row;
                        break;
                    }
                }
            }

            if (bestRow) {
                bestRow.click();
            }
        }, senderName);

        // Chờ panel thông tin hiện ra (Nút mở panel hoặc tên người dùng)
        console.log(`[Scraper][${debugPrefix}] Step 2.5: Waiting for conversation panel...`);
        try {
            await page.waitForSelector('div[role="heading"][aria-level="3"], div[role="main"] h2', { timeout: 10000 });
            console.log(`[Scraper][${debugPrefix}] Conversation panel loaded`);
        } catch (e) {
            console.warn(`[Scraper][${debugPrefix}] ⚠️ Timeout waiting for conversation panel`);
        }

        // Screenshot sau khi chọn conversation
        const screenshotPath2 = path.join(DEBUG_DIR, `${debugPrefix}_02_after_select_conversation.png`);
        await page.screenshot({ path: screenshotPath2, fullPage: true });
        console.log(`[Scraper][${debugPrefix}] Screenshot saved: ${screenshotPath2}`);


        // Step 3: Đảm bảo click vào tên để mở panel chi tiết nếu nó chưa mở
        console.log(`[Scraper][${debugPrefix}] Step 3: Opening detail panel...`);
        await page.evaluate((name) => {
            const els = Array.from(document.querySelectorAll('span, div, a'));
            const target = els.find(el => el.textContent.trim() === name || el.textContent.trim() === 'Người dùng Messenger');
            if (target) target.click();
        }, senderName);

        console.log(`[Scraper][${debugPrefix}] Waiting for detail panel to load...`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Screenshot sau khi mở panel chi tiết
        const screenshotPath3 = path.join(DEBUG_DIR, `${debugPrefix}_03_after_open_detail_panel.png`);
        await page.screenshot({ path: screenshotPath3, fullPage: true });
        console.log(`[Scraper][${debugPrefix}] Screenshot saved: ${screenshotPath3}`);


        // Step 4: Lấy Link & Tên (Lọc kỹ để né link Help/System)
        console.log(`[Scraper][${debugPrefix}] Step 4: Extracting profile link and name...`);
        const info = await page.evaluate(async () => {
            let extractedName = null;
            const nameEl = document.querySelector('div[role="heading"][aria-level="3"], div[role="main"] h2');
            if (nameEl) extractedName = nameEl.textContent.trim();

            const links = Array.from(document.querySelectorAll('a'));

            // Blacklist các link hệ thống của Facebook
            const systemPaths = [
                '/help/', '/policies/', '/legal/', '/about/', '/settings/',
                '/notifications/', '/messages/', '/ads/', '/business/',
                '/login/', '/register/', '/sharer/', '/groups/', '/events/'
            ];

            let bestLink = null;

            for (const link of links) {
                let href = link.href || '';
                const text = link.textContent.toLowerCase();

                // 0. Xử lý "Self-healing": Nếu là link login redirect (thường do session bị out giữa chừng)
                if (href.includes('facebook.com/login') && href.includes('next=')) {
                    try {
                        const urlObj = new URL(href);
                        const nextParam = urlObj.searchParams.get('next');
                        if (nextParam) {
                            href = decodeURIComponent(nextParam);
                            console.log(`[Scraper-Browser] Healed login link to: ${href}`);
                        }
                    } catch (e) { }
                }

                // Skip link login/register nếu không lấy được next param sạch
                if (href.includes('/login') || href.includes('/reg/')) continue;

                // ƯU TIÊN 1: Nút "Xem trang cá nhân" chính thống
                if (text.includes('xem trang cá nhân') || text.includes('view profile')) {
                    if (href && href.includes('facebook.com/') && !href.includes('/latest/')) {
                        return { profileLink: href, customerName: extractedName };
                    }
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
                    try {
                        const pathParts = new URL(href).pathname.split('/').filter(p => p);
                        if (pathParts.length === 1 && pathParts[0].length > 4) {
                            bestLink = href;
                        }
                    } catch (e) { }
                }
            }
            return { profileLink: bestLink, customerName: extractedName };
        });

        console.log(`[Scraper][${debugPrefix}] Extracted info:`, JSON.stringify(info, null, 2));


        // Step 5 & 6: Lôi khách ra Inbox (NỀN TẢNG QUAN TRỌNG)
        console.log(`[Scraper][${debugPrefix}] Step 5: Moving conversation to inbox...`);
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
                console.log(`[Scraper][${debugPrefix}] ✅ Hành động: ${actionResult.type} (${actionResult.details})`);
            } else {
                console.log(`[Scraper][${debugPrefix}] No inbox action needed`);
            }
        } catch (err) {
            console.error(`[Scraper][${debugPrefix}] ⚠️ Error during inbox action:`, err.message);
        }

        console.log(`[Scraper][${debugPrefix}] ✅ Scraping completed successfully`);
        return info;
    } catch (e) {
        console.error(`[Scraper][${debugPrefix}] ❌ Fatal error during scraping:`, e.message);
        console.error(`[Scraper][${debugPrefix}] Stack trace:`, e.stack);

        // Screenshot lỗi nếu page còn tồn tại
        try {
            if (browser) {
                const pages = await browser.pages();
                if (pages.length > 0) {
                    const errorScreenshot = path.join(DEBUG_DIR, `${debugPrefix}_ERROR_exception.png`);
                    await pages[0].screenshot({ path: errorScreenshot, fullPage: true });
                    console.error(`[Scraper][${debugPrefix}] Error screenshot saved: ${errorScreenshot}`);
                }
            }
        } catch (screenshotErr) {
            console.error(`[Scraper][${debugPrefix}] Could not capture error screenshot:`, screenshotErr.message);
        }

        return null;
    } finally {
        if (browser) {
            await browser.close();
            console.log(`[Scraper][${debugPrefix}] Browser closed`);
        }
    }
}

module.exports = { scrapeProfileLink };
