// Light theme has been removed — site is always dark
const body = document.body;
body.classList.remove('light-theme');

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
  const intro       = document.getElementById('packIntro');
  const pack        = document.getElementById('pack');
  const tearEl      = document.getElementById('packTear');
  const cardBurstEl = document.getElementById('cardBurst');
  const burst       = document.getElementById('burst');
  if (!intro || !pack || !tearEl || !burst) return;

  // Disable page scroll until opened
  document.body.style.overflow = 'hidden';

  let isOpen      = false;
  let startX      = null;
  let startY      = null;
  let dragging    = false;
  let horizSwipe  = false;
  const SWIPE_THRESHOLD = 110;   // px of horizontal drag needed to "tear"

  function spawnSparks() {
    const count = 28;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      const angle    = (Math.PI * 2 * i) / count + (Math.random() * 0.5);
      const distance = 240 + Math.random() * 200;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;
      s.style.setProperty('--tx', `${tx}px`);
      s.style.setProperty('--ty', `${ty}px`);
      s.style.animationDelay = `${Math.random() * 0.2}s`;
      const colors = ['#ffffff', '#87b3ff', '#4a8aff', '#ffd700', '#00d4ff'];
      const c = colors[Math.floor(Math.random() * colors.length)];
      s.style.background  = c;
      s.style.boxShadow   = `0 0 12px ${c}, 0 0 24px ${c}`;
      burst.appendChild(s);
    }
    burst.classList.add('go');
  }

  function resetTearTransform() {
    tearEl.style.transition = '';
    tearEl.style.transform  = '';
    tearEl.style.opacity    = '';
  }

  function openPack() {
    if (isOpen) return;
    isOpen = true;
    resetTearTransform();
    pack.classList.add('is-cut');
    intro.classList.add('is-cut');

    // Cards burst out shortly after the tear flies off
    setTimeout(() => {
      if (cardBurstEl) cardBurstEl.classList.add('is-burst');
      spawnSparks();
    }, 280);

    // Fade overlay and scroll to hero after cards have spread
    setTimeout(() => {
      intro.classList.add('is-gone');
      document.body.style.overflow = '';
      const about = document.getElementById('about');
      if (about) about.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 2100);

    // Cleanup
    setTimeout(() => { intro.remove(); }, 3200);
  }

  // Auto-open the pack after 3.5s if the user hasn't interacted —
  // saves anyone from getting stuck on the swipe gesture
  const autoOpenTimer = setTimeout(() => {
    if (!isOpen) openPack();
  }, 3500);

  // ── Swipe gesture (with live visual feedback on the tear strip) ──
  pack.addEventListener('pointerdown', (e) => {
    if (isOpen) return;
    // The user is interacting — cancel the auto-open so we don't
    // interrupt their swipe mid-gesture
    clearTimeout(autoOpenTimer);
    startX     = e.clientX;
    startY     = e.clientY;
    dragging   = false;
    horizSwipe = false;
    try { pack.setPointerCapture(e.pointerId); } catch (_) {}
  });

  pack.addEventListener('pointermove', (e) => {
    if (isOpen || startX == null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Decide once whether this is a horizontal swipe
    if (!dragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      dragging   = true;
      horizSwipe = Math.abs(dx) > Math.abs(dy);
    }

    if (horizSwipe) {
      // Live feedback: tear strip follows the finger as it's "torn off"
      const progress = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
      tearEl.style.transition = 'none';
      tearEl.style.transform  = `translateX(${dx * 0.65}px) translateY(${-Math.abs(dx) * 0.18}px) rotate(${dx * 0.06}deg)`;
      tearEl.style.opacity    = `${1 - progress * 0.55}`;
    }
  });

  pack.addEventListener('pointerup', (e) => {
    if (isOpen || startX == null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    try { pack.releasePointerCapture(e.pointerId); } catch (_) {}

    if (horizSwipe && Math.abs(dx) > SWIPE_THRESHOLD) {
      // Past threshold — complete the tear
      openPack();
    } else if (!dragging && Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      // Treated as a tap — also opens (accessibility / desktop)
      openPack();
    } else {
      // Snap back
      tearEl.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
      tearEl.style.transform  = '';
      tearEl.style.opacity    = '';
    }

    startX = startY = null;
    dragging = false;
    horizSwipe = false;
  });

  pack.addEventListener('pointercancel', () => {
    if (isOpen) return;
    tearEl.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
    tearEl.style.transform  = '';
    tearEl.style.opacity    = '';
    startX = startY = null;
    dragging = false;
    horizSwipe = false;
  });

  // Keyboard fallback (Enter / Space)
  pack.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPack(); }
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