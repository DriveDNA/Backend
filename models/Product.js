const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sname: { type: String, required: true },
  discription: { type: String, required: true },
  features: [{ type: String }],
  price: { type: Number, required: true },
  images: [{ type: String }],
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Categorys", // reference to Category model
    required: true,
  },
  inStock:{
    type:Boolean,
    default:true
  }
});

module.exports = mongoose.model("Products", productSchema);
