const express = require('express');
const bodyParser = require('body-parser');
const passport = require('passport');
const authJwtController = require('./auth_jwt'); // You're not using authController, consider removing it
const jwt = require('jsonwebtoken');
const cors = require('cors');
const User = require('./Users');
const Movie = require('./Movies'); // You're not using Movie, consider removing it
require('dotenv').config();
const app = express();
app.use(cors());
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

const router = express.Router();
router.post('/signup', async (req, res) => { // Use async/await
  if (!req.body.username || !req.body.password) {
    return res.status(400).json({ success: false, msg: 'Please include both username and password to signup.' }); // 400 Bad Request
  }

  try {
    const user = new User({ // Create user directly with the data
      name: req.body.name,
      username: req.body.username,
      password: req.body.password,
    });

    await user.save(); // Use await with user.save()

    res.status(201).json({ success: true, msg: 'Successfully created new user.' }); // 201 Created
  } catch (err) {
    if (err.code === 11000) { // Strict equality check (===)
      return res.status(409).json({ success: false, message: 'A user with that username already exists.' }); // 409 Conflict
    } else {
      console.error(err); // Log the error for debugging
      return res.status(500).json({ success: false, message: 'Something went wrong. Please try again later.' }); // 500 Internal Server Error
    }
  }
});


router.post('/signin', async (req, res) => { // Use async/await
  try {
    const user = await User.findOne({ username: req.body.username }).select('name username password');

    if (!user) {
      return res.status(401).json({ success: false, msg: 'Authentication failed. User not found.' }); // 401 Unauthorized
    }

    const isMatch = await user.comparePassword(req.body.password); // Use await

    if (isMatch) {
      const userToken = { id: user._id, username: user.username }; // Use user._id (standard Mongoose)
      const token = jwt.sign(userToken, process.env.SECRET_KEY, { expiresIn: '1h' }); // Add expiry to the token (e.g., 1 hour)
      res.json({ success: true, token: token });

    } else {
      res.status(401).json({ success: false, msg: 'Authentication failed. Incorrect password.' }); // 401 Unauthorized
    }
  } catch (err) {
    console.error(err); // Log the error
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again later.' }); // 500 Internal Server Error
  }
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


