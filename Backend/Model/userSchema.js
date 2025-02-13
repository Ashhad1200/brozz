const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  joiningDate: { type: Date, default: Date.now, required: true },
  refreshToken: { type: String }
});

userSchema.methods.generateToken = function () {
  // Change to a regular function
  try {
    return jwt.sign(
      {
        id: this._id,
        username: this.username,
        email: this.email,
        phone: this.phone,
        isAdmin: this.isAdmin,
      },
      process.env.JWT_SECRET, // Replace with your secret key, and store it securely in an environment variable
      { expiresIn: "15m" }
    );
  } catch (error) {
    console.error("Error generating token:", error);
    return null;
  }
};

userSchema.methods.generateRefreshToken = function () {
  try {
    // Generate refresh token
    const refreshToken = jwt.sign(
      { id: this._id, phone: this.phone, isAdmin: this.isAdmin }, // Only include essential information
      process.env.REFRESH_SECRET, // Use environment variable for the secret
      { expiresIn: "30d" } // Adjust expiration to your app's security needs
    );

    return refreshToken;
  } catch (error) {
    console.error("Error generating refresh refreshToken:", error);
    return null;
  }
};

const User = mongoose.model("User", userSchema);

module.exports = User;
