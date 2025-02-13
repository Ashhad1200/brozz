const jwt = require("jsonwebtoken");
const User = require("../Model/userSchema");

const RefreshToken = async (req, res) => {
  const { refreshToken: refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token is required!" });
  }

  // Verify the refresh token
  jwt.verify(refreshToken, process.env.REFRESH_SECRET, async (err, decoded) => {
    if (err)
      return res
        .status(403)
        .json({ error: "Invalid or expired refresh token" });

    try {
      // Find the user
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if the refresh token matches
      if (user.refreshToken !== refreshToken) {
        return res.status(403).json({ error: "Token mismatch!" });
      }

      // Generate a new access token (make sure your user model has this function)
      const newAccessToken = await user.generateToken();

      // Optionally, rotate the refresh token
      // const newRefreshToken = user.generateRefreshToken(); // You can implement this if needed

      // // Save the new refresh token in the database
      // user.refreshToken = newRefreshToken;
      // await user.save();

      // Respond with new tokens
      res.json({
        token: newAccessToken
      });
      console.log("refreshed token 1")
    } catch (error) {
      console.error("Error in token refresh:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
};

module.exports = {
  RefreshToken,
};
