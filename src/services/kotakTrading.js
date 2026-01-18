const axios = require("axios");
const logger = require("../utils/logger");
const kotakAuth = require("./kotakAuth");
const config = require("../config/config");
const Trade = require("../models/Trade");

class KotakTrading {

    // ✅ Helper: Check if market is open
    isMarketOpen() {
        const now = new Date();
        const day = now.getDay(); // 0=Sunday, 6=Saturday
        const hour = now.getHours();
        const minute = now.getMinutes();
        const currentMinutes = hour * 60 + minute;

        // Market closed on weekends
        if (day === 0 || day === 6) {
            logger.warn("⚠️ Market closed: Weekend");
            return false;
        }

        // Market hours: 9:15 AM to 3:30 PM
        const marketOpen = 9 * 60 + 15;   // 9:15 AM
        const marketClose = 15 * 60 + 30;  // 3:30 PM

        if (currentMinutes < marketOpen) {
            logger.warn(`⚠️ Market not yet open. Opens at 9:15 AM`);
            return false;
        }

        if (currentMinutes > marketClose) {
            logger.warn(`⚠️ Market closed. Closed at 3:30 PM`);
            return false;
        }

        return true;
    }

    async placeOrder(option, side = "B") {
        const session = kotakAuth.getSession();
        if (!session?.baseUrl) throw new Error("Not authenticated");

        if (config.trading.paperTrade) {
            logger.info(`📝 PAPER TRADE: ${side === "B" ? "BUY" : "SELL"} ${option.tradingSymbol}`);
            return {
                nOrdNo: "PAPER_" + Date.now(),
                stat: "OK"
            };
        }

        const payload = {
            am: "NO",
            dq: "0",
            es: option.exchangeSegment,
            mp: "0",
            pc: "MIS",
            pf: "N",
            pr: "0",
            pt: "MKT",
            qt: config.trading.quantity.toString(),
            rt: "DAY",
            tp: "0",
            ts: option.tradingSymbol,
            tt: side
        };

        try {
            const res = await axios.post(
                `${session.baseUrl}/quick/order/rule/ms/place`,
                `jData=${encodeURIComponent(JSON.stringify(payload))}`,
                {
                    headers: {
                        Auth: session.sessionToken,
                        Sid: session.sessionSid,
                        "neo-fin-key": "neotradeapi",
                        "Content-Type": "application/x-www-form-urlencoded"
                    }
                }
            );

            return res.data;

        } catch (error) {
            let errorMsg = "Unknown error";

            if (error.response) {
                const data = error.response.data;
                errorMsg = data?.message ||
                    (typeof data === 'string' ? data : JSON.stringify(data)) ||
                    `HTTP ${error.response.status}`;

                logger.error("❌ Order API Error:", {
                    status: error.response.status,
                    data: error.response.data,
                    tradingSymbol: option.tradingSymbol
                });
            } else if (error.request) {
                errorMsg = "No response from server";
            } else {
                errorMsg = error.message;
            }

            throw new Error(errorMsg);
        }
    }

    async executeEntry(options) {
        logger.info("========================================");
        logger.info("🔥 EXECUTE ENTRY STARTED");
        logger.info(`Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);
        logger.info("========================================");

        // ✅ CRITICAL: Check market status for real trading
        if (!config.trading.paperTrade) {
            if (!this.isMarketOpen()) {
                logger.error("❌ Cannot place orders - Market is closed");
                return;
            }
            logger.info("✅ Market is open - Proceeding with entry");
        } else {
            logger.info("📝 Paper trading mode - Skipping market hours check");
        }

        if (!options || options.length === 0) {
            logger.warn("⚠️ No options provided to executeEntry");
            return;
        }

        logger.info(`📊 Processing ${options.length} options for entry`);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < options.length; i++) {
            const opt = options[i];

            try {
                logger.info(`\n--- Option ${i + 1}/${options.length}: ${opt.tradingSymbol} ---`);
                logger.info(`Strike: ${opt.strikePrice} | Type: ${opt.optionType} | LTP: ₹${opt.ltp}`);

                const order = await this.placeOrder(opt, "B");
                logger.info(`✅ Order placed: ${order.nOrdNo}`);

                const tradeData = {
                    orderId: order.nOrdNo,
                    symbol: opt.symbol,
                    tradingSymbol: opt.tradingSymbol,
                    strikePrice: opt.strikePrice,
                    optionType: opt.optionType,
                    entryPrice: opt.ltp,
                    quantity: config.trading.quantity,
                    entryTime: new Date(),
                    status: "OPEN",
                    paperTrade: config.trading.paperTrade
                };

                const trade = await Trade.create(tradeData);

                logger.info(`✅ SAVED TO DB: ${trade.tradingSymbol} | ID: ${trade._id}`);

                successCount++;

            } catch (err) {
                failCount++;
                logger.error(`❌ Entry failed for ${opt?.tradingSymbol || 'unknown'}:`, err.message);
            }
        }

        logger.info("========================================");
        logger.info(`📊 Entry Summary: ${successCount} success, ${failCount} failed`);
        logger.info("========================================");
    }

    async executeExit() {
        logger.info("========================================");
        logger.info("🔴 EXECUTE EXIT STARTED");
        logger.info(`Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);
        logger.info("========================================");

        // ✅ CRITICAL: Check market status for real trading
        if (!config.trading.paperTrade) {
            if (!this.isMarketOpen()) {
                logger.error("❌ Cannot place orders - Market is closed");
                return;
            }
            logger.info("✅ Market is open - Proceeding with exit");
        } else {
            logger.info("📝 Paper trading mode - Skipping market hours check");
        }

        const openTrades = await Trade.find({ status: "OPEN" });

        if (openTrades.length === 0) {
            logger.info("ℹ️ No open trades to exit");
            return;
        }

        logger.info(`📊 Found ${openTrades.length} open positions to exit`);

        let successCount = 0;
        let failCount = 0;

        for (const trade of openTrades) {
            try {
                logger.info(`\n--- Exiting: ${trade.tradingSymbol} ---`);

                const ltp = await this.getLiveLTP(trade.tradingSymbol);

                const order = await this.placeOrder(
                    {
                        tradingSymbol: trade.tradingSymbol,
                        exchangeSegment: "nse_fo"
                    },
                    "S"
                );

                trade.exitPrice = ltp;
                trade.exitTime = new Date();
                trade.pnl = (ltp - trade.entryPrice) * trade.quantity;
                trade.status = "CLOSED";

                await trade.save();

                logger.info(`✅ EXIT SUCCESS: ${trade.tradingSymbol} | PnL: ₹${trade.pnl.toFixed(2)}`);
                successCount++;

            } catch (err) {
                failCount++;
                logger.error(`❌ Exit failed for ${trade.tradingSymbol}:`, err.message);
            }
        }

        logger.info("========================================");
        logger.info(`📊 Exit Summary: ${successCount} success, ${failCount} failed`);
        logger.info("========================================");
    }

    async getLiveLTP(tradingSymbol) {
        // TODO: Implement actual LTP fetching
        const randomPrice = Math.random() * 100 + 50;
        logger.warn(`⚠️ Using dummy LTP for ${tradingSymbol}: ₹${randomPrice.toFixed(2)}`);
        return randomPrice;
    }

    async getAllTrades() {
        return Trade.find().sort({ createdAt: -1 });
    }

    async getTradesByDate(date) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        return Trade.find({
            entryTime: { $gte: start, $lte: end }
        });
    }

    async getMonthlyPnL(month) {
        const start = new Date(`${month}-01`);
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);

        const trades = await Trade.find({
            exitTime: { $gte: start, $lt: end }
        });

        return {
            totalTrades: trades.length,
            totalPnL: trades.reduce((s, t) => s + (t.pnl || 0), 0),
            trades
        };
    }
}

module.exports = new KotakTrading();