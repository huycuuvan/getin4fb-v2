const axios = require('axios');

async function testPage(pageId, pageName) {
    const TEST_PAYLOAD = {
        object: 'page',
        entry: [{
            id: pageId, // Giả lập tin nhắn gửi đến Page này
            messaging: [{
                sender: { id: 'TEST_PSID_' + pageId },
                message: { text: `Test message for ${pageName}` }
            }]
        }]
    };

    try {
        console.log(`--- Testing for Page: ${pageName} (${pageId}) ---`);
        const response = await axios.post('http://localhost:3000/webhook', TEST_PAYLOAD);
        console.log('Response:', response.data);
    } catch (error) {
        console.error(`Test failed for ${pageName}:`, error.message);
    }
}

async function runTests() {
    console.log('Starting Multi-Page Webhook Test...');
    // Test cho Page 1
    await testPage('103437236153893', 'OHARi - Ghế Massage Nhật Bản Chính Hãng');
    // Test cho Page 2
    await testPage('103347135887962', 'Ghế Massage Nội Địa Nhật - Thanh Hóa');
    // Test cho Page không tồn tại (để xem log cảnh báo)
    await testPage('999999999999999', 'Unknown Page');
}

runTests();
