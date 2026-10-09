/* ════════════════════════════════════════════════════════════════
   Page behaviour: smooth scroll, tab bar, pause menu, collapsibles,
   GSAP choreography and the tic-tac-toe game.
   The 3D scenes live in gl.js.
   ════════════════════════════════════════════════════════════════ */
(function () {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof window.gsap !== 'undefined';
  const hasST = hasGsap && typeof window.ScrollTrigger !== 'undefined';
  const animate = hasST && !reduceMotion;
  if (hasST) gsap.registerPlugin(ScrollTrigger);

  // Always (re)load at the title screen instead of restoring the old scroll position
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  window.addEventListener('load', () => window.scrollTo(0, 0));

  /* ── Smooth scroll (Lenis is the only smooth-scroll engine) ───── */
  let lenis = null;
  if (!reduceMotion && typeof window.Lenis === 'function') {
    lenis = new Lenis({ lerp: 0.1 });
    if (hasGsap) {
      if (hasST) lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  function scrollToEl(el) {
    if (!el) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    if (lenis) {
      lenis.scrollTo(el, { duration: 1.2 });
    } else {
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
    el.focus({ preventScroll: true });
  }

  /* ── Sections, tab bar and its sliding indicator ─────────────── */
  const sections = ['about', 'education', 'experience', 'projects', 'leadership', 'play']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const tabLinks = [...document.querySelectorAll('.tabs-list a')];
  const pauseLinks = [...document.querySelectorAll('.pause-list a')];
  const indicator = document.querySelector('.tabs-indicator');
  let activeIndex = -1;
  let menuOpen = false;

  function placeIndicator() {
    const link = tabLinks[activeIndex];
    if (!indicator || !link || !link.offsetParent) return;
    indicator.style.setProperty('--x', link.offsetLeft + 12 + 'px');
    indicator.style.setProperty('--w', link.offsetWidth - 24 + 'px');
    indicator.style.setProperty('--o', '1');
  }

  function setActive(i) {
    if (i === activeIndex) return;
    activeIndex = i;
    [tabLinks, pauseLinks].forEach((list) => list.forEach((a, j) => {
      if (j === i) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }));
    placeIndicator();
  }

  function updateActive() {
    const line = window.innerHeight * 0.4;
    let idx = 0;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top <= line) idx = i; });
    setActive(idx);
  }

  document.querySelectorAll('.shoulder').forEach((btn) => {
    btn.addEventListener('click', () => {
      const step = Number(btn.dataset.step);
      const next = Math.min(sections.length - 1, Math.max(0, activeIndex + step));
      scrollToEl(sections[next]);
    });
  });

  /* ── Top bar hides while reading down, returns on the way up ──── */
  const topbar = document.getElementById('topbar');
  let lastY = 0;
  let ticking = false;

  function onScroll() {
    const y = lenis ? lenis.scroll : window.scrollY;
    const delta = y - lastY;
    if (Math.abs(delta) > 4) {
      const hide = delta > 0 && y > 160 && !menuOpen && !topbar.contains(document.activeElement);
      topbar.classList.toggle('is-hidden', hide);
      lastY = y;
    }
    updateActive();
  }
  function requestScrollUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; onScroll(); });
  }
  if (lenis) lenis.on('scroll', requestScrollUpdate);
  else window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  topbar.addEventListener('focusin', () => topbar.classList.remove('is-hidden'));
  window.addEventListener('resize', placeIndicator);

  /* ── Pause menu (mobile navigation) ──────────────────────────── */
  const menuBtn = document.getElementById('menuBtn');
  const pause = document.getElementById('pause');
  const pauseClose = document.getElementById('pauseClose');
  const behindMenu = [topbar, document.getElementById('main'), document.querySelector('.continue'), document.querySelector('.skip-link')];

  function openMenu() {
    menuOpen = true;
    pause.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    behindMenu.forEach((el) => el && (el.inert = true));
    if (lenis) lenis.stop(); else document.body.style.overflow = 'hidden';
    if (animate) {
      // opacity only (not autoAlpha) so the links stay focusable while they animate in
      gsap.fromTo('.pause-title', { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.5, ease: 'expo.out' });
      gsap.fromTo('.pause-list li', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out', stagger: 0.04 });
    }
    const current = pause.querySelector('[aria-current="true"]') || pause.querySelector('a');
    current.focus();
  }

  function closeMenu(restoreFocus = true) {
    if (!menuOpen) return;
    menuOpen = false;
    pause.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    behindMenu.forEach((el) => el && (el.inert = false));
    if (lenis) lenis.start(); else document.body.style.overflow = '';
    if (restoreFocus) menuBtn.focus();
  }

  menuBtn.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
  pauseClose.addEventListener('click', () => closeMenu());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) closeMenu();
  });
  matchMedia('(min-width: 1080px)').addEventListener('change', (e) => { if (e.matches) closeMenu(false); });

  /* ── In-page links ───────────────────────────────────────────── */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href');
    const target = id.length > 1 && document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    closeMenu(false);
    scrollToEl(target);
  });

  /* ── Resume viewer (PDF.js, loaded on first open) ────────────── */
  (function () {
    const viewer = document.getElementById('resumeViewer');
    if (!viewer || typeof viewer.showModal !== 'function') return; // plain PDF link still works
    const PDF_URL = 'pictures/Tejas-Venkatesh-Resume.pdf';
    const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    const pagesEl = viewer.querySelector('[data-viewer-pages]');
    const statusEl = viewer.querySelector('[data-viewer-status]');
    const metaEl = viewer.querySelector('[data-viewer-meta]');
    let loading = null;

    function loadPdfJs() {
      if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = PDFJS + 'pdf.min.js';
        script.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
          resolve(window.pdfjsLib);
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    async function renderPages() {
      const lib = await loadPdfJs();
      const doc = await lib.getDocument(PDF_URL).promise;
      const cssWidth = Math.min(860, pagesEl.clientWidth - 24);
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      metaEl.textContent = `PDF · ${doc.numPages} ${doc.numPages === 1 ? 'page' : 'pages'}`;
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const scale = (cssWidth / page.getViewport({ scale: 1 }).width) * dpr;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Resume page ${n} of ${doc.numPages}`);
        pagesEl.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      }
      statusEl.remove();
    }

    function open() {
      viewer.showModal();
      if (lenis) lenis.stop();
      if (!loading) {
        loading = renderPages().catch(() => {
          loading = null;
          statusEl.innerHTML = 'Couldn\u2019t load the preview. <a href="' + PDF_URL + '" target="_blank" rel="noopener">Open the PDF</a> instead.';
        });
      }
    }

    document.querySelectorAll('[data-resume-view]').forEach((link) => {
      link.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // keep "open in new tab"
        e.preventDefault();
        closeMenu(false);
        open();
      });
    });
    viewer.querySelector('[data-viewer-close]').addEventListener('click', () => viewer.close());
    viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.close(); });
    viewer.addEventListener('close', () => { if (lenis) lenis.start(); });
  })();

  /* ── Mission log: expandable project details ─────────────────── */
  // While a panel above `el` collapses, scroll with it so `el` stays where the
  // reader tapped instead of the page jumping ahead to the next section
  function keepInPlace(el, duration = 560) {
    const startTop = el.getBoundingClientRect().top;
    const t0 = performance.now();
    const step = () => {
      const delta = el.getBoundingClientRect().top - startTop;
      if (Math.abs(delta) > 0.5) {
        if (lenis) lenis.scrollTo(lenis.scroll + delta, { immediate: true, force: true });
        else window.scrollBy(0, delta);
      }
      if (performance.now() - t0 < duration) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  let refreshTimer = 0;
  function refreshLater() {
    if (!hasST) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 560);
  }

  document.querySelectorAll('.quest').forEach((quest) => {
    const btn = quest.querySelector('.quest-toggle');
    const label = quest.querySelector('.quest-toggle-label');
    const details = quest.querySelector('.quest-details');
    const row = quest.querySelector('.quest-row');
    if (!btn || !details) return;

    const set = (open) => {
      quest.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      label.textContent = open ? 'Hide details' : 'Details';
      details.inert = !open;
      refreshLater();
    };
    set(false);

    const toggle = () => {
      const open = !quest.classList.contains('is-open');
      if (!open) keepInPlace(row);
      set(open);
    };
    btn.addEventListener('click', toggle);
    // The whole row is a larger pointer target; links and buttons keep their own job
    row.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      if (String(window.getSelection())) return;
      toggle();
    });
  });

  /* ── Career mode: bullets collapse on phones only ────────────── */
  const phone = matchMedia('(max-width: 759px)');
  const roles = [...document.querySelectorAll('.role')].map((role) => {
    const body = role.querySelector('.role-body');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'role-toggle';
    btn.setAttribute('aria-controls', body.id);
    btn.innerHTML = '<svg class="prompt prompt-tri" aria-hidden="true"><use href="#g-triangle"/></svg><span></span>';
    role.appendChild(btn);
    const label = btn.querySelector('span');

    const set = (open) => {
      role.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      label.textContent = open ? 'Hide highlights' : 'Show highlights';
      body.inert = phone.matches && !open;
      refreshLater();
    };
    btn.addEventListener('click', () => {
      const open = !role.classList.contains('is-open');
      if (!open) keepInPlace(btn);
      set(open);
    });
    return { role, set };
  });
  const applyPhone = () => roles.forEach(({ role, set }) => set(role.classList.contains('is-open')));
  applyPhone();
  phone.addEventListener('change', applyPhone);

  /* ── Save files: progress computed from the real dates ───────── */
  document.querySelectorAll('.save[data-start]').forEach((save) => {
    const start = new Date(save.dataset.start).getTime();
    const end = new Date(save.dataset.end).getTime();
    const pct = Math.round(Math.min(1, Math.max(0, (Date.now() - start) / (end - start))) * 100);
    const bar = save.querySelector('.bar');
    const state = save.querySelector('[data-state]');
    save.querySelector('.bar-fill').style.setProperty('--p', pct + '%');
    save.querySelector('[data-pct]').textContent = pct + '%';
    bar.setAttribute('aria-valuenow', String(pct));
    state.textContent = pct >= 100 ? 'Completed' : 'In progress';
    state.dataset.state = pct >= 100 ? 'done' : 'progress';
  });

  /* ── Product / Program / Project word reel ───────────────────── */
  (function () {
    const reels = [...document.querySelectorAll('.cycler')];
    if (!reels.length || reduceMotion) return;

    const sets = reels.map((reel) => {
      const words = [...reel.querySelectorAll('.cycler-word')];
      // Screen readers get the full phrase once instead of a changing word
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      const names = words.map((w) => w.textContent);
      sr.textContent = names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
      reel.setAttribute('aria-hidden', 'true');
      reel.after(sr);
      reel.classList.add('is-cycling');
      words[0].classList.add('is-active');
      return { reel, words };
    });

    let index = 0;
    const fit = () => sets.forEach(({ reel, words }) => { reel.style.width = words[index].offsetWidth + 'px'; });
    fit();
    if (document.fonts) document.fonts.ready.then(fit);
    window.addEventListener('resize', fit);

    // Pauses while no reel is on screen, the tab is hidden, or the pointer rests on the sentence
    const onScreen = new Set();
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) onScreen.add(e.target); else onScreen.delete(e.target);
    }));
    let hovering = 0;
    sets.forEach(({ reel }) => {
      io.observe(reel);
      const host = reel.closest('p') || reel;
      host.addEventListener('pointerenter', () => { hovering++; });
      host.addEventListener('pointerleave', () => { hovering = Math.max(0, hovering - 1); });
    });

    setInterval(() => {
      if (!onScreen.size || hovering || document.hidden) return;
      const prev = index;
      index = (index + 1) % sets[0].words.length;
      sets.forEach(({ words }) => {
        words.forEach((w) => w.classList.remove('is-leaving'));
        words[prev].classList.remove('is-active');
        words[prev].classList.add('is-leaving');
        words[index].classList.add('is-active');
      });
      fit();
    }, 2600);
  })();

  /* ── Player card tilts toward the pointer (mouse only) ───────── */
  (function () {
    const tilt = document.querySelector('.player-card-tilt');
    const hero = document.querySelector('.hero');
    if (!tilt || !hero || reduceMotion || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let frame = 0;
    let last = null;

    function apply() {
      frame = 0;
      if (!last) return;
      const r = tilt.getBoundingClientRect();
      const px = Math.max(-1.4, Math.min(1.4, (last.x - (r.left + r.width / 2)) / (r.width / 2)));
      const py = Math.max(-1.4, Math.min(1.4, (last.y - (r.top + r.height / 2)) / (r.height / 2)));
      tilt.style.setProperty('--ry', (px * 6).toFixed(2) + 'deg');
      tilt.style.setProperty('--rx', (-py * 5).toFixed(2) + 'deg');
      tilt.style.setProperty('--mx', (((last.x - r.left) / r.width) * 100).toFixed(1) + '%');
      tilt.style.setProperty('--my', (((last.y - r.top) / r.height) * 100).toFixed(1) + '%');
      tilt.style.setProperty('--glare', '1');
    }
    function reset() {
      last = null;
      tilt.classList.remove('is-tilting');
      ['--rx', '--ry', '--glare'].forEach((p) => tilt.style.removeProperty(p));
    }

    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      last = { x: e.clientX, y: e.clientY };
      tilt.classList.add('is-tilting');
      if (!frame) frame = requestAnimationFrame(apply);
    });
    hero.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
  })();

  /* ── Choreography ────────────────────────────────────────────── */
  function splitWords(el) {
    const text = el.textContent.trim();
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = text;
    const visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    text.split(/\s+/).forEach((w, i, all) => {
      const line = document.createElement('span');
      line.className = 'line';
      const word = document.createElement('span');
      word.className = 'word';
      word.textContent = w;
      line.appendChild(word);
      visual.appendChild(line);
      if (i < all.length - 1) visual.appendChild(document.createTextNode(' '));
    });
    el.textContent = '';
    el.append(sr, visual);
    return visual.querySelectorAll('.word');
  }

  function heroIntro() {
    const name = document.querySelector('.hero-name');
    const words = name.querySelectorAll('.word');
    const card = document.querySelector('.player-card');
    const finalWidth = parseFloat(getComputedStyle(name).getPropertyValue('--w')) || 112;

    gsap.timeline({ onComplete: () => root.classList.add('intro-done') })
      .fromTo(words,
        { yPercent: 108, '--w': 50 },
        { yPercent: 0, '--w': finalWidth, duration: 1.15, ease: 'expo.out', stagger: 0.09, clearProps: 'transform,--w' }, 0)
      .fromTo(card,
        { autoAlpha: 0, y: 56, rotation: -3 },
        { autoAlpha: 1, y: 0, rotation: 0, duration: 1.4, ease: 'expo.out', clearProps: 'transform' }, 0.08);
  }

  if (animate) {
    const fontsReady = document.fonts
      ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))])
      : Promise.resolve();
    fontsReady.then(() => {
      heroIntro();
      ScrollTrigger.refresh();
    });

    // Title screen drifts apart as you leave it
    const heroScrub = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
    gsap.to('.hero-copy', { yPercent: -12, ease: 'none', scrollTrigger: heroScrub });
    gsap.to('.hero-card', { yPercent: 8, ease: 'none', scrollTrigger: { ...heroScrub } });

    // Mode banners: title words rise in, then label and inspect frame
    document.querySelectorAll('.mode').forEach((sec) => {
      const head = sec.querySelector('.mode-head');
      const words = splitWords(sec.querySelector('.mode-title'));
      gsap.timeline({ scrollTrigger: { trigger: head, start: 'top 84%', once: true } })
        .from(words, { yPercent: 105, duration: 0.95, ease: 'expo.out', stagger: 0.08 })
        .from(sec.querySelector('.mode-label'), { autoAlpha: 0, y: 10, duration: 0.6, ease: 'power2.out' }, 0.05)
        .from(sec.querySelector('.mode-item'), { autoAlpha: 0, duration: 0.8, ease: 'power2.out' }, 0.15);
    });

    // Content enters in reading order
    const reveal = '.bio-label, .bio-text, .save, .role, .quest, .ranks-intro, .rank, .arena-side, .arena-board, .continue .mode-label, .continue-title, .continue-copy, .continue-actions';
    gsap.set(reveal, { autoAlpha: 0, y: 28 });
    ScrollTrigger.batch(reveal, {
      start: 'top 90%',
      once: true,
      onEnter: (els) => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.85, ease: 'expo.out', stagger: 0.08, overwrite: true }),
    });

    // Save-file bars fill once
    gsap.from('.bar-fill', {
      scaleX: 0, duration: 1.4, ease: 'expo.out', stagger: 0.15,
      scrollTrigger: { trigger: '.saves', start: 'top 80%', once: true },
    });

    // Career rail fills as you read down the timeline
    gsap.fromTo('.career-rail-fill', { scaleY: 0 }, {
      scaleY: 1, ease: 'none',
      scrollTrigger: { trigger: '.career', start: 'top 70%', end: 'bottom 70%', scrub: 0.6 },
    });

    window.addEventListener('load', () => ScrollTrigger.refresh());
  } else {
    root.classList.add('intro-done');
  }

  // Initial nav state once layout and fonts settle
  updateActive();
  if (document.fonts) document.fonts.ready.then(placeIndicator);
  window.addEventListener('load', placeIndicator);

  /* ════════════════════════════════════════════════════════════
     TIC-TAC-TOE — You (X) vs Me (O)
     ════════════════════════════════════════════════════════════ */
  (function () {
    const boardEl = document.getElementById('tttBoard');
    const statusEl = document.getElementById('tttStatus');
    const statusRowEl = document.getElementById('tttStatusRow');
    const resetBtn = document.getElementById('tttReset');
    const scoreXEl = document.getElementById('tttScoreX');
    const scoreOEl = document.getElementById('tttScoreO');
    const scoreDEl = document.getElementById('tttScoreD');
    if (!boardEl || !statusEl) return;

    const HUMAN = 'X';
    const AI = 'O';
    const LINES = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];
    const POS = [1, 2, 3].flatMap((r) => [1, 2, 3].map((c) => `Row ${r}, column ${c}`));

    let board = Array(9).fill('');
    let active = true;
    let yourTurn = true;
    let difficulty = 'easy';
    const scores = { X: 0, O: 0, D: 0 };

    // probability of AI picking a random move (lower = harder)
    const RANDOM_CHANCE = { easy: 0.75, medium: 0.30, hard: 0 };

    const getCells = () => [...boardEl.querySelectorAll('.ttt-cell')];

    function winner(b) {
      for (const line of LINES) {
        const [a, c, d] = line;
        if (b[a] && b[a] === b[c] && b[a] === b[d]) return { player: b[a], line };
      }
      if (b.every((v) => v)) return { player: 'D', line: [] };
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
        cell.setAttribute('aria-label', `${POS[i]}, ${v === 'X' ? 'X, yours' : v === 'O' ? 'O, mine' : 'empty'}`);
      });
      if (highlight && highlight.line) {
        highlight.line.forEach((i) => cells[i].classList.add('win'));
      }
    }

    function setStatus(text, cls) {
      statusEl.textContent = text;
      statusEl.classList.remove('win-x', 'win-o', 'draw');
      if (cls) statusEl.classList.add(cls);
    }

    // Minimax for the unbeatable setting
    function minimax(b, player) {
      const w = winner(b);
      if (w) {
        if (w.player === AI) return { score: 10 };
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
      let choice = moves[0];
      if (player === AI) {
        for (const m of moves) if (m.score > choice.score) choice = m;
      } else {
        for (const m of moves) if (m.score < choice.score) choice = m;
      }
      return choice;
    }

    function aiMove() {
      if (!active) return;
      yourTurn = false;
      render();
      setStatus('My move…');

      setTimeout(() => {
        const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i !== -1);
        const chance = RANDOM_CHANCE[difficulty] ?? 0.25;
        const move = Math.random() < chance && empty.length > 0
          ? empty[Math.floor(Math.random() * empty.length)]
          : minimax([...board], AI).index;
        board[move] = AI;

        const result = winner(board);
        if (result) return finish(result);

        yourTurn = true;
        setStatus('Your move');
        render();
      }, 550);
    }

    function finish(result) {
      active = false;
      if (result.player === 'X') {
        scores.X++;
        setStatus('You win! 🎉', 'win-x');
      } else if (result.player === 'O') {
        scores.O++;
        setStatus('I win — rematch?', 'win-o');
      } else {
        scores.D++;
        setStatus("It's a draw", 'draw');
      }
      scoreXEl.textContent = scores.X;
      scoreOEl.textContent = scores.O;
      scoreDEl.textContent = scores.D;
      statusRowEl.classList.add('show-reset');
      render(result);
    }

    function reset() {
      board = Array(9).fill('');
      active = true;
      yourTurn = true;
      setStatus('Your move');
      statusRowEl.classList.remove('show-reset');
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

    document.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        difficulty = btn.dataset.diff;
        reset();
      });
    });

    render();
  })();
})();
