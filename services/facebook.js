const axios = require('axios');

async function getSenderInfoFromMessage(pageConfig, messageId) {
    try {
        // Cách mới: Gọi API lấy chi tiết tin nhắn (đúng theo mẫu v18.0 của bạn)
        const url = `https://graph.facebook.com/v18.0/${messageId}`;

        const response = await axios.get(url, {
            params: {
                fields: 'from,to',
                access_token: pageConfig.page_access_token
            }
        });

        const data = response.data;
        if (data.from) {
            // Thử lấy thêm profile_pic để parse User ID từ URL ảnh
            let realUserId = null;
            let profilePicUrl = null;

            try {
                const userDetailUrl = `https://graph.facebook.com/v18.0/${data.from.id}`;
                const userResponse = await axios.get(userDetailUrl, {
                    params: {
                        fields: 'id,name,profile_pic',
                        access_token: pageConfig.page_access_token
                    }
                });

                if (userResponse.data && userResponse.data.profile_pic) {
                    profilePicUrl = userResponse.data.profile_pic;
                    console.log(`[FacebookAPI] DEBUG profile_pic URL: ${profilePicUrl}`);

                    // Cách 2: "Tiểu ngạch" - Parse URL ảnh để tìm User ID thật
                    // URL ảnh thường có dạng: .../asid/12345678_REAL_UID_987654321_n.jpg
                    // Tìm tất cả dãy số dài >= 15 ký tự
                    const matches = profilePicUrl.match(/(\d{15,})/g);
                    console.log(`[FacebookAPI] DEBUG matches found: ${JSON.stringify(matches)}`);
                    if (matches && matches.length > 0) {
                        // Lấy match dài nhất để chắc chắn
                        realUserId = matches.reduce((a, b) => a.length >= b.length ? a : b);
                        console.log(`[FacebookAPI] ✅ Extracted User ID: ${realUserId} from profile_pic`);
                    }
                }
            } catch (e) {
                // Không lấy được profile_pic thì bỏ qua, không crash server
                console.log(`[FacebookAPI] Could not fetch profile_pic: ${e.message}`);
            }

            return {
                fullName: data.from.name,
                id: data.from.id,
                realUserId: realUserId,
                profileLink: realUserId ? `https://www.facebook.com/profile.php?id=${realUserId}` : null
            };
        }

    } catch (error) {
        if (error.response) {
            console.error(`[FacebookAPI] Error ${error.response.status} fetching message ${messageId}:`, JSON.stringify(error.response.data));
            if (error.response.data.error.code === 100 && error.response.data.error.error_subcode === 33) {
                console.warn('⚠️  NGUYÊN NHÂN: App chưa "Live" (Công khai) hoặc tài khoản nhắn tin không điều hành App.');
                console.warn('👉  GIẢI PHÁP: Vào Facebook Developers > App Settings > Chuyển "In Development" sang "Live".');
            }
        } else {
            console.error(`[FacebookAPI] Error fetching message ${messageId}:`, error.message);
        }
    }

    return {
        fullName: 'Người dùng Messenger',
        id: null,
        profileLink: null
    };
}

async function generateProfileLink(psid) {
    // Basic format
    const basicLink = `https://www.facebook.com/${psid}`;

    try {
        // Optional: Check if it redirects to a real profile URL
        // Note: This requires a high-quality proxy or authorized session if FB blocks standard axios requests
        const response = await axios.head(basicLink, {
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400
        });

        if (response.headers.location) {
            return response.headers.location;
        }
    } catch (e) {
        // Fallback to basic link if head request fails
    }

    return basicLink;
}

function generateAdminChatLink(pageId, psid) {
    return `https://business.facebook.com/latest/inbox/all?asset_id=${pageId}&selected_item_id=${psid}`;
}

/**
 * Trả quyền điều khiển hội thoại về cho Page Inbox (Hộp thư chính)
 * Giúp tin nhắn nhảy từ mục "Xong" về lại mục "Chưa đọc/Inbox"
 */
async function passThreadControl(pageConfig, psid) {
    try {
        const url = `https://graph.facebook.com/v18.0/me/pass_thread_control`;
        const response = await axios.post(url, {
            recipient: { id: psid },
            target_app_id: '263902037430900', // ID mặc định của Facebook Page Inbox
            metadata: 'Handing over to human agent'
        }, {
            params: { access_token: pageConfig.page_access_token }
        });

        if (response.data && response.data.success) {
            console.log(`[FacebookAPI] ✅ Passed thread control for PSID: ${psid} to Inbox.`);
            return true;
        }
    } catch (error) {
        console.error(`[FacebookAPI] ❌ Failed to pass thread control:`, error.response?.data || error.message);
    }
    return false;
}

module.exports = {
    getSenderInfoFromMessage,
    generateProfileLink,
    generateAdminChatLink,
    passThreadControl
};
