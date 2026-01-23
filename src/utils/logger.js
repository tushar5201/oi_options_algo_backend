const fs = require("fs");
const path = require("path");
const winston = require("winston");

const logsDir = path.join(__dirname, "../../logs");

if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: "kotak-options-bot" },
    transports: [
        new winston.transports.File({
            filename: path.join(logsDir, "error.log"),
            level: "error"
        }),
        new winston.transports.File({
            filename: path.join(logsDir, 'trading.log')
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

module.exports = logger;
