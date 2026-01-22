const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const { getSenderInfoFromMessage, generateProfileLink, generateAdminChatLink, passThreadControl } = require('./services/facebook');
const { appendToSheet } = require('./services/googleSheets');
const { extractPhoneNumber } = require('./utils/helpers');
const { scrapeProfileLink } = require('./services/scraper');
const { sendToN8N } = require('./services/apiN8N');

// QUEUE for scraping to prevent concurrency issues (too many browsers / race conditions)
let scraperQueue = Promise.resolve();

// Load Config
const configPath = path.resolve(__dirname, 'config.json');
let config = {};

function loadConfig() {
    try {
        const data = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(data);
        console.log('[Config] Configuration loaded successfully.');
    } catch (err) {
        console.error('[Config] Error loading config.json:', err.message);
        process.exit(1);
    }
}

loadConfig();

const app = express();
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // Serve tĩnh (login.html, admin.html)

// --- ADMIN AUTH & API ---

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123'; // Đổi pass ở đây
const COOKIE_SECRET = 'my_super_secret_key_fb_tool';

// Middleware Check Login
const authMiddleware = (req, res, next) => {
    // Nếu có cookie auth đúng thì cho qua
    if (req.cookies && req.cookies.auth === COOKIE_SECRET) {
        return next();
    }
    // Nếu là API call thì trả 401
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    // Nếu truy cập trang web admin thì redirect về login
    res.redirect('/login.html');
};

// Route: Login Page (Direct link)
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

// Route: Admin Page (Protected)
app.get('/admin', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin.html'));
});

// API: Login Process
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        res.cookie('auth', COOKIE_SECRET, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // 1 ngày
        return res.json({ success: true });
    }
    res.json({ success: false, message: 'Invalid credentials' });
});

// API: Logout
app.get('/api/logout', (req, res) => {
    res.clearCookie('auth');
    res.json({ success: true });
});

// API Read Config (Protected)
app.get('/api/config', authMiddleware, (req, res) => {
    try {
        const freshConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.json(freshConfig);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API Update Config (Protected)
app.post('/api/config', authMiddleware, (req, res) => {
    try {
        const { id, name, token, spreadsheet_id, sheet_name } = req.body;
        if (!id || !token) return res.status(400).json({ success: false, message: 'Missing ID or Token' });

        const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        currentConfig.pages = currentConfig.pages || {};
        currentConfig.pages[id] = {
            name,
            page_access_token: token,
            spreadsheet_id: spreadsheet_id || '1-vceGSIV4MvfznSv8062YfwAU29tL8B9N7QPMyK6stg',
            sheet_name: sheet_name || 'Sheet1'
        };

        fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 4), 'utf8');
        console.log(`[Admin] Updated config for page ${name} (${id})`);

        config = currentConfig;
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// API Delete Page (Protected)
app.post('/api/config/delete', authMiddleware, (req, res) => {
    try {
        const { id } = req.body;
        const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        if (currentConfig.pages && currentConfig.pages[id]) {
            delete currentConfig.pages[id];
            fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 4), 'utf8');
            config = currentConfig;
            console.log(`[Admin] Deleted page ID ${id}`);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Page ID not found' });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// API Update Cookies (Protected)
app.post('/api/cookies', authMiddleware, (req, res) => {
    try {
        const { cookies } = req.body;
        if (!cookies) return res.status(400).json({ success: false, message: 'Missing cookie data' });

        // Validate JSON format
        try {
            JSON.parse(cookies);
        } catch (e) {
            return res.status(400).json({ success: false, message: 'Invalid JSON format' });
        }

        const cookiesFilePath = path.resolve(__dirname, 'cookies.json');
        fs.writeFileSync(cookiesFilePath, cookies, 'utf8');
        console.log('[Admin] Cookies updated via UI.');
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// --- END ADMIN UI ---

// 1. Webhook Verification & Receiving
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === (config.verify_token || config.facebook.verify_token)) {
            console.log('[Webhook] Verification successful.');
            res.status(200).send(challenge);
        } else {
            console.error('[Webhook] Verification failed. Token mismatch.');
            res.sendStatus(403);
        }
    }
});

// Webhook Event Handling (POST)
app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        console.log(`[Webhook] Received update for ${body.entry.length} entries.`);
        for (const entry of body.entry) {
            console.log('[Webhook] Entry Content:', JSON.stringify(entry, null, 2));
            const pageId = entry.id;
            const pageConfig = config.pages[pageId];

            if (!pageConfig) {
                console.warn(`[Warning] Received message for unknown Page ID: ${pageId}. Please add it to config.json`);
                continue;
            }

            // 1. Xử lý TIN NHẮN (Messaging hoặc Standby - nghe lén)
            const messaging_events = entry.messaging || entry.standby;
            if (messaging_events) {
                for (const webhook_event of messaging_events) {
                    if (webhook_event.message) {
                        const psid = webhook_event.sender.id;
                        const messageText = webhook_event.message.text || '[Attachment/Non-text]';
                        const isEcho = webhook_event.message.is_echo;
                        const mode = entry.standby ? 'Standby' : 'Inbox';

                        // In ra toàn bộ để anh dễ theo dõi
                        console.log(`[Webhook][${mode}] Event: ${isEcho ? 'Echo' : 'Message'}, From: ${psid}, Text: ${messageText}`);

                        if (!isEcho) {
                            const messageId = webhook_event.message.mid;
                            processEvent(pageId, pageConfig, psid, messageId, messageText, mode).catch(err => {
                                console.error(`[Error] Message processing failed:`, err.message);
                            });
                        }
                    }
                }
            }

            // 2. Xử lý COMMENT (Feed)
            if (entry.changes) {
                console.log(`[Webhook] Received ${entry.changes.length} changes.`);
                for (const change of entry.changes) {
                    console.log('[Webhook] Change detected:', JSON.stringify(change, null, 2));

                    if (change.field === 'feed' && change.value.item === 'comment' && change.value.verb === 'add') {
                        const val = change.value;
                        const psid = val.from.id;

                        // CHẶN ADMIN: Nếu người comment chính là Page -> Bỏ qua
                        if (psid === pageId) {
                            console.log(`[Comment] Ignored admin reply from Page ${pageId}`);
                            continue;
                        }

                        const commentId = val.comment_id;
                        const commentText = val.message || '[Comment/Non-text]';
                        const name = val.from.name;
                        console.log(`[Comment][${pageConfig.name || pageId}] Lead from comment: ${name} (${psid}): ${commentText}`);
                        processEvent(pageId, pageConfig, psid, commentId, commentText, 'Comment', name).catch(err => {
                            console.error(`[Error] Comment processing failed:`, err.message);
                        });
                    }
                }
            }
        }

        // Returns a '200 OK' response to all requests
        res.status(200).send('EVENT_RECEIVED');
    } else {
        // Returns a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
    }
});

async function processEvent(pageId, pageConfig, psid, messageId, message, source = 'Inbox', customerName = null) {
    // 1. Enrich User Data
    let userInfo = { fullName: customerName || 'Người dùng Messenger', profileLink: null };

    // Nếu tin nhắn từ Inbox, thử gọi API lấy thông tin (nếu ID là Messenger ID)
    if (source === 'Inbox') {
        const apiInfo = await getSenderInfoFromMessage(pageConfig, messageId);
        if (apiInfo) userInfo = apiInfo;
    }

    // 2. Generate Links
    // Ưu tiên: API > Scraper > Fallback PSID
    let profileLink = userInfo.profileLink; // Từ API (thường null)

    if (!profileLink) {
        // Delay 2s để tránh bị trùng lặp quá nhanh
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Thử dùng Puppeteer scraper để lấy cả link và tên thật (QUEUE SEQUENTIAL)
        console.log('[Server] Attempting to scrape profile info (Queued)...');

        let scrapedInfo = null;
        try {
            // CƠ CHẾ QUEUE ĐÚNG: Gán lại promise vào biến scraperQueue
            scraperQueue = scraperQueue.then(async () => {
                console.log(`[Queue] Starting scrape for ${userInfo.fullName} (ID: ${psid})...`);
                const result = await scrapeProfileLink(psid, userInfo.fullName, pageId);
                // Nghỉ 2s giữa các lần quét để ổn định hệ thống
                await new Promise(r => setTimeout(r, 2000));
                return result;
            });

            // Đợi kết quả của chính tác vụ vừa đưa vào queue
            scrapedInfo = await scraperQueue;
        } catch (err) {
            console.error('[Server] Queue error:', err);
        }

        if (scrapedInfo) {
            profileLink = scrapedInfo.profileLink;
            // Cập nhật tên thật nếu lấy được từ Scraper (Chỉ khi tên hiện tại chưa có hoặc là placeholder)
            const placeholders = ['người dùng facebook', 'facebook user', 'người dùng messenger'];
            const currentNameLower = (userInfo.fullName || '').toLowerCase();

            if (scrapedInfo.customerName &&
                (!userInfo.fullName || placeholders.includes(currentNameLower)) &&
                scrapedInfo.customerName !== 'Người dùng Messenger') {
                console.log(`[Server] Updating name from Scraper: ${userInfo.fullName} -> ${scrapedInfo.customerName}`);
                userInfo.fullName = scrapedInfo.customerName;
            } else {
                console.log(`[Server] Kept Webhook name: ${userInfo.fullName} (Scraper found: ${scrapedInfo.customerName})`);
            }
        }
    }

    if (!profileLink) {
        // Fallback: Dùng PSID (sẽ không mở được nhưng để làm reference)
        profileLink = await generateProfileLink(psid);
    }

    const adminChatLink = generateAdminChatLink(pageId, psid);

    const phoneNumber = extractPhoneNumber(message);

    // 3. Log to Console
    console.log('--- [DATA COLLECTED] ---');
    console.table({
        'Nguồn': source,
        'Page ID': pageId,
        'Page Name': pageConfig.name,
        'PSID': psid,
        'Họ tên': userInfo.fullName,
        'SĐT': phoneNumber || 'Không có',
        'Nội dung': message,
        'Profile Link': profileLink,
        'Admin Chat': adminChatLink
    });
    console.log('------------------------');

    // 4. Save to Google Sheets
    const dataToSave = {
        source,
        psid,
        fullName: userInfo.fullName,
        phoneNumber,
        message,
        profileLink,
        adminChatLink
    };

    const sheetContext = {
        google_sheet: {
            ...config.google_sheet,
            spreadsheet_id: pageConfig.spreadsheet_id,
            sheet_name: pageConfig.sheet_name
        }
    };

    console.log(`[Server] Appending data to Google Sheets (Page: ${pageConfig.name})...`);
    await appendToSheet(sheetContext, dataToSave);
    console.log(`[Server] ✅ Data appended to Google Sheets.`);

    // 5. Gửi lên API N8N
    const n8nData = {
        source,
        page_id: pageId,
        ps_id: psid,
        m_id: messageId,
        time_stamp: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).replace(' ', 'T'),
        customer_name: userInfo.fullName,
        customer_facebook_url: profileLink,
        text: message,
        extracted_phone_number: phoneNumber
    };

    console.log(`[Server] Sending data to N8N (Source: ${source})...`);
    await sendToN8N(n8nData);
    console.log(`[Server] ✅ Data sent to N8N.`);

    // 6. Trả lời hội thoại về Inbox chính (Chỉ làm nếu App là Primary - 'Inbox')
    if (source === 'Inbox') {
        console.log(`[Server] Passing thread control back to Inbox...`);
        await passThreadControl(pageConfig, psid);
    }
}

// Health check endpoint
app.get('/', (req, res) => {
    res.send('Messenger to Google Sheets Server is running!');
});

const PORT = process.env.PORT || config.port || 3000;
app.listen(PORT, () => {
    console.log(`[Server] Webhook is listening at port ${PORT}`);
});

// Handle config file changes for hot-reloading (optional)
fs.watchFile(configPath, (curr, prev) => {
    console.log('[Config] config.json changed. Reloading...');
    loadConfig();
});
