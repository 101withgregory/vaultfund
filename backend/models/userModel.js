const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    role: { type: String, enum: ["superAdmin","Admin", "Member"], default: "Member" },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);



const User = mongoose.model("User", UserSchema);
module.exports = User;
