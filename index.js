var nforce = require('nforce');
var passport = require("passport");
var LocalStrategy = require("passport-local").Strategy;
var bodyParser = require('body-parser');
var lurch = {};

// ========== Express Config ==========
var port = Number(process.env.PORT || 5000);
var logfmt = require("logfmt");
var express = require("express");
var app = require('express')();
var cookieParser = require('cookie-parser');
var session = require('express-session');
app.use(bodyParser.urlencoded({extended: true}));
app.use(cookieParser());
app.use(session({ secret: 'yourang???',
                  resave: true,
                  saveUninitialized: true,
                  cookie: { maxAge: 100000000}
                }));
app.use(logfmt.requestLogger());
app.use(passport.initialize());
app.use(passport.session());

// ========== Listen for requests ==========
var http = require('http').Server(app);
http.listen(port, function(){
  console.log('Listening on port ' + port);
});


// ========== Lurch Authentication ==========
  passport.serializeUser(function(user, done) {done(null, user);});
  passport.deserializeUser(function(user, done) {done(null, user);});

  passport.use(new LocalStrategy(
    function(username, password, done) {
      lurch.checkUserAuth(username, password, function(result){
        console.log('RESULT' + result);
        if (result === true){
          console.log("Successful login.");
          var user = username;
          return done(null, user, result);
        } else if (result === false) {
          console.log("Failed login.");
           return done(null, false, { message: 'Incorrect un/pw' });
        } else {
          console.log("Failed, server error");
          return done(err);
        }
      });

  lurch.ensureAuthenticated = function(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    else{
      res.redirect('/login');
    }
  };

  lurch.checkUserAuth = function (username, password, callback) {
    var r = false;
    if (username === process.env.ADMIN_UN && password === process.env.ADMIN_PW){
      r = true;
    }
    callback(r);
  };

  // ========== nforce setup ==========
  var org = nforce.createConnection({
    clientId: process.env.SFORCE_CLIENTID,
    clientSecret: process.env.SFORCE_SECRET,
    redirectUri: process.env.APPDOMAIN + '/auth/sfdc/_callback',
    apiVersion: 'v29.0',
    environment: 'sandbox',
    mode: 'single',
    autoRefresh: true
  });

  // ========== Salesforce Authentication ==========
  app.get('/logout', function(req, res){
    req.logout();
    res.redirect('/');
  });
  app.post('/login', function(req, res, next) {
    passport.authenticate('local', function(err, user, info) {
      if (err) { return next(err); }
      if (!user) { return res.redirect('/login'); }
      req.logIn(user, function(err) {
        if (err) { return next(err); }
        return res.redirect('/index.html');
      });
    })(req, res, next);
  });
  app.get('/login', function(req, res){
    res.sendfile('login.html');
  });
  app.use('/', function(req, res, next){
    lurch.ensureAuthenticated(req, res, next);
  });
  app.use('/', express.static(__dirname + '/'));

  app.get('/auth/sfdc',
          function(req,res){
            console.log('getting auth redir...');
            console.log('AuthURI: ' + org.getAuthUri());
            res.redirect(org.getAuthUri());
          }
        );

  app.get('/auth/sfdc/_callback',
          function(req, res) {
            org.authenticate({code: req.query.code}, function(err, resp){
              if(!err) {
                console.log('Access Token: ' + resp.access_token);
                console.log(resp);
              } else {
                console.log('Error: ' + err.message);
              }
            });
          }
         );


  // ========== Github Authentication ==========
  app.get('/auth/github',
        function(req,res){
        }
      );
  app.get('/auth/github/_callback', function(req, res){

        }
      );



    }
  ));
