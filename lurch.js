window.onload = function(){

  $("[id$='nav_option']").on('click', function() {
    //deactive all selected menu items
    $("[id$='nav_option']").parent().removeClass('active');
    //check the clicked one
    $(this).parent().addClass('active');
  });

  $("[id='logout_lurch']").on('click', function() {
    window.location.replace("./logout");
  });




};
