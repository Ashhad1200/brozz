const express = require('express');
const cors = require('cors');
const connectDb = require('./DB/db');
const authRoutes = require('./Routes/authRoutes');
const userRoutes = require('./Routes/userRoutes');
const feedBackRoutes = require('./Routes/feedBackRoutes');
const verifyToken = require('./MiddleWare/auth');
const tokenRoutes = require('./Routes/refreshTokenRoutes');
const productRoutes = require('./Routes/productRoutes');
const cartRoutes = require('./Routes/cartRoutes');
const orderRoutes = require('./Routes/orderRoutes');

// Import the middleware
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Public routes (no token required)
app.use('/auth', authRoutes);
app.use('/refresh', tokenRoutes );

// Protected routes (token required)
app.use('/user', verifyToken, userRoutes); // Apply middleware to protect `/user`
app.use('/contactUs', verifyToken, feedBackRoutes); // Protect `/contactUs`

app.use("/products", productRoutes );
app.use("/cart", cartRoutes);
app.use("/orders", orderRoutes);

// Start the database and server
connectDb().then(() => {
    app.listen(8000, () => {
        console.log('server started');
    });
});
