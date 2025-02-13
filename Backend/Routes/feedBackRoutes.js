const express = require('express');
const { FeedBackForm, GetUserComments, DeleteComment, GetUserCommentsByName } = require('../Controller/contactUsController');

const feedBackRoutes = express.Router();

feedBackRoutes.post('/feedBack', FeedBackForm);
feedBackRoutes.get('/allComments', GetUserComments);
feedBackRoutes.get('/userComments/:name', GetUserCommentsByName);
feedBackRoutes.delete('/allComments/:id', DeleteComment);

module.exports = feedBackRoutes;