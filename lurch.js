window.onload = function(){

  $("[id$='nav_option']").on('click', function() {
    //deactive all selected menu items
    $("[id$='nav_option']").parent().removeClass('active');
    //check the clicked one
    $(this).parent().addClass('active');
  });

  $(".github-connect").on('click', function(){
    window.location.replace("./auth/github");
  });
  $(".github-disconnect").on('click', function(){
    window.location.replace("./auth/github/revoke");
  });


  $(".sfdc-connect").on('click', function(){
    window.location.replace("./auth/sfdc");
  });
  $(".sfdc-disconnect").on('click', function(){
    window.location.replace("./auth/sfdc/revoke");
  });

  $("[id='logout_lurch']").on('click', function() {
    window.location.replace("./logout");
  });

  $.ajax('/auth/github/status', {
   type: 'GET',
   dataType: 'text',
   success: function(data) {
     var res = JSON.parse(data);
     if (res.status === true){
       $(".gh-auth-remove").hide();
       $(".github-connect").hide();
       $(".gh-auth-ok").show();
       $(".github-disconnect").show();
    }else{
      $(".gh-auth-remove").show();
      $(".github-connect").show();
      $(".gh-auth-ok").hide();
      $(".github-disconnect").hide();
    }
  },
   error: function(err){ console.log('Error retrieving statuses: ' + err);}
  });

  $.ajax('/auth/sfdc/status', {
   type: 'GET',
   dataType: 'text',
   success: function(data) {
     var res = JSON.parse(data);
     if (res.status === true){
       $(".sfdc-auth-remove").hide();
       $(".sfdc-connect").hide();
       $(".sfdc-auth-ok").show();
       $(".sfdc-disconnect").show();
    }else{
      $(".sfdc-auth-remove").show();
      $(".sfdc-connect").show();
      $(".sfdc-auth-ok").hide();
      $(".sfdc-disconnect").hide();
    }
  },
   error: function(err){ console.log('Error retrieving statuses: ' + err);}
  });

  io.connectToServer = function ( data ) {
    //connect socket
    io.socket = io.connect('/', {data: data});

    io.socket.on('error', function (err){
      console.log('Connection error: ' + err);
    });

    console.log('attempting connection...');

    io.socket.on('onconnected', function( data ) {
      //Note that the data is the object we sent from the server, as is. So we can assume its id exists.
      console.log('Connected successfully to the socket.io server with a server side ID of ' + data.msg );
      io.socket.on('logout_client', function () {
        console.log('User logout requested');
        window.location.replace("/logout");
      });
    });
  };
  io.connectToServer();
};
