const express = require("express");
const verifyToken = require("../MiddleWare/auth");
const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require("../Controller/productController");
const upload = require("../MiddleWare/upload");

const productRoutes = express.Router();

productRoutes.post(
  "/createProduct",
  upload.array("images", 5),
  verifyToken,
  createProduct
);
productRoutes.get("/", getAllProducts);
productRoutes.get("/:id", getProductById);
productRoutes.put(
  "/:id",
  upload.array("images", 5),
  verifyToken,
  updateProduct
);
productRoutes.delete("/:id", verifyToken, deleteProduct);

module.exports = productRoutes;
