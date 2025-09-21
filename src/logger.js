const winston = require('winston');
const path = require('path');

const logFilePath = path.join(__dirname, '..', 'logs', 'log');

const logFormat = winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const logger = winston.createLogger({
    level: 'info', // Nível mínimo de log a ser registrado
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        new winston.transports.File({
            filename: logFilePath,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            tailable: true
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: 'HH:mm:ss' }),
                logFormat
            )
        })
    ],
    exitOnError: false,
});

module.exports = logger;
