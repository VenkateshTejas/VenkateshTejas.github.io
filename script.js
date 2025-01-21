// script.js
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

// Check if user has a saved theme preference
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    body.classList.add(savedTheme);
}

// Update the button icon based on the current theme
function updateButtonIcon() {
    if (body.classList.contains('dark-mode')) {
        themeToggle.textContent = '☀️'; // Light mode icon
    } else {
        themeToggle.textContent = '🌙'; // Dark mode icon
    }
}

// Toggle theme on button click
themeToggle.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    
    // Save the current theme in localStorage
    const currentTheme = body.classList.contains('dark-mode') ? 'dark-mode' : '';
    localStorage.setItem('theme', currentTheme);

    // Update button icon
    updateButtonIcon();
});

// Initialize button icon on page load
updateButtonIcon();
