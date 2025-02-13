const express = require("express");
const verifyToken = require("../MiddleWare/auth");
const { getCart, addToCart, removeFromCart, clearCart } = require("../Controller/cartController");

const cartRoutes = express.Router();

cartRoutes.get("/", verifyToken, getCart);
cartRoutes.post("/", verifyToken, addToCart);
cartRoutes.delete("/:productId", verifyToken, removeFromCart);
cartRoutes.delete("/", verifyToken, clearCart);

module.exports = cartRoutes;
