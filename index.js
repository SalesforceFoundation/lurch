  // ========== Lurch vars ==========
  var lurch = {};
  lurch.auth = {};
  lurch.auth.github_token = '';
  lurch.auth.sfdc_token = '';
  lurch.auth.sfdc_user = '';
  lurch.auth.github_user = '';
  lurch.valid_users = [];
  lurch.db = require('./lurch_db.js');

  // ========== Agile Accelerator Default vars ==========
  var defaultAssignee = process.env.AADEFAULTASSIGNEE || '00580000005eABFAA2';
  var defaultProductOwner = process.env.AADEFAULTPRODUCTOWNER || '00580000005eABFAA2';
  var defaultProductTag = process.env.AADEFAULTPRODUCTTAG || 'a2Pn0000000D2tYEAS';
  var defaultScrumTeam = process.env.AADEFAULTSCRUMTEAM || 'a2cn000000019jLAAQ';
  var defaultRecordType = process.env.AADEFAULTRECORDTYPE || '01280000000BlTnAAK';
  var sfdcURLBase = process.env.SFDCURLBASE;

  // ========== Nforce and Passport Libs ==========
  var nforce = require('nforce');
  var chatter = require('nforce-chatter')(nforce);
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
    autoRefresh: true,
    plugins: ['chatter']
  });


  // ========== node-github Setup ==========
  var OAuth2 = require("oauth").OAuth2;
  var ngithub = require("github");
  var github = new ngithub({
    version: "3.0.0",
    //debug: true,
    protocol: "https",
    host: "api.github.com",
    timeout: 5000,
    headers: {
        "user-agent": "lurch-app"
    }
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
               scope: "repo,gist,public_repo,notifications"
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
    /*only listen and forward:
    1.  anything with **lurch:add from a known user
    2.  anything with **lurch:attach w-xxxxxxxxxxxx or epic:XXXXXXX from a known user
    3.  anything with **lurch:remove from a known user
    4.  anything currently being actively tracked, regardless of user
    5.  pull requests from a known user
    (?) 5.  milestones
    */

    //if its an event we care about
    if (event_name === 'issue_comment' || event_name === 'issues' || event_name === 'pull_request'){

      //set the tracking id to search for existing connected AA issues
      var tracking_id = '';
      var issue_number = '';
      var gh_url = '';
      var issue_body = '';
      var issue_action = event_body.action;
      var comment_body = '';
      switch (event_name){
        case 'issue_comment':
          issue_number = event_body.issue.number;
          gh_url = event_body.issue.html_url;
          tracking_id = event_body.issue.id;
          comment_body = event_body.comment.body;
          issue_body = event_body.issue.body;
        break;
        case 'issues':
          issue_number = event_body.issue.number;
          gh_url = event_body.issue.html_url;
          tracking_id = event_body.issue.id;
          issue_body = event_body.issue.body;
        break;
        case 'pull_request':
          issue_number = event_body.pull_request.number;
          gh_url = event_body.pull_request.html_url;
          tracking_id = event_body.pull_request.id;
          issue_body = event_body.issue.body;
        break;
      }

      console.log('Processing ' + event_name + ' ' + tracking_id + ' for ' + event_body.repository.name);

      //see if there are any existing connected AA issues
      var args = {github_id: issue_number, repo: event_body.repository.name};
      lurch.db.findTrackingRecord(args, function (results){
        console.log ('Workissue records found: ' + results.length);
        //get the lurch command, if any
        var lurchcommand = '';

        //if there's a lurch command, get it
        var command_string = event_name === 'issue_comment' ? comment_body : issue_body;
        if (command_string.indexOf('**lurch:') > -1){
          var command = command_string.substring(command_string.indexOf('**lurch:'), command_string.length);
          lurchcommand = command.replace('**lurch:', '').trim();
          console.log('LURCH COMMAND: ' + lurchcommand);
        }

        lurch.githubEventUserRepoCheck(event_body.sender.login, event_body.repository.name, function (isValidUserRepo) {
          //if we're already actively tracking this issue...
          if (results.length > 0){
            var feeditem_id = results[0].feeditem_id;
            var sfdc_id = results[0].sfdc_id;

            if (lurchcommand === 'detach' && isValidUserRepo){
              console.log('Detaching Issue from tracker');
              //remove record from mongo
              //detach from AA issue and update AA accordingly
              //postback to issue that its been detached
              var query = {repo: event_body.repository.name, github_id: issue_number};

              lurch.db.removeTrackingRecord(query, function(result){
                if (result){
                  //confirm there are no more tracking records for this work item
                  //if there are none remaining, set source controls status on work item to unattached
                  var args = {sfdc_id: sfdc_id, repo: event_body.repository.name};
                  lurch.db.findTrackingRecord(args, function(results){
                    //if we found no other records for this work item, set source control status on work item
                    if (results.length < 1){
                      var wrk = nforce.createSObject('agf__ADM_Work__c');
                      wrk.set("Id", sfdc_id);
                      wrk.set('agf__Perforce_Status__c', 'None');
                      org.update({ sobject: wrk }, function(err, resp){});
                    }
                  });
                  var posttext = 'Detached from issue by ' + event_body.comment.user.login;
                  org.chatter.postComment({id: feeditem_id, text: posttext}, function(err, resp){
                    if (!err){
                      console.log('Posted removal to Chatter');
                      var ghcomment = {
                        user: event_body.sender.login,
                        repo: event_body.repository.name,
                        number: issue_number,
                        body: "Successfully detached from work item"
                      };
                      github.issues.createComment(ghcomment, function(err, res){
                        if (!err)console.log('Posted back to Github');
                        else console.log(err);
                      });
                    }
                    else console.log(err);
                  });
                }
              });
            }
            //add the comment to the AA issue silently
            //check and make sure this isn't our own postback before proceeding
            else if (event_name === 'issue_comment' && comment_body.indexOf('Tracking <a href') < 0){
              console.log('Result feed item id: ');
              console.log(feeditem_id);
              var posttext = '';
              posttext = '@' + event_body.comment.user.login + ': ' + comment_body;
              org.chatter.postComment({id: feeditem_id, text: posttext}, function(err, resp){
                if (!err) console.log('Posted github comment to Chatter');
                else console.log(err);
              });
            }
            //handle open, closing and assignment of issues
            else if (event_name === 'issues' && (issue_action === 'assigned' || issue_action === 'unassigned' || issue_action ===  'closed' || issue_action === 'reopened')){


            }
            else{
              //would handle labels, user assignment, status changes here at some point
              //in the future

              console.log('Non-relevent activity on a tracked issue.');
            }
          }
          //not tracked, but a valid user/repo and lurch command identified
          else if (isValidUserRepo && lurchcommand !== ''){

            if (lurchcommand === 'add'){
              console.log('Adding a new AA work item for ' + tracking_id);
              var uid = '';
              //get the user id for assignment
              for (i=0; i<lurch.valid_users.length; i++){
                if (lurch.valid_users[i].get('github_username__c') === event_body.sender.login){
                  uid = lurch.valid_users[i].get('id');
                }
              }
              //create new AA issue
              var wrk = nforce.createSObject('agf__ADM_Work__c');
              wrk.set('agf__Assignee__c', defaultAssignee);//default user assignment
              //clean up the body - swap lurch command w/ link to GH issue
              if (issue_body.indexOf('**lurch') > -1){
                console.log('Found lurch comment' );
                var lcommand = issue_body.substring(issue_body.indexOf('**lurch:'), issue_body.length);
                issue_body = issue_body.replace(lcommand, "").trim();
              }
              wrk.set('agf__Details__c', issue_body);
              wrk.set('agf__Perforce_Status__c', 'Attached');
              wrk.set('agf__Product_Owner__c', defaultProductOwner);//default product owner
              wrk.set('agf__Product_Tag__c', defaultProductTag);//default product tag
              wrk.set('agf__Scrum_Team__c', defaultScrumTeam);//default scrum team
              wrk.set('agf__Status__c', 'New - Lurch Add');
              wrk.set('agf__Subject__c', event_body.issue.title);
              wrk.set('OwnerId', uid);//lurch add owner
              wrk.set('RecordTypeId', defaultRecordType);//default record type

              org.insert({ sobject: wrk }, function(err, resp){
                if(!err){
                  console.log('New AA issue successfully inserted: ' + resp.id);
                  var q = "SELECT Id, Name from agf__ADM_Work__c WHERE id = '" + resp.id + "' LIMIT 1";
                  org.query({ query: q }, function(err, resp){
                    if (err) console.log(err);
                    if(!err && resp.records) {
                      var nwrk = resp.records[0];
                      var work_item_name = nwrk.get('Name');
                      var work_item_id = nwrk.get('Id');
                      console.log('Created ' + work_item_name + ' at ' + work_item_id);
                      var posttext = event_body.sender.login + " added issue: '" + event_body.issue.title + "'";
                      var capabilities = {'link': { "urlName": event_body.repository.name + " issue " + issue_number,"url":gh_url}};
                      org.chatter.postFeedItem({id: work_item_id, text: posttext, capabilities: capabilities}, function(err, resp){
                        if (!err){
                          console.log('Posted link to Chatter');
                          var args = {github_id: issue_number, sfdc_id: work_item_id, repo: event_body.repository.name, feeditem_id: resp.id};
                          //add to mongo if record was successfully created
                          lurch.db.createTrackingRecord(args, function(result){
                            if (results){
                              var ghcomment = {
                                user: event_body.sender.login,
                                repo: event_body.repository.name,
                                number: issue_number,
                                body: "Tracking " + "<a href='" + sfdcURLBase + "/" + work_item_id + "' target='blank'>" + work_item_name + "</a>"
                              };
                              github.issues.createComment(ghcomment, function(err, res){
                                if (!err)console.log('Posted back to Github');
                                else console.log(err);
                              });
                            }
                          });
                        }
                        else console.log(err);
                      });
                    }
                  });
                }
                else{
                  console.log('Error inserting work item: ' + err);
                }
              });
            }
            else if (lurchcommand.indexOf('attach') > -1){
              //get the AA issue from SFDC
              //post to the AA issue
              //post the issue link back to github
              //enter a mongo row
              var issue_name = lurchcommand.replace('attach', '').trim();
              issue_name.replace(/(^")|("$)/g, '');
              console.log('Attaching issue to existing work item ' + issue_name);
              var q = "SELECT Id, Name from agf__ADM_Work__c WHERE Name = '" + issue_name + "' LIMIT 1";

              org.query({ query: q }, function(err, resp){
                var nwrk = resp.records[0];
                var work_item_id = nwrk.get('Id');
                if (!err){

                  var posttext = event_body.sender.login + " added issue: '" + event_body.issue.title + "'";
                  var capabilities = {'link': { "urlName": event_body.repository.name + " issue " + issue_number,"url":gh_url}};
                  org.chatter.postFeedItem({id: work_item_id, text: posttext, capabilities: capabilities}, function(err, resp){
                    if (!err){
                      console.log('Posted link to Chatter');
                      var args = {github_id: issue_number, sfdc_id: work_item_id, repo: event_body.repository.name, feeditem_id: resp.id};
                      lurch.db.createTrackingRecord(args, function(result){
                        if (results){
                          //post the successful record back to github
                          var ghcomment = {
                            user: event_body.sender.login,
                            repo: event_body.repository.name,
                            number: issue_number,
                            body: "Tracking " + "<a href='" + sfdcURLBase + "/" + work_item_id + "' target='blank'>" + issue_name + "</a>"
                          };
                          github.issues.createComment(ghcomment, function(err, res){
                            if (!err) console.log('Posted back to Github');
                            else console.log(err);
                          });
                        }
                      });
                    }
                    else console.log(err);
                  });
                }
                //query error
                else {
                  var ghcomment = {
                    user: event_body.sender.login,
                    repo: event_body.repository.name,
                    number: issue_number,
                    body: "Could not find an existing issue.  Did you intend to add a new work item instead?"
                  };
                  github.issues.createComment(ghcomment, function(err, res){
                    if (!err) console.log('Posted back to Github');
                    else console.log(err);
                  });
                }
              });
            }
          }
          else{
            console.log('Could not find user/repo and/or no lurch command found.');
          }
        });//eventUserReportCheck
      });//find trackingRecord
    }//event type checker
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

  lurch.githubEventUserRepoCheck = function(event_sender, repo_name, callback) {
    lurch.db.verifyRepo(repo_name, function (results){
      if (results.length > 0){
        console.log('Repo verified.  Checking users.');
        var hasUser = false;
        for (i=0; i<lurch.valid_users.length; i++){
          if (lurch.valid_users[i].get('github_username__c') === event_sender){
            hasUser = true;
          }
        }
        callback(hasUser);
      }
      else{
        console.log('No matching repo found');
        callback(false);
      }
    });
  };

  // ========== Connect to Mongo ==========
  lurch.db.connect();
