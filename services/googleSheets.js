const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

async function appendToSheet(config, data) {
    try {
        const credentialsPath = path.resolve(config.google_sheet.credentials_path);
        if (!fs.existsSync(credentialsPath)) {
            throw new Error(`Credentials file not found at ${credentialsPath}`);
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: credentialsPath,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = config.google_sheet.spreadsheet_id;
        let sheetName = config.google_sheet.sheet_name || 'Sheet1';

        // 1. Kiểm tra sheet name có tồn tại không, nếu không lấy sheet đầu tiên
        try {
            const meta = await sheets.spreadsheets.get({ spreadsheetId });
            const sheetsList = meta.data.sheets;
            const exists = sheetsList.some(s => s.properties.title === sheetName);
            if (!exists && sheetsList.length > 0) {
                sheetName = sheetsList[0].properties.title;
                console.log(`[GoogleSheets] Sheet '${config.google_sheet.sheet_name}' not found. Using first sheet: '${sheetName}'`);
            }
        } catch (err) {
            console.error('[GoogleSheets] Error fetching metadata:', err.message);
        }

        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_MinH' });

        const rowData = [
            timestamp,
            data.source || 'Inbox',
            data.psid,
            data.fullName,
            data.phoneNumber || '',
            data.message,
            data.profileLink,
            data.adminChatLink
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetName}!A:H`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [rowData],
            },
        });

        console.log(`[GoogleSheets] Successfully appended data for PSID: ${data.psid} to sheet: ${sheetName}`);
    } catch (error) {
        console.error('[GoogleSheets] Error:', error.message);
        throw error;
    }
}

module.exports = { appendToSheet };
