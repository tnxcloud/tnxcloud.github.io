/* TNxMovieZone — homepage logic */
(function () {
  'use strict';

  var movies = [];
  var settings = null;
  var heroIdx = 0;
  var heroTimer = null;
  var activeCat = 'All';
  var activeLang = 'All';

  /* ---------- theme ---------- */
  function initTheme() {
    var t = localStorage.getItem('vf_theme');
    if (!t) t = 'dark';
    document.documentElement.setAttribute('data-theme', t);
    var btn = document.getElementById('themeToggle');
    if (btn) {
      btn.textContent = t === 'dark' ? '🌙' : '☀️';
      btn.onclick = function () {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('vf_theme', next);
        btn.textContent = next === 'dark' ? '🌙' : '☀️';
      };
    }
  }

  /* ---------- data ---------- */
  function fetchJSON(url) {
    return fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  function listed(m) { return m.listed !== false; }

  /* ---------- cards ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function cardHTML(m, i) {
    var badge = '';
    if (m.is_trending) badge = '<span class="card-badge">🔥 Trending</span>';
    else if (m.is_featured) badge = '<span class="card-badge">✨ Featured</span>';
    var qbadge = m.quality ? '<span class="q-badge">' + esc(m.quality) + '</span>' : '';
    var rating = m.rating ? '<span class="imdb">★ ' + esc(m.rating) + '</span>' : '';
    return '<a class="card" href="movie.html?id=' + encodeURIComponent(m.id) + '" style="animation-delay:' + (i * 40) + 'ms">' +
      '<div class="card-poster">' +
      (m.poster_url ? '<img src="' + esc(m.poster_url) + '" alt="' + esc(m.title) + '" loading="lazy" decoding="async">' : '<div style="width:100%;height:100%;display:grid;place-items:center;background:var(--grad-soft);font-size:2rem">🎬</div>') +
      badge +
      qbadge +
      '<div class="card-play"><span>▶</span></div>' +
      '</div>' +
      '<div class="card-info"><div class="card-title">' + esc(m.title) + '</div>' +
      '<div class="card-sub"><span>' + esc(m.year || '') + '</span>' + rating + '</div></div></a>';
  }

  /* ---------- hero ---------- */
  function setHero(list) {
    if (!list.length) return;
    heroIdx = heroIdx % list.length;
    var m = list[heroIdx];
    var bg = document.getElementById('heroBg');
    var title = document.getElementById('heroTitle');
    var meta = document.getElementById('heroMeta');
    var desc = document.getElementById('heroDesc');
    var watch = document.getElementById('heroWatch');
    var info = document.getElementById('heroInfo');
    if (bg) bg.src = m.backdrop_url || m.poster_url || '';
    if (title) title.textContent = m.title || '';
    if (meta) meta.innerHTML =
      (m.rating ? '<span class="imdb">★ ' + esc(m.rating) + '</span>' : '') +
      '<span>' + esc(m.year || '') + '</span>' +
      '<span>' + esc(m.genre || '') + '</span>' +
      (m.duration ? '<span>' + esc(m.duration) + '</span>' : '');
    if (desc) desc.textContent = m.description || '';
    /* hero cast strip */
    var hc = document.getElementById('heroCast');
    if (hc) {
      var hcast = [];
      if (Array.isArray(m.cast)) {
        hcast = m.cast.map(function (c) {
          if (c && typeof c === 'object') return { name: c.name || '', photo: c.photo || '' };
          return { name: String(c), photo: '' };
        }).filter(function (c) { return c.name; }).slice(0, 6);
      } else if (m.cast) {
        hcast = String(m.cast).split(',').map(function (s) { return { name: s.trim(), photo: '' }; }).filter(function (c) { return c.name; }).slice(0, 6);
      }
      hc.innerHTML = hcast.length ? hcast.map(function (c) {
        var img = c.photo
          ? '<img src="' + esc(c.photo) + '" alt="' + esc(c.name) + '" loading="lazy" decoding="async" title="' + esc(c.name) + '">'
          : '<div class="hcast-noimg" title="' + esc(c.name) + '">🎭</div>';
        return '<div class="hcast-item">' + img + '</div>';
      }).join('') : '';
    }
    if (watch) watch.href = 'watch.html?id=' + encodeURIComponent(m.id);
    if (info) info.href = 'movie.html?id=' + encodeURIComponent(m.id);

    var dots = document.getElementById('heroDots');
    if (dots) {
      dots.innerHTML = list.map(function (_, i) {
        return '<button type="button" data-i="' + i + '" class="' + (i === heroIdx ? 'on' : '') + '" aria-label="Slide ' + (i + 1) + '"></button>';
      }).join('');
      var btns = dots.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        (function (b) {
          b.onclick = function () { heroIdx = parseInt(b.getAttribute('data-i'), 10); setHero(list); restartHero(list); };
        })(btns[i]);
      }
    }
    // Re-trigger animation
    var hc = document.querySelector('.hero-content');
    if (hc) { hc.style.animation = 'none'; void hc.offsetWidth; hc.style.animation = ''; }
  }

  function restartHero(list) {
    if (heroTimer) clearInterval(heroTimer);
    heroTimer = setInterval(function () { heroIdx = (heroIdx + 1) % list.length; setHero(list); }, 7000);
  }

  /* ---------- rows ---------- */
  function renderRow(elId, list) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="empty">No titles here yet.</div>'; return; }
    el.innerHTML = list.map(cardHTML).join('');
  }

  function renderCatChips() {
    var wrap = document.getElementById('catChips');
    if (!wrap) return;
    var rawCats = (settings && settings.categories) || [];
    var cats = ['All'].concat(rawCats.map(function (c) {
      return (c && typeof c === 'object') ? (c.label || c.id || '') : String(c);
    }).filter(Boolean));
    wrap.innerHTML = cats.map(function (c) {
      return '<button type="button" class="chip' + (c === activeCat ? ' on' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
    var btns = wrap.querySelectorAll('.chip');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.onclick = function () {
          activeCat = b.getAttribute('data-cat');
          renderCatChips();
          applyFilter();
        };
      })(btns[i]);
    }
  }

  function renderLangChips() {
    var wrap = document.getElementById('langChips');
    if (!wrap) return;
    var langSet = {};
    movies.filter(listed).forEach(function (m) {
      (m.language || '').split(',').forEach(function (l) {
        l = l.trim();
        if (l) langSet[l] = true;
      });
    });
    var langs = Object.keys(langSet).sort();
    if (!langs.length) { wrap.innerHTML = ''; return; }
    var all = ['All'].concat(langs);
    wrap.innerHTML = '<span style="font-size:.75rem;color:var(--text-faint);margin-right:4px;">🌐</span>' + all.map(function (l) {
      return '<button type="button" class="chip' + (l === activeLang ? ' on' : '') + '" data-lang="' + esc(l) + '">' + esc(l) + '</button>';
    }).join('');
    var btns = wrap.querySelectorAll('.chip');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.onclick = function () {
          activeLang = b.getAttribute('data-lang');
          renderLangChips();
          applyFilter();
        };
      })(btns[i]);
    }
  }

  function renderContinueWatching() {
    var sec = document.getElementById('continueSec');
    var row = document.getElementById('continueRow');
    if (!sec || !row) return;
    var list = [];
    try { list = JSON.parse(localStorage.getItem('tnx_continue') || '[]'); } catch (e) {}
    var items = [];
    list.forEach(function (x) {
      for (var i = 0; i < movies.length; i++) {
        if (String(movies[i].id) === String(x.id) && listed(movies[i])) { items.push(movies[i]); break; }
      }
    });
    if (!items.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    row.innerHTML = items.map(cardHTML).join('');
    var clr = document.getElementById('clearContinue');
    if (clr) clr.onclick = function () {
      try { localStorage.removeItem('tnx_continue'); } catch (e) {}
      sec.style.display = 'none';
    };
  }

  function applyFilter() {
    var vis = movies.filter(listed);
    /* language filter */
    if (activeLang !== 'All') {
      vis = vis.filter(function (m) {
        return (m.language || '').toLowerCase().split(',').map(function (s) { return s.trim(); }).indexOf(activeLang.toLowerCase()) > -1;
      });
    }
    var trending = vis.filter(function (m) { return m.is_trending; });
    var latest = vis.slice().sort(function (a, b) {
      return String(b.release_date || b.year || '').localeCompare(String(a.release_date || a.year || ''));
    }).slice(0, 20);
    if (activeCat !== 'All') {
      var catL = activeCat.toLowerCase();
      var f = vis.filter(function (m) {
        /* Web Series: has episodes OR content_type is Web Series */
        if (catL === 'web-series' || catL === 'web series') {
          return (m.episodes && String(m.episodes).trim() !== '') ||
                 (m.content_type || '').toLowerCase() === 'web series';
        }
        /* Anime: content_type is Anime OR genre has anime/animation */
        if (catL === 'anime') {
          return (m.content_type || '').toLowerCase() === 'anime' ||
                 (m.genre || '').toLowerCase().indexOf('anime') > -1 ||
                 (m.genre || '').toLowerCase().indexOf('animation') > -1;
        }
        /* default: genre match */
        return (m.genre || '').toLowerCase().split(/[,\/]/).map(function (s) { return s.trim(); }).indexOf(catL) > -1;
      });
      renderRow('trendingRow', f);
      renderRow('latestRow', []);
      document.getElementById('latest').style.display = 'none';
    } else {
      document.getElementById('latest').style.display = '';
      renderRow('trendingRow', trending.length ? trending : vis.slice(0, 20));
      renderRow('latestRow', latest);
    }
    renderCatRows(vis);
  }

  function renderCatRows(vis) {
    var wrap = document.getElementById('catRows');
    if (!wrap) return;
    if (activeCat !== 'All') { wrap.innerHTML = ''; return; }
    var cats = ((settings && settings.categories) || []).map(function (c) {
      return (c && typeof c === 'object') ? (c.label || c.id || '') : String(c);
    }).filter(Boolean);
    var html = '';
    cats.slice(0, 6).forEach(function (c) {
      var list = vis.filter(function (m) {
        var cl = c.toLowerCase();
        if (cl === 'web-series' || cl === 'web series') {
          return (m.episodes && String(m.episodes).trim() !== '') ||
                 (m.content_type || '').toLowerCase() === 'web series';
        }
        if (cl === 'anime') {
          return (m.content_type || '').toLowerCase() === 'anime' ||
                 (m.genre || '').toLowerCase().indexOf('anime') > -1 ||
                 (m.genre || '').toLowerCase().indexOf('animation') > -1;
        }
        return (m.genre || '').toLowerCase().indexOf(cl) > -1;
      }).slice(0, 20);
      if (!list.length) return;
      html += '<section class="row-sec"><div class="row-head"><h2 class="row-title">' + esc(c) + '</h2></div>' +
        '<div class="poster-row">' + list.map(cardHTML).join('') + '</div></section>';
    });
    wrap.innerHTML = html;
  }

  /* ---------- search ---------- */
  /* ---------- smart fuzzy search ---------- */
  function lev(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    var m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    var d = [];
    for (var i = 0; i <= m; i++) d[i] = [i];
    for (var j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    return d[m][n];
  }
  function fuzzyScore(query, text) {
    if (!text) return 0;
    query = query.toLowerCase().trim(); text = text.toLowerCase();
    if (!query) return 0;
    if (text.indexOf(query) > -1) return 100; // exact substring = best
    var words = text.split(/[^a-z0-9]+/);
    var best = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w) continue;
      var dist = lev(query, w);
      var maxLen = Math.max(query.length, w.length);
      var sim = Math.round((1 - dist / maxLen) * 100);
      if (sim > best) best = sim;
    }
    return best;
  }
  function movieSearchText(m) {
    var parts = [m.title, m.genre, m.director, m.language, m.country, m.year];
    if (Array.isArray(m.cast)) parts.push(m.cast.map(function(c){return (c&&typeof c==='object')?(c.name||''):String(c);}).join(' '));
    else if (m.cast) parts.push(String(m.cast));
    if (Array.isArray(m.tags)) parts.push(m.tags.join(' '));
    else if (m.tags) parts.push(String(m.tags));
    if (m.description) parts.push(m.description);
    return parts.filter(Boolean).join(' ');
  }
  function smartSearch(query) {
    var q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    var scored = [];
    movies.filter(listed).forEach(function (m) {
      var score = fuzzyScore(q, movieSearchText(m));
      // boost title matches
      var titleScore = fuzzyScore(q, m.title || '');
      score = Math.max(score, titleScore + 10);
      if (score >= 55) scored.push({ m: m, s: score });
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, 8).map(function (x) { return x.m; });
  }

  function initSearch() {
    var input = document.getElementById('searchInput');
    var box = document.getElementById('searchResults');
    var sec = document.getElementById('searchSec');
    var grid = document.getElementById('searchGrid');
    var count = document.getElementById('searchCount');
    var closeBtn = document.getElementById('searchClose');
    if (!input || !box) return;

    function showFullResults(q) {
      var hits = smartSearch(q);
      // also get all matches (not just top 8)
      var all = [];
      var ql = q.trim().toLowerCase();
      movies.filter(listed).forEach(function (m) {
        var score = Math.max(fuzzyScore(ql, movieSearchText(m)), fuzzyScore(ql, m.title || '') + 10);
        if (score >= 55) all.push({ m: m, s: score });
      });
      all.sort(function (a, b) { return b.s - a.s; });
      if (sec && grid) {
        sec.style.display = '';
        if (count) count.textContent = '(' + all.length + ' found)';
        grid.innerHTML = all.length
          ? all.map(function (x) { return cardHTML(x.m); }).join('')
          : '<div class="empty">No results for "' + esc(q) + '"</div>';
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      box.classList.remove('show');
    }
    function hideFullResults() {
      if (sec) sec.style.display = 'none';
      if (grid) grid.innerHTML = '';
    }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (q.length < 2) { box.classList.remove('show'); box.innerHTML = ''; hideFullResults(); return; }
      hideFullResults();
      var hits = smartSearch(q);
      if (!hits.length) { box.innerHTML = '<div class="sr-item"><div class="s">No results</div></div>'; }
      else {
        box.innerHTML = hits.map(function (m) {
          return '<a class="sr-item" href="movie.html?id=' + encodeURIComponent(m.id) + '">' +
            (m.poster_url ? '<img src="' + esc(m.poster_url) + '" alt="">' : '') +
            '<div><div class="t">' + esc(m.title) + '</div><div class="s">' + esc(m.year || '') + ' • ' + esc(m.genre || '') + '</div></div></a>';
        }).join('');
      }
      box.classList.add('show');
    });
    document.addEventListener('click', function (e) {
      if (!box.contains(e.target) && e.target !== input) box.classList.remove('show');
    });
    /* Enter key = full grid results */
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var q = input.value.trim();
        if (q.length >= 2) showFullResults(q);
      }
    });
    if (closeBtn) closeBtn.onclick = function () {
      input.value = ''; hideFullResults(); box.classList.remove('show');
    };
  }

  /* ---------- site branding ---------- */
  function applySettings() {
    if (!settings) return;
    if (settings.site_name) {
      document.title = settings.site_name + ' — Watch Movies & Shows';
      var logos = document.querySelectorAll('#siteLogo');
      for (var i = 0; i < logos.length; i++) {
        if (settings.logo_url) logos[i].innerHTML = '<img src="' + esc(settings.logo_url) + '" alt="' + esc(settings.site_name) + '">';
        else logos[i].textContent = settings.site_name;
      }
      var fn = document.getElementById('footName');
      if (fn) fn.textContent = settings.site_name;
    }
    var nb = document.getElementById('noticeModal');
    if (nb) {
      var txt = (settings.notice || '').trim();
      if (txt && !sessionStorage.getItem('noticeSeen')) {
        document.getElementById('noticeText').textContent = txt;
        nb.style.display = 'flex';
        var close = function () { nb.style.display = 'none'; sessionStorage.setItem('noticeSeen', '1'); };
        document.getElementById('noticeClose').onclick = close;
        nb.onclick = function (e) { if (e.target === nb) close(); };
      } else nb.style.display = 'none';
    }
    /* ---------- ads ---------- */
    if (settings.ads) {
      if (settings.ads.head_enabled && settings.ads.head_code && !document.getElementById('adsHeadCode')) {
        var h = document.createElement('div');
        h.id = 'adsHeadCode'; h.style.display = 'none';
        h.innerHTML = settings.ads.head_code;
        document.head.appendChild(h);
      }
      if (settings.ads.body_enabled && settings.ads.body_code) {
        var b = document.getElementById('adsBodySlot');
        if (b && !b.innerHTML.trim()) b.innerHTML = settings.ads.body_code;
      }
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    initTheme();
    document.getElementById('year').textContent = new Date().getFullYear();
    Promise.all([
      fetchJSON('data/movies.json').catch(function () { return []; }),
      fetchJSON('data/settings.json').catch(function () { return null; })
    ]).then(function (res) {
      movies = Array.isArray(res[0]) ? res[0] : [];
      settings = res[1];
      applySettings();
      renderCatChips();
      renderLangChips();
      renderContinueWatching();
      var featured = movies.filter(listed).filter(function (m) { return m.is_featured; });
      var heroList = featured.length ? featured : movies.filter(listed).slice(0, 5);
      if (heroList.length) { setHero(heroList); restartHero(heroList); }
      else { document.getElementById('heroTitle').textContent = 'No movies yet'; }
      applyFilter();
      initSearch();
    }).catch(function () {
      document.getElementById('heroTitle').textContent = 'Failed to load catalog';
    });
  }

  /* ---------- scroll reveal (always re-triggers) ---------- */
  function initReveal() {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          /* re-animate cards inside */
          var cards = e.target.querySelectorAll('.card');
          cards.forEach(function (c, i) {
            c.style.animation = 'none';
            void c.offsetWidth;
            c.style.animation = '';
          });
        } else {
          e.target.classList.remove('in');
        }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('.row-sec, .chips').forEach(function (el) {
      el.classList.add('reveal'); io.observe(el);
    });
    /* observe dynamically added rows */
    setInterval(function () {
      document.querySelectorAll('.row-sec:not(.reveal), .chips:not(.reveal)').forEach(function (el) {
        el.classList.add('reveal'); io.observe(el);
      });
    }, 2000);
  }

  /* ---------- push notifications for new movies ---------- */
  function initNotif() {
    var btn = document.getElementById('notifToggle');
    if (!btn || !('serviceWorker' in navigator) || !('Notification' in window)) {
      if (btn) btn.style.display = 'none';
      return;
    }
    function updateIcon() {
      try {
        btn.textContent = (localStorage.getItem('tnx_notif') === 'on' && Notification.permission === 'granted') ? '🔔' : '🔕';
        btn.style.opacity = localStorage.getItem('tnx_notif') === 'on' ? '1' : '.5';
      } catch (e) {}
    }
    updateIcon();
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      /* auto-reload when new version deployed */
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (nw) nw.addEventListener('statechange', function () {
          if (nw.state === 'activated') {
            toast('New update available — refreshing...');
            setTimeout(function () { location.reload(); }, 1500);
          }
        });
      });
      /* listen for id updates from SW */
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'ids') {
          try { localStorage.setItem('tnx_known_ids', JSON.stringify(e.data.ids)); } catch (err) {}
        }
      });
      btn.onclick = function () {
        var on = false;
        try { on = localStorage.getItem('tnx_notif') === 'on'; } catch (e) {}
        if (on) {
          try { localStorage.setItem('tnx_notif', 'off'); } catch (e) {}
          updateIcon();
          toast('Notifications off');
          return;
        }
        Notification.requestPermission().then(function (perm) {
          if (perm === 'granted') {
            try {
              localStorage.setItem('tnx_notif', 'on');
              /* seed known ids so existing movies don't trigger */
              var ids = movies.map(function (m) { return String(m.id); });
              localStorage.setItem('tnx_known_ids', JSON.stringify(ids));
            } catch (e) {}
            updateIcon();
            toast('Notun movie asle alert paba 🔔');
          } else {
            toast('Permission denied');
          }
        });
      };
      /* periodic check every 30 min */
      function checkNew() {
        var on = false, known = [];
        try {
          on = localStorage.getItem('tnx_notif') === 'on';
          known = JSON.parse(localStorage.getItem('tnx_known_ids') || '[]');
        } catch (e) {}
        if (on && Notification.permission === 'granted' && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'check-new', knownIds: known });
        }
      }
      setInterval(checkNew, 30 * 60 * 1000);
      setTimeout(checkNew, 10000);
    }).catch(function () { btn.style.display = 'none'; });
  }

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('DOMContentLoaded', function () { setTimeout(initReveal, 300); });
  document.addEventListener('DOMContentLoaded', function () { setTimeout(initNotif, 1500); });
})();
