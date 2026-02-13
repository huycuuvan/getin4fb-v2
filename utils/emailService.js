const nodemailer = require('nodemailer');
require('dotenv').config();

// Cấu hình người nhận mặc định
const DEFAULT_RECEIVER = 'ndhuy0904@gmail.com';

// Tạo transporter (người vận chuyển)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Email của bạn (người gửi)
        pass: process.env.EMAIL_PASS  // Mật khẩu ứng dụng (App Password)
    }
});

/**
 * Gửi email cảnh báo Cookie
 * @param {string} subject Tiêu đề email
 * @param {string} message Nội dung email
 */
async function sendCookieAlert(subject, message) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn('⚠️ [EmailService] Chưa cấu hình EMAIL_USER và EMAIL_PASS trong .env. Không thể gửi email.');
        console.log(`📧 Giả lập gửi email đến ${DEFAULT_RECEIVER}: [${subject}] ${message}`);
        return;
    }

    const mailOptions = {
        from: `"Messenger Bot Alert" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_TO || DEFAULT_RECEIVER,
        subject: subject || '🚨 CẢNH BÁO: Cookie Facebook có thể đã hết hạn!',
        text: message,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
                <h2 style="color: #d32f2f;">🚨 Cảnh báo Hệ thống</h2>
                <p>Hệ thống phát hiện dấu hiệu bất thường về Cookie Facebook.</p>
                <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #d32f2f; margin: 20px 0;">
                    <strong>Chi tiết:</strong><br/>
                    ${message.replace(/\n/g, '<br/>')}
                </div>
                <p>Vui lòng kiểm tra lại:</p>
                <ul>
                    <li>File <code>cookies.json</code> trên server.</li>
                    <li>Thử đăng nhập tài khoản Facebook thủ công.</li>
                    <li>Chạy script <code>node check_cookie.js</code> để kiểm tra lại.</li>
                </ul>
                <p style="font-size: 12px; color: #777;">Email tự động từ Messenger Bot Server.</p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ [EmailService] Đã gửi email cảnh báo đến ${mailOptions.to}: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error('❌ [EmailService] Lỗi khi gửi email:', error.message);
    }
}

module.exports = { sendCookieAlert };
