//Holds values for lurch-tracked elements

module.exports = {

  createIssue: function (args){
    var issue = {};
    issue.githubid = '';
    issue.sfdcid = '';
    issue.subject = '';
    issue.story = '';
    issue.created_date = '';
    issue.github_userid = '';
    issue.sfdc_userid = '';
    issue.product_name = '';
    issue.repo = '';
    issue.comments = [{}];
    issue.issue_tags = [{}];
    issue.unique_id = '';
    issue.github_url = '';


    return issue;
  },
  createIssueComment: function (args){



  },
  createRepository: function (args){

  },
  createTag: function (args) {

  }



};
