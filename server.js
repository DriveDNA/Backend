const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cors = require("cors");
require("dotenv").config();
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const SibApiV3Sdk = require("@sendinblue/client");
const Admin = require("./models/adminSchema");
const User = require("./models/userSchema");
const Category = require("./models/Category");
const Product = require("./models/Product");
const Cart = require("./models/Cart");
const Review = require("./models/Reviews");
const Order = require("./models/Order");
const app = express();

const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();

// ✅ set API key DIRECTLY
emailApi.setApiKey(
  SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

app.use(
  cors({
    origin: "*",
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
  })
);

app.use(express.json());
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("connection successfull");
  })
  .catch((err) => {
    console.log("connection fails", err);
  });

// 📤 Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
// 🌥 Multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "DriveDNA",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 800, height: 800, crop: "limit" }],
  },
});
const upload = multer({ storage });

async function sendEmailBrevo({ to, subject, html }) {
  try {
    await emailApi.sendTransacEmail({
      sender: { email: "infodrivedna@gmail.com", name: "DriveDNA" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    });
  } catch (err) {
    console.error("BREVO EMAIL ERROR:", err.message);
  }
}

app.get("/", (req, res) => {
  res.send("app is working again");
});

app.post("/usersignup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 🔎 Check duplicate email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    // 🔐 Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ CREATE TOKEN
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = new User({
      name,
      email,
      password: hashedPassword, // store encrypted password
      verificationToken,
      isVerified: false,
    });

    // ✅ SEND VERIFICATION EMAIL
    const verifyLink = `http://192.168.0.153:5000/verify-email?token=${verificationToken}`;

    await transporter.sendMail({
      from: `"DriveDNA" <${process.env.ADMIN_EMAIL}>`,
      to: email,
      subject: "Verify your email",
      html: `
        <p>Hello ${name},</p>
        <p>Please verify your email by clicking the link below:</p>
        <a href="${verifyLink}">Verify Email</a>
        <p>If you did not sign up, ignore this email.</p>
      `,
    });

    let result = await user.save();
    result = result.toObject();
    delete result.password;

    res.send({
      success: false,
      message: "Please check your mail for verification",
      result,
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;

    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.send("Invalid or expired verification link");
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    // 🔥 AUTO LOGIN REDIRECT
    res.redirect(`http://192.168.0.153:3000/verify-success?id=${user._id}`);
  } catch (err) {
    console.error("VERIFY ERROR:", err);
    res.status(500).send("Verification failed");
  }
});

app.get("/user-by-id/:id", async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");
  res.send(user);
});

app.post("/login", async (req, res) => {
  if (req.body.email && req.body.password) {
    let admin = await Admin.findOne(req.body).select("-password");
    if (admin) {
      res.send(admin);
    } else {
      res.send({ result: "user not found" });
    }
  } else {
    res.send({ result: "user not found" });
  }
});

app.get("/orders/user/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId })
      .sort({ createdAt: -1 }) // latest first
      .populate("items.productId");

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

app.post("/category", async (req, res) => {
  try {
    const { name, parent } = req.body;

    const newCategory = new Category({
      name,
      parent: parent || null, // If parent empty → main category
    });

    await newCategory.save();

    res.send({ success: true, newCategory });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send({ success: false, message: "Error creating category" });
  }
});

app.get("/category", async (req, res) => {
  const category = await Category.find().lean();
  res.send(category);
});

app.post("/userlogin", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.send({ success: false, message: "user not found" });
    }

    // 1️⃣ Find user
    const user = await User.findOne({ email });

    if (!user) {
      return res.send({ success: false, message: "user not found" });
    }

    // 2️⃣ Compare password using bcrypt
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.send({ success: false, message: "invalid password" });
    }

    // ✅ BLOCK LOGIN IF EMAIL NOT VERIFIED
    if (!user.isVerified) {
      return res.send({
        success: false,
        message: "Please verify your email",
      });
    }

    // 3️⃣ Remove password before sending response
    const result = user.toObject();
    delete result.password;

    // 4️⃣ Send same flow response
    res.send({
      success: true,
      result,
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).send({ success: false });
  }
});

app.post("/addproduct", upload.array("images", 10), async (req, res) => {
  try {
    const { name, sname, discription, features, price, category } = req.body;
    if (!category) return res.status(400).json({ error: "Category required" });

    const imagePaths = req.files.map((file) => file.path); // Cloudinary URLs

    const product = new Product({
      name,
      sname,
      discription,
      features,
      price,
      category,
      images: imagePaths,
    });
    await product.save();

    res.status(201).json({ message: "Product added", product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/products/search", async (req, res) => {
  try {
    const query = req.query.q;

    if (!query || query.trim() === "") {
      return res.json([]);
    }
    // find categories
    const categories = await Category.find({
      name: { $regex: query, $options: "i" },
    }).select("_id");

    const categoryIds = categories.map((c) => c._id);

    const products = await Product.find({
      $or: [
        { name: { $regex: query, $options: "i" } },
        categoryIds.length > 0
          ? { category: { $in: categoryIds } }
          : { _id: null },
      ],
    }).populate("category");

    res.json(products);
  } catch (err) {
    console.error("❌ SEARCH API ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/search/suggest", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.send([]);

    const products = await Product.find(
      { name: { $regex: q, $options: "i" } },
      { name: 1 }
    ).limit(5);

    res.send(products);
  } catch (err) {
    res.status(500).send([]);
  }
});

app.get("/products/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const products = await Product.find({ category: categoryId }).populate(
      "category"
    );
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.get("/products", async (req, res) => {
  const product = await Product.find();
  res.send(product);
});

app.delete("/product/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Delete images from Cloudinary
    product.images.forEach(async (imgUrl) => {
      const publicId = imgUrl.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(`DriveDNA/${publicId}`);
    });

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/product/:id", async (req, res) => {
  const { id } = req.params;
  const product = await Product.findById(id);
  res.json(product);
});

app.get("/updateproduct/:id", async (req, res) => {
  const { id } = req.params;
  const product = await Product.findById(id);
  res.json(product);
});

app.put("/product/stock/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).send({ success: false });
    }

    // 🔄 TOGGLE
    product.inStock = !product.inStock;
    await product.save();

    res.send({
      success: true,
      product,
      message: product.inStock
        ? "Product marked In Stock"
        : "Product marked Out of Stock",
    });
  } catch (err) {
    res.status(500).send({ success: false });
  }
});

app.put("/product/:id", upload.array("images", 10), async (req, res) => {
  try {
    const { name, sname, discription, price, category, features } = req.body;

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ msg: "Product not found" });
    }

    // 🔴 CASE 1: NO NEW IMAGES → KEEP OLD IMAGES
    if (!req.files || req.files.length === 0) {
      product.name = name;
      product.sname = sname;
      product.discription = discription;
      product.price = price;
      product.category = category;
      product.features = features;

      await product.save();
      return res.json(product);
    }

    // 🟢 CASE 2: NEW IMAGES SELECTED → DELETE ALL OLD + REPLACE

    // delete ALL old images from cloudinary
    for (const imgUrl of product.images) {
      const publicId = imgUrl.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(`DriveDNA/${publicId}`);
    }

    // add NEW images
    const newImages = req.files.map((file) => file.path); // cloudinary URLs

    product.name = name;
    product.sname = sname;
    product.discription = discription;
    product.price = price;
    product.category = category;
    product.features = features;
    product.images = newImages;

    await product.save();
    res.json(product);
  } catch (err) {
    console.error("UPDATE PRODUCT ERROR:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

app.delete("/category/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).send({ error: "Category not found" });
    }

    // 1️⃣ Find all related subcategories (if it's a main category)
    const subCategories = await Category.find({ parent: id });
    const subCategoryIds = subCategories.map((s) => s._id.toString());

    // 2️⃣ Combine IDs (delete both parent + subs)
    const allCategoryIds = [id, ...subCategoryIds];

    // 3️⃣ Get all products under these categories
    const products = await Product.find({ category: { $in: allCategoryIds } });

    // 4️⃣ Delete product images from uploads folder
    products.forEach((product) => {
      product.images.forEach((img) => {
        const imgPath = path.join("uploads", img.replace(/^\/+/, ""));

        if (fs.existsSync(imgPath)) {
          fs.unlinkSync(imgPath); // delete image file
        }
      });
    });

    // 5️⃣ Delete the products
    await Product.deleteMany({ category: { $in: allCategoryIds } });

    // 6️⃣ Delete main + sub categories
    await Category.deleteMany({ _id: { $in: allCategoryIds } });

    return res.send({
      success: true,
      message: "Category, subcategories, products & images deleted!",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});

app.post("/cart/add", async (req, res) => {
  try {
    const { userId, productId, quantity } = req.body;

    const product = await Product.findById(productId);
    if (!product.inStock) {
      res.send({
        success: false,
        message: "Product is out of stock",
      });
    }

    // check if already added
    const existing = await Cart.findOne({ userId, productId });

    if (existing) {
      existing.quantity += quantity || 1;
      await existing.save();
      return res.send({ success: true, cart: existing });
    }

    const cartItem = new Cart({
      userId,
      productId,
      quantity: quantity || 1,
    });

    await cartItem.save();
    res.send({ success: true, cart: cartItem });
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
});

app.get("/cart/:userId", async (req, res) => {
  try {
    const items = await Cart.find({ userId: req.params.userId }).populate(
      "productId"
    );
    res.send({ success: true, items });
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
});

app.delete("/cart/item/:id", async (req, res) => {
  try {
    await Cart.findByIdAndDelete(req.params.id);
    res.send({ success: true });
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
});

app.get("/review/top", async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate("userId", "name") // get username
      .sort({ rating: -1 }) // highest stars first
      .limit(6); // only top 6 reviews for home page
    res.json(reviews);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/review/add", async (req, res) => {
  try {
    const { userId, username, productId, comment, rating } = req.body;

    if (!userId || !productId || !username || !comment || !rating) {
      return res
        .status(400)
        .send({ success: false, message: "Missing fields" });
    }

    const product = await Product.findById(productId).select("name");

    const review = new Review({
      userId,
      username,
      productId,
      productName: product.name,
      comment,
      rating,
    });

    await review.save();
    res.send({ success: true, review });
  } catch (e) {
    res.status(500).send({ success: false, error: e.message });
  }
});

app.get("/review/product/:productId", async (req, res) => {
  try {
    const reviews = await Review.find({ productId: req.params.productId }).sort(
      { createdAt: -1 }
    );

    res.send(reviews);
  } catch (e) {
    res.status(500).send({ success: false, error: e.message });
  }
});

app.post("/create", async (req, res) => {
  try {
    const lastOrder = await Order.findOne().sort({ orderNumber: -1 });
    const newOrderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1001;

    const order = new Order({
      ...req.body,
      userName: req.body.userName,
      userEmail: req.body.userEmail,
      orderNumber: newOrderNumber,
    });

    await order.save();
    await Cart.deleteMany({ userId: req.body.userId });

    const populatedOrder = await Order.findById(order._id).populate(
      "items.productId"
    );

    let productHTML = "";
    populatedOrder.items.forEach((item) => {
      productHTML += `
        <ul>
          <li>
            <strong>${item.productId.name}</strong><br>
            Qty: ${item.quantity}<br>
            Price: Rs. ${item.price}
          </li>
        </ul>
      `;
    });

    // ✅ SEND RESPONSE IMMEDIATELY (NO BLOCKING)
    res.json({
      success: true,
      message: "Order placed successfully",
      order,
    });

    // 🔥 EMAIL TO ADMIN (ASYNC)
    sendEmailBrevo({
      to: process.env.ADMIN_EMAIL,
      subject: "🛒 New Order Received",
      html: `
        <h3>New Order Received</h3>
        <p><strong>Order No:</strong> ${newOrderNumber}</p>
        <p><strong>Name:</strong> ${req.body.userName}</p>
        <p><strong>Email:</strong> ${req.body.userEmail}</p>
        ${productHTML}
        <h4>Total: Rs. ${req.body.grandTotal}</h4>
      `,
    });

    // 🔥 EMAIL TO USER (ASYNC)
    sendEmailBrevo({
      to: req.body.userEmail,
      subject: "✅ Your Order is Confirmed",
      html: `
        <p>Dear ${req.body.userName}, <br><br> Thank you for choosing Drive DNA. We’re pleased to confirm that your order <strong>#${newOrderNumber}</strong> has been successfully placed. Below are the details of your order for your reference:</p> ${productHTML} <h4>Total Paid: Rs. ${req.body.grandTotal}</h4> <p>Your order is currently being processed, and you will be notified once it has been dispatched. If you have any questions or need assistance, please feel free to contact us. <p> 📧 Email: infodrivedna@gmail.com </p> <p>📞 Phone / WhatsApp: +91 9205957977</p> <p>🕗Support Hours: Mon to Sat | 10:00 AM – 6:00 PM </p> We truly appreciate your trust in Drive DNA.<br> Best Regards,<br>Team DriveDNA
      `,
    });
  } catch (err) {
    console.error("ORDER ERROR:", err);
    res.status(500).json({ success: false, message: "Order failed" });
  }
});

app.put("/order/cancel/:orderId", async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate(
      "items.productId"
    );

    // ⏰ Check 12 hours rule
    const orderTime = new Date(order.createdAt).getTime();
    const currentTime = Date.now();
    const hoursPassed = (currentTime - orderTime) / (1000 * 60 * 60);

    if (hoursPassed > 12) {
      return res.status(400).json({
        message: "Order can only be cancelled within 12 hours",
      });
    }

    // ✅ Cancel order
    order.orderStatus = "Cancelled";
    order.cancelledAt = new Date();
    await order.save();

    // build product list
    let productHTML = "";
    order.items.forEach((item, index) => {
      productHTML += `
       <ul><li><span><strong>${item.productId.name}</strong></span><br>
      Quantity: <span>${item.quantity}</span><br>
      Price: <span>Rs. ${item.price}</span></li></ul>
      `;
    });

    // sendEmailBrevo
    sendEmailBrevo({
      from: `"Order Cancelled" <${process.env.ADMIN_EMAIL}>`,
      to: process.env.ADMIN_EMAIL,
      subject: "❌ Order Cancelled",
      html: `
        <h3>Order Cancelled</h3>
        <p><strong>Order No:</strong> ${order.orderNumber}</p>
        <p><strong>User:</strong> ${order.userName}</p>
        <p><strong>Email:</strong> ${order.userEmail}</p>
          ${productHTML}
        <p><strong>Status:</strong> Cancelled</p>
      `,
    });

    // 📧 EMAIL TO USER
    sendEmailBrevo({
      from: `"DriveDNA" <${process.env.ADMIN_EMAIL}>`,
      to: order.userEmail,
      subject: "❌ Your Order Has Been Cancelled",
      html: `
        <p>Dear ${order.userName},</p>
          <p>This is to inform you that your order <strong>#${order.orderNumber}</strong> has been successfully cancelled as per your request. <br>
           ${productHTML}
          If your payment was already processed, the applicable refund will be initiated as per our refund policy and credited to your original payment method within the standard processing timeline.
          </p>
        <p>If you have any questions, feel free to contact us.</p>
                  <p> Our support team is always here to help.</p>
               
            <p> 📧 Email: infodrivedna@gmail.com </p>
            <p>📞 Phone / WhatsApp: +91 9205957977</p>
            <p>🕗Support Hours: Mon to Sat | 10:00 AM – 6:00 PM </p>
          
                  <p> Should you need further assistance or wish to place a new order, please feel free to reach out to us anytime.</p>
                  <p> Thank you for choosing Drive DNA. We look forward to serving you again.</p>
        <p>Best Regards,<br>Team DriveDNA</p>
      `,
    });

    res.json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (err) {
    console.log("user emial", req.body);
    console.error("CANCEL ORDER ERROR:", err);
    res.status(500).json({ message: "Failed to cancel order" });
  }
});

app.get("/admin/order", async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .populate("items.productId") // 🔥 IMPORTANT
      .populate("userId", "name email");

    res.json(orders);
  } catch (err) {
    console.error("ADMIN ORDER ERROR:", err); // 👈 SHOW REAL ERROR
    res.status(500).json({
      message: "Failed to fetch orders",
      error: err.message,
    });
  }
});

app.put("/admin/order/status/:id", async (req, res) => {
  try {
    const { status } = req.body;

    // 🔥 Fetch order FIRST
    const order = await Order.findById(req.params.id).populate(
      "items.productId"
    );

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // 🔄 Update status
    order.orderStatus = status;
    if (status === "Cancelled") {
      order.cancelledAt = new Date();
    }
    await order.save();

    // 🧾 Build product list
    let productHTML = "";
    order.items.forEach((item) => {
      productHTML += `
        <ul>
          <li>
            <strong>${item.productId.name}</strong><br>
            Quantity: ${item.quantity}<br>
            Price: Rs. ${item.price}
          </li>
        </ul>
      `;
    });

    // 📧 EMAIL WHEN DELIVERED
    if (status === "Delivered") {
     sendEmailBrevo({
        from: `"DriveDNA" <${process.env.ADMIN_EMAIL}>`,
        to: order.userEmail,
        subject: "📦 Your Order Has Been Delivered",
        html: `
          <p>Dear ${order.userName},</p>

          <p>We’re happy to inform you that your order 
          <strong>#${order.orderNumber}</strong> has been successfully delivered.</p>

          <h4>Order Details:</h4>
          ${productHTML}

          <h4>Total Paid: Rs. ${order.grandTotal}</h4>

          <p>We hope you enjoy your purchase!  
          If you have any feedback or need assistance, feel free to reach out.</p>

          <p> 📧 Email: infodrivedna@gmail.com </p>
            <p>📞 Phone / WhatsApp: +91 9205957977</p>
            <p>🕗Support Hours: Mon to Sat | 10:00 AM – 6:00 PM </p>

          <p>Thank you for choosing <strong>Drive DNA</strong>.</p>

          <p>Best Regards,<br/>Team DriveDNA</p>
        `,
      });
    }

    res.json({
      success: true,
      message: `Order marked as ${status}`,
    });
  } catch (err) {
    console.error("ORDER STATUS ERROR:", err);
    res.status(500).json({ success: false, message: "Failed to update order" });
  }
});

app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

const PORT = process.env.PORT || 5000;
app.listen(5000, "0.0.0.0", () => {
  console.log("Server running on 0.0.0.0:5000");
});
