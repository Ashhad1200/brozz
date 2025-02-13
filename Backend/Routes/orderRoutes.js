const express = require("express");
const { placeOrder, getOrders, getOrderById, cancelOrder } = require("../Controller/orderController");
const verifyToken = require("../MiddleWare/auth");

const orderRoutes = express.Router();

orderRoutes.post("/", verifyToken, placeOrder);
orderRoutes.get("/", verifyToken, getOrders);
orderRoutes.get("/:id", verifyToken, getOrderById);
orderRoutes.delete("/:id", verifyToken, cancelOrder);

module.exports = orderRoutes;
