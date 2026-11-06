// Allows the request through only when the JWT belongs to an admin user.
// Must run after authMiddleware so req.user is populated.
const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  next();
};

module.exports = adminMiddleware;
