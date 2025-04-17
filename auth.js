var passport = require('passport');
var BasicStrategy = require('passport-http').BasicStrategy;
var User = require('./Users.js'); //import the user model
var bcrypt = require('bcrypt');

passport.use(new BasicStrategy(
  async function(username, password, done) {
        try {
            const user = await User.findOne({ username: username }).select('+password');
            if (!user) {
                return done(null, false, { message: 'Incorrect username.' });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return done(null, false, { message: 'Incorrect password.' });
            }
            return done(null, user);
        }catch(err){
            return done(err);
        }
   }));
       


exports.isAuthenticated = passport.authenticate('basic', { session: false });
