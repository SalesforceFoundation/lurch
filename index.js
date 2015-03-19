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

  // ========== Start Server and Listen for Requests ==========
  var http = require('http').Server(app);
  http.listen(port, function(){
    console.log('Listening on port ' + port);
  });

  // ========== Lurch Auth Helper Functions ==========
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

  // ========== nforce Setup ==========
  var org = nforce.createConnection({
    clientId: process.env.SFORCE_CLIENTID,
    clientSecret: process.env.SFORCE_SECRET,
    redirectUri: process.env.APPDOMAIN + '/auth/sfdc/_callback',
    apiVersion: 'v32.0',
    environment: 'sandbox',
    mode: 'single',
    autoRefresh: true
  });


  // ========== node-github Setup ==========
  var OAuth2 = require("oauth").OAuth2;
  var ngithub = require("github");
  var github = new ngithub({
      version: "3.0.0"
  });
  var clientId = process.env.GH_CLIENTID;
  var secret = process.env.GH_SECRET;
  var oauth = new OAuth2(clientId, secret, "https://github.com/", "login/oauth/authorize", "login/oauth/access_token");

  // ========== Route Handlers ==========
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


  // ========== Salesforce Authentication ==========
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
  app.get('/auth/github', function(req,res){
          res.writeHead(303, {
               Location: oauth.getAuthorizeUrl({
                   redirect_uri: process.env.APPDOMAIN + "/auth/github/_callback",
                   scope: "user,repo,gist"
               })
           });
           console.log('Redir: ' + oauth.getAuthorizeUrl());
           res.end();


        }
      );
  app.get('/auth/github/_callback', function(req, res){
    oauth.getOAuthAccessToken(req.query.code, {}, function (err, access_token, refresh_token) {
        if (err) {
          console.log(err);
          res.writeHead(500);
          res.end(err + "");
          return;
        }

        accessToken = access_token;

        // authenticate github API
        github.authenticate({
          type: "oauth",
          token: accessToken
        });

        //redirect back
        res.writeHead(303, {
          Location: "/"
        });
        res.end();
      });
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
    }
  ));





  // ========== GH Webhook Handlers ==========
  var createHandler = require('github-webhook-handler');
  var ghhandler = createHandler({ path: '/ghwebhook', secret: process.env.GHWEBHOOK_SECRET });

  ghhandler.on('error', function (err) {
    console.error('Error:', err.message);
  });

  ghhandler.on('push', function (event) {
    console.log('Received a push event for %s to %s',
      event.payload.repository.name,
      event.payload.ref);
  });

  ghhandler.on('issues', function (event) {
    console.log('Received an issue event for % action=%s: #%d %s',
      event.payload.repository.name,
      event.payload.action,
      event.payload.issue.number,
      event.payload.issue.title);
  });
