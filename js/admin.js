/* ============================================================
   VioletFlex Admin — GitHub-as-database
   Reliable login: called directly from button onclick.
   No <form> element anywhere in the login flow.
   ============================================================ */
'use strict';

/* ---------- state ---------- */
var gh = null;              // {token, owner, repo, branch}
var movies = [];
var moviesSha = null;
var settings = null;
var settingsSha = null;

/* ---------- helpers ---------- */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function toast(msg, ms) {
  var t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, ms || 3000);
}
function showErr(msg) {
  var e = $('loginError');
  if (e) { e.textContent = msg; e.classList.add('show'); }
}
function hideErr() {
  var e = $('loginError');
  if (e) { e.classList.remove('show'); e.textContent = ''; }
}
function b64encodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decodeUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));
}
function uid() {
  return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- GitHub API ---------- */
function ghHeaders() {
  return {
    'Authorization': 'Bearer ' + gh.token,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
}
function repoPath(p) {
  return '/repos/' + gh.owner + '/' + gh.repo + '/contents/' + p;
}
function ghGet(path) {
  return fetch('https://api.github.com' + repoPath(path) + '?ref=' + encodeURIComponent(gh.branch), { headers: ghHeaders() })
    .then(function (r) {
      if (!r.ok) {
        var err = new Error('GitHub API error: ' + r.status);
        err.status = r.status;
        throw err;
      }
      return r.json();
    });
}
function ghPut(path, contentStr, sha, message) {
  var body = { message: message, content: b64encodeUtf8(contentStr), branch: gh.branch };
  if (sha) body.sha = sha;
  return fetch('https://api.github.com' + repoPath(path), {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify(body)
  }).then(function (r) {
    if (!r.ok) {
      var err = new Error('GitHub save failed: ' + r.status);
      err.status = r.status;
      throw err;
    }
    return r.json();
  });
}

/* ============================================================
   LOGIN — called directly via onclick="doAdminLogin()"
   ============================================================ */
function doAdminLogin() {
  hideErr();
  var btn = $('loginBtn');
  var token = $('ghToken').value.trim();
  var owner = $('ghOwner').value.trim();
  var repo = $('ghRepo').value.trim();
  var branch = $('ghBranch').value.trim() || 'main';

  if (!token) { showErr('Please paste your GitHub token.'); return; }
  if (!owner || !repo) { showErr('Owner and repository are required.'); return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Connecting...'; }

  var creds = { token: token, owner: owner, repo: repo, branch: branch };
  gh = creds;

  // Validate: fetch repo info
  fetch('https://api.github.com/repos/' + owner + '/' + repo, { headers: ghHeaders() })
    .then(function (r) {
      if (r.status === 401) throw new Error('Invalid token. Check it and try again.');
      if (r.status === 404) throw new Error('Repository not found. Check owner/repo.');
      if (!r.ok) throw new Error('GitHub error: ' + r.status);
      return r.json();
    })
    .then(function () {
      // Save creds (token included) for this browser only
      try { localStorage.setItem('vf_admin', JSON.stringify(creds)); } catch (e) {}
      // Clear the token field for security
      $('ghToken').value = '';
      enterDashboard();
    })
    .catch(function (e) {
      gh = null;
      showErr(e.message || 'Connection failed.');
      if (btn) { btn.disabled = false; btn.textContent = 'Connect'; }
    });
}

/* Auto-login if saved creds exist (token field stays empty) */
function tryAutoLogin() {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('vf_admin') || 'null'); } catch (e) {}
  if (!saved || !saved.token) return false;
  gh = saved;
  fetch('https://api.github.com/repos/' + gh.owner + '/' + gh.repo, { headers: ghHeaders() })
    .then(function (r) {
      if (!r.ok) throw new Error('invalid');
      enterDashboard();
    })
    .catch(function () {
      gh = null;
      try { localStorage.removeItem('vf_admin'); } catch (e) {}
    });
  return true;
}

function doLogout() {
  try { localStorage.removeItem('vf_admin'); } catch (e) {}
  gh = null;
  location.reload();
}

/* ---------- dashboard ---------- */
function enterDashboard() {
  $('loginView').style.display = 'none';
  $('dashView').style.display = 'block';
  loadAll();
}

function loadAll() {
  Promise.all([loadMovies(), loadSettings()]).catch(function (e) {
    toast('Load error: ' + e.message);
  });
}

function loadMovies() {
  var tbody = $('moviesTbody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-faint)">Loading...</td></tr>';
  return ghGet('data/movies.json')
    .then(function (data) {
      moviesSha = data.sha;
      var parsed = JSON.parse(b64decodeUtf8(data.content));
      movies = Array.isArray(parsed) ? parsed : [];
      renderMovies();
    })
    .catch(function (e) {
      if (e.status === 404) {
        movies = []; moviesSha = null;
        renderMovies();
      } else { throw e; }
    });
}

function loadSettings() {
  return ghGet('data/settings.json')
    .then(function (data) {
      settingsSha = data.sha;
      settings = JSON.parse(b64decodeUtf8(data.content));
      renderSettings();
    })
    .catch(function (e) {
      if (e.status === 404) {
        settings = defaultSettings(); settingsSha = null;
        renderSettings();
      } else { throw e; }
    });
}

function defaultSettings() {
  return {
    site_name: 'VioletFlex',
    logo_url: '',
    embed_server: 'https://vidsrc.xyz/embed/movie/{tmdb}',
    categories: ['Action', 'Comedy', 'Drama'],
    notice: '',
    dark_default: true,
    ads: { enabled: false, head_code: '', body_code: '' }
  };
}

/* ---------- movies table ---------- */
function renderMovies() {
  var tbody = $('moviesTbody');
  var total = movies.length;
  var feat = movies.filter(function (m) { return m.is_featured; }).length;
  var tren = movies.filter(function (m) { return m.is_trending; }).length;
  var hidden = movies.filter(function (m) { return m.listed === false; }).length;
  $('stTotal').textContent = total;
  $('stFeatured').textContent = feat;
  $('stTrending').textContent = tren;
  $('stHidden').textContent = hidden;

  if (!movies.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-faint);padding:30px">No movies yet. Click "+ Add Movie".</td></tr>';
    return;
  }
  tbody.innerHTML = movies.map(function (m) {
    var flags = [];
    if (m.is_featured) flags.push('✨');
    if (m.is_trending) flags.push('🔥');
    return '<tr>' +
      '<td>' + (m.poster_url ? '<img class="tbl-poster" src="' + esc(m.poster_url) + '" alt="">' : '<span style="color:var(--text-faint)">—</span>') + '</td>' +
      '<td><strong>' + esc(m.title || 'Untitled') + '</strong></td>' +
      '<td>' + esc(m.year || '—') + '</td>' +
      '<td>' + esc(m.genre || '—') + '</td>' +
      '<td>' + flags.join(' ') + '</td>' +
      '<td>' + (m.listed === false
        ? '<span class="pill" style="color:var(--warn)">Unlisted</span>'
        : '<span class="pill" style="color:var(--success)">Listed</span>') + '</td>' +
      '<td><div class="row-actions">' +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="openMovieModal(\'' + String(m.id).replace(/'/g, "\\'") + '\')">Edit</button>' +
      '<button type="button" class="btn btn-danger btn-sm" onclick="quickDelete(\'' + String(m.id).replace(/'/g, "\\'") + '\')">Delete</button>' +
      '</div></td></tr>';
  }).join('');
}

function filterMovieTable() {
  var q = $('movieSearch').value.trim().toLowerCase();
  var rows = $('moviesTbody').querySelectorAll('tr');
  rows.forEach(function (tr) {
    tr.style.display = tr.textContent.toLowerCase().indexOf(q) > -1 ? '' : 'none';
  });
}

/* ---------- movie modal ---------- */
function openMovieModal(id) {
  var m = null;
  if (id) {
    for (var i = 0; i < movies.length; i++) {
      if (String(movies[i].id) === String(id)) { m = movies[i]; break; }
    }
  }
  $('modalTitle').textContent = m ? 'Edit Movie' : 'Add Movie';
  $('mId').value = m ? m.id : '';
  $('mTitle').value = m ? (m.title || '') : '';
  $('mYear').value = m ? (m.year || '') : '';
  $('mGenre').value = m ? (m.genre || '') : '';
  $('mTmdb').value = m ? (m.tmdb_id || '') : '';
  $('mRating').value = m ? (m.rating || '') : '';
  $('mDuration').value = m ? (m.duration || '') : '';
  $('mDirector').value = m ? (m.director || '') : '';
  $('mCast').value = m ? (Array.isArray(m.cast) ? m.cast.join(', ') : (m.cast || '')) : '';
  $('mPoster').value = m ? (m.poster_url || '') : '';
  $('mBackdrop').value = m ? (m.backdrop_url || '') : '';
  $('mVideo').value = m ? (m.video_url || '') : '';
  var srvLines = [];
  (m && m.servers || []).forEach(function (s) { srvLines.push((s.name || '') + '|' + (s.url || '')); });
  $('mServers').value = srvLines.join('\n');
  $('mDesc').value = m ? (m.description || '') : '';
  $('mFeatured').checked = !!(m && m.is_featured);
  $('mTrending').checked = !!(m && m.is_trending);
  $('mListed').checked = !m || m.listed !== false;
  $('mDeleteBtn').style.display = m ? '' : 'none';
  $('movieModal').classList.add('show');
}

function closeMovieModal() {
  $('movieModal').classList.remove('show');
}

function collectMovie() {
  var id = $('mId').value || uid();
  var title = $('mTitle').value.trim();
  if (!title) { toast('Title is required.'); return null; }
  var servers = [];
  $('mServers').value.split('\n').forEach(function (line) {
    line = line.trim();
    if (!line) return;
    var parts = line.split('|');
    if (parts.length >= 2) servers.push({ name: parts[0].trim(), url: parts.slice(1).join('|').trim() });
    else servers.push({ name: 'Server', url: line });
  });
  return {
    id: id,
    title: title,
    year: $('mYear').value.trim(),
    genre: $('mGenre').value.trim(),
    tmdb_id: $('mTmdb').value.trim(),
    rating: $('mRating').value.trim(),
    duration: $('mDuration').value.trim(),
    director: $('mDirector').value.trim(),
    cast: $('mCast').value.trim(),
    poster_url: $('mPoster').value.trim(),
    backdrop_url: $('mBackdrop').value.trim(),
    video_url: $('mVideo').value.trim(),
    servers: servers,
    description: $('mDesc').value.trim(),
    is_featured: $('mFeatured').checked,
    is_trending: $('mTrending').checked,
    listed: $('mListed').checked
  };
}

function saveMovie() {
  var m = collectMovie();
  if (!m) return;
  var idx = -1;
  for (var i = 0; i < movies.length; i++) {
    if (String(movies[i].id) === String(m.id)) { idx = i; break; }
  }
  if (idx > -1) movies[idx] = m;
  else movies.unshift(m);
  persistMovies('Add/update movie: ' + m.title)
    .then(function () { closeMovieModal(); toast('Movie saved ✓'); })
    .catch(function (e) { toast('Save failed: ' + e.message); });
}

function deleteMovie() {
  var id = $('mId').value;
  if (!id) return;
  if (!confirm('Delete this movie permanently?')) return;
  doDelete(id);
  closeMovieModal();
}

function quickDelete(id) {
  if (!confirm('Delete this movie permanently?')) return;
  doDelete(id);
}

function doDelete(id) {
  movies = movies.filter(function (m) { return String(m.id) !== String(id); });
  persistMovies('Delete movie')
    .then(function () { toast('Movie deleted ✓'); })
    .catch(function (e) { toast('Delete failed: ' + e.message); });
}

function persistMovies(message) {
  return ghPut('data/movies.json', JSON.stringify(movies, null, 2), moviesSha, message || 'Update movies')
    .then(function (res) {
      moviesSha = res.content && res.content.sha ? res.content.sha : moviesSha;
      renderMovies();
    });
}

/* ---------- settings ---------- */
function renderSettings() {
  if (!settings) settings = defaultSettings();
  $('setSiteName').value = settings.site_name || '';
  $('setLogo').value = settings.logo_url || '';
  $('setEmbed').value = settings.embed_server || '';
  $('setNotice').value = settings.notice || '';
  $('setDarkDefault').checked = settings.dark_default !== false;
  $('setCats').value = (settings.categories || []).join('\n');
}

function saveSettings() {
  if (!settings) settings = defaultSettings();
  settings.site_name = $('setSiteName').value.trim() || 'VioletFlex';
  settings.logo_url = $('setLogo').value.trim();
  settings.embed_server = $('setEmbed').value.trim();
  settings.notice = $('setNotice').value.trim();
  settings.dark_default = $('setDarkDefault').checked;
  persistSettings('Update site settings')
    .then(function () { toast('Settings saved ✓'); })
    .catch(function (e) { toast('Save failed: ' + e.message); });
}

function saveCategories() {
  if (!settings) settings = defaultSettings();
  settings.categories = $('setCats').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  persistSettings('Update categories')
    .then(function () { toast('Categories saved ✓'); })
    .catch(function (e) { toast('Save failed: ' + e.message); });
}

function persistSettings(message) {
  return ghPut('data/settings.json', JSON.stringify(settings, null, 2), settingsSha, message || 'Update settings')
    .then(function (res) {
      settingsSha = res.content && res.content.sha ? res.content.sha : settingsSha;
    });
}

/* ---------- tabs ---------- */
function switchTab(name) {
  var btns = document.querySelectorAll('.tab-btn');
  btns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === name); });
  var panes = document.querySelectorAll('.tab-pane');
  panes.forEach(function (p) { p.classList.toggle('on', p.id === 'tab-' + name); });
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', function () {
  // Token field is always empty on load — user pastes manually.
  $('ghToken').value = '';
  // Enter key in token field triggers login (no form needed)
  $('ghToken').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doAdminLogin(); }
  });
  // Modal backdrop click closes
  $('movieModal').addEventListener('click', function (e) {
    if (e.target === $('movieModal')) closeMovieModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMovieModal();
  });
  tryAutoLogin();
});

/* Expose globals for inline onclick handlers */
window.doAdminLogin = doAdminLogin;
window.doLogout = doLogout;
window.openMovieModal = openMovieModal;
window.closeMovieModal = closeMovieModal;
window.saveMovie = saveMovie;
window.deleteMovie = deleteMovie;
window.quickDelete = quickDelete;
window.filterMovieTable = filterMovieTable;
window.saveSettings = saveSettings;
window.saveCategories = saveCategories;
window.switchTab = switchTab;
