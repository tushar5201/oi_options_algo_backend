const cron = require("node-cron");
const logger = require("../utils/logger");
const config = require("../config/config");
const oiAnalyzerService = require("./oiAnalyzer.service");
const kotakTradingService = require("./kotakTrading.service");

class SchedulerService {
    constructor() {
        this.entryJob = null;
        this.exitJob = null;
    }

    scheduleEntryTrades() {
        const { hour, minute } = config.trading.entryTime;
        const cronExpression = `${minute} ${hour} * * 1-4`;

        logger.info(`📅 Entry cron scheduled: ${cronExpression}`);
        logger.info(`📅 This means: Every Mon-Thu at ${hour}:${String(minute).padStart(2, '0')} IST`);

        this.entryJob = cron.schedule(
            cronExpression,
            async () => {
                logger.info("🔥 ENTRY CRON TRIGGERED");
                logger.info(`Time: ${new Date().toLocaleString("en-IN")}`);

                try {
                    const options = await oiAnalyzerService.analyzeAndSelectOptions();

                    if (!options || options.length === 0) {
                        logger.warn("⚠️ No options selected. Skipping entry.");
                        return;
                    }

                    logger.info(`📊 Options selected: ${options.length}`);
                    await kotakTradingService.executeEntry(options);
                } catch (error) {
                    logger.error("❌ Entry execution failed:", error.message);
                }
            },
            {
                timezone: "Asia/Kolkata"
            }
        );

        logger.info(`✅ Entry Scheduler Active → Mon–Thu @ ${hour}:${minute} IST`);
    }

    scheduleExitTrades() {
        const { hour, minute } = config.trading.exitTime;
        const cronExpression = `${minute} ${hour} * * 2-5`;

        this.exitJob = cron.schedule(
            cronExpression,
            async () => {
                logger.info("🔴 EXIT CRON TRIGGERED");
                logger.info(`Time: ${new Date().toLocaleString("en-IN")}`);

                try {
                    await kotakTradingService.executeExit();
                } catch (error) {
                    logger.error("❌ Exit execution failed:", error.message);
                }
            },
            {
                timezone: "Asia/Kolkata"
            }
        );

        logger.info(`✅ Exit Scheduler Active → Tue–Fri @ ${hour}:${minute} IST`);
    }

    start() {
        logger.info("🚀 Starting Trade Scheduler...");
        this.scheduleEntryTrades();
        this.scheduleExitTrades();
        logger.info("✅ Scheduler started successfully");
    }

    stop() {
        if (this.entryJob) this.entryJob.stop();
        if (this.exitJob) this.exitJob.stop();
        logger.info("🛑 Scheduler stopped");
    }
}

module.exports = new SchedulerService();
