const cron = require("node-cron");
const logger = require("../utils/logger");
const config = require("../config/config");
const oiAnalyzer = require("./oiAnalyzer");
const kotakTrading = require("./kotakTrading");

class Scheduler {
    constructor() {
        this.entryJob = null;
        this.exitJob = null;
    }

    // ============================
    // ENTRY SCHEDULER (3:15 PM)
    // ============================
    scheduleEntryTrades() {
        const { hour, minute } = config.trading.entryTime;

        // Mon–Thu (1–4)
        const cronExpression = `${minute} ${hour} * * 1-4`;
        logger.info(`📅 Entry cron scheduled: ${cronExpression}`);
        logger.info(`📅 This means: Every Mon-Thu at ${hour}:${String(minute).padStart(2, '0')} IST`);

        this.entryJob = cron.schedule(
            cronExpression,
            async () => {
                logger.info("🔥 ENTRY CRON TRIGGERED");
                logger.info(`Time: ${new Date().toLocaleString("en-IN")}`);

                try {
                    const options = await oiAnalyzer.analyzeAndSelectOptions();

                    if (!options || options.length === 0) {
                        logger.warn("⚠️ No options selected. Skipping entry.");
                        return;
                    }

                    logger.info(`📊 Options selected: ${options.length}`);

                    await kotakTrading.executeEntry(options);

                } catch (error) {
                    logger.error("❌ Entry execution failed:", error.message);
                }
            },
            {
                timezone: "Asia/Kolkata"
            }
        );

        logger.info(
            `✅ Entry Scheduler Active → Mon–Thu @ ${hour}:${minute} IST`
        );
    }

    // ============================
    // EXIT SCHEDULER (9:30 AM)
    // ============================
    scheduleExitTrades() {
        const { hour, minute } = config.trading.exitTime;

        // Tue–Fri (2–5)
        const cronExpression = `${minute} ${hour} * * 2-5`;

        this.exitJob = cron.schedule(
            cronExpression,
            async () => {
                logger.info("🔴 EXIT CRON TRIGGERED");
                logger.info(`Time: ${new Date().toLocaleString("en-IN")}`);

                try {
                    await kotakTrading.executeExit();
                } catch (error) {
                    logger.error("❌ Exit execution failed:", error.message);
                }
            },
            {
                timezone: "Asia/Kolkata"
            }
        );

        logger.info(
            `✅ Exit Scheduler Active → Tue–Fri @ ${hour}:${minute} IST`
        );
    }

    // ============================
    // START ALL SCHEDULERS
    // ============================
    start() {
        logger.info("🚀 Starting Trade Scheduler...");

        this.scheduleEntryTrades();
        this.scheduleExitTrades();

        logger.info("✅ Scheduler started successfully");
    }

    // ============================
    // STOP ALL JOBS
    // ============================
    stop() {
        if (this.entryJob) this.entryJob.stop();
        if (this.exitJob) this.exitJob.stop();

        logger.info("🛑 Scheduler stopped");
    }
}

module.exports = new Scheduler();
