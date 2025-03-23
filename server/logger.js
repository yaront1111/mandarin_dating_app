// logger.js - Enhanced with ES modules, better log formatting, and daily log rotation
import { createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get directory name in ES modules context
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define custom format for console logs with colors
const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...metadata }) => {
    let metaStr = '';
    if (Object.keys(metadata).length > 0) {
      metaStr = JSON.stringify(metadata, null, 2);
    }
    return `${timestamp} ${level}: ${message}${metaStr ? ` ${metaStr}` : ''}`;
  })
);

// Define format for file logs (without colors but with more details)
const fileFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.json()
);

// Create daily rotating file transport
const fileRotateTransport = new transports.DailyRotateFile({
  filename: path.join(logsDir, '%DATE%-server.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d', // keep logs for 14 days
  maxSize: '20m',  // rotate when file reaches 20MB
  format: fileFormat
});

// Create error-specific transport
const errorFileRotateTransport = new transports.DailyRotateFile({
  filename: path.join(logsDir, '%DATE%-error.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  maxSize: '20m',
  level: 'error',
  format: fileFormat
});

// Create a Winston logger with improved configuration
const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  defaultMeta: { service: 'mandarin-api' },
  transports: [
    new transports.Console({ format: consoleFormat }),
    fileRotateTransport,
    errorFileRotateTransport
  ],
  exitOnError: false // Don't exit on handled exceptions
});

// Add shutdown handler
const gracefulShutdown = () => {
  logger.info('Logger shutting down...');

  const transportsClosed = [];
  // Close each transport that has a close method
  logger.transports.forEach((transport) => {
    if (transport.close) {
      transportsClosed.push(
        new Promise((resolve) => {
          transport.close(resolve);
        })
      );
    }
  });

  return Promise.all(transportsClosed);
};

// Create HTTP request logger middleware
const requestLogger = (req, res, next) => {
  // Skip logging for static files to reduce noise
  if (req.url.startsWith('/uploads/')) {
    return next();
  }

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const message = `${req.method} ${req.url} ${res.statusCode} ${duration}ms`;

    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error(message, {
        ip: req.ip,
        userId: req.user?.id || 'anonymous'
      });
    } else if (res.statusCode >= 400) {
      logger.warn(message, {
        ip: req.ip,
        userId: req.user?.id || 'anonymous'
      });
    } else {
      logger.info(message, {
        ip: req.ip,
        userId: req.user?.id || 'anonymous'
      });
    }
  });

  next();
};

export { requestLogger, gracefulShutdown };
export default logger;
