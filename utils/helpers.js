/**
 * Trích xuất số điện thoại từ văn bản (Hỗ trợ định dạng Việt Nam)
 * @param {string} text 
 * @returns {string|null}
 */
function extractPhoneNumber(text) {
    if (!text) return null;

    // Regex hỗ trợ: 090..., 8490..., +8490..., 024... (số bàn)
    // Chấp nhận dấu chấm, khoảng trắng, gạch ngang giữa các số
    const phoneRegex = /(?:\+84|84|0)(?:\d[.\- ]?){9,10}\b/g;

    const matches = text.match(phoneRegex);
    if (matches && matches.length > 0) {
        // Lấy số đầu tiên tìm thấy và làm sạch (chỉ giữ lại số)
        let phone = matches[0].replace(/[.\- ]/g, '');

        // Chuẩn hóa: Nếu bắt đầu bằng 84 thì đổi thành 0
        if (phone.startsWith('84')) phone = '0' + phone.substring(2);
        if (phone.startsWith('+84')) phone = '0' + phone.substring(3);

        // Kiểm tra độ dài hợp lệ (10 số di động, 11 số bàn cũ)
        if (phone.length >= 10 && phone.length <= 11) {
            return phone;
        }
    }

    return null;
}

module.exports = { extractPhoneNumber };
