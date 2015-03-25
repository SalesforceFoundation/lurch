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
      io.socket.emit('auth_check_github', data.msg);
      io.socket.emit('auth_check_sfdc', data.msg);
      io.socket.on('logout_client', function () {
        console.log('User logout requested');
        window.location.replace("/logout");
      });

      io.socket.on('sfdc_connected', function ( msg ){
        $(".sfdc-auth-remove").hide();
        $(".sfdc-connect").hide();
        
      });
      io.socket.on('sfdc_disconnected', function (){
        $(".sfdc-auth-ok").hide();
        $(".sfdc-disconnect").hide();
      });

    });
  };

  io.connectToServer();





};
