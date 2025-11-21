// Theme toggle functionality
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;
const moonIcon = themeToggle.querySelector('.fa-moon');
const sunIcon = themeToggle.querySelector('.fa-sun');

themeToggle.addEventListener('click', () => {
  body.classList.toggle('light-theme');
});

// Hamburger menu functionality
const hamburger = document.getElementById('hamburger');
const navMenu = document.querySelector('.nav-menu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  navMenu.classList.toggle('active');
});

// Close menu when clicking on a link
document.querySelectorAll('.nav-menu a').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navMenu.classList.remove('active');
  });
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
    hamburger.classList.remove('active');
    navMenu.classList.remove('active');
  }
});

// Scroll reveal animation
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
    }
  });
}, observerOptions);

// Observe all scroll-reveal elements
document.querySelectorAll('.scroll-reveal').forEach(el => {
  observer.observe(el);
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// Add scroll effect to header
let lastScrollTop = 0;
const header = document.querySelector('header');

window.addEventListener('scroll', () => {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  
  if (scrollTop > lastScrollTop && scrollTop > 100) {
    header.style.transform = 'translateY(-100%)';
  } else {
    header.style.transform = 'translateY(0)';
  }
  
  lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
});

// Tic-Tac-Toe Game
class TicTacToe {
  constructor() {
    this.board = ['', '', '', '', '', '', '', '', ''];
    this.currentPlayer = 'X';
    this.gameActive = true;
    this.difficulty = 'medium';
    this.scores = {
      player: 0,
      ai: 0,
      draw: 0
    };
    
    this.winConditions = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6]
    ];
    
    this.init();
  }
  
  init() {
    this.cells = document.querySelectorAll('.cell');
    this.statusText = document.querySelector('.status-text');
    this.resetBtn = document.getElementById('resetGame');
    this.difficultySelect = document.getElementById('difficulty');
    this.playerScoreEl = document.getElementById('playerScore');
    this.aiScoreEl = document.getElementById('aiScore');
    this.drawScoreEl = document.getElementById('drawScore');
    
    this.cells.forEach((cell, index) => {
      cell.addEventListener('click', () => this.handleCellClick(index));
    });
    
    this.resetBtn.addEventListener('click', () => this.resetGame());
    this.difficultySelect.addEventListener('change', (e) => {
      this.difficulty = e.target.value;
      this.resetGame();
    });
    
    this.updateDisplay();
  }
  
  handleCellClick(index) {
    if (this.board[index] !== '' || !this.gameActive || this.currentPlayer !== 'X') {
      return;
    }
    
    this.makeMove(index, 'X');
    
    if (this.gameActive) {
      this.currentPlayer = 'O';
      this.updateStatus('AI is thinking...');
      
      setTimeout(() => {
        if (this.gameActive) {
          this.aiMove();
        }
      }, 500);
    }
  }
  
  makeMove(index, player) {
    this.board[index] = player;
    this.updateDisplay();
    
    const result = this.checkResult();
    if (result) {
      this.handleGameEnd(result);
    } else {
      this.currentPlayer = player === 'X' ? 'O' : 'X';
      if (this.currentPlayer === 'X' && this.gameActive) {
        this.updateStatus('Your turn! You are X');
      }
    }
  }
  
  aiMove() {
    let move;
    
    switch(this.difficulty) {
      case 'easy':
        move = this.getEasyMove();
        break;
      case 'medium':
        move = this.getMediumMove();
        break;
      case 'hard':
        move = this.getHardMove();
        break;
      case 'impossible':
        move = this.getBestMove();
        break;
      default:
        move = this.getMediumMove();
    }
    
    if (move !== undefined) {
      this.makeMove(move, 'O');
    }
  }
  
  getEasyMove() {
    // Random move with 30% chance of making a good move
    if (Math.random() < 0.3) {
      return this.getBestMove();
    }
    return this.getRandomMove();
  }
  
  getMediumMove() {
    // 60% chance of making the best move
    if (Math.random() < 0.6) {
      return this.getBestMove();
    }
    return this.getRandomMove();
  }
  
  getHardMove() {
    // 90% chance of making the best move
    if (Math.random() < 0.9) {
      return this.getBestMove();
    }
    return this.getRandomMove();
  }
  
  getRandomMove() {
    const availableMoves = [];
    for (let i = 0; i < 9; i++) {
      if (this.board[i] === '') {
        availableMoves.push(i);
      }
    }
    return availableMoves[Math.floor(Math.random() * availableMoves.length)];
  }
  
  getBestMove() {
    // Minimax algorithm for unbeatable AI
    let bestScore = -Infinity;
    let bestMove;
    
    for (let i = 0; i < 9; i++) {
      if (this.board[i] === '') {
        this.board[i] = 'O';
        const score = this.minimax(this.board, 0, false);
        this.board[i] = '';
        
        if (score > bestScore) {
          bestScore = score;
          bestMove = i;
        }
      }
    }
    
    return bestMove;
  }
  
  minimax(board, depth, isMaximizing) {
    const result = this.checkWinner(board);
    
    if (result === 'O') return 10 - depth;
    if (result === 'X') return depth - 10;
    if (result === 'draw') return 0;
    
    if (isMaximizing) {
      let bestScore = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === '') {
          board[i] = 'O';
          const score = this.minimax(board, depth + 1, false);
          board[i] = '';
          bestScore = Math.max(score, bestScore);
        }
      }
      return bestScore;
    } else {
      let bestScore = Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === '') {
          board[i] = 'X';
          const score = this.minimax(board, depth + 1, true);
          board[i] = '';
          bestScore = Math.min(score, bestScore);
        }
      }
      return bestScore;
    }
  }
  
  checkWinner(board) {
    for (let condition of this.winConditions) {
      const [a, b, c] = condition;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    
    if (!board.includes('')) {
      return 'draw';
    }
    
    return null;
  }
  
  checkResult() {
    for (let condition of this.winConditions) {
      const [a, b, c] = condition;
      if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
        this.highlightWinningCells([a, b, c]);
        return this.board[a];
      }
    }
    
    if (!this.board.includes('')) {
      return 'draw';
    }
    
    return null;
  }
  
  highlightWinningCells(cells) {
    cells.forEach(index => {
      this.cells[index].classList.add('winner');
    });
  }
  
  handleGameEnd(result) {
    this.gameActive = false;
    
    if (result === 'X') {
      this.updateStatus('You Win! 🎉', 'win');
      this.scores.player++;
      this.playerScoreEl.textContent = this.scores.player;
    } else if (result === 'O') {
      this.updateStatus('AI Wins! 🤖', 'lose');
      this.scores.ai++;
      this.aiScoreEl.textContent = this.scores.ai;
    } else {
      this.updateStatus("It's a Draw! 🤝", 'draw');
      this.scores.draw++;
      this.drawScoreEl.textContent = this.scores.draw;
    }
  }
  
  updateStatus(message, type = '') {
    this.statusText.textContent = message;
    this.statusText.className = 'status-text';
    if (type) {
      this.statusText.classList.add(type);
    }
  }
  
  updateDisplay() {
    this.cells.forEach((cell, index) => {
      cell.textContent = this.board[index];
      cell.className = 'cell';
      
      if (this.board[index]) {
        cell.classList.add('taken');
        cell.classList.add(this.board[index].toLowerCase());
      }
    });
  }
  
  resetGame() {
    this.board = ['', '', '', '', '', '', '', '', ''];
    this.currentPlayer = 'X';
    this.gameActive = true;
    this.updateStatus('Your turn! You are X');
    this.updateDisplay();
  }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're on a page with the game
  if (document.getElementById('gameBoard')) {
    new TicTacToe();
  }
});


// Section Title Animations on Scroll
const observeSectionTitles = () => {
  const sectionTitles = document.querySelectorAll('.section-title');
  
  const titleObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        // Re-trigger the gradient animation
        entry.target.style.animation = 'none';
        setTimeout(() => {
          entry.target.style.animation = 'gradientShift 3s linear infinite, fadeInUp 1s ease forwards';
        }, 10);
      }
    });
  }, {
    threshold: 0.5,
    rootMargin: '0px 0px -50px 0px'
  });
  
  sectionTitles.forEach(title => {
    titleObserver.observe(title);
  });
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  observeSectionTitles();
  
  // Add hover sound effect (optional - visual feedback only)
  const sectionTitles = document.querySelectorAll('.section-title');
  sectionTitles.forEach(title => {
    title.addEventListener('mouseenter', () => {
      title.style.transform = 'scale(1.05) translateY(0)';
    });
    
    title.addEventListener('mouseleave', () => {
      title.style.transform = 'scale(1) translateY(0)';
    });
  });
});
