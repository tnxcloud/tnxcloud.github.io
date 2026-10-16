/* VioletFlex — watch page: multi-server player with auto-failover */
(function () {
  'use strict';

  var movie = null;
  var settings = null;
  var servers = [];       // [{name, url, type}]
  var activeIdx = 0;
  var probeTimer = null;

  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function fetchJSON(url) {
    return fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function toast(msg, ms) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, ms || 3200);
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

  /* ---------- server list ---------- */
  function buildServers() {
    servers = [];
    if (movie.video_url) {
      servers.push({ name: 'Server 1', url: movie.video_url, type: 'direct' });
    }
    var tmpl = settings && settings.embed_server;
    if (movie.tmdb_id && tmpl) {
      servers.push({ name: 'Server 2', url: tmpl.replace('{tmdb}', encodeURIComponent(movie.tmdb_id)), type: 'embed' });
    }
    var extra = movie.servers || [];
    for (var i = 0; i < extra.length; i++) {
      var s = extra[i];
      if (s && s.url) servers.push({ name: s.name || ('Server ' + (servers.length + 1)), url: s.url, type: 'embed' });
    }
  }

  function renderServerBtns() {
    var wrap = document.getElementById('serverBtns');
    if (!wrap) return;
    wrap.innerHTML = '';
    servers.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'srv-btn' + (i === activeIdx ? ' on' : '');
      b.textContent = s.name;
      b.onclick = function () { switchServer(i, false); };
      wrap.appendChild(b);
    });
    if (!servers.length) {
      wrap.innerHTML = '<span style="color:var(--text-faint);font-size:.88rem">No playable servers for this title yet.</span>';
    }
  }

  /* ---------- player ---------- */
  function isDirectVideo(url) {
    return /\.(mp4|webm|m3u8|mkv)(\?|#|$)/i.test(url);
  }

  function loadServer(i) {
    var frame = document.getElementById('playerFrame');
    var loading = document.getElementById('playerLoading');
    if (!frame) return;
    // Remove old player nodes
    var olds = frame.querySelectorAll('iframe, video');
    for (var k = 0; k < olds.length; k++) olds[k].remove();
    if (loading) loading.style.display = 'grid';

    var s = servers[i];
    if (!s) { if (loading) loading.style.display = 'none'; return; }

    var el;
    if (s.type === 'direct' || isDirectVideo(s.url)) {
      el = document.createElement('video');
      el.src = s.url;
      el.controls = true;
      el.autoplay = true;
      el.playsInline = true;
      el.style.position = 'absolute';
      el.style.inset = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      el.addEventListener('error', function () { onServerError(i); }, true);
      el.addEventListener('canplay', function () { if (loading) loading.style.display = 'none'; });
    } else {
      el = document.createElement('iframe');
      el.src = s.url;
      el.allowFullscreen = true;
      el.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
      el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
      el.addEventListener('load', function () { if (loading) loading.style.display = 'none'; });
    }
    frame.appendChild(el);

    // Probe: if still loading after 12s on an embed, offer next server
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = setTimeout(function () {
      if (loading && loading.style.display !== 'none' && servers.length > 1) {
        toast(s.name + ' seems slow — tap another server if it stays stuck.');
      }
    }, 12000);
  }

  function onServerError(failedIdx) {
    var next = failedIdx + 1;
    if (next < servers.length) {
      toast(servers[failedIdx].name + ' failed — switching to ' + servers[next].name + '…');
      switchServer(next, true);
    } else {
      toast('All servers failed. Please try again later.');
      var loading = document.getElementById('playerLoading');
      if (loading) {
        loading.style.display = 'grid';
        loading.innerHTML = '<div style="text-align:center;padding:20px">😞<br><br>Playback failed on all servers.</div>';
      }
    }
  }

  function switchServer(i, auto) {
    activeIdx = i;
    renderServerBtns();
    loadServer(i);
    if (!auto) toast('Switched to ' + servers[i].name);
  }

  /* ---------- boot ---------- */
  function boot() {
    initTheme();
    document.getElementById('year').textContent = new Date().getFullYear();
    var id = qs('id');
    if (!id) { document.getElementById('wTitle').textContent = 'Video not found'; return; }

    Promise.all([
      fetchJSON('data/movies.json').catch(function () { return []; }),
      fetchJSON('data/settings.json').catch(function () { return null; })
    ]).then(function (res) {
      var movies = Array.isArray(res[0]) ? res[0] : [];
      settings = res[1];
      if (settings && settings.site_name) {
        var fn = document.getElementById('footName');
        if (fn) fn.textContent = settings.site_name;
      }
      for (var i = 0; i < movies.length; i++) {
        if (String(movies[i].id) === String(id)) { movie = movies[i]; break; }
      }
      if (!movie) { document.getElementById('wTitle').textContent = 'Video not found'; return; }

      document.title = 'Watch ' + movie.title + ' — ' + (settings && settings.site_name ? settings.site_name : 'VioletFlex');
      document.getElementById('wTitle').textContent = movie.title + (movie.year ? ' (' + movie.year + ')' : '');
      document.getElementById('wBack').href = 'movie.html?id=' + encodeURIComponent(movie.id);
      document.getElementById('wDetails').href = 'movie.html?id=' + encodeURIComponent(movie.id);

      buildServers();
      renderServerBtns();
      if (servers.length) loadServer(0);
      else {
        var loading = document.getElementById('playerLoading');
        if (loading) {
          loading.style.display = 'grid';
          loading.innerHTML = '<div style="text-align:center;padding:20px">No servers available for this title yet.</div>';
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
