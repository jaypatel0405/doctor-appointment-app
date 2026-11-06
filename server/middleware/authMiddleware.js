// Verifies the "Authorization: Bearer <JWT>" header and sets req.user.
// 401 = missing/invalid/expired token (the client should log in again).
const { verifyToken } = require("../utils/tokens");

const BEARER_PATTERN = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)\s*$/;

const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
  }

  const match = BEARER_PATTERN.exec(header);
  const user = match ? verifyToken(match[1]) : null;

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
  }

  req.user = user;
  return next();
};

module.exports = authMiddleware;
