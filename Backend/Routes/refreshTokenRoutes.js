const express = require('express');
const { RefreshToken } = require('../Controller/refreshTokenController');
const tokenRoutes = express.Router();    

// Apply the middleware and then call the RefreshToken controller
tokenRoutes.post('/token',RefreshToken);

module.exports = tokenRoutes;
