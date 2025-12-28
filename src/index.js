require("dotenv").config();
const readline = require("readline");
const logger = require("./utils/logger");
const kotakAuth = require("./services/kotakAuth");
const kotakTrading = require("./services/kotakTrading");
const scheduler = require('./services/scheduler');
const express = require("express");

const app = express();
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    try {
        logger.info("=".repeat(70));
        logger.info("KOTAK NEO OPTIONS TRADING BOT");
        logger.info('='.repeat(70));

        // Check configuration
        if (!process.env.ACCESS_TOKEN) {
            throw new Error("ACCESS_TOKEN not configured in .env file");
        }

        logger.info(`Paper Trade Mode: ${process.env.PAPER_TRADE === 'true' ? 'ENABLED' : 'DISABLED'}`);
        logger.info(`Trade Quantity: ${process.env.TRADE_QUANTITY || 50}`);

        await kotakAuth.authenticate();
        logger.info('✓ Authentication successful');

        // Display open positions
        const openPositions = kotakTrading.getOpenPositions();
        if (openPositions.length > 0) {
            logger.info(`\n Open positions: ${openPositions.length}`);
            openPositions.forEach(pos => {
                logger.info(`   -${pos.tradingSymbol} | Entry: ${pos.entryPrice}`);
            });
        }

        // Start Scheduler
        logger.info("\n --- Starting Automated Trading --- ");
        scheduler.start();

        logger.info("\nBot is now running");
        logger.info('Entry: Mon-Thu at 3:15 PM IST');
        logger.info('Exit: Tue-Fri at 9:30 AM IST');
    } catch (error) {
        logger.error(`Fatal error: ${error.stack || error.response?.data || error}`);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    logger.info('\nShutting down gracefully...');
    scheduler.stop();
    rl.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('\nShutting down gracefully...');
    scheduler.stop();
    rl.close();
    process.exit(0);
});

// Start the application
main().catch(error => {
    logger.error(`Unhandled error: ${error.stack || error}`);
    process.exit(1);
});

app.get("/", (req, res) => {
  res.send("Trading bot running");
});

app.listen(5000, () => {
  console.log("Health server running on port", PORT);
});
