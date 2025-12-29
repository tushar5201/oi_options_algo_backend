require("dotenv").config();
const logger = require("./utils/logger");
const kotakAuth = require("./services/kotakAuth");
const scheduler = require("./services/scheduler");

async function startBot() {
    try {
        logger.info("====================================");
        logger.info("🚀 KOTAK OPTIONS BOT STARTING");
        logger.info("====================================");

        await kotakAuth.authenticate();
        logger.info("✅ Kotak login successful");

        scheduler.start();

        logger.info("⏳ Bot running...");
        logger.info("Entry: Mon–Thu 3:15 PM");
        logger.info("Exit: Tue–Fri 9:30 AM");

    } catch (err) {
        logger.error("Startup failed:", err.message);
        process.exit(1);
    }
}

startBot();
