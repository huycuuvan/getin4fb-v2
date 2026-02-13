const fs = require('fs');
const path = require('path');
const { sendCookieAlert } = require('./emailService');

/**
 * Monitor debug screenshots để phát hiện lỗi login
 */
class DebugMonitor {
    constructor(debugDir) {
        this.debugDir = debugDir || path.resolve(__dirname, '../debug_screenshots');
        this.loginErrorThreshold = 3; // Cảnh báo khi có 3 lỗi login liên tiếp
        this.timeWindowMinutes = 10; // Trong vòng 10 phút
    }

    /**
     * Kiểm tra số lượng lỗi login trong khoảng thời gian gần đây
     */
    checkLoginErrors() {
        if (!fs.existsSync(this.debugDir)) {
            return { hasIssue: false, count: 0, message: 'Debug directory not found' };
        }

        const now = new Date();
        const timeWindow = this.timeWindowMinutes * 60 * 1000; // Convert to ms

        try {
            const files = fs.readdirSync(this.debugDir);
            const loginErrors = files
                .filter(f => f.includes('ERROR_login_redirect'))
                .map(f => {
                    const filePath = path.join(this.debugDir, f);
                    const stats = fs.statSync(filePath);
                    return {
                        name: f,
                        time: stats.mtime,
                        age: now - stats.mtime
                    };
                })
                .filter(f => f.age < timeWindow)
                .sort((a, b) => b.time - a.time);

            const hasIssue = loginErrors.length >= this.loginErrorThreshold;

            return {
                hasIssue,
                count: loginErrors.length,
                recentErrors: loginErrors,
                message: hasIssue
                    ? `⚠️ WARNING: ${loginErrors.length} login errors in the last ${this.timeWindowMinutes} minutes!`
                    : `✅ OK: ${loginErrors.length} login errors in the last ${this.timeWindowMinutes} minutes`
            };
        } catch (err) {
            console.error('[DebugMonitor] Error checking login errors:', err.message);
            return { hasIssue: false, count: 0, message: 'Error checking files', error: err.message };
        }
    }

    /**
     * Lấy thống kê tổng quan
     */
    getStats() {
        if (!fs.existsSync(this.debugDir)) {
            return {
                totalScreenshots: 0,
                totalHtml: 0,
                totalErrors: 0,
                loginErrors: 0,
                exceptionErrors: 0,
                oldestFile: null,
                newestFile: null
            };
        }

        try {
            const files = fs.readdirSync(this.debugDir);
            const screenshots = files.filter(f => f.endsWith('.png'));
            const htmlFiles = files.filter(f => f.endsWith('.html'));
            const errorFiles = files.filter(f => f.includes('ERROR'));
            const loginErrors = files.filter(f => f.includes('ERROR_login_redirect'));
            const exceptionErrors = files.filter(f => f.includes('ERROR_exception'));

            const fileTimes = files.map(f => {
                const filePath = path.join(this.debugDir, f);
                const stats = fs.statSync(filePath);
                return { name: f, time: stats.mtime };
            });

            const oldest = fileTimes.length > 0
                ? fileTimes.reduce((a, b) => a.time < b.time ? a : b)
                : null;
            const newest = fileTimes.length > 0
                ? fileTimes.reduce((a, b) => a.time > b.time ? a : b)
                : null;

            return {
                totalScreenshots: screenshots.length,
                totalHtml: htmlFiles.length,
                totalErrors: errorFiles.length,
                loginErrors: loginErrors.length,
                exceptionErrors: exceptionErrors.length,
                oldestFile: oldest,
                newestFile: newest
            };
        } catch (err) {
            console.error('[DebugMonitor] Error getting stats:', err.message);
            return null;
        }
    }

    /**
     * Dọn dẹp file cũ
     */
    cleanOldFiles(daysOld = 7) {
        if (!fs.existsSync(this.debugDir)) {
            return { success: false, message: 'Debug directory not found' };
        }

        const now = new Date();
        const cutoffTime = daysOld * 24 * 60 * 60 * 1000;

        try {
            const files = fs.readdirSync(this.debugDir);
            let deletedCount = 0;

            files.forEach(f => {
                const filePath = path.join(this.debugDir, f);
                const stats = fs.statSync(filePath);
                const age = now - stats.mtime;

                if (age > cutoffTime) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            });

            return {
                success: true,
                deletedCount,
                message: `Deleted ${deletedCount} files older than ${daysOld} days`
            };
        } catch (err) {
            console.error('[DebugMonitor] Error cleaning files:', err.message);
            return { success: false, message: 'Error cleaning files', error: err.message };
        }
    }

    /**
     * Tự động cảnh báo nếu phát hiện vấn đề
     */
    async autoAlert() {
        const check = this.checkLoginErrors();

        if (check.hasIssue) {
            console.error('');
            console.error('═══════════════════════════════════════════════════════════');
            console.error('🚨 COOKIE ALERT: Too many login errors detected!');
            console.error('═══════════════════════════════════════════════════════════');
            console.error(`   Message: ${check.message}`);

            // Logic gửi email
            const emailSubject = '🚨 CẢNH BÁO COOKIE MỚI: Đăng nhập thất bại!';
            const emailBody = `
                Hệ thống phát hiện ${check.count} lỗi đăng nhập liên tiếp trong ${this.timeWindowMinutes} phút qua!
                Nguyên nhân có thể do Cookie hết hạn hoặc bị Checkpoint.
                File lỗi mới nhất: ${check.recentErrors[0] ? check.recentErrors[0].name : 'N/A'}
                Vui lòng kiểm tra ngay!
            `;

            try {
                // Chỉ gửi email nếu chưa gửi trong vòng 5 phút trước đó (để không spam)
                const lastAlertPath = path.join(this.debugDir, 'last_email_alert.json');
                let lastSent = 0;

                if (fs.existsSync(lastAlertPath)) {
                    const data = JSON.parse(fs.readFileSync(lastAlertPath, 'utf8'));
                    lastSent = data.timestamp;
                }

                const now = Date.now();
                if (now - lastSent > 5 * 60 * 1000) { // 5 minutes cooldown
                    console.log('📧 Đang gửi email cảnh báo...');
                    await sendCookieAlert(emailSubject, emailBody);

                    fs.writeFileSync(lastAlertPath, JSON.stringify({ timestamp: now }));
                } else {
                    console.log('⏳ Đã gửi mail báo lỗi gần đây. Bỏ qua lần này để tránh spam.');
                }
            } catch (err) {
                console.error('❌ Lỗi khi gửi mail:', err.message);
            }

            console.error('');
            console.error('   Possible causes:');
            console.error('   1. Facebook cookies have expired');
            console.error('   2. Account is under checkpoint/security review');
            console.error('   3. Too many requests triggering rate limits');
            console.error('');
            console.error('   Recommended actions:');
            console.error('   1. Update cookies.json with fresh cookies from J2TEAM');
            console.error('   2. Check if Facebook account can login normally');
            console.error('   3. Reduce scraping frequency');
            console.error('   4. Check debug screenshots in: ' + this.debugDir);
            console.error('═══════════════════════════════════════════════════════════');
            console.error('');
        }

        return check;
    }

    /**
     * In báo cáo tổng quan
     */
    printReport() {
        const stats = this.getStats();
        const loginCheck = this.checkLoginErrors();

        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📊 DEBUG MONITOR REPORT');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`   Total Screenshots: ${stats.totalScreenshots}`);
        console.log(`   Total HTML Files: ${stats.totalHtml}`);
        console.log(`   Total Errors: ${stats.totalErrors}`);
        console.log(`     - Login Errors: ${stats.loginErrors}`);
        console.log(`     - Exception Errors: ${stats.exceptionErrors}`);
        console.log('');
        console.log(`   Recent Login Errors (${this.timeWindowMinutes}min): ${loginCheck.count}`);
        console.log(`   Status: ${loginCheck.hasIssue ? '🚨 ALERT' : '✅ OK'}`);
        console.log('');
        if (stats.oldestFile) {
            console.log(`   Oldest File: ${stats.oldestFile.name}`);
            console.log(`   Newest File: ${stats.newestFile.name}`);
        }
        console.log('');
        console.log(`   Debug Directory: ${this.debugDir}`);
        console.log('═══════════════════════════════════════════════════════════');
        console.log('');
    }
}

module.exports = DebugMonitor;
