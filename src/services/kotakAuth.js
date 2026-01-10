const axios = require("axios");
const logger = require("../utils/logger");
const config = require("../config/config");
const { authenticator } = require('otplib');

authenticator.options = {
    step: 30,
    window: 1
};

class kotakAuth {
    constructor() {
        this.sessionToken = null;
        this.sessionSid = null;
        this.baseUrl = null;
        this.viewToken = null;
        this.viewSid = null;
    }

    // Step 1: Login with TOTP
    async loginWithTOTP() {
        try {
            logger.info("Step 1: Authenticating with TOTP...");

            const totp = authenticator.generate(process.env.TOTP_SECRET);
            const payload = {
                mobileNumber: "+916351650589",
                ucc: config.credentials.ucc,
                totp: totp
            };

            const headers = {
                Authorization: config.credentials.accessToken,
                "neo-fin-key": "neotradeapi",
                "Content-Type": "application/json"
            };

            const res = await axios.post(
                config.api.loginUrl,
                payload,
                { headers }
            );
            this.viewToken = res.data.data.token;
            this.viewSid = res.data.data.sid;
            logger.info("TOTP authentication successful");
        } catch (error) {
            const errorMsg = error.response?.data?.message || 
                           (typeof error.response?.data === "string" ? error.response.data : JSON.stringify(error.response?.data)) ||
                           error.message;
            logger.error("TOTP Login Error:", errorMsg);
            throw new Error(`TOTP Login failed: ${errorMsg}`);
        }
    }


    // Step 2: Validate MPIN and get session token
    async validateMPIN() {
        try {
            logger.info("Step 2: Validating MPIN...");
            const res = await axios.post(
                config.api.validateUrl,
                {
                    mpin: config.credentials.mpin
                }, {
                headers: {
                    'Authorization': config.credentials.accessToken,
                    'sid': this.viewSid,
                    'Auth': this.viewToken,
                    "neo-fin-key": "neotradeapi",
                    "Content-Type": "application/json"
                }
            }
            );

            if (res.data && res.data.data) {
                this.sessionToken = res.data.data.token;
                this.sessionSid = res.data.data.sid;
                this.baseUrl = res.data.data.baseUrl;

                logger.info("MPIN Validation successfully");
                logger.info(`Base URL: ${this.baseUrl}`);
                return true;
            }
            throw new Error("Mpin validation failed");
        } catch (error) {
            logger.error("Mpin validation failed: ", error.response.data || error.message);
            throw error;
        }
    }

    // Complete authentication code
    async authenticate() {
        await this.loginWithTOTP();
        await this.validateMPIN();
        return {
            sessionToken: this.sessionToken,
            sessionSid: this.sessionSid,
            baseUrl: this.baseUrl
        };
    }

    // Get current session
    getSession() {
        return {
            sessionToken: this.sessionToken,
            sessionSid: this.sessionSid,
            baseUrl: this.baseUrl
        };
    }

    // Check if session is valid
    isAuthenticated() {
        return !!(this.sessionToken && this.sessionSid && this.baseUrl);
    }

    
}

module.exports = new kotakAuth();