const Trade = require("../models/Trade");
const { NseIndia } = require("stock-nse-india");
const oiAnalyzerService = require("../services/oiAnalyzer.service");
const kotakTradingService = require("../services/kotakTrading.service");
const logger = require("../utils/logger");

const nseIndia = new NseIndia();

class TradeController {
    // Get all trades
    async getAllTrades(req, res) {
        try {
            const trades = await Trade.find().sort({ createdAt: -1 });
            res.json(trades);
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    }

    // Get open trades
    async getOpenTrades(req, res) {
        try {
            const trades = await Trade.find({ status: "OPEN" });
            res.json(trades);
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    }

    // Get latest entry options (static)
    async getLatestEntryOptions(req, res) {
        try {
            const latestTrade = await Trade.findOne()
                .sort({ entryTime: -1 })
                .select('entryTime');

            if (!latestTrade) {
                return res.json({
                    success: true,
                    message: "No trades found",
                    options: [],
                    entryTime: null
                });
            }

            const latestEntryTime = latestTrade.entryTime;
            const sessionStart = new Date(latestEntryTime);
            sessionStart.setMinutes(sessionStart.getMinutes() - 15);

            const sessionEnd = new Date(latestEntryTime);
            sessionEnd.setMinutes(sessionEnd.getMinutes() + 15);

            const currentOptions = await Trade.find({
                entryTime: {
                    $gte: sessionStart,
                    $lte: sessionEnd
                }
            }).sort({ entryTime: -1 });

            res.json({
                success: true,
                count: currentOptions.length,
                entryTime: latestEntryTime,
                options: currentOptions.map(trade => ({
                    tradingSymbol: trade.tradingSymbol,
                    symbol: trade.symbol,
                    strikePrice: trade.strikePrice,
                    optionType: trade.optionType,
                    entryPrice: trade.entryPrice,
                    entryTime: trade.entryTime,
                    quantity: trade.quantity,
                    status: trade.status,
                    exitPrice: trade.exitPrice,
                    exitTime: trade.exitTime,
                    pnl: trade.pnl
                }))
            });
        } catch (err) {
            logger.error(err);
            res.status(500).json({ success: false, error: err.message });
        }
    }

    // Get latest entry options with live prices
    async getLatestEntryOptionsLive(req, res) {
        try {
            const latestTrade = await Trade.findOne()
                .sort({ entryTime: -1 })
                .select('entryTime');

            if (!latestTrade) {
                return res.json({
                    success: true,
                    message: "No trades found",
                    options: [],
                    entryTime: null
                });
            }

            const latestEntryTime = latestTrade.entryTime;
            const sessionStart = new Date(latestEntryTime);
            sessionStart.setMinutes(sessionStart.getMinutes() - 15);

            const sessionEnd = new Date(latestEntryTime);
            sessionEnd.setMinutes(sessionEnd.getMinutes() + 15);

            const currentOptions = await Trade.find({
                entryTime: {
                    $gte: sessionStart,
                    $lte: sessionEnd
                }
            }).sort({ entryTime: -1 });

            if (currentOptions.length === 0) {
                return res.json({
                    success: true,
                    message: "No trades in latest entry",
                    options: []
                });
            }

            const liveData = await Promise.all(
                currentOptions.map(async (trade) => {
                    try {
                        const allData = await nseIndia.getIndexOptionChain(trade.symbol);
                        const matched = allData.records.data.find(d =>
                            d.strikePrice.toString() === trade.strikePrice.toString()
                        );

                        if (!matched) {
                            return {
                                ...trade.toObject(),
                                currentPrice: null,
                                pnl: null,
                                error: "Data not found"
                            };
                        }

                        const optionData = trade.optionType === "CE" ? matched.CE : matched.PE;
                        const currentPrice = optionData?.lastPrice || trade.entryPrice;

                        let pnl = 0;
                        let pnlPercent = 0;

                        if (trade.status === "CLOSED" && trade.exitPrice) {
                            pnl = trade.pnl;
                            pnlPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
                        } else {
                            pnl = (currentPrice - trade.entryPrice) * trade.quantity;
                            pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
                        }

                        return {
                            tradingSymbol: trade.tradingSymbol,
                            symbol: trade.symbol,
                            strikePrice: trade.strikePrice,
                            optionType: trade.optionType,
                            entryPrice: trade.entryPrice,
                            currentPrice: currentPrice,
                            entryTime: trade.entryTime,
                            quantity: trade.quantity,
                            status: trade.status,
                            exitPrice: trade.exitPrice,
                            exitTime: trade.exitTime,
                            pnl: pnl,
                            pnlPercent: pnlPercent,
                            change: optionData?.change,
                            volume: optionData?.totalTradedVolume,
                            oi: optionData?.openInterest
                        };
                    } catch (error) {
                        return {
                            ...trade.toObject(),
                            currentPrice: trade.entryPrice,
                            pnl: 0,
                            error: error.message
                        };
                    }
                })
            );

            const totalPnL = liveData.reduce((sum, opt) => sum + (opt.pnl || 0), 0);

            res.json({
                success: true,
                count: liveData.length,
                entryTime: latestEntryTime,
                totalPnL: totalPnL,
                options: liveData,
                lastUpdated: new Date()
            });
        } catch (err) {
            logger.error(err);
            res.status(500).json({ success: false, error: err.message });
        }
    }

    // Get entry sessions
    async getEntrySessions(req, res) {
        try {
            const allTrades = await Trade.find().sort({ entryTime: -1 });

            if (allTrades.length === 0) {
                return res.json({ success: true, sessions: [] });
            }

            const sessions = [];
            let currentSession = {
                entryTime: allTrades[0].entryTime,
                trades: [allTrades[0]]
            };

            for (let i = 1; i < allTrades.length; i++) {
                const timeDiff = Math.abs(
                    currentSession.entryTime - allTrades[i].entryTime
                ) / 1000 / 60;

                if (timeDiff <= 30) {
                    currentSession.trades.push(allTrades[i]);
                } else {
                    sessions.push(currentSession);
                    currentSession = {
                        entryTime: allTrades[i].entryTime,
                        trades: [allTrades[i]]
                    };
                }
            }

            sessions.push(currentSession);

            res.json({
                success: true,
                totalSessions: sessions.length,
                latestSession: sessions[0],
                allSessions: sessions.map(s => ({
                    entryTime: s.entryTime,
                    tradesCount: s.trades.length,
                    trades: s.trades.map(t => ({
                        tradingSymbol: t.tradingSymbol,
                        strikePrice: t.strikePrice,
                        optionType: t.optionType,
                        status: t.status,
                        pnl: t.pnl
                    }))
                }))
            });
        } catch (err) {
            logger.error(err);
            res.status(500).json({ success: false, error: err.message });
        }
    }

    // Get OI data
    async getOIData(req, res) {
        try {
            const data = await oiAnalyzerService.analyzeAndSelectOptions();
            res.json(data);
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    }

    // Test entry
    async testEntry(req, res) {
        try {
            logger.info("🧪 TEST: Fetching OI data...");
            const options = await oiAnalyzerService.analyzeAndSelectOptions();

            logger.info(`✅ Found ${options.length} options:`, options);

            if (options.length === 0) {
                return res.json({
                    success: false,
                    message: "No options selected",
                    options: []
                });
            }

            logger.info("🧪 TEST: Executing entry...");
            await kotakTradingService.executeEntry(options);

            const savedTrades = await Trade.find().sort({ createdAt: -1 }).limit(5);

            res.json({
                success: true,
                optionsSelected: options.length,
                options: options,
                savedTrades: savedTrades
            });
        } catch (err) {
            logger.error("Test entry failed:", err.message);
            logger.error("Stack:", err.stack);
            res.status(500).json({
                success: false,
                error: err.message,
                stack: err.stack
            });
        }
    }
}

module.exports = new TradeController();
