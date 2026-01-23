const config = {
    // API Configuration
    api: {
        loginUrl: "https://mis.kotaksecurities.com/login/1.0/tradeApiLogin",
        validateUrl: "https://mis.kotaksecurities.com/login/1.0/tradeApiValidate",
        nseOiUrl: "https://www.nseindia.com/api/live-analysis-oi-spurts-contracts"
    },

    //Credentials
    credentials: {
        accessToken: process.env.ACCESS_TOKEN,
        mobileNumber: process.env.MOBILE_NUMBER,
        ucc: process.env.UCC,
        mpin: process.env.MPIN
    },

    //Trading Configuration
    trading: {
        quantity: parseInt(process.env.TRADE_QUANTITY) || 50,
        maxPosition: parseInt(process.env.MAX_POSITION) || 2,
        paperTrade: true,
        entryTime: { hour: 15, minute: 9 },
        exitTime: { hour: 9, minute: 30 },
        tradingDays: [1,2,3,4]
    },

    // Option Filtering
    options: {
        instruments: ["NIFTY", "BANKNIFTY"],
        maxSelection: 2,
        topN: 5
    },

    // Server Configuration
    server: {
        port: process.env.PORT || 5000,
        mongoUri: process.env.MONGODB_URI
    },

    // WebSocket Configuration
    websocket: {
        updateInterval: 3000,
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    }
};

module.exports = config;