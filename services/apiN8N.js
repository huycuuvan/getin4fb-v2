const axios = require('axios');
const fs = require('fs');
const path = require('path');

const { extractPhoneNumber } = require('../utils/helpers');

const CONFIG_PATH = path.resolve(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

/**
 * Gửi dữ liệu tin nhắn lên API N8N
 * @param {Object} data - Dữ liệu tin nhắn
 */
async function sendToN8N(data) {
    if (!config.n8n_api || !config.n8n_api.url) {
        console.warn('[N8N-API] ⚠️ API N8N chưa được cấu hình.');
        return;
    }

    const { url, api_key } = config.n8n_api;

    try {
        console.log(`[N8N-API] Sending data for PSID: ${data.ps_id}...`);

        const payload = {
            page_id: data.page_id,
            ps_id: data.ps_id,
            m_id: data.m_id,
            time_stamp: data.time_stamp, // Đã có dạng ISO 8601 từ server
            customer_name: data.customer_name,
            customer_facebook_url: data.customer_facebook_url,
            text: data.text,
            extracted_phone_number: data.extracted_phone_number || extractPhoneNumber(data.text)
        };

        console.log('[N8N-API] Payload:', JSON.stringify(payload, null, 2));

        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': api_key
            }
        });

        if (response.status === 200) {
            console.log('✅ [N8N-API] Data sent successfully:', response.data);
        } else {
            console.warn('⚠️ [N8N-API] Received non-200 status:', response.status, response.data);
        }
    } catch (error) {
        console.error('❌ [N8N-API] Error sending data:', error.response?.data || error.message);
    }
}

module.exports = { sendToN8N };
