  // ========== Lurch vars ==========
  var lurch = {};
  lurch.auth = {};
  lurch.auth.github_token = '';
  lurch.auth.sfdc_token = '';
  lurch.auth.sfdc_user = '';
  lurch.auth.github_user = '';
  lurch.valid_users = [];
  lurch.db = require('./lurch_db.js');
  lurch.el = require('./lurch_elements.js');

  // ========== Nforce and Passport Libs ==========
  var nforce = require('nforce');
  var passport = require("passport");
  var LocalStrategy = require("passport-local").Strategy;
  var bodyParser = require('body-parser');
  var crypto = require('crypto');


  // ========== Express Config ==========
  var port = Number(process.env.PORT || 5000);
  var logfmt = require("logfmt");
  var express = require("express");
  var app = express();
  var cookieParser = require('cookie-parser');
  var session = require('express-session');
  app.use(bodyParser.urlencoded({extended: true}));
  app.use(bodyParser.json());
  app.use(cookieParser());
  app.use(session({ secret: 'yourang?',
                    resave: true,
                    saveUninitialized: true,
                    cookie: { maxAge: 100000000}
                  }));
  app.use(logfmt.requestLogger());
  app.use(passport.initialize());
  app.use(passport.session());

  // ========== Start server, socket.io and listen for requests ==========
  var http = require('http').Server(app);
  var io = require('socket.io')(http);

  http.listen(port, function(){
    console.log('Listening on port ' + port);
  });

  // ========== Lurch Auth Helper Functions ==========
  lurch.ensureAuthenticated = function(req, res, next) {
    if (req.isAuthenticated() || req.path === '/ghwebhook') {
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
  app.use('/ghwebhook', function(req, res){
    var gh_sig   = req.headers['x-hub-signature'];
    var gh_event = req.headers['x-github-event'];
    var event_id = req.headers['x-github-delivery'];
    var lurch_gh_sig = '';

    if (!gh_sig || !gh_event || !event_id){
      res.status(400);
      res.send('Missing required header value.');
    }else{
      lurch_gh_sig = 'sha1=' + crypto.createHmac('sha1', process.env.GHWEBHOOK_SECRET).update(JSON.stringify(req.body)).digest('hex');
      if (gh_sig !== lurch_gh_sig){
        res.status(403);
        res.send('Mismatch signature');
      }else{
        lurch.processGithubEvent(gh_event, event_id, req.body);
        res.status(200);
        res.send();
      }
    }
  });

  app.use('/', express.static(__dirname + '/'));

  // ========== Salesforce Authentication ==========
  app.get('/auth/sfdc', function(req,res){
      console.log('getting auth redir...');
      console.log('AuthURI: ' + org.getAuthUri());
      res.redirect(org.getAuthUri());
  });

  app.get('/auth/sfdc/_callback', function(req, res) {
    org.authenticate({code: req.query.code}, function(err, resp){
      if(!err) {
        console.log('SFDC Access Token: ' + resp.access_token);
        lurch.auth.sfdc_token = resp.access_token;
        //query force.com id service
        org.getIdentity({}, function(err, resp){
          console.log('Logging in...');
          lurch.auth.sfdc_user = resp.username;
          //console.log(resp);
          res.redirect('/index.html');
          lurch.findValidUsers();
        });
      }
    });
  });

  app.get('/auth/sfdc/status', function(req, res){
    res.writeHead(200, {'Content-Type':'application/json'});
    var status_response = '';
    if (lurch.auth.sfdc_token !== ''){
      status_response = JSON.stringify({'status':true, 'username':lurch.auth.sfdc_user});
    }
    else{
      status_response = JSON.stringify({'status':false});
    }
    res.write(status_response);
    res.end();
  });
  app.get('/auth/sfdc/revoke', function(req, res){
    var r = res;
    console.log('SFDC revoke requested');
    org.revokeToken({token: lurch.auth.sfdc_token}, function(err, resp) {
      lurch.auth.sfdc_token = '';
      res.redirect('/index.html');
    });
  });

  // ========== Github Authentication ==========
  app.get('/auth/github', function(req,res){
        res.writeHead(303, {
             Location: oauth.getAuthorizeUrl({
               redirect_uri: process.env.APPDOMAIN + "/auth/github/_callback",
               scope: "user,repo,gist"
             })
         });
         res.end();
  });
  app.get('/auth/github/_callback', function(req, res){
    oauth.getOAuthAccessToken(req.query.code, {}, function (err, access_token, refresh_token) {
        if (err) {
          console.log(err);
          res.writeHead(500);
          res.end(err + "");
          return;
        }
        lurch.auth.github_token = access_token;

        // authenticate github API
        github.authenticate({
          type: "oauth",
          token: lurch.auth.github_token
        });

        //redirect back
        res.writeHead(303, {Location: "/"});
        res.end();
      });
  });
  app.get('/auth/github/status', function(req, res){
    res.writeHead(200, {'Content-Type':'application/json'});
    var status_response = '';
    if (lurch.auth.github_token !== ''){
      status_response = JSON.stringify({'status':true});
    }
    else{
      status_response = JSON.stringify({'status':false});
    }
    res.write(status_response);
    res.end();
  });

  // ========== Lurch Authentication ==========
  passport.serializeUser(function(user, done) {done(null, user);});
  passport.deserializeUser(function(user, done) {done(null, user);});

  passport.use(new LocalStrategy(
    function(username, password, done) {
      lurch.checkUserAuth(username, password, function(result){
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

  // ========== Socket.io config ==========
  io.on('connection', function (socket) {
    socket.emit('onconnected', {msg: 'SUP DUDE.'});
    console.log('Client Connected: ' + socket);
  });

  // ========== Lurch Event Processors ==========
  lurch.processGithubEvent = function (event_name, event_id, event_body) {
    console.log('Processing event ' + event_id + ' of type: ' + event_name);


    //we only want to parse this event if the following things are true:
    /*
      1.  The event creator is a valid user AND
          1.  The event already has an entry in mongo based on the GH Id; OR
          2.  The event does not have an entry in mongo, but has a body that indicates a lurch action (add/delete/connect);
    */

    if (event_name === 'issue_comment' || event_name === 'issues' || event_name === 'pull_request'){
      //check that this is for a valid repository that we have synced
      console.log('Event for : ' + event_body.repository.name);

      //check if the relevent event already has an entry in mongo

      switch (event_name){
        case 'issue_comment':
    //      lurch.issueCommentHandler(event_body);
        break;
        case 'issues':
          var ghid = event_body.issue.id;
          lurch.db.findIssueRecord(event_id, function (results){
            console.log ('Result size: ' + results);
            //no results returned
            if (results && results.result){
              //do something with the already existing recor
              //we shouldn't have more than one, so always select for the
              //first element in the collection that matches
              console.log('Results found');
              var issue = results[0];
              //based on what happened in the event, modify the existing issue,
              //update it, and then push the updates to github
            }else{
              console.log('No results found');
              //createa  new record
              lurch.db.createIssueRecord(event_body, function (results){

              });
            }
          });

        break;
        case 'pull_request':

        break;
      }
    }

    //we only care about events that are issue comments or other
    //since lurch will only add github events on comment **lurch: add** by valid users
    //valid users determined during the original authentication sequence to SFDC
    //and can be re-evaluated by the client at any point


  };

  lurch.processSFDCEvent = function () {


  };

  //retrieve the list of valid issue adders based on the Github_Username__c field in the AA sfdc org
  lurch.findValidUsers = function () {
    var q = "SELECT Id, FirstName, LastName, UserName, Github_Username__c FROM User WHERE Github_Username__c != ''";
    lurch.valid_users = [];
    org.query({ query: q }, function(err, resp){
      //if we find users, populate our list of valid users
      if (err){
        console.log(err);
      }
      else if(!err && resp.records) {
        for (i=0; i<resp.records.length; i++){
          lurch.valid_users[lurch.valid_users.length] = resp.records[i];
          var u = JSON.stringify(resp.records[i]);
          for (var i = 0; i < lurch.valid_users.length; i++){
            console.log('User ' + lurch.valid_users[i].get('github_username__c') + ' has been added.');
          }
          console.log('Emitting user ' + u);
          io.sockets.emit('found_users', {user: u});
        }
      }
      //no records found
      else{
        //notify the client that no valid user records were found
        io.sockets.emit('no_valid_users', {});
      }


    });
  };

  lurch.findValidRepos = function () {


  };

  // ========== Connect to Mongo via Mongoose ==========
  lurch.db.connect();
