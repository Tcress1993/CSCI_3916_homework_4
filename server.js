/*
CSC3916 HW4
File: Server.js
Description: Web API scaffolding for Movie API
 */

var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var authJwtController = require('./auth_jwt');
var jwt = require('jsonwebtoken');
var cors = require('cors');
var User = require('./Users');
var Movie = require('./Movies');
var Review = require('./Reviews');
require('dotenv').config();
var app = express();
const mongoose = require('mongoose');
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

var router = express.Router();

function getJSONObjectForMovieRequirement(req) {
    var json = {
        headers: "No headers",
        key: process.env.UNIQUE_KEY,
        body: "No body"
    };

    if (req.body != null) {
        json.body = req.body;
    }

    if (req.headers != null) {
        json.headers = req.headers;
    }

    return json;
}

router.post('/signup', function(req, res) {
    if (!req.body.username || !req.body.password) {
        res.json({success: false, msg: 'Please include both username and password to signup.'})
    } else {
        var user = new User();
        user.name = req.body.name;
        user.username = req.body.username;
        user.password = req.body.password;

        user.save(function(err){
            if (err) {
                if (err.code == 11000)
                    return res.json({ success: false, message: 'A user with that username already exists.'});
                else
                    return res.json(err);
            }

            res.json({success: true, msg: 'Successfully created new user.'})
        });
    }
});

router.post('/signin', async function (req, res) {
    var userNew = new User();
    userNew.username = req.body.username;
    userNew.password = req.body.password;

    await User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
        if (err) {
            res.send(err);
        }

        user.comparePassword(userNew.password, function(isMatch) {
            if (isMatch) {
                var userToken = { id: user.id, username: user.username };
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json ({success: true, token: 'JWT ' + token});
            }
            else {
                res.status(401).send({success: false, msg: 'Authentication failed.'});
            }
        })
    })
});

router.route('/movies')
    .get(authJwtController.isAuthenticated, async (req, res) => {
        try {
            if (req.query.review === "true"){
                const movies = await Movie.aggregate([
                  {$lookup: {
                    from: "reviews",
                    localField: "_id",
                    foreignField: "movieId",
                    as: "reviews"
                  }},
                  {$addFields: {
                    avgRating: {
                      $cond: {
                        if: {$gt: [{$size: "$reviews"}, 0]},
                        then: {$avg: "$reviews.rating"},
                        else: null
                      }
                    }
                  }},
                  {$sort: {
                    avgRating: -1,
                    title: 1
                  }}
                ])
            res.status(200).json(movies);

        }else{ // if review is false, return all movie without reviews
          const movie = await Movie.find();
          res.status(200).json(movie); // Respond with the movie
        }}catch (err){
            res.status(500).json({success: false, msg: "GET request not supported."});
        }
    })
    .post(authJwtController.isAuthenticated, async (req, res) => {
        try {
          const { title, releaseDate, genre, actors } = req.body; // Destructure the request body
          if (!title || !releaseDate || !genre || !actors) {
            //if any part of the request body is missing, return a 400 error
            return res.status(400).json({ success: false, msg: 'Please include all required fields.' }); // 400 Bad Request
          }
          if (actors.length < 3) {
            return res.status(400).json({ success: false, msg: "Please include atleast 3 actors."}); // 400 Bad Request
          }
          // Check for duplicate movies
          if (await Movie.findOne({ title })) {
            return res.status(409).json({ success: false, msg: 'Movie already exists.' }); // 409 Conflict
          }
          const newMovie = new Movie(req.body); // Create a new movie instance
          await newMovie.save(); // Save the movie to the database
          res.status(201).json({ success: true, msg: 'Movie added successfully.', movie: newMovie }); // 200 OK
        } catch (err) {
          console.error(err); // Log the error for debugging
          res.status(500).json({success: false, message: "movie not saved."}); // 500 Internal Server Error
        }
    })
    .delete(authJwtController.isAuthenticated, async (req, res) => {
        try{
          const {title} = req.body; // pulls the id from the request body
          if (!title) {
            return res.status(400).json({ success: false, msg: 'Please include the title of the movie to delete.' }); // 400 Bad Request
          }
          const deleteMovie = await Movie.findOneAndDelete({title: title}); // Find and delete the movie by title
          if (!deleteMovie) {
            return res.status(404).json({ success: false, msg: 'Movie not found.' }); // 404 Not Found
          }
          res.status(200).json({sucess: true, msg: "Movie deleted successfully."}); //movie deleted successfully
        } catch(err){
          res.status(500).json({ success: false, message: 'DELETE request not supported' }); // 500 Internal Server Error
        }
    })
    .put(authJwtController.isAuthenticated, async (req, res) => {
      try {
        const {title, ...update} = req.body;
        if (title){
          // No ID provided, return an error
          res.status(400).json({success: false, msg: "ID is required to update a movie."}); // 400 Bad Request
        }
        // Update the movie with the new data
        const movieUpdates = await Movie.findByIdAndUpdate(title, {$set: update}, {new: true, runValidators: true});
        if (!movieUpdates){
          // Movie not found, return an error
          res.status(404).json({success: false, msg: "Movie not found."}); // 404 Not Found
        }
        res.status(200).json({success: true, msg: "Movie updated successfully.", movie: movieUpdates}); // 200 OK
      }catch(err){
        res.status(500).json({success: false, msg: "Movie not updated."}); // 500 Internal Server Error
      }
    });

router.route('/movies/:movieId')
    .get(authJwtController.isAuthenticated, async (req, res) => {
      const id = req.params.movieId; // Get the movie ID from the URL
      try{
        console.log(req.query.review);
        console.log(id);
        if (req.query.review === "true"){
          const movies = await Movie.aggregate([
            {$match: { _id: new mongoose.Types.ObjectId(id)}},
            {$lookup: {
              from: "reviews",
              localField: "_id",
              foreignField: "movieId",
              as: "reviews"
            }},
            {$addFields: {
              avgRating: {
                $cond: {
                  if: {$gt: [{$size: "$reviews"}, 0]},
                  then: {$avg: "$reviews.rating"},
                  else: null
                }
              }
            }},
            {$sort: {
              avgRating: -1,
              title: 1
            }}
          ])
          res.status(200).json(movies); // Respond with the movie
      } else { //if review is false, return the movie without reviews
        const movie = await Movie.findById(id); // Find the movie by ID
        if (!movie) {
          return res.status(404).json({ success: false, msg: 'Movie not found.' }); // 404 Not Found
        }
        res.status(200).json(movie); // Respond with the movie
      }
    }catch(err){
      res.status(500).json({success: false, msg: "GET request not supported."}); // 500 Internal Server Error
    }
  });

router.route('/review')
    .get(authJwtController.isAuthenticated, async (req, res) => {
        try {
            const {movieId} = req.body; // pulls the id from the request body
            if (!movieId){
                res.status(400).json({success: false, msg: "No Id entered."});
            }
            const reviews = await Review.find({movieId: movieId});
            res.status(200).json(reviews);

        } catch(err){
            res.status(500).json({success: false, msg: "GET request not supported."});
        }
    })
    .post(authJwtController.isAuthenticated, async (req, res) => {
        try {
            const {movieId, userName, review, rating} = req.body;
            if (!movieId || !userName || !review || !rating) {
                res.status(400).json({success: false, msg: "Please include all required fields."});
            }
            const newReview = new Review(req.body);
            console.log(newReview);
            await newReview.save();
            res.status(201).json({success: true, msg: "Review added successfully.", review: newReview});
        } catch(err){
            res.status(500).json({success: false, msg: "Review not added."});
        }
    })
    .delete(authJwtController.isAuthenticated, async (req, res) => {
        try{
            const {_id} = req.body;
            if (!_id){
                res.status(400).json({success: false, msg: "No Id entered."});
            }
            const deleteReview = await Review.findByIdAndDelete(_id);
            if (!deleteReview){
                res.status(404).json({success: false, msg: "Review not found."});
            }
            res.status(200).json({success: true, msg: "Review deleted successfully."});
        } catch(err){
            res.status(500).json({success: false, msg: "Review not deleted."});
        }
    })


app.use('/', router);
app.listen(process.env.PORT || 8080);
module.exports = app; // for testing only


