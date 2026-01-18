const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { getSenderInfoFromMessage, generateProfileLink, generateAdminChatLink, passThreadControl } = require('./services/facebook');
const { appendToSheet } = require('./services/googleSheets');
const { extractPhoneNumber } = require('./utils/helpers');
const { scrapeProfileLink } = require('./services/scraper');
const { sendToN8N } = require('./services/apiN8N');

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
    console.log('[Webhook] Received Payload:', JSON.stringify(body, null, 2));

    if (body.object === 'page') {
        for (const entry of body.entry) {
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
                    if (webhook_event.message && !webhook_event.message.is_echo) {
                        const psid = webhook_event.sender.id;
                        const messageId = webhook_event.message.mid;
                        const messageText = webhook_event.message.text || '[Attachment/Non-text]';
                        const mode = entry.standby ? 'Standby' : 'Inbox';
                        console.log(`[${mode}][${pageConfig.name || pageId}] Received from ${psid}: ${messageText}`);
                        processEvent(pageId, pageConfig, psid, messageId, messageText, mode).catch(err => {
                            console.error(`[Error] Message processing failed:`, err.message);
                        });
                    }
                }
            }

            // 2. Xử lý COMMENT (Feed)
            if (entry.changes) {
                for (const change of entry.changes) {
                    if (change.field === 'feed' && change.value.item === 'comment' && change.value.verb === 'add') {
                        const val = change.value;
                        const psid = val.from.id;
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

        // Thử dùng Puppeteer scraper để lấy cả link và tên thật
        console.log('[Server] Attempting to scrape profile info...');
        const scrapedInfo = await scrapeProfileLink(psid, userInfo.fullName, pageId);

        if (scrapedInfo) {
            profileLink = scrapedInfo.profileLink;
            // Cập nhật tên thật nếu lấy được từ Scraper (tránh "Người dùng Messenger")
            if (scrapedInfo.customerName && scrapedInfo.customerName !== 'Người dùng Messenger') {
                console.log(`[Server] Updating name from Scraper: ${userInfo.fullName} -> ${scrapedInfo.customerName}`);
                userInfo.fullName = scrapedInfo.customerName;
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
