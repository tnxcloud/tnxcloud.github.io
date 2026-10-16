/* VioletFlex — homepage logic */
(function () {
  'use strict';

  var movies = [];
  var settings = null;
  var heroIdx = 0;
  var heroTimer = null;
  var activeCat = 'All';

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
    var rating = m.rating ? '<span class="imdb">★ ' + esc(m.rating) + '</span>' : '';
    return '<a class="card" href="movie.html?id=' + encodeURIComponent(m.id) + '" style="animation-delay:' + (i * 40) + 'ms">' +
      '<div class="card-poster">' +
      (m.poster_url ? '<img src="' + esc(m.poster_url) + '" alt="' + esc(m.title) + '" loading="lazy" decoding="async">' : '<div style="width:100%;height:100%;display:grid;place-items:center;background:var(--grad-soft);font-size:2rem">🎬</div>') +
      badge +
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
    var cats = ['All'].concat((settings && settings.categories) || []);
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

  function applyFilter() {
    var vis = movies.filter(listed);
    var trending = vis.filter(function (m) { return m.is_trending; });
    var latest = vis.slice().sort(function (a, b) {
      return String(b.release_date || b.year || '').localeCompare(String(a.release_date || a.year || ''));
    }).slice(0, 20);
    if (activeCat !== 'All') {
      var f = vis.filter(function (m) {
        return (m.genre || '').toLowerCase().split(/[,\/]/).map(function (s) { return s.trim(); }).indexOf(activeCat.toLowerCase()) > -1;
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
    var cats = (settings && settings.categories) || [];
    var html = '';
    cats.slice(0, 6).forEach(function (c) {
      var list = vis.filter(function (m) {
        return (m.genre || '').toLowerCase().indexOf(c.toLowerCase()) > -1;
      }).slice(0, 20);
      if (!list.length) return;
      html += '<section class="row-sec"><div class="row-head"><h2 class="row-title">' + esc(c) + '</h2></div>' +
        '<div class="poster-row">' + list.map(cardHTML).join('') + '</div></section>';
    });
    wrap.innerHTML = html;
  }

  /* ---------- search ---------- */
  function initSearch() {
    var input = document.getElementById('searchInput');
    var box = document.getElementById('searchResults');
    if (!input || !box) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) { box.classList.remove('show'); box.innerHTML = ''; return; }
      var hits = movies.filter(listed).filter(function (m) {
        return (m.title || '').toLowerCase().indexOf(q) > -1;
      }).slice(0, 8);
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

  document.addEventListener('DOMContentLoaded', boot);
})();
