const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
    logger.error(err.message, { stack: err.stack });

    res.status(err.status || 500).json({
        success: false,
        error: err.message || "Internal Server Error"
    });
};

module.exports = errorHandler;
