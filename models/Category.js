const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    requires:true
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Categorys",   // MUST match your model name
    default: null       // null means "main category"
  },
});

module.exports = mongoose.model("Categorys", categorySchema);
