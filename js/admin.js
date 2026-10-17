/* ============================================================
   TNxMovieZone Admin — GitHub-as-database
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
    site_name: 'TNxMovieZone',
    logo_url: '',
    embed_server: 'https://vidsrc.xyz/embed/movie/{tmdb}',
    tmdb_api_key: '',
    categories: ['Action', 'Comedy', 'Drama'],
    notice: '',
    dark_default: true,
    ads: { head_enabled: false, head_code: '', body_enabled: false, body_code: '' }
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
      '<td><label class="toggle-row" title="Listed / Unlisted"><input type="checkbox" class="toggle-input" ' + (m.listed === false ? '' : 'checked') + ' onchange="toggleListed(\'' + String(m.id).replace(/'/g, "\\'") + '\', this.checked)"><span class="toggle-sw toggle-sm"></span></label></td>' +
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
/* ---------- content type selector ---------- */
function escAttr(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
var CONTENT_TYPES = ['Movie', 'Web Series', 'Anime'];
function renderTypeSelect(selected) {
  var box = document.getElementById('typeSelect');
  if (!box) return;
  box.innerHTML = CONTENT_TYPES.map(function (t) {
    return '<span class="chip' + (t === selected ? ' on' : '') + '" data-type="' + escAttr(t) + '">' + esc(t) + '</span>';
  }).join('');
  var chips = box.querySelectorAll('.chip');
  for (var i = 0; i < chips.length; i++) {
    (function (ch) {
      ch.onclick = function () {
        box.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('on'); });
        ch.classList.add('on');
      };
    })(chips[i]);
  }
}
function getSelectedType() {
  var box = document.getElementById('typeSelect');
  if (!box) return 'Movie';
  var on = box.querySelector('.chip.on');
  return on ? on.getAttribute('data-type') : 'Movie';
}

/* ---------- category selector ---------- */
function getCatList() {
  var raw = (settings && settings.categories) || [];
  return raw.map(function (c) {
    return (c && typeof c === 'object') ? (c.label || c.id || '') : String(c);
  }).filter(Boolean);
}
function renderCatSelect(selectedGenre) {
  try {
  var box = document.getElementById('catSelect');
  var dd = document.getElementById('catDropdown');
  var cats = getCatList();
  var sel = (selectedGenre || '').toLowerCase().split(',').map(function (s) { return s.trim(); });
  /* dropdown */
  if (dd && box) {
    dd.innerHTML = '<option value="">— Category select koro —</option>' + cats.map(function (c) {
      return '<option value="' + escAttr(c) + '">' + esc(c) + '</option>';
    }).join('');
    dd.onchange = function () {
      if (!dd.value) return;
      /* toggle chip */
      var chips = box.querySelectorAll('.chip');
      for (var i = 0; i < chips.length; i++) {
        if (chips[i].getAttribute('data-cat') === dd.value) {
          chips[i].classList.add('on');
          syncGenreFromCats();
          break;
        }
      }
      dd.value = '';
    };
  }
  if (!box) return;
  box.innerHTML = cats.map(function (c) {
    var on = sel.indexOf(c.toLowerCase()) > -1;
    return '<span class="chip' + (on ? ' on' : '') + '" data-cat="' + escAttr(c) + '">' + esc(c) + '</span>';
  }).join('');
  var chips = box.querySelectorAll('.chip');
  for (var i = 0; i < chips.length; i++) {
    (function (ch) {
      ch.onclick = function () {
        ch.classList.toggle('on');
        syncGenreFromCats();
      };
    })(chips[i]);
  }
  } catch (e) { console.error('renderCatSelect:', e); }
}
function syncGenreFromCats() {
  var box = document.getElementById('catSelect');
  if (!box) return;
  var sel = [];
  box.querySelectorAll('.chip.on').forEach(function (ch) { sel.push(ch.getAttribute('data-cat')); });
  var cur = $('mGenre').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  /* merge: keep non-category genres, add selected */
  var cats = getCatList().map(function (c) { return c.toLowerCase(); });
  var keep = cur.filter(function (g) { return cats.indexOf(g.toLowerCase()) === -1; });
  $('mGenre').value = keep.concat(sel).join(', ');
}
function autoSelectCatsFromGenre() {
  renderCatSelect($('mGenre').value);
}
/* manual typing in genre field -> update chips live */
document.addEventListener('DOMContentLoaded', function () {
  var g = document.getElementById('mGenre');
  if (g) {
    var t;
    g.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () { renderCatSelect(g.value); }, 400);
    });
  }
  /* add custom category to site-wide list */
  var addBtn = document.getElementById('addCatBtn');
  if (addBtn) {
    addBtn.onclick = function () {
      var inp = document.getElementById('newCatInput');
      var val = (inp.value || '').trim();
      if (!val) { toast('Category name likho'); return; }
      var cats = getCatList();
      if (cats.map(function (c) { return c.toLowerCase(); }).indexOf(val.toLowerCase()) > -1) {
        toast('Ei category already ase'); return;
      }
      if (!settings) settings = {};
      /* handle both string[] and object[] formats */
      var raw = settings.categories || [];
      var isObj = raw.length && typeof raw[0] === 'object';
      raw.push(isObj ? { id: val.toLowerCase().replace(/\s+/g, '-'), label: val, subs: [] } : val);
      settings.categories = raw;
      persistSettings('Add custom category')
        .then(function () { toast('Category add hoise ✓'); inp.value = ''; renderCatSelect($('mGenre').value); })
        .catch(function () { toast('Save failed'); });
    };
  }
});

/* ---------- server list (global) ---------- */
function extractEmbedUrl(raw) {
  if (!raw) return '';
  raw = raw.trim();
  var m = raw.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (m) return m[1];
  m = raw.match(/src=["']([^"']+)["']/i);
  if (m && raw.indexOf('<') > -1) return m[1];
  return raw;
}
function getServers() {
  var out = [];
  (window._serverRows || []).forEach(function (row, i) {
    var nEl = row.querySelector('[data-srv="name"]');
    var uEl = row.querySelector('[data-srv="url"]');
    var name = (nEl ? nEl.value.trim() : '') || ('Server ' + (i + 1));
    var url = extractEmbedUrl(uEl ? uEl.value : '');
    if (url) out.push({ name: name, url: url });
  });
  return out;
}

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
  $('mReleaseDate').value = m ? (m.release_date || '') : '';
  $('mGenre').value = m ? (m.genre || '') : '';
  renderCatSelect(m ? (m.genre || '') : '');
  renderTypeSelect(m ? (m.content_type || 'Movie') : 'Movie');
  $('mLang').value = m ? (m.language || '') : '';
  $('mCountry').value = m ? (m.country || '') : '';
  $('mTmdb').value = m ? (m.tmdb_id || '') : '';
  $('mRating').value = m ? (m.rating || '') : '';
  $('mDuration').value = m ? (m.duration || '') : '';
  $('mDirector').value = m ? (m.director || '') : '';
  $('mCast').value = m ? (Array.isArray(m.cast) ? m.cast.map(function (c) { return (c && typeof c === 'object') ? (c.name || '') : String(c); }).join(', ') : (m.cast || '')) : '';
  /* ---------- dynamic server list ---------- */
  window._serverRows = [];
  function addServerRow(name, url) {
    var list = document.getElementById('serverList');
    if (!list) return;
    var idx = window._serverRows.length;
    var row = document.createElement('div');
    row.className = 'server-row';
    row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
    row.innerHTML =
      '<input type="text" placeholder="Server ' + (idx + 1) + '" value="' + escAttr(name || '') + '" data-srv="name" style="flex:0 0 110px;">' +
      '<input type="text" placeholder="https://... or <iframe>" value="' + escAttr(url || '') + '" data-srv="url" style="flex:1;">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-srv="del" style="flex:none;">✕</button>';
    list.appendChild(row);
    window._serverRows.push(row);
    row.querySelector('[data-srv="del"]').onclick = function () {
      row.remove();
      window._serverRows = window._serverRows.filter(function (r) { return r !== row; });
      renumberServers();
    };
  }
  function renumberServers() {
    window._serverRows.forEach(function (row, i) {
      var n = row.querySelector('[data-srv="name"]');
      if (n && !n.value) n.placeholder = 'Server ' + (i + 1);
    });
  }
  function setServers(list) {
    var box = document.getElementById('serverList');
    if (box) box.innerHTML = '';
    window._serverRows = [];
    (list || []).forEach(function (s) { addServerRow(s.name, s.url); });
    if (!window._serverRows.length) addServerRow('', '');
  }
  function bindAddServerBtn() {
    var btn = document.getElementById('addServerBtn');
    if (btn) btn.onclick = function () { addServerRow('', ''); };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAddServerBtn);
  } else {
    bindAddServerBtn();
  }
  $('mPoster').value = m ? (m.poster_url || '') : '';
  $('mBackdrop').value = m ? (m.backdrop_url || '') : '';
  $('mVideo') && ($('mVideo').value = '');
  var allSrv = [];
  if (m) {
    if (m.video_url) allSrv.push({ name: 'Server 1', url: m.video_url });
    (m.servers || []).forEach(function (s) { allSrv.push(s); });
  }
  setServers(allSrv);
  $('mDesc').value = m ? (m.description || '') : '';
  $('mTags').value = m ? ((Array.isArray(m.tags) ? m.tags.join(', ') : (m.tags || ''))) : '';
  $('mTrailer').value = m ? (m.trailer_url || '') : '';
  $('mQuality').value = m ? (m.quality || '') : '';
  $('mEpisodes').value = m ? (m.episodes || '') : '';
  $('mAge').value = m ? (m.age_rating || '') : '';
  $('mFeatured').checked = !!(m && m.is_featured);
  $('mTrending').checked = !!(m && m.is_trending);
  $('mListed').checked = !m || m.listed !== false;
  $('mDeleteBtn').style.display = m ? '' : 'none';
  $('tmdbSearch').value = m ? (m.title || '') : '';
  $('tmdbResults').style.display = 'none';
  window._tmdbCast = null;
  $('mPosterFile').value = ''; $('posterUploadStatus').textContent = '';
  $('mBackdropFile').value = ''; $('backdropUploadStatus').textContent = '';
  $('movieModal').classList.add('show');
  initTmdbSearch();
  initMovieImageUploads();
}

function closeMovieModal() {
  $('movieModal').classList.remove('show');
}

function collectMovie() {
  var id = $('mId').value || uid();
  var title = $('mTitle').value.trim();
  if (!title) { toast('Title is required.'); return null; }
  var servers = getServers();
  var video_url = servers.length ? servers[0].url : '';
  var extraServers = servers.slice(1);
  return {
    id: id,
    title: title,
    content_type: getSelectedType(),
    year: $('mYear').value.trim(),
    release_date: $('mReleaseDate').value,
    genre: $('mGenre').value.trim(),
    language: $('mLang').value.trim(),
    country: $('mCountry').value.trim(),
    tmdb_id: $('mTmdb').value.trim(),
    rating: $('mRating').value.trim(),
    duration: $('mDuration').value.trim(),
    director: $('mDirector').value.trim(),
    cast: (window._tmdbCast && window._tmdbCast.length &&
      window._tmdbCast.map(function (c) { return c.name; }).join(', ') === $('mCast').value.trim())
      ? window._tmdbCast : $('mCast').value.trim(),
    poster_url: $('mPoster').value.trim(),
    backdrop_url: $('mBackdrop').value.trim(),
    video_url: video_url,
    servers: extraServers,
    description: $('mDesc').value.trim(),
    tags: $('mTags').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
    trailer_url: $('mTrailer').value.trim(),
    quality: $('mQuality').value,
    episodes: $('mEpisodes').value.trim(),
    age_rating: $('mAge').value,
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
    })
    .catch(function (e) {
      /* 409 = SHA conflict (file changed elsewhere) — refetch latest SHA and retry once */
      if (e.status === 409) {
        return ghGet('data/movies.json').then(function (f) {
          moviesSha = f.sha;
          return ghPut('data/movies.json', JSON.stringify(movies, null, 2), moviesSha, message || 'Update movies');
        }).then(function (res) {
          moviesSha = res.content && res.content.sha ? res.content.sha : moviesSha;
          renderMovies();
        });
      }
      throw e;
    });
}

/* ---------- settings ---------- */
function renderSettings() {
  if (!settings) settings = defaultSettings();
  $('setSiteName').value = settings.site_name || '';
  $('setLogo').value = settings.logo_url || '';
  $('setEmbed').value = settings.embed_server || '';
  $('setWhatsApp').value = settings.request_whatsapp || '';
  $('setTelegram').value = settings.request_telegram || '';
  $('setTmdbKey').value = settings.tmdb_api_key || '';
  $('setNotice').value = settings.notice || '';
  $('setDarkDefault').checked = settings.dark_default !== false;
  $('setCats').value = (settings.categories || []).join('\n');
  initLogoUpload();
}

function saveSettings() {
  if (!settings) settings = defaultSettings();
  settings.site_name = $('setSiteName').value.trim() || 'TNxMovieZone';
  settings.logo_url = $('setLogo').value.trim();
  settings.embed_server = $('setEmbed').value.trim();
  settings.request_whatsapp = $('setWhatsApp').value.trim();
  settings.request_telegram = $('setTelegram').value.trim();
  settings.tmdb_api_key = $('setTmdbKey').value.trim();
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

function renderAds() {
  if (!settings) settings = defaultSettings();
  if (!settings.ads) settings.ads = { head_enabled: false, head_code: '', body_enabled: false, body_code: '' };
  $('adsHeadEnabled').checked = !!settings.ads.head_enabled;
  $('adsHead').value = settings.ads.head_code || '';
  $('adsBodyEnabled').checked = !!settings.ads.body_enabled;
  $('adsBody').value = settings.ads.body_code || '';
}
function saveAds() {
  if (!settings) settings = defaultSettings();
  settings.ads = {
    head_enabled: $('adsHeadEnabled').checked,
    head_code: $('adsHead').value,
    body_enabled: $('adsBodyEnabled').checked,
    body_code: $('adsBody').value
  };
  persistSettings('Update ads')
    .then(function () { toast('Ads saved ✓'); })
    .catch(function (e) { toast('Save failed: ' + e.message); });
}
window.saveAds = saveAds;

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
  if (name === 'ads') renderAds();
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
window.toggleListed = toggleListed;

function toggleListed(id, checked) {
  for (var i = 0; i < movies.length; i++) {
    if (String(movies[i].id) === String(id)) {
      movies[i].listed = !!checked;
      break;
    }
  }
  persistMovies(checked ? 'List movie' : 'Unlist movie')
    .then(function () { renderMovies(); toast(checked ? 'Listed ✓' : 'Unlisted ✓'); })
    .catch(function (e) { toast('Failed: ' + e.message); renderMovies(); });
}
window.quickDelete = quickDelete;
window.filterMovieTable = filterMovieTable;
window.saveSettings = saveSettings;
window.saveCategories = saveCategories;
window.switchTab = switchTab;

function initLogoUpload() {
  var inp = $('logoFile');
  if (!inp || inp._init) return;
  inp._init = true;
  inp.addEventListener('change', function () {
    var file = inp.files[0];
    if (!file) return;
    var status = $('logoUploadStatus');
    status.textContent = 'Uploading…';
    status.style.color = '#888';
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = String(reader.result).split(',')[1];
      var ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].indexOf(ext) < 0) ext = 'png';
      var path = 'logo/logo-' + Date.now() + '.' + ext;
      var body = { message: 'Upload site logo', content: base64, branch: gh.branch };
      fetch('https://api.github.com' + repoPath(path), {
        method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body)
      }).then(function (r) {
        if (!r.ok) throw new Error('Upload failed: ' + r.status);
        return r.json();
      }).then(function (d) {
        var url = 'https://' + gh.owner + '.github.io/' + gh.repo + '/' + path;
        // For user.github.io repos the path is root
        if (/\.github\.io$/.test(gh.repo)) url = 'https://' + gh.owner + '.github.io/' + path;
        $('setLogo').value = url;
        status.textContent = 'Uploaded ✓ — Save Settings chap dao';
        status.style.color = '#4ade80';
        toast('Logo uploaded ✓');
      }).catch(function (e) {
        status.textContent = 'Error: ' + e.message;
        status.style.color = '#f66';
      });
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- Movie poster/backdrop upload from device ---------- */
function uploadMovieImage(file, folder, urlFieldId, statusId) {
  var status = $(statusId);
  status.textContent = 'Uploading… (4K ok)';
  status.style.color = '#888';
  var reader = new FileReader();
  reader.onload = function () {
    var base64 = String(reader.result).split(',')[1];
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].indexOf(ext) < 0) ext = 'jpg';
    var path = folder + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    var body = { message: 'Upload movie ' + folder.slice(0, -1), content: base64, branch: gh.branch };
    fetch('https://api.github.com' + repoPath(path), {
      method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('Upload failed: ' + r.status);
      return r.json();
    }).then(function () {
      var url = 'https://' + gh.owner + '.github.io/' + gh.repo + '/' + path;
      if (/\.github\.io$/.test(gh.repo)) url = 'https://' + gh.owner + '.github.io/' + path;
      $(urlFieldId).value = url;
      status.textContent = 'Uploaded ✓';
      status.style.color = '#4ade80';
      toast('Image uploaded ✓');
    }).catch(function (e) {
      status.textContent = 'Error: ' + e.message;
      status.style.color = '#f66';
    });
  };
  reader.readAsDataURL(file);
}
function initMovieImageUploads() {
  var pf = $('mPosterFile');
  if (pf && !pf._init) {
    pf._init = true;
    pf.addEventListener('change', function () {
      if (pf.files[0]) uploadMovieImage(pf.files[0], 'posters', 'mPoster', 'posterUploadStatus');
    });
  }
  var bf = $('mBackdropFile');
  if (bf && !bf._init) {
    bf._init = true;
    bf.addEventListener('change', function () {
      if (bf.files[0]) uploadMovieImage(bf.files[0], 'backdrops', 'mBackdrop', 'backdropUploadStatus');
    });
  }
}

/* ---------- Logo upload from device ---------- */
function removeLogo() {
  var url = $('setLogo').value.trim();
  $('setLogo').value = '';
  $('logoUploadStatus').textContent = 'Logo removed — Save Settings chap dao';
  $('logoUploadStatus').style.color = '#f66';
  // If the logo was hosted in this repo, delete the file too
  var m = url.match(/github\.io\/(.+)$/);
  if (m && gh && gh.owner) {
    var path = m[1];
    // Only delete files under logo/ to be safe
    if (path.indexOf('logo/') === 0) {
      ghGet(path).then(function (d) {
        return fetch('https://api.github.com' + repoPath(path), {
          method: 'DELETE', headers: ghHeaders(),
          body: JSON.stringify({ message: 'Remove site logo', sha: d.sha, branch: gh.branch })
        });
      }).then(function () { toast('Logo file deleted ✓'); })
      .catch(function () { /* ignore — file may not exist */ });
    }
  }
  toast('Logo removed — Save Settings chap dao');
}
window.removeLogo = removeLogo;

/* ---------- TMDB auto-fill ---------- */
var _tmdbTimer = null;
var DEFAULT_TMDB_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlYmRjYjNmMGEwNjExMTU1N2M4MWJhYTc0ZjJhZThlYiIsIm5iZiI6MTc5MTc0MTU2Ny43MDU5OTk5LCJzdWIiOiI2YWNiY2U3ZmIxNTk1OGYxZjhjZjRkNTkiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.X3LdC9Jzqh3ouyDrCooPdygDrExJZyL-dwgtTZ2Vl_k';
function tmdbKey() {
  var k = (settings && settings.tmdb_api_key || '').trim();
  return k || DEFAULT_TMDB_KEY;
}
function tmdbFetch(url) {
  var key = tmdbKey();
  var headers = { 'Accept': 'application/json' };
  // v4 JWT token (starts with eyJ) uses Bearer header; v3 key uses api_key param
  if (key.indexOf('eyJ') === 0) {
    headers['Authorization'] = 'Bearer ' + key;
  } else {
    url += (url.indexOf('?') > -1 ? '&' : '?') + 'api_key=' + encodeURIComponent(key);
  }
  return fetch(url, { headers: headers }).then(function (r) { return r.json(); });
}

function initTmdbSearch() {
  var inp = $('tmdbSearch');
  if (!inp || inp._tmdbInit) return;
  inp._tmdbInit = true;
  inp.addEventListener('input', function () {
    clearTimeout(_tmdbTimer);
    var q = inp.value.trim();
    var box = $('tmdbResults');
    if (q.length < 2) { box.style.display = 'none'; box.innerHTML = ''; return; }
    if (!tmdbKey()) { box.style.display = 'block'; box.innerHTML = '<div style="padding:12px;color:#f66;">TMDB API key set koro Site Settings-e.</div>'; return; }
    _tmdbTimer = setTimeout(function () { tmdbSearch(q); }, 400);
  });
  document.addEventListener('click', function (e) {
    var box = $('tmdbResults');
    if (box && !document.getElementById('tmdbSearchWrap').contains(e.target)) { box.style.display = 'none'; }
  });
}

function tmdbSearch(q) {
  var box = $('tmdbResults');
  box.style.display = 'block';
  box.innerHTML = '<div style="padding:12px;color:#888;">Searching…</div>';
  Promise.all([
    tmdbFetch('https://api.themoviedb.org/3/search/movie?query=' + encodeURIComponent(q) + '&include_adult=false').catch(function () { return { results: [] }; }),
    tmdbFetch('https://api.themoviedb.org/3/search/tv?query=' + encodeURIComponent(q) + '&include_adult=false').catch(function () { return { results: [] }; })
  ]).then(function (res) {
      var movies = (res[0].results || []).slice(0, 6).map(function (m) { m._type = 'movie'; return m; });
      var tvs = (res[1].results || []).slice(0, 6).map(function (m) { m._type = 'tv'; return m; });
      var list = movies.concat(tvs);
      if (!list.length) { box.innerHTML = '<div style="padding:12px;color:#888;">Kichu paini.</div>'; return; }
      box.innerHTML = list.map(function (m) {
        var isTv = m._type === 'tv';
        var title = isTv ? m.name : m.title;
        var yr = ((isTv ? m.first_air_date : m.release_date) || '').slice(0, 4);
        var poster = m.poster_path ? 'https://image.tmdb.org/t/p/w92' + m.poster_path : '';
        return '<div class="tmdb-item" data-id="' + m.id + '" data-type="' + m._type + '" style="display:flex;gap:10px;align-items:center;padding:8px;cursor:pointer;border-radius:8px;" onmouseover="this.style.background=\'rgba(139,92,246,.12)\'" onmouseout="this.style.background=\'\'">' +
          (poster ? '<img src="' + poster + '" style="width:36px;height:54px;object-fit:cover;border-radius:6px;">' : '') +
          '<div><div style="font-weight:600;">' + esc(title) + (isTv ? ' <span style="font-size:11px;background:#8b5cf6;color:#fff;padding:1px 6px;border-radius:4px;">📺 TV</span>' : '') + '</div><div style="font-size:12px;color:#888;">' + yr + (m.original_language ? ' • ' + m.original_language.toUpperCase() : '') + '</div></div></div>';
      }).join('');
      box.querySelectorAll('.tmdb-item').forEach(function (el) {
        el.addEventListener('click', function () { tmdbFillMovie(el.getAttribute('data-id'), el.getAttribute('data-type')); });
      });
    })
    .catch(function (e) { box.innerHTML = '<div style="padding:12px;color:#f66;">Error: ' + esc(e.message) + '</div>'; });
}

function tmdbFillMovie(id, type) {
  type = type === 'tv' ? 'tv' : 'movie';
  var box = $('tmdbResults');
  box.innerHTML = '<div style="padding:12px;color:#888;">Loading details…</div>';
  tmdbFetch('https://api.themoviedb.org/3/' + type + '/' + id + '?append_to_response=credits')
    .then(function (m) {
      box.style.display = 'none';
      var isTv = type === 'tv';
      $('mTitle').value = isTv ? (m.name || '') : (m.title || '');
      $('mYear').value = ((isTv ? m.first_air_date : m.release_date) || '').slice(0, 4);
      $('mReleaseDate').value = (isTv ? m.first_air_date : m.release_date) || '';
      $('mGenre').value = (m.genres || []).map(function (g) { return g.name; }).join(', ');
      autoSelectCatsFromGenre();
      var langNames = { en: 'English', hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', mr: 'Marathi', pa: 'Punjabi', ur: 'Urdu', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ar: 'Arabic', tr: 'Turkish', ru: 'Russian' };
      var langs = (m.spoken_languages || []).map(function (l) { return langNames[l.iso_639_1] || l.english_name || l.iso_639_1; }).filter(Boolean);
      if (!langs.length && m.original_language) langs = [langNames[m.original_language] || m.original_language];
      $('mLang').value = langs.join(', ');
      $('mCountry').value = (m.production_countries || []).map(function (c) { return c.name; }).join(', ');
      $('mTmdb').value = m.id || '';
      $('mRating').value = m.vote_average ? Number(m.vote_average).toFixed(1) : '';
      if (isTv) {
        var ep = (m.episode_run_time || [])[0];
        $('mDuration').value = ep ? ep + 'm / episode' : '';
        if (m.number_of_episodes) $('mEpisodes').value = m.number_of_episodes;
        /* auto-set content type to Web Series for TV */
        var typeBox = document.getElementById('typeSelect');
        if (typeBox) {
          typeBox.querySelectorAll('.chip').forEach(function (c) {
            c.classList.toggle('on', c.getAttribute('data-type') === 'Web Series');
          });
        }
      } else {
        $('mDuration').value = m.runtime ? Math.floor(m.runtime / 60) + 'h ' + (m.runtime % 60) + 'm' : '';
      }
      var dir = (m.credits && m.credits.crew || []).filter(function (c) { return c.job === 'Director'; });
      $('mDirector').value = dir.length ? dir[0].name : '';
      window._tmdbCast = (m.credits && m.credits.cast || []).slice(0, 12).map(function (c) {
        return { name: c.name || '', character: c.character || '', photo: c.profile_path ? 'https://image.tmdb.org/t/p/w185' + c.profile_path : '' };
      }).filter(function (c) { return c.name; });
      $('mCast').value = window._tmdbCast.map(function (c) { return c.name; }).join(', ');
      $('mPoster').value = m.poster_path ? 'https://image.tmdb.org/t/p/original' + m.poster_path : '';
      $('mBackdrop').value = m.backdrop_path ? 'https://image.tmdb.org/t/p/original' + m.backdrop_path : '';
      $('mDesc').value = m.overview || '';
      $('tmdbSearch').value = isTv ? (m.name || '') : (m.title || '');
      /* fetch TMDB keywords for smart search tags */
      tmdbFetch('https://api.themoviedb.org/3/' + type + '/' + id + '/keywords').then(function (k) {
        var kw = ((k.keywords || k.results) || []).map(function (x) { return x.name; }).filter(Boolean).slice(0, 10);
        if (kw.length) $('mTags').value = kw.join(', ');
      }).catch(function () {});
      /* fetch TMDB trailer */
      tmdbFetch('https://api.themoviedb.org/3/' + type + '/' + id + '/videos').then(function (v) {
        var vids = v.results || [];
        var tr = vids.filter(function (x) { return x.site === 'YouTube' && x.type === 'Trailer'; })[0]
              || vids.filter(function (x) { return x.site === 'YouTube'; })[0];
        if (tr) $('mTrailer').value = 'https://www.youtube.com/watch?v=' + tr.key;
      }).catch(function () {});
      toast('TMDB theke fill hoise ✓');
    })
    .catch(function (e) { toast('TMDB error: ' + e.message); });
}
window.tmdbFillMovie = tmdbFillMovie;
