

const themeSwitcher = document.getElementById("theme-switcher");
const hamburger = document.getElementById("hamburger");
const menu = document.querySelector(".menu");
const menuItems = document.querySelectorAll(".menu a");  // Select all menu items

themeSwitcher.addEventListener("click", () => {
  document.body.classList.toggle("light-theme");
});

hamburger.addEventListener("click", () => {
  menu.classList.toggle("active");
});

// Close the menu when clicking outside of it
document.addEventListener("click", (event) => {
  if (!menu.contains(event.target) && !hamburger.contains(event.target)) {
    menu.classList.remove("active");
  }
});

// Close the menu when a menu item is clicked
menuItems.forEach(item => {
  item.addEventListener("click", () => {
    menu.classList.remove("active");
  });
});
