// Allows the request through only when the JWT belongs to a current admin.
// Must run after authMiddleware so req.user is populated.
// 403 = authenticated but not allowed.
//
// The role is re-checked in the database (one indexed lookup) so an account
// that was removed or demoted loses admin access immediately instead of when
// its token expires.
const User = require("../models/User");

const forbidden = (res) =>
  res.status(403).json({
    success: false,
    message: "Admin access required",
  });

const adminMiddleware = async (req, res, next) => {
  if (!req.user || req.user.role !== "admin") return forbidden(res);

  try {
    const stillAdmin = await User.exists({ _id: req.user.userId, role: "admin" });

    if (!stillAdmin) return forbidden(res);

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = adminMiddleware;
