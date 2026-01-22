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

        // Step 2: Chọn cuộc hội thoại (Strict Match)
        const matchResult = await page.evaluate(async (targetName) => {
            const normalize = (str) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            const targetNorm = normalize(targetName);
            const genericNames = ['người dùng facebook', 'facebook user', 'người dùng messenger'];

            // Chờ một chút để UI ổn định
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));

            // 1. Thử tìm trong 10 giây
            for (let i = 0; i < 5; i++) {
                // Kiểm tra Header hiện tại
                const headerEl = document.querySelector('div[role="main"] h2 span, div[role="main"] h2');
                const headerText = normalize(headerEl ? headerEl.textContent : '');

                if (headerText && (headerText.includes(targetNorm) || targetNorm.includes(headerText))) {
                    return { success: true, method: 'header_already_match' };
                }

                // Nếu Header chưa match, tìm trong menu trái
                const rows = Array.from(document.querySelectorAll('[role="row"], [data-testid*="conversation"]'));
                for (const row of rows) {
                    const rowText = normalize(row.textContent);
                    if (rowText.includes(targetNorm)) {
                        // Click vào row
                        const clickTarget = row.querySelector('img, span[style*="font-weight: bold"], span[style*="font-weight: 700"]') || row;
                        clickTarget.click();
                        await sleep(2000);
                        return { success: true, method: 'row_clicked' };
                    }
                }

                // Nếu là tên ảo/generic, có thể skip click
                if (genericNames.includes(targetNorm)) break;

                await sleep(2000); // Đợi load thêm
            }

            return { success: false, reason: 'name_not_found' };
        }, senderName);

        if (!matchResult.success) {
            console.warn(`[Scraper] ⚠️ Khôn tìm thấy cuộc hội thoại cho: ${senderName}`);
            // Tiếp tục chạy để lấy link hiện tại nếu PSID trong URL đã tự mở đúng, 
            // nhưng lát nữa Step 4 sẽ check tên lại lần nữa cho chắc.
        }

        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 3: Mở Panel thông tin (Click vào tên ở giữa header)
        await page.evaluate((name) => {
            const normalize = (str) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            const targetNorm = normalize(name);
            const els = Array.from(document.querySelectorAll('div[role="main"] h2, div[role="main"] h2 span'));
            const header = els.find(el => normalize(el.textContent).includes(targetNorm) || targetNorm.includes(normalize(el.textContent)));
            if (header) {
                header.click();
            } else {
                // Fallback: Click bừa vào text lớn nhất ở giữa header
                const backup = document.querySelector('div[role="main"] h2');
                if (backup) backup.click();
            }
        }, senderName);

        await new Promise(resolve => setTimeout(resolve, 4000));

        // Step 4: Lấy Link & Tên (VALIDATE TRƯỚC KHI TRẢ VỀ)
        const info = await page.evaluate(async (targetName) => {
            const normalize = (str) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            const targetNorm = normalize(targetName);

            let extractedName = null;
            const nameEl = document.querySelector('div[role="heading"][aria-level="3"], div[role="main"] h2');
            if (nameEl) extractedName = nameEl.textContent.trim();

            // KIỂM TRA TÊN: Nếu tên lấy được hoàn toàn khác tên cần tìm -> CANCEL (để né nhầm link)
            const extNorm = normalize(extractedName);
            const isMatch = extNorm.includes(targetNorm) || targetNorm.includes(extNorm) || targetNorm === 'người dùng messenger';

            if (!isMatch && extractedName) {
                return { error: `Name mismatch: Got "${extractedName}" vs Expected "${targetName}"` };
            }

            const links = Array.from(document.querySelectorAll('a'));
            const systemPaths = ['/help/', '/policies/', '/legal/', '/about/', '/settings/', '/notifications/', '/messages/', '/ads/', '/business/'];
            let bestLink = null;

            for (const link of links) {
                const href = link.href || '';
                const text = link.textContent.toLowerCase();

                if (text.includes('xem trang cá nhân') || text.includes('view profile')) {
                    return { profileLink: href, customerName: extractedName };
                }

                if (href.includes('facebook.com/') && !href.includes('/latest/')) {
                    if (systemPaths.some(p => href.includes(p))) continue;
                    if (href.includes('profile.php?id=')) {
                        bestLink = href; continue;
                    }
                    const pathParts = new URL(href).pathname.split('/').filter(p => p);
                    if (pathParts.length === 1 && pathParts[0].length > 4) {
                        bestLink = href;
                    }
                }
            }
            return { profileLink: bestLink, customerName: extractedName };
        }, senderName);

        if (info && info.error) {
            console.error(`[Scraper] ❌ Sai lệch dữ liệu: ${info.error}`);
            return null;
        }

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
