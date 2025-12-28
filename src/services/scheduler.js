const config = require("../config/config");
const cron = require("node-cron");
const logger = require("../utils/logger");
const oiAnalyzer = require("./oiAnalyzer");
const kotakTrading = require("./kotakTrading");

class Scheduler {
    constructor() {
        this.entryJob = null;
        this.exitJob = null;
    }

    scheduleEntryTrades() {
        const { hour, minute } = config.trading.entryTime;
        // minute hour day-of-month month day-of-week (Mon-Thu => 1-4)
        const cronExpression = `${minute} ${hour} * * 1-4`;

        this.entryJob = cron.schedule(cronExpression, async () => {
            logger.info(">>> Entry trade trigger activated <<<");
            try {
                const selectedOptions = await oiAnalyzer.analyzeAndSelectOptions();
                if (selectedOptions.length === 0) {
                    logger.warn("No options selected for trading");
                    return;
                }

                // Convert to kotak format
                const kotakOptions = selectedOptions.map(opt => oiAnalyzer.convertToKotakFormat(opt));
                await kotakTrading.executeEntry(kotakOptions);
            } catch (error) {
                logger.error(`Entry trade execution failed: ${error.message}`);
            }
        }, {
            timezone: 'Asia/Kolkata'
        });
        logger.info(`Entry trades scheduled: Mon-Thu at ${hour}:${minute}`);
    }

    scheduleExitTrades() {
        const { hour, minute } = config.trading.exitTime;
        const cronExpression = `${minute} ${hour} * * 2-5`;
        this.exitJob = cron.schedule(cronExpression, async () => {
            logger.info('>>> Exit trade trigger activated <<<');

            try {
                await kotakTrading.executeExit();
            } catch (error) {
                logger.error(`Exit trade execution failed: ${error.message}`);
            }
        }, {
            timezone: 'Asia/Kolkata'
        });

        logger.info(`Exit trades scheduled: Tue-Fri at ${hour}:${minute}`);
    }

    start() {
        logger.info("Starting trade scheduler...");
        this.scheduleEntryTrades();
        this.scheduleExitTrades();
        logger.info("Scheduler started successfully");
    }

    stop() {
        if (this.entryJob) this.entryJob.stop();
        if (this.exitJob) this.exitJob.stop();
        logger.info("Scheduler stopped");
    }
}

module.exports = new Scheduler();