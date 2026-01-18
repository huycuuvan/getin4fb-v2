const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const COOKIES_PATH = path.resolve(__dirname, '../cookies.json');

/**
 * Lấy Profile Link và Tên thật từ Business Suite
 * @param {string} psid - Page-Scoped ID
 * @param {string} senderName - Tên người gửi (từ API)
 * @param {string} pageId - ID của Page
 * @returns {Promise<Object|null>} - { profileLink, customerName } hoặc null
 */
async function scrapeProfileLink(psid, senderName, pageId) {
    let browser = null;
    try {
        console.log(`[Scraper] Starting browser for: ${senderName} (Page: ${pageId})`);

        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Hạn chế log rác từ browser
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('Found name') || text.includes('Found profile')) {
                console.log('[Browser]', text);
            }
        });

        if (fs.existsSync(COOKIES_PATH)) {
            const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
            await page.setCookie(...cookies);
        } else {
            console.warn('[Scraper] ⚠️ No cookies found.');
            return null;
        }

        const businessInboxUrl = `https://business.facebook.com/latest/inbox/all?asset_id=${pageId}`;
        await page.goto(businessInboxUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Kiểm tra xem có bị đá ra trang login không
        const currentUrl = page.url();
        if (currentUrl.includes('facebook.com/login') || currentUrl.includes('business.facebook.com/login')) {
            console.error('[Scraper] ❌ Cookies expired or invalid. Redirected to login page.');
            return null;
        }

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Step 2: Click conversation mới nhất
        const conversationClicked = await page.evaluate(() => {
            const selectors = ['[role="row"]', '[data-testid*="conversation"]', 'div[role="button"][tabindex="0"]'];
            for (const selector of selectors) {
                const conversations = document.querySelectorAll(selector);
                if (conversations.length > 0) {
                    conversations[0].click();
                    return true;
                }
            }
            return false;
        });

        if (!conversationClicked) return null;
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 3: Click sender name để mở panel thông tin
        await page.evaluate((targetName) => {
            const allElements = Array.from(document.querySelectorAll('span, div, a, h1, h2, h3'));
            for (const el of allElements) {
                const val = el.textContent.trim();
                // Click vào tên khách hàng hoặc "Người dùng Messenger"
                if ((val === targetName || val === 'Người dùng Messenger' || val.includes(targetName)) && el.offsetParent !== null) {
                    el.click();
                    break;
                }
            }
        }, senderName);

        await new Promise(resolve => setTimeout(resolve, 4000));

        // Step 4: Extract Info (Name & Link)
        const info = await page.evaluate(async () => {
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            let lastChance = null;
            let extractedName = null;

            for (let i = 0; i < 10; i++) {
                if (!extractedName) {
                    // Ưu tiên bộ chọn aria-level="3" của bạn
                    const nameSelectors = [
                        'div[role="heading"][aria-level="3"]',
                        'div[role="main"] h2',
                        'div[depth="0"] div[dir="auto"] span'
                    ];
                    for (const sel of nameSelectors) {
                        const el = document.querySelector(sel);
                        if (el && el.textContent.trim().length > 2) {
                            const val = el.textContent.trim();
                            if (!['Hộp thư', 'Facebook', 'Xong', 'Messenger'].includes(val)) {
                                extractedName = val;
                                break;
                            }
                        }
                    }
                }

                const links = Array.from(document.querySelectorAll('a'));
                for (const link of links) {
                    const text = link.textContent.trim().toLowerCase();
                    const href = link.href || '';
                    if (text.includes('xem trang cá nhân') || text.includes('view profile')) {
                        return { profileLink: href, customerName: extractedName };
                    }
                    if (href.includes('facebook.com/') && !href.includes('/latest/') && !href.includes('/business/')) {
                        if (href.includes('profile.php?id=') || (!href.includes('?') && href.split('/').pop().length > 5)) {
                            if (!['pages', 'groups', 'home'].some(k => href.includes('/' + k))) {
                                lastChance = href;
                            }
                        }
                    }
                }
                if (lastChance && i > 5) return { profileLink: lastChance, customerName: extractedName };
                await sleep(500);
            }
            return { profileLink: null, customerName: extractedName };
        });

        // Step 5: Đánh dấu là chưa đọc (Fix lỗi nhảy vào mục Xong)
        console.log('[Scraper] Step 5: Marking as unread (Prevention mode)...');
        try {
            await page.evaluate(() => {
                // 1. Thử tìm nút trực tiếp có chữ "chưa đọc"
                const allButtons = Array.from(document.querySelectorAll('div[role="button"], span, div'));
                let foundUnread = false;

                // Tìm và click các nút lôi tin nhắn ra Inbox
                const unreadTerms = [
                    'đánh dấu là chưa đọc', 'mark as unread',
                    'đưa vào hộp thư đến', 'move to inbox',
                    'đánh dấu là chưa xong', 'mark as not done'
                ];

                for (const btn of allButtons) {
                    const txt = btn.textContent.trim().toLowerCase();
                    if (unreadTerms.includes(txt)) {
                        btn.click();
                        foundUnread = true;
                        console.log('Clicked:', txt);
                        break;
                    }
                }

                // 2. Nếu không thấy nút ngoài, mở menu "Ba chấm"
                if (!foundUnread) {
                    const more = document.querySelector('div[aria-label="Xem thêm" i], div[aria-label="More" i], div[aria-label*="Menu"]');
                    if (more) {
                        more.click();
                    }
                }
            });

            if (info && info.profileLink) await new Promise(resolve => setTimeout(resolve, 1000));

            // Chỉ click trong menu nếu chưa tìm thấy ở ngoài
            await page.evaluate(() => {
                const unreadTerms = [
                    'đánh dấu là chưa đọc', 'mark as unread',
                    'đưa vào hộp thư đến', 'move to inbox',
                    'đánh dấu là chưa xong', 'mark as not done'
                ];
                const menuItems = Array.from(document.querySelectorAll('div[role="menuitem"], span, div'));
                for (const item of menuItems) {
                    const t = item.textContent.toLowerCase();
                    if (unreadTerms.includes(t)) {
                        item.click();
                        break;
                    }
                }
            });
        } catch (e) {
            console.error('[Scraper] Error during unread action:', e.message);
        }

        return info;
    } catch (e) {
        console.error(`[Scraper] Exception:`, e.message);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { scrapeProfileLink };
