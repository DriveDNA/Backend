const { type } = require("express/lib/response");
const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: Number,
      unique: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    userName: String,
    userEmail: String,
    checkStatus: {
      type: Boolean,
      default: false,
    },

    orderStatus: {
      type: String,
      enum: ["Placed", "Cancelled","Delivered"],
      default: "Placed",
    },

    cancelledAt: {
      type: Date,
    },

    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Products",
          required: true,
        },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
      },
    ],

    address: {
      name: String,
      phone: String,
      street: String,
      city: String,
      pincode: String,
      upi: String,
    },

    subTotal: Number,
    shipping: Number,
    tax: Number,
    grandTotal: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);
