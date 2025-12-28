const crypto = require("crypto");
const logger = require("./logger");

class Helpers{
    static generateTOTP(secret) {
        throw new Error('Please enter TOTP manually from your authenticator app');
    }

    // Format date for API 
    static formatData(date) {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    }

    // Check if market is open
    static isMarketOpen() {
        const now = new Date();
        const day = now.getDay();
        const hour = now.getHours();
        const minute = now.getMinutes();

        // Monday to Friday
        if (day === 0 || day === 6) return false;

        // 9:15 AM to 3:30 PM
        const currentMinutes = hour * 60 + minute;
        const marketOpen = 9 * 60 + 15;
        const marketClose = 15 * 60 + 30;

        return currentMinutes >= marketOpen && currentMinutes <= marketClose;
    }

    // Sleep function
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Retry with exponential backoff
    static async retryWithBackoff(fn, maxRetries = 3, delay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i == maxRetries - 1) throw error;
                const waitTime = delay * Math.pow(2, i);
                logger.warn(`Retry ${i + 1}/${maxRetries} after ${waitTime}ms: ${error.message}`);
                await this.sleep(waitTime);
            }
        }
    }
}

module.exports = Helpers;