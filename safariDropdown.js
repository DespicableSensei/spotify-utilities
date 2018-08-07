var selectOption = document.querySelectorAll('#slct option');
for (var i = 0; i < selectOption.length; i++) {
  var item = selectOption[i];
  if (item.innerHTML === "") {
    item.remove();
  };
}