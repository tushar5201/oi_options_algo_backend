const { NseIndia } = require("stock-nse-india");
const Trade = require("../models/Trade");
const { Server } = require("socket.io");
const logger = require("../utils/logger");

const nseIndia = new NseIndia();
let io = null;

const updateIntervals = new Map();
async function fetchLatestEntryOptionsLive() {
    try {
        const latestTrade = await Trade.findOne().sort({ entryTime: -1 }).select('entryTime');
        if (!latestTrade) {
            return {
                success: true,
                message: "No trades found",
                options: [],
                entryTime: null
            };
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
            return {
                success: true,
                message: "No trades in latest entry",
                options: [],
                entryTime: latestEntryTime
            };
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
                    }
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

        return {
            success: true,
            count: liveData.length,
            entryTime: latestEntryTime,
            totalPnL: totalPnL,
            options: liveData,
            lastUpdated: new Date()
        };
    } catch (error) {
        logger.error("Error fetching latest entry options:", err);
        return {
            success: false,
            error: err.message
        };
    }
}

function initializeWebSocket(server) {
    io = new Server(server, {
        cors: {
            origin: "*", // Configure this properly in production
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        logger.info(`🔌 Client connected: ${socket.id}`);

        // Send initial data immediately
        fetchLatestEntryOptionsLive().then(data => {
            socket.emit("latestEntryOptions", data);
        });

        // Start real-time updates (every 3 seconds to avoid rate limiting)
        const intervalId = setInterval(async () => {
            try {
                const data = await fetchLatestEntryOptionsLive();
                socket.emit("latestEntryOptions", data);
            } catch (error) {
                logger.error("Error in WebSocket update:", error);
                socket.emit("error", { message: error.message });
            }
        }, 3000); // Update every 3 seconds

        updateIntervals.set(socket.id, intervalId);

        // Handle client requesting manual refresh
        socket.on("refresh", async () => {
            try {
                const data = await fetchLatestEntryOptionsLive();
                socket.emit("latestEntryOptions", data);
            } catch (error) {
                socket.emit("error", { message: error.message });
            }
        });

        // Handle disconnection
        socket.on("disconnect", () => {
            logger.info(`🔌 Client disconnected: ${socket.id}`);
            const intervalId = updateIntervals.get(socket.id);
            if (intervalId) {
                clearInterval(intervalId);
                updateIntervals.delete(socket.id);
            }
        });
    });

    logger.info("🔌 WebSocket server initialized");
}

module.exports = { initializeWebSocket };