const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  nameOfEvent: { type: String, required: true }
});

const Info = mongoose.model("ContactUsInfo", contactSchema);

module.exports = Info;