// Light theme has been removed — site is always dark
const body = document.body;
body.classList.remove('light-theme');

// Always (re)load from the top — the About/hero screen — instead of
// restoring the previous scroll position on refresh.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
window.addEventListener('load', () => window.scrollTo(0, 0));

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

// Collapsible cards (projects + experience)
function makeCollapsible(card, { toggleClass, mount, label }) {
  card.classList.add('collapsed');

  const toggle = document.createElement('button');
  toggle.className = toggleClass;
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '<i class="fas fa-chevron-down"></i>';
  mount.appendChild(toggle);

  // Clicking anywhere on the card toggles it, except the live link
  card.addEventListener('click', (e) => {
    if (e.target.closest('.project-link')) return;
    const expanded = card.classList.contains('collapsed');
    card.classList.toggle('collapsed', !expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
  });
}

document.querySelectorAll('.project-card').forEach(card => {
  const header = card.querySelector('.project-header');
  if (!header) return;
  makeCollapsible(card, { toggleClass: 'project-toggle', mount: header, label: 'Toggle project details' });
});

document.querySelectorAll('.experience-card').forEach(card => {
  makeCollapsible(card, { toggleClass: 'experience-toggle', mount: card, label: 'Toggle experience details' });
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

// Keep the mobile menu drawer aligned to the real header height at any size
const header = document.querySelector('header');
function syncHeaderHeight() {
  if (header) {
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  }
}
syncHeaderHeight();
window.addEventListener('load', syncHeaderHeight);
window.addEventListener('resize', syncHeaderHeight);

// Add scroll effect to header
let lastScrollTop = 0;

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
   TIC-TAC-TOE — You (X) vs Me (O)
   ════════════════════════════════════════════════════ */
(function () {
  const boardEl     = document.getElementById('tttBoard');
  const statusEl    = document.getElementById('tttStatus');
  const statusRowEl = document.getElementById('tttStatusRow');
  const resetBtn    = document.getElementById('tttReset');
  const scoreXEl    = document.getElementById('tttScoreX');
  const scoreOEl    = document.getElementById('tttScoreO');
  const scoreDEl    = document.getElementById('tttScoreD');
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
    if (statusRowEl) statusRowEl.classList.add('show-reset');
    render(result);
  }

  function reset() {
    board = Array(9).fill('');
    active = true;
    yourTurn = true;
    setStatus("Your move");
    if (statusRowEl) statusRowEl.classList.remove('show-reset');
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