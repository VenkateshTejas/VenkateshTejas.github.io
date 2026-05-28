// Theme toggle — always start in dark mode for every visitor
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;
const moonIcon = themeToggle.querySelector('.fa-moon');
const sunIcon = themeToggle.querySelector('.fa-sun');

// Force dark theme on every load (ignore prior session / OS preference)
body.classList.remove('light-theme');

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

/* ════════════════════════════════════════════════════
   CARD PACK OPENING — Pokémon-style intro
   ════════════════════════════════════════════════════ */
(function () {
  const intro = document.getElementById('packIntro');
  const pack  = document.getElementById('pack');
  const burst = document.getElementById('burst');
  if (!intro || !pack || !burst) return;

  // Disable page scroll until opened
  document.body.style.overflow = 'hidden';

  function spawnSparks() {
    const count = 26;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      const angle    = (Math.PI * 2 * i) / count + (Math.random() * 0.5);
      const distance = 220 + Math.random() * 180;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;
      s.style.setProperty('--tx', `${tx}px`);
      s.style.setProperty('--ty', `${ty}px`);
      s.style.animationDelay = `${Math.random() * 0.15}s`;
      const colors = ['#fff', '#ffd700', '#ff9966', '#4facfe', '#f5576c'];
      const c = colors[Math.floor(Math.random() * colors.length)];
      s.style.background  = c;
      s.style.boxShadow   = `0 0 12px ${c}, 0 0 24px ${c}`;
      burst.appendChild(s);
    }
    burst.classList.add('go');
  }

  function openPack() {
    if (pack.classList.contains('is-cut')) return;
    pack.classList.add('is-cut');
    intro.classList.add('is-cut');
    spawnSparks();

    // After tear finishes, fade overlay and scroll to hero
    setTimeout(() => {
      intro.classList.add('is-gone');
      document.body.style.overflow = '';
      const about = document.getElementById('about');
      if (about) about.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 950);

    // Remove overlay from DOM after fade
    setTimeout(() => { intro.remove(); }, 2200);
  }

  pack.addEventListener('click', openPack);
  pack.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPack(); }
  });

  // Drag-to-slice gesture (cut horizontally across pack)
  let startX = null, startY = null;
  pack.addEventListener('pointerdown', (e) => {
    startX = e.clientX; startY = e.clientY;
  });
  pack.addEventListener('pointerup', (e) => {
    if (startX == null) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > 60 && dx > dy) openPack();
    startX = startY = null;
  });
})();

/* ════════════════════════════════════════════════════
   TIC-TAC-TOE — You (X) vs Me (O)
   ════════════════════════════════════════════════════ */
(function () {
  const boardEl  = document.getElementById('tttBoard');
  const statusEl = document.getElementById('tttStatus');
  const resetBtn = document.getElementById('tttReset');
  const scoreXEl = document.getElementById('tttScoreX');
  const scoreOEl = document.getElementById('tttScoreO');
  const scoreDEl = document.getElementById('tttScoreD');
  if (!boardEl || !statusEl) return;

  const HUMAN = 'X';
  const AI    = 'O';
  const LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  let board    = Array(9).fill('');
  let active   = true;
  let yourTurn = true;
  let difficulty = 'easy';
  const scores = { X: 0, O: 0, D: 0 };

  // probability of AI picking a random move (lower = harder)
  const RANDOM_CHANCE = { easy: 0.75, medium: 0.30, hard: 0 };

  function getCells() { return [...boardEl.querySelectorAll('.ttt-cell')]; }

  function winner(b) {
    for (const line of LINES) {
      const [a,c,d] = line;
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return { player: b[a], line };
    }
    if (b.every(v => v)) return { player: 'D', line: [] };
    return null;
  }

  function render(highlight) {
    const cells = getCells();
    cells.forEach((cell, i) => {
      const v = board[i];
      cell.textContent = v;
      cell.classList.remove('x', 'o', 'win');
      cell.disabled = !!v || !active || !yourTurn;
      if (v === 'X') cell.classList.add('x');
      if (v === 'O') cell.classList.add('o');
    });
    if (highlight && highlight.line) {
      highlight.line.forEach(i => {
        const c = cells[i];
        c.classList.add('win');
        if (highlight.player === 'O') c.classList.add('o');
      });
    }
  }

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.classList.remove('win-x', 'win-o', 'draw');
    if (cls) statusEl.classList.add(cls);
  }

  // Minimax for unbeatable AI (with light randomness on first move)
  function minimax(b, player) {
    const w = winner(b);
    if (w) {
      if (w.player === AI)    return { score:  10 };
      if (w.player === HUMAN) return { score: -10 };
      return { score: 0 };
    }
    const moves = [];
    for (let i = 0; i < 9; i++) {
      if (!b[i]) {
        b[i] = player;
        const result = minimax(b, player === AI ? HUMAN : AI);
        moves.push({ index: i, score: result.score });
        b[i] = '';
      }
    }
    if (player === AI) {
      let best = -Infinity, choice = moves[0];
      for (const m of moves) if (m.score > best) { best = m.score; choice = m; }
      return choice;
    } else {
      let best = Infinity, choice = moves[0];
      for (const m of moves) if (m.score < best) { best = m.score; choice = m; }
      return choice;
    }
  }

  function aiMove() {
    if (!active) return;
    yourTurn = false;
    render();
    setStatus("My move…");

    setTimeout(() => {
      const empty = board.map((v, i) => v ? -1 : i).filter(i => i !== -1);
      const chance = RANDOM_CHANCE[difficulty] ?? 0.25;
      let move;
      if (Math.random() < chance && empty.length > 0) {
        move = empty[Math.floor(Math.random() * empty.length)];
      } else {
        move = minimax([...board], AI).index;
      }
      board[move] = AI;

      const result = winner(board);
      if (result) return finish(result);

      yourTurn = true;
      setStatus("Your move");
      render();
    }, 550);
  }

  function finish(result) {
    active = false;
    if (result.player === 'X') {
      scores.X++;
      setStatus("You win! 🎉", 'win-x');
    } else if (result.player === 'O') {
      scores.O++;
      setStatus("I win — rematch?", 'win-o');
    } else {
      scores.D++;
      setStatus("It's a draw", 'draw');
    }
    scoreXEl.textContent = scores.X;
    scoreOEl.textContent = scores.O;
    scoreDEl.textContent = scores.D;
    render(result);
  }

  function reset() {
    board = Array(9).fill('');
    active = true;
    yourTurn = true;
    setStatus("Your move");
    render();
  }

  boardEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.ttt-cell');
    if (!cell || !active || !yourTurn) return;
    const i = parseInt(cell.dataset.i, 10);
    if (board[i]) return;
    board[i] = HUMAN;
    const result = winner(board);
    if (result) return finish(result);
    aiMove();
  });

  resetBtn.addEventListener('click', reset);

  // Difficulty buttons
  document.querySelectorAll('.ttt-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ttt-diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      difficulty = btn.dataset.diff;
      reset();
    });
  });

  render();
})();

/* ════════════════════════════════════════════════════
   SECTION SCROLL-DROPS — themed item falls in
   ════════════════════════════════════════════════════ */
(function () {
  const themed = document.querySelectorAll('section.themed');
  if (!themed.length) return;

  const dropObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('dropped');
        dropObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px 0px 0px' });

  themed.forEach(s => dropObs.observe(s));
})();