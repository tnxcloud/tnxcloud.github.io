/* TNxMovieZone — movie detail logic */
(function () {
  'use strict';

  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fetchJSON(url) {
    return fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  function initTheme() {
    var t = localStorage.getItem('vf_theme') || 'dark';
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

  function cardHTML(m, i) {
    var rating = m.rating ? '<span class="imdb">★ ' + esc(m.rating) + '</span>' : '';
    return '<a class="card" href="movie.html?id=' + encodeURIComponent(m.id) + '" style="animation-delay:' + (i * 40) + 'ms">' +
      '<div class="card-poster">' +
      (m.poster_url ? '<img src="' + esc(m.poster_url) + '" alt="' + esc(m.title) + '" loading="lazy" decoding="async">' : '') +
      '<div class="card-play"><span>▶</span></div></div>' +
      '<div class="card-info"><div class="card-title">' + esc(m.title) + '</div>' +
      '<div class="card-sub"><span>' + esc(m.year || '') + '</span>' + rating + '</div></div></a>';
  }

  function boot() {
    initTheme();
    document.getElementById('year').textContent = new Date().getFullYear();
    var id = qs('id');
    if (!id) { document.getElementById('dTitle').textContent = 'Movie not found'; return; }

    Promise.all([
      fetchJSON('data/movies.json').catch(function () { return []; }),
      fetchJSON('data/settings.json').catch(function () { return null; })
    ]).then(function (res) {
      var movies = Array.isArray(res[0]) ? res[0] : [];
      var settings = res[1];
      if (settings && settings.site_name) {
        document.title = 'Movie — ' + settings.site_name;
        var fn = document.getElementById('footName');
        if (fn) fn.textContent = settings.site_name;
      }
      var m = null;
      for (var i = 0; i < movies.length; i++) {
        if (String(movies[i].id) === String(id)) { m = movies[i]; break; }
      }
      if (!m) { document.getElementById('dTitle').textContent = 'Movie not found'; return; }

      document.getElementById('dBackdrop').src = m.backdrop_url || m.poster_url || '';
      document.getElementById('dPoster').src = m.poster_url || '';
      document.getElementById('dTitle').textContent = m.title || '';
      if (m.quality) document.getElementById('dTitle').innerHTML = esc(m.title || '') + ' <span class="d-quality">' + esc(m.quality) + '</span>';
      document.getElementById('dMeta').innerHTML =
        (m.rating ? '<span class="imdb">★ ' + esc(m.rating) + '</span>' : '') +
        '<span>' + esc(m.year || '') + '</span>' +
        '<span>' + esc(m.genre || '') + '</span>' +
        (m.duration ? '<span>' + esc(m.duration) + '</span>' : '');
      document.getElementById('dDesc').textContent = m.description || 'No description available.';

      var extra = [];
      if (m.director) extra.push(['Director', m.director]);
      if (m.genre) extra.push(['Genre', m.genre]);
      if (m.language) extra.push(['Language', m.language]);
      if (m.country) extra.push(['Country', m.country]);
      if (m.release_date) extra.push(['Release Date', m.release_date]);
      document.getElementById('dExtra').innerHTML = extra.map(function (e) {
        return '<div class="extra-box"><div class="k">' + esc(e[0]) + '</div><div class="v">' + esc(e[1]) + '</div></div>';
      }).join('');

      document.getElementById('dWatch').href = 'watch.html?id=' + encodeURIComponent(m.id);
      /* trailer button */
      var trBtn = document.getElementById('dTrailer');
      if (trBtn) {
        if (m.trailer_url) { trBtn.href = m.trailer_url; trBtn.style.display = ''; }
        else trBtn.style.display = 'none';
      }
      /* share button */
      var shBtn = document.getElementById('dShare');
      if (shBtn) {
        shBtn.onclick = function () {
          var url = location.href;
          var text = '🎬 ' + (m.title || '') + ' — TNxMovieZone-e dekho!';
          if (navigator.share) {
            navigator.share({ title: m.title, text: text, url: url }).catch(function () {});
          } else {
            var wa = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url);
            window.open(wa, '_blank');
          }
        };
      }

      /* view counter */
      (function countView() {
        try {
          var key = 'tnx_views_' + m.id;
          var v = parseInt(localStorage.getItem(key) || '0', 10) + 1;
          localStorage.setItem(key, String(v));
          var el = document.getElementById('viewCount');
          if (el) el.textContent = '👁 ' + v.toLocaleString() + ' views';
        } catch (e) {}
      })();

      /* user star rating */
      (function initRating() {
        var box = document.getElementById('starsBox');
        var info = document.getElementById('ratingInfo');
        if (!box) return;
        var key = 'tnx_rating_' + m.id;
        var my = 0;
        try { my = parseInt(localStorage.getItem(key) || '0', 10); } catch (e) {}
        function draw(n) {
          var h = '';
          for (var i = 1; i <= 5; i++) h += '<span data-s="' + i + '" style="color:' + (i <= n ? '#ffc107' : 'var(--text-faint)') + ';">★</span>';
          box.innerHTML = h;
        }
        draw(my);
        if (info && my) info.textContent = 'Tumi ' + my + '/5 diso';
        box.querySelectorAll('span').forEach(function (s) {
          s.onclick = function () {
            var v = parseInt(s.getAttribute('data-s'), 10);
            try { localStorage.setItem(key, String(v)); } catch (e) {}
            draw(v);
            if (info) info.textContent = 'Tumi ' + v + '/5 diso';
          };
        });
      })();

      /* cast with photos from stored data */
      var castSec = document.getElementById('dCastSec');
      var castBox = document.getElementById('dCast');
      function renderCastList(arr) {
        if (!castSec || !castBox || !arr.length) return;
        castSec.style.display = '';
        castBox.innerHTML = arr.map(function (c) {
          var img = c.photo
            ? '<img src="' + esc(c.photo) + '" alt="' + esc(c.name) + '" loading="lazy" decoding="async">'
            : '<div class="cast-noimg">🎭</div>';
          return '<div class="cast-card">' + img +
            '<div class="cast-name">' + esc(c.name) + '</div>' +
            (c.character ? '<div class="cast-char">' + esc(c.character) + '</div>' : '') + '</div>';
        }).join('');
      }
      var castArr = [];
      if (Array.isArray(m.cast)) {
        castArr = m.cast.map(function (c) {
          if (c && typeof c === 'object') return { name: c.name || '', photo: c.photo || '', character: c.character || '' };
          return { name: String(c), photo: '', character: '' };
        }).filter(function (c) { return c.name; });
      } else if (m.cast) {
        castArr = String(m.cast).split(',').map(function (s) { return { name: s.trim(), photo: '', character: '' }; }).filter(function (c) { return c.name; });
      }
      renderCastList(castArr);

      // Related (same genre)
      var g = (m.genre || '').split(',')[0].trim().toLowerCase();
      var rel = movies.filter(function (x) {
        return String(x.id) !== String(m.id) && x.listed !== false &&
          (x.genre || '').toLowerCase().indexOf(g) > -1;
      }).slice(0, 15);
      document.getElementById('relatedRow').innerHTML =
        rel.length ? rel.map(cardHTML).join('') : '<div class="empty">No related titles.</div>';
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
