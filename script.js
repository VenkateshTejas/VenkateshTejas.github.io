const themeSwitcher = document.getElementById("theme-switcher");
const hamburger = document.getElementById("hamburger");
const menu = document.querySelector(".menu");

themeSwitcher.addEventListener("click", () => {
  document.body.classList.toggle("light-theme");
});

hamburger.addEventListener("click", () => {
  menu.classList.toggle("active");
});