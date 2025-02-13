const Product = require("../Model/ProductSchema");
const fs = require("fs");

// Create Product with Multiple Images (Stored as Base64)
exports.createProduct = async (req, res) => {
  try {
    console.log("Incoming request...");
    console.log("Request Body:", req.body);
    console.log("Uploaded Files:", req.files);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No images uploaded" });
    }

    const images = await Promise.all(
      req.files.map(async (file) => {
        const data = await fs.promises.readFile(file.path);
        console.log(`Successfully read file: ${file.path}`);
        return {
          data,
          contentType: file.mimetype,
        };
      })
    );

    const productData = {
      name: req.body.name,
      price: req.body.price,
      description: req.body.description, // Include description
      stock: req.body.stock, // Include stock
      category: req.body.category, // Include category
      images,
    };

    console.log("Final Product Data:", productData);

    const product = await Product.create(productData);
    res.status(201).json(product);
  } catch (err) {
    console.error("Error creating product:", err);
    res.status(400).json({ message: err.message });
  }
};

// Get All Products
exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get Product by ID
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update Product with Images
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    let images = product.images; // Keep existing images

    if (req.files && req.files.length > 0) {
      images = req.files.map((file) => {
        return {
          data: fs.readFileSync(file.path), // Read new images
          contentType: file.mimetype,
        };
      });
    }

    const updatedData = {
      ...req.body,
      images,
    };

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updatedData,
      { new: true }
    );
    res.json(updatedProduct);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
