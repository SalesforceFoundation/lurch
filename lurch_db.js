var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var connection_string = process.env.MONGOLAB_URI || 'mongodb://localhost/HelloMongoose';
var lurch_el = require('./lurch_elements.js');
var mongodb;

module.exports = {
  getDB: function () {
    return mongodb;
  },
  connect: function () {
    MongoClient.connect(connection_string, function(err, db) {
      if (err) {
        console.log('ERROR connecting to: ' + connection_string + '. ' + err);
      } else {
        console.log('Succeeded connected to: ' + connection_string);
        console.log('DB: ' + db);
        mongodb = db;
      }
    });
  },
  findIssueRecord: function (record_id, callback) {
    var issue_collection = mongodb.collection('issues');
    var docs = issue_collection.find({githubid: record_id});
    callback(docs);
  },
  createIssueRecord: function (issue, callback) {
    var new_issue = lurch_el.createIssue(issue);

    //insert the new issue
    var issue_collection = mongodb.collection('issues');
    issue_collection.insert(new_issue, function (err, result){
      if (err){
        console.log('Error inserting new issue into Mongo');
        callback(null);
      }
      else{
        console.log('Success inserting new issue into Mongo');
        callback(result);
      }
    });
  }


};
