const jwt = require("jsonwebtoken");
const User = require("../Model/userSchema");

const verifyToken = async (req, res, next) => {
  
  const authHeader = req.headers.authorization;

  // Check if authorization header exists and starts with 'Bearer '
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied, no token provided" });
  }

  // Extract token by removing 'Bearer ' prefix
  const token = authHeader.split(" ")[1].trim();

  try {
    // Verify token using the JWT_SECRET from environment variables
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userData = await User.findOne({ username: decoded.username });

    if (!userData) {
      return res.status(404).json({ error: "User not found" });
    }
    req.user = userData; // Attach user data to request object for later use
    next(); // Proceed to the next middleware/route handler
  } catch (error) {
    res.status(403).json({ error: "Invalid token" });
  }
};

module.exports = verifyToken;
