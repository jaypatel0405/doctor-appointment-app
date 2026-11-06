// JWT and password helpers. The signing algorithm is pinned (HS256) on both
// sign and verify so a token can never choose its own algorithm.
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("../config");
const { OBJECT_ID_PATTERN } = require("../middleware/validate");

function signToken(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role },
    process.env.JWT_SECRET,
    { algorithm: config.jwt.algorithm, expiresIn: config.jwt.expiresIn() }
  );
}

// Returns { userId, role } for a valid token, otherwise null.
function verifyToken(token) {
  const secret = process.env.JWT_SECRET;

  if (!secret || !token) return null;

  try {
    const decoded = jwt.verify(token, secret, { algorithms: [config.jwt.algorithm] });

    if (
      !decoded ||
      typeof decoded !== "object" ||
      typeof decoded.userId !== "string" ||
      !OBJECT_ID_PATTERN.test(decoded.userId) ||
      typeof decoded.role !== "string"
    ) {
      return null;
    }

    return { userId: decoded.userId, role: decoded.role };
  } catch {
    return null;
  }
}

function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptRounds());
}

// A valid bcrypt hash of a random string, used to spend the same time on
// "unknown email" as on "wrong password" (prevents user enumeration by timing).
let dummyHashPromise = null;

async function verifyPassword(password, hash) {
  if (!hash) {
    dummyHashPromise = dummyHashPromise || bcrypt.hash(`dummy-${Date.now()}`, config.bcryptRounds());
    await bcrypt.compare(password, await dummyHashPromise);
    return false;
  }

  return bcrypt.compare(password, hash);
}

// After a successful login, re-hash a password stored at an older (lower) bcrypt cost, so every
// account converges on the current cost and "wrong password" takes as long as "unknown email".
async function upgradePasswordHash(user, password) {
  try {
    if (bcrypt.getRounds(user.password) >= config.bcryptRounds()) return;
    const hash = await hashPassword(password);
    await user.constructor.updateOne({ _id: user._id }, { $set: { password: hash } });
  } catch {
    // best effort: a failed upgrade never blocks the login
  }
}

module.exports = { signToken, verifyToken, hashPassword, verifyPassword, upgradePasswordHash };
