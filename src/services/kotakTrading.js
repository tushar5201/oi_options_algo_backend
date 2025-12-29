const axios = require("axios");
const logger = require("../utils/logger");
const kotakAuth = require("./kotakAuth");
const config = require("../config/config");
const Trade = require("../models/Trade");

class KotakTrading {

    // ======================
    // PLACE ORDER
    // ======================
    async placeOrder(option, side = "B") {
        const session = kotakAuth.getSession();
        if (!session?.baseUrl) throw new Error("Not authenticated");

        if (config.trading.paperTrade) {
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
    }

    // ======================
    // ENTRY
    // ======================
    async executeEntry(options) {
        for (const opt of options) {
            try {
                const order = await this.placeOrder(opt, "B");

                const trade = await Trade.create({
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
                });

                logger.info(`✅ ENTRY: ${trade.tradingSymbol}`);
            } catch (err) {
                logger.error("Entry failed:", err.message);
            }
        }
    }

    // ======================
    // EXIT
    // ======================
    async executeExit() {
        const openTrades = await Trade.find({ status: "OPEN" });

        for (const trade of openTrades) {
            try {
                const ltp = await this.getLiveLTP(trade.tradingSymbol);

                await this.placeOrder(
                    { tradingSymbol: trade.tradingSymbol, exchangeSegment: "nse_fo" },
                    "S"
                );

                trade.exitPrice = ltp;
                trade.exitTime = new Date();
                trade.pnl = (ltp - trade.entryPrice) * trade.quantity;
                trade.status = "CLOSED";

                await trade.save();

                logger.info(
                    `✅ EXIT: ${trade.tradingSymbol} | PnL: ₹${trade.pnl.toFixed(2)}`
                );
            } catch (err) {
                logger.error("Exit failed:", err.message);
            }
        }
    }

    // ======================
    // HELPERS
    // ======================
    async getLiveLTP() {
        return Math.random() * 100 + 50; // replace later
    }

    async getAllTrades() {
        return Trade.find().sort({ createdAt: -1 });
    }

    async getTradesByDate(date) {
        const start = new Date(date);
        const end = new Date(date);
        end.setHours(23, 59, 59);

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
