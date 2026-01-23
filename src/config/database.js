const mongoose = require("mongoose");
const logger = require("../utils/logger");
const config = require("./config");

const connectDB = async () => {
    try {
        await mongoose.connect(config.server.mongoUri);
        logger.info("✅ Connected to MongoDB");
    } catch (err) {
        logger.error("❌ MongoDB connection failed:", err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
