const express = require("express");
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const publicNotification = (item) => ({
  id: String(item._id),
  appointmentId: item.appointment ? String(item.appointment) : null,
  title: item.title,
  message: item.message,
  status: item.status,
  read: Boolean(item.read),
  createdAt: item.createdAt,
});

// GET MY NOTIFICATIONS (newest first)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = notifications.filter((item) => !item.read).length;

    return res.status(200).json({
      success: true,
      unreadCount,
      notifications: notifications.map(publicNotification),
    });
  } catch (error) {
    console.error("Get notifications error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch notifications",
    });
  }
});

// MARK ALL AS READ
router.put("/read-all", authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.userId, read: false },
      { $set: { read: true } }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark all read error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update notifications",
    });
  }
});

// MARK ONE AS READ
router.put("/:id/read", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid notification ID" });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: req.user.userId },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({
      success: true,
      notification: publicNotification(notification),
    });
  } catch (error) {
    console.error("Mark read error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update notification",
    });
  }
});

module.exports = router;
