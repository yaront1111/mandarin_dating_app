// cron/subscriptionTasks.js - Enhanced with ES modules and improved error handling
import cron from 'node-cron';
import logger from '../logger.js';
import User from '../models/User.js';

/**
 * Reset daily likes for FREE users at midnight
 * @returns {Promise<void>}
 */
const resetDailyLikes = async () => {
  try {
    logger.info("Running daily likes reset task");
    
    const result = await User.updateMany(
      { accountTier: "FREE" },
      {
        $set: {
          dailyLikesRemaining: 3,
          dailyLikesReset: new Date(new Date().setHours(24, 0, 0, 0)),
        },
      },
    );

    logger.info(`Reset daily likes for ${result.modifiedCount} users`);
    return result;
  } catch (error) {
    logger.error(`Error resetting daily likes: ${error.message}`, { stack: error.stack });
    // We don't throw the error to prevent the cron job from stopping
  }
};

/**
 * Check for expired subscriptions and downgrade users
 * @returns {Promise<void>}
 */
const checkExpiredSubscriptions = async () => {
  try {
    logger.info("Running subscription expiry check");

    const now = new Date();

    const result = await User.updateMany(
      {
        isPaid: false,
        accountTier: "PAID",
        subscriptionExpiry: { $lt: now },
      },
      {
        $set: { accountTier: "FREE" },
      },
    );

    logger.info(`Updated ${result.modifiedCount} expired subscriptions`);
    return result;
  } catch (error) {
    logger.error(`Error checking subscription expiry: ${error.message}`, { stack: error.stack });
    // We don't throw the error to prevent the cron job from stopping
  }
};

/**
 * Monitor user inactivity and clean up resources
 * @returns {Promise<void>}
 */
const cleanInactiveUsers = async () => {
  try {
    logger.info("Running inactive user cleanup");
    
    const inactivityThreshold = new Date();
    inactivityThreshold.setDate(inactivityThreshold.getDate() - 30); // 30 days ago
    
    // Update user statuses for those inactive for 30+ days
    const result = await User.updateMany(
      {
        lastActive: { $lt: inactivityThreshold },
        isOnline: true
      },
      {
        $set: { isOnline: false }
      }
    );
    
    logger.info(`Updated online status for ${result.modifiedCount} inactive users`);
    return result;
  } catch (error) {
    logger.error(`Error cleaning inactive users: ${error.message}`, { stack: error.stack });
  }
};

/**
 * Initialize all subscription-related cron tasks
 */
const initSubscriptionTasks = () => {
  // Reset daily likes at midnight (server time)
  cron.schedule("0 0 * * *", resetDailyLikes);
  
  // Check for expired subscriptions at 1 AM (server time)
  cron.schedule("0 1 * * *", checkExpiredSubscriptions);
  
  // Clean inactive users weekly (Sunday at 2 AM)
  cron.schedule("0 2 * * 0", cleanInactiveUsers);
  
  logger.info("Subscription tasks initialized");
};

// Export both the initialization function and the individual tasks
// This allows for easier unit testing of individual tasks
export { 
  initSubscriptionTasks,
  resetDailyLikes,
  checkExpiredSubscriptions,
  cleanInactiveUsers
};

export default initSubscriptionTasks;
