const express = require("express");
const Notification = require("../models/Notification");
const authMiddleware = require("../middleware/authMiddleware");
const { validate, rules } = require("../middleware/validate");
const { handle } = require("../utils/errors");

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

// GET MY NOTIFICATIONS (newest 50, plus the total unread count)
router.get(
  "/",
  authMiddleware,
  handle("Unable to fetch notifications", async (req, res) => {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ user: req.user.userId }).sort({ createdAt: -1 }).limit(50).lean(),
      Notification.countDocuments({ user: req.user.userId, read: false }),
    ]);

    return res.status(200).json({
      success: true,
      unreadCount,
      notifications: notifications.map(publicNotification),
    });
  })
);

// MARK ALL AS READ
router.put(
  "/read-all",
  authMiddleware,
  handle("Unable to update notifications", async (req, res) => {
    await Notification.updateMany(
      { user: req.user.userId, read: false },
      { $set: { read: true } }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  })
);

// MARK ONE AS READ
router.put(
  "/:id/read",
  authMiddleware,
  validate({ params: { id: rules.objectId({ required: true, message: "Invalid notification ID" }) } }),
  handle("Unable to update notification", async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.valid.params.id, user: req.user.userId },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({
      success: true,
      notification: publicNotification(notification),
    });
  })
);

module.exports = router;
