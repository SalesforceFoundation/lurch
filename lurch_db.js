var mongoose = require('mongoose');
var connection_string = process.env.MONGOLAB_URI || 'mongodb://localhost/HelloMongoose';


// ========== Mongoose Schema ==========
var issueSchema = new mongoose.Schema({
  githubid: { type: String, trim: true },
  sfdcid: { type: String, trim: true },
  github_userid: { type: String, trim: true },
  sfdc_userid: { type: String, trim: true },
  created_date: { type: Number, min: 0 },
  repo: { type: Number, min: 0 },
  comments: [{ body: String, commenter: String, date: Date }]
});

var issueCommentSchema = new mongoose.Schema({

});
var pullSchema = new mongoose.Schema({

});
var releaseSchema = new mongoose.Schema({

});

module.exports = {

  connect: function () {
    mongoose.connect(connection_string, function (err, res) {
      if (err) {
      console.log ('ERROR connecting to: ' + connection_string + '. ' + err);
      } else {
      console.log ('Succeeded connected to: ' + connection_string);
      }
    });
  }

  


};
