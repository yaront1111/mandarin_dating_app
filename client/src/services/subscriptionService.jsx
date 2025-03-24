"use client";

import apiService from "./apiService.jsx";
import { toast } from "react-toastify";

/**
 * Subscription Service
 *
 * Handles subscription-related operations including:
 * - Fetching the current subscription status
 * - Upgrading to a premium plan (monthly/yearly)
 * - Cancelling subscriptions
 * - Checking if a user can perform a premium action
 *
 * All methods return a promise that resolves to the response data.
 */
const subscriptionService = {
  /**
   * Retrieves the user's subscription status.
   *
   * @returns {Promise<Object>} Response object with subscription status data.
   */
  getSubscriptionStatus: async () => {
    try {
      console.log("Fetching subscription status...");
      const response = await apiService.get("/subscription/status");
      console.log("Subscription status response:", response);
      return response;
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      // Return a default response to prevent UI errors
      return {
        success: true,
        data: {
          accountTier: "FREE",
          isPaid: false,
          dailyLikesRemaining: 3,
          canSendMessages: false,
          canCreateStory: true,
        },
      };
    }
  },

  /**
   * Upgrades the user to a paid subscription.
   *
   * @param {string} plan - Subscription plan ("monthly" or "yearly").
   * @returns {Promise<Object>} Updated user data with subscription info.
   */
  upgradeSubscription: async (plan) => {
    try {
      if (!plan || !["monthly", "yearly"].includes(plan)) {
        throw new Error("Invalid subscription plan. Please choose monthly or yearly.");
      }
      console.log(`Upgrading to ${plan} plan...`);
      const response = await apiService.post("/subscription/upgrade", { plan });
      console.log("Upgrade response:", response);
      if (response.success) {
        toast.success(`Successfully upgraded to ${plan} plan!`);
        return response;
      } else {
        throw new Error(response.error || "Failed to upgrade subscription");
      }
    } catch (error) {
      console.error("Error upgrading subscription:", error);
      toast.error(error.message || "Failed to upgrade subscription");
      throw error;
    }
  },

  /**
   * Cancels the current subscription.
   *
   * @returns {Promise<Object>} Updated user data.
   */
  cancelSubscription: async () => {
    try {
      const response = await apiService.post("/subscription/cancel");
      if (response.success) {
        toast.info(response.message || "Subscription successfully canceled");
        return response;
      } else {
        throw new Error(response.error || "Failed to cancel subscription");
      }
    } catch (error) {
      console.error("Error canceling subscription:", error);
      toast.error(error.message || "Failed to cancel subscription");
      throw error;
    }
  },

  /**
   * Checks if the user can perform a premium action.
   *
   * @param {string} actionType - Type of action ("message", "like", or "story").
   * @returns {Promise<Object>} Object indicating if the action is allowed and any related data.
   */
  checkActionPermission: async (actionType) => {
    try {
      if (!["message", "like", "story"].includes(actionType)) {
        throw new Error("Invalid action type");
      }
      const status = await subscriptionService.getSubscriptionStatus();
      if (!status.success) {
        throw new Error("Could not verify subscription status");
      }
      const { data } = status;
      switch (actionType) {
        case "message":
          return {
            allowed: data.canSendMessages,
            reason: data.canSendMessages ? null : "Messaging requires a premium account",
          };
        case "like":
          return {
            allowed: data.accountTier !== "FREE" || data.dailyLikesRemaining > 0,
            reason: data.dailyLikesRemaining > 0 ? null : "You have used all your daily likes",
            remaining: data.dailyLikesRemaining,
          };
        case "story":
          return {
            allowed: data.canCreateStory,
            reason: data.canCreateStory ? null : `Story creation available in ${data.storyCooldown} hours`,
            cooldown: data.storyCooldown,
          };
        default:
          return { allowed: false, reason: "Unknown action type" };
      }
    } catch (error) {
      console.error(`Error checking permission for ${actionType}:`, error);
      return { allowed: false, reason: error.message || "Could not verify permissions" };
    }
  },
};

export default subscriptionService;
