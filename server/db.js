// db.js - Enhanced database connection with ES modules and better error handling
import mongoose from 'mongoose';
import config from './config.js';
import logger from './logger.js';

/**
 * Connect to MongoDB with improved error handling and connection events
 * @returns {Promise<typeof mongoose>} Mongoose connection instance
 */
const connectDB = async () => {
  try {
    // Connection options for modern MongoDB driver
    const connection = await mongoose.connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    // Set up connection event handlers
    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected successfully');
    });

    // Log connection info
    logger.info(`MongoDB Connected: ${mongoose.connection.host}`);
    logger.debug(`MongoDB Connection Details: Database: ${mongoose.connection.name}, Port: ${mongoose.connection.port}`);

    return connection;
  } catch (err) {
    logger.error(`MongoDB connection error: ${err.message}`);

    // Add more context to the error for easier debugging
    if (err.name === 'MongoServerSelectionError') {
      logger.error('Could not connect to any MongoDB server. Check your connection string and network.');
    } else if (err.name === 'MongoParseError') {
      logger.error('Invalid MongoDB connection string. Check your MONGODB_URI.');
    }

    // Exit process in case of database connection failure
    process.exit(1);
  }
};

/**
 * Close MongoDB connection gracefully
 * @returns {Promise<void>}
 */
const closeConnection = async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed successfully');
  } catch (err) {
    logger.error(`Error closing MongoDB connection: ${err.message}`);
  }
};

// Setup process events for graceful shutdown
process.on('SIGINT', async () => {
  await closeConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeConnection();
  process.exit(0);
});

export { connectDB, closeConnection };
export default connectDB;
