const mongoose = require("mongoose");
const CartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Users",
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Products",
    required: true
  },
  quantity: {
    type: Number,
    default: 1
  }
}, { timestamps: true });

module.exports = mongoose.model("Cart", CartSchema);
