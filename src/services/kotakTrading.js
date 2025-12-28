const fs = require("fs");
const axios = require("axios");
const logger = require("../utils/logger");
const kotakAuth = require("./kotakAuth");
const config = require("../config/config");
const path = require("path");

class KotakTrading {
    constructor() {
        this.position = [];
        this.tradeFile = path.join(__dirname, "../../data/trades.json");
        this.ensureDataDirectory();
        this.loadPositions();
    }

    ensureDataDirectory() {
        const dir = path.dirname(this.tradeFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    loadPositions() {
        try {
            if (fs.existsSync(this.tradeFile)) {
                const data = fs.readFileSync(this.tradeFile, 'utf-8');
                if (!data || !data.trim()) {
                    this.position = [];
                    fs.writeFileSync(this.tradeFile, JSON.stringify(this.position, null, 2));
                    logger.info('Initialized empty trades file.');
                } else {
                    this.position = JSON.parse(data);
                    logger.info(`Loaded ${this.position.length} existing positions`);
                }
            }
        } catch (error) {
            logger.error(`Failed to load positions: ${error.message}`);
            this.position = [];
        }
    }

    savePositions() {
        try {
            fs.writeFileSync(this.tradeFile, JSON.stringify(this.position, null, 2));
            logger.info("Positions saved successfully.");
        } catch (error) {
            logger.error(`Failed to save positions: ${error.message}`);
        }
    }

    async notifyTrade(position, type = 'entry') {
        try {
            const message = {
                type,
                timestamp: new Date().toISOString(),
                symbol: position.tradingSymbol,
                entryPrice: position.entryPrice,
                quantity: position.quantity,
                paperTrade: config.trading.paperTrade,
                pnl: position.pnl || 0
            };

            // FCM Notification (replace with your FCM endpoint)
            if (process.env.FCM_SERVER_KEY) {
                await axios.post('https://fcm.googleapis.com/fcm/send', {
                    to: '/topics/trades',
                    notification: {
                        title: `${type.toUpperCase()} TRADE`,
                        body: `${position.tradingSymbol} | ₹${position.entryPrice}`,
                    },
                    data: message
                }, {
                    headers: { Authorization: `key=${process.env.FCM_SERVER_KEY}` }
                });
            }
            logger.info(`✅ Notification sent: ${position.tradingSymbol} (${type})`);
        } catch (error) {
            logger.error('Notification failed:', error.message);
        }
    }

    async placeOrder(option, transactionType = "B") {
        const session = kotakAuth.getSession();
        if (!session.baseUrl) throw new Error("Not authenticated.");

        const orderData = {
            am: "NO", dq: "0", es: option.exchangeSegment,
            mp: "0", pc: "MIS", pf: "N", pr: "0",
            pt: "MKT", qt: config.trading.quantity.toString(),
            rt: "DAY", tp: "0", ts: option.tradingSymbol, tt: transactionType
        };

        try {
            if (config.trading.paperTrade) {
                logger.info(`[PAPER] ${transactionType === "B" ? "BUY" : "SELL"} ${option.tradingSymbol}`);
                return { nOrdNo: `Paper${Date.now()}`, stat: "Ok", stCode: 200, paperTrade: true };
            }

            const res = await axios.post(
                `${session.baseUrl}/quick/order/rule/ms/place`,
                `jData=${encodeURIComponent(JSON.stringify(orderData))}`,
                {
                    headers: {
                        'Auth': session.sessionToken,
                        'Sid': session.sessionSid,
                        'neo-fin-key': 'neotradeapi',
                        'Content-Type': 'application/x-www-form-urlencoded' // ✅ FIXED
                    }
                }
            );
            logger.info(`Order placed: ${res.data.nOrdNo}`);
            return res.data;
        } catch (error) {
            logger.error("Order failed:", error.response?.data || error.message);
            throw error;
        }
    }

    async executeEntry(options) {
        // ✅ Check max positions
        const openPositions = this.getOpenPositions();
        if (openPositions.length >= config.trading.maxPosition) {
            logger.warn(`Max positions reached: ${openPositions.length}/${config.trading.maxPosition}`);
            return;
        }

        logger.info("=== ENTRY TRADES ===");
        const newPositions = [];

        for (const option of options.slice(0, config.trading.maxPosition - openPositions.length)) {
            try {
                const orderResponse = await this.placeOrder(option, "B");
                const position = {
                    orderId: orderResponse.nOrdNo,
                    symbol: option.symbol,
                    tradingSymbol: option.tradingSymbol,
                    strikePrice: option.strikePrice,
                    optionType: option.optionType,
                    entryPrice: option.ltp,
                    quantity: config.trading.quantity,
                    entryTime: new Date().toISOString(),
                    status: 'OPEN',
                    paperTrade: config.trading.paperTrade
                };

                newPositions.push(position);
                await this.notifyTrade(position, 'entry');
                logger.info(`✅ Position opened: ${position.tradingSymbol}`);
            } catch (error) {
                logger.error(`❌ Entry failed ${option.tradingSymbol}:`, error.message);
            }
        }

        this.position.push(...newPositions);
        this.savePositions();
        logger.info(`Entry complete. Open: ${this.getOpenPositions().length}`);
    }

    async executeExit() {
        logger.info("=== EXIT TRADES ===");
        const openPositions = this.getOpenPositions();
        if (openPositions.length === 0) {
            logger.info("No positions to exit");
            return;
        }

        for (const position of openPositions) {
            try {
                // Fetch live LTP before exit
                const ltp = await this.getLiveLTP(position.tradingSymbol);
                const option = {
                    exchangeSegment: 'nse_fo',
                    tradingSymbol: position.tradingSymbol,
                    ltp: ltp
                };

                const orderResponse = await this.placeOrder(option, 'S');
                position.exitPrice = ltp;
                position.exitTime = new Date().toISOString();
                position.status = 'CLOSED';
                position.pnl = (ltp - position.entryPrice) * position.quantity;
                position.exitOrderId = orderResponse.nOrdNo;

                await this.notifyTrade(position, 'exit');
                logger.info(`✅ Closed ${position.tradingSymbol} | P&L: ₹${position.pnl.toFixed(2)}`);
            } catch (error) {
                logger.error(`❌ Exit failed ${position.tradingSymbol}:`, error.message);
            }
        }

        this.savePositions();
    }

    async getLiveLTP(tradingSymbol) {
        // Mock LTP fetch - implement actual Kotak quotes API
        return Math.random() * 100 + 50; // Replace with real API call
    }

    getOpenPositions() {
        return this.position.filter(p => p.status === 'OPEN');
    }

    getAllPositions() {
        return [...this.position]; // Return copy
    }

    getSummary({ date, period = 'today' } = {}) {
        const closed = this.position.filter(p => p.status === 'CLOSED');
        let filtered = closed;

        if (date) {
            const selectedDate = new Date(date);
            filtered = closed.filter(trade => {
                const exitDate = new Date(trade.exitTime);
                return exitDate.toDateString() === selectedDate.toDateString();
            });
        }

        const totalPnL = filtered.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
        const wins = filtered.filter(t => t.pnl > 0).length;
        const winRate = filtered.length ? (wins / filtered.length * 100) : 0;

        return {
            period,
            totalTrades: filtered.length,
            totalPnL,
            winRate: Math.round(winRate * 10) / 10,
            avgPnL: filtered.length ? totalPnL / filtered.length : 0,
            openPositions: this.getOpenPositions().length
        };
    }
}

module.exports = new KotakTrading();
