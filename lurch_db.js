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
        console.log('Successfully connected to: ' + connection_string);
        mongodb = db;
      }
    });
  },
  findTrackingRecord: function (record_id, callback) {
    var issue_collection = mongodb.collection('trackers');
    var docs = issue_collection.find({githubid: record_id}).toArray(function(err, docs){
      if (err){
        callback(null);
      }
      else{
        console.log('Returning tracker results');
        console.log('Docs: ' + docs.length);
        callback(docs);
      }
    });
  },
  createTrackingRecord: function (github_id, sfdc_id, callback) {
    var new_workissue = {github_id: github_id,
                        sfdc_id: sfdc_id};

    //insert the new issue
    var issue_collection = mongodb.collection('workissues');
    issue_collection.insert(new_workissue, function (err, result){
      if (err){
        console.log('Error inserting new issue into Mongo');
        callback(null);
      }
      else{
        console.log('Success inserting new issue into Mongo');
        callback(result);
      }
    });
  },
  verifyRepo: function (repo_name, callback) {
    var repo_collection = mongodb.collection('repos');
    var docs = repo_collection.find({repo_name: repo_name}).toArray(function (err, docs){
      if (err){
        callback(null);
      }
      else{
        console.log('Returning repo results');
        console.log('Docs: ' + docs.length);
        callback(docs);
      }
    });
  }
};
