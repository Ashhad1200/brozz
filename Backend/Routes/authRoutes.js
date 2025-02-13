const express = require('express');
const { Login, Registration, GetUsers, GetUsersById } = require('../Controller/authController');
const { default: mongoose } = require('mongoose');

const authRoutes = express.Router();

authRoutes.post('/login',Login)

authRoutes.post('/registration',Registration)

module.exports = authRoutes;