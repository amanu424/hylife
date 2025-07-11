const mongoose = require("mongoose");


// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String, required: true },
  age: { type: Number, required: true },
  phoneNumber: { type: String, required: true },
  status: { 
    type: String, 
    required: true,
    enum: ['accepted', 'pending', 'rejected'],
    default: 'pending'
  }
})

const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = User;
