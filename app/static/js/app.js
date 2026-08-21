// ============ State ============
let currentUser = null;
let selectedHomeCoords = null; // { lat, lng } derived from the chosen country
let profileEditTarget = null; // which user id the profile modal is currently showing

const body = document.body;

// ============ Custom Confirm ============
function customConfirm(msg) {
  return new Promise(resolve => {
    document.getElementById('confirmMsg').textContent = msg;
    document.getElementById('confirmModal').classList.remove('hidden');
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    const close = (val) => {
      document.getElementById('confirmModal').classList.add('hidden');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      document.getElementById('confirmModal').removeEventListener('click', onBg);
      resolve(val);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onBg = (e) => { if (e.target === document.getElementById('confirmModal')) close(false); };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    document.getElementById('confirmModal').addEventListener('click', onBg);
  });
}

// ============ 3D Globe ============
const MARKER_COLORS = [
  '#8ab4f8','#f28b82','#81c995','#fdd663','#c58af9',
  '#ff8a80','#80cbc4','#ffab91','#a5d6a7','#90caf9',
  '#ce93d8','#ffcc80','#80deea','#ef9a9a','#b39ddb',
];
function markerColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return MARKER_COLORS[Math.abs(h) % MARKER_COLORS.length];
}

const globe = Globe()(document.getElementById('globeViz'))
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
  .backgroundColor('rgba(0,0,0,0)')
  .atmosphereColor('#8ab4f8')
  .atmosphereAltitude(0.18)
  .pointOfView({ lat: 41.3, lng: 69.2, altitude: 2.2 })
  .pointLabel(() => '')
  .onPointHover(handlePointHover)
  .onPointClick(handlePointClick);

window.addEventListener('resize', () => {
  globe.width(window.innerWidth).height(window.innerHeight);
});

fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
  .then(r => r.json())
  .then(countries => {
    globe
      .polygonsData(countries.features.filter(d => d.properties.ISO_A2 !== 'AQ'))
      .polygonCapColor(() => 'rgba(138,180,248,0.04)')
      .polygonSideColor(() => 'rgba(138,180,248,0.08)')
      .polygonStrokeColor(() => 'rgba(138,180,248,0.25)')
      .polygonAltitude(0.005);
  });

let markersById = {};

async function loadMarkers() {
  const res = await fetch('/api/markers');
  const markers = await res.json();

  const coordGroups = {};
  markers.forEach(m => {
    const key = `${m.lat.toFixed(2)},${m.lng.toFixed(2)}`;
    if (!coordGroups[key]) coordGroups[key] = [];
    coordGroups[key].push(m);
  });
  Object.values(coordGroups).forEach(group => {
    if (group.length > 1) {
      const baseR = 0.18 + group.length * 0.04;
      group.forEach((m, i) => {
        const angle = (2 * Math.PI * i) / group.length;
        const r = baseR + Math.random() * 0.08;
        m.lat += r * Math.cos(angle);
        m.lng += r * Math.sin(angle);
      });
    }
  });

  markersById = Object.fromEntries(markers.map(m => [m.id, m]));
  rawMarkers = markers;
  lastClusterAlt = -1;
  updateGlobeMarkers();
}
let rawMarkers = [];
let lastClusterAlt = -1;

function getClusterGridSize(altitude) {
  if (altitude < 1.2) return 0;
  if (altitude < 1.8) return 1.5;
  if (altitude < 2.5) return 3;
  return 5;
}

function clusterMarkers(markers, gridSize) {
  if (gridSize === 0) return markers.map(m => ({ ...m, _cluster: false, _items: [m] }));
  const clusters = {};
  markers.forEach(m => {
    const gLat = Math.round(m.lat / gridSize) * gridSize;
    const gLng = Math.round(m.lng / gridSize) * gridSize;
    const key = `${gLat},${gLng}`;
    if (!clusters[key]) clusters[key] = { lat: gLat + (Math.random() - 0.5) * gridSize * 0.3, lng: gLng + (Math.random() - 0.5) * gridSize * 0.3, _items: [] };
    clusters[key]._items.push(m);
  });
  return Object.values(clusters).map(c => {
    if (c._items.length === 1) return { ...c._items[0], _cluster: false };
    return { id: 'cluster-' + c.lat + ',' + c.lng, lat: c.lat, lng: c.lng, _cluster: true, _count: c._items.length, _items: c._items, author_avatar: c._items[0].author_avatar };
  });
}

function updateGlobeMarkers() {
  if (!rawMarkers.length) return;
  const alt = globe.pointOfView().altitude;
  const grid = getClusterGridSize(alt);
  if (grid === lastClusterAlt) return;
  lastClusterAlt = grid;
  const data = clusterMarkers(rawMarkers, grid);
  globe
    .htmlElementsData(data)
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(0.012)
    .htmlElement(m => {
      if (m._cluster && m._count > 1) {
        const el = document.createElement('div');
        el.className = 'globe-cluster-marker';
        el.textContent = m._count;
        el.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          globe.pointOfView({ lat: m.lat, lng: m.lng, altitude: Math.max(0.8, alt - 1) }, 600);
        });
        return el;
      }
      const item = m._items ? m._items[0] : m;
      const el = document.createElement('div');
      el.className = 'globe-avatar-marker';
      const img = document.createElement('img');
      img.src = item.author_avatar || '';
      img.onerror = () => { img.style.display = 'none'; el.style.background = markerColor(item.id); };
      el.appendChild(img);
      el.style.cursor = 'pointer';
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); handlePointClick(item); });
      el.addEventListener('pointerenter', () => handlePointHover(item));
      el.addEventListener('pointerleave', () => handlePointHover(null));
      return el;
    });
}

loadMarkers();
setInterval(loadMarkers, 10 * 60 * 1000);

let _zoomThrottle = null;
globe.onZoom(() => {
  if (_zoomThrottle) return;
  _zoomThrottle = setTimeout(() => { _zoomThrottle = null; updateGlobeMarkers(); }, 500);
});

// ============ Hover card ============
const hoverCard = document.getElementById('hoverCard');
let lastMouseX = 0, lastMouseY = 0;

document.getElementById('globeViz').addEventListener('mousemove', (e) => {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  if (!hoverCard.classList.contains('hidden')) positionHoverCard();
});

function positionHoverCard() {
  const pad = 16;
  const rect = hoverCard.getBoundingClientRect();
  let left = lastMouseX - rect.width - pad;
  let top = lastMouseY - rect.height / 2;
  if (left < 8) left = lastMouseX + pad;
  if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
  top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, top));
  hoverCard.style.left = `${left}px`;
  hoverCard.style.top = `${top}px`;
}

function handlePointHover(point) {
  if (!point) {
    hoverCard.classList.add('hidden');
    return;
  }
  document.getElementById('hover-avatar').src = point.author_avatar || '';
  document.getElementById('hover-name').textContent = point.author_name || '';
  const cityEl = document.getElementById('hover-city');
  if (point.author_city) {
    cityEl.textContent = point.author_city;
    cityEl.style.display = '';
  } else {
    cityEl.style.display = 'none';
  }
  document.getElementById('hover-text').textContent = point.text_content || '';
  const dateEl = document.getElementById('hover-date');
  if (point.created_at) {
    const d = new Date(point.created_at);
    dateEl.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    dateEl.style.display = '';
  } else {
    dateEl.style.display = 'none';
  }
  hoverCard.classList.remove('hidden');
  positionHoverCard();
}


async function deleteProfilePost(postId, element) {
  if (!await customConfirm('Delete this post?')) return;
  const res = await fetch(`/api/audio/${postId}`, { method: 'DELETE' });
  if (!res.ok) {
    showToast('Failed to delete');
    return;
  }
  element.remove();
  showToast('Post deleted');
  loadMarkers();
  const countEl = document.getElementById('pf-posts-count');
  countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
}

function handlePointClick(point) {
  if (!point) return;
  hoverCard.classList.add('hidden');
  openProfileCard(point.author_id);
}

// ============ Toast ============
let toastTimeout;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.add('hidden'), 2500);
}

// ============ Profile page (own = editable, stranger's = read-only) ============
async function openProfileCard(userId) {
  const res = await fetch(`/api/profile/${userId}`);
  if (!res.ok) { showToast('Profile not found'); return; }
  const p = await res.json();
  profileEditTarget = userId;

  const isOwn = currentUser && currentUser.id === userId;

  document.getElementById('pf-avatar').src = p.avatar_url || '';
  document.getElementById('pf-name').textContent = p.full_name;
  document.getElementById('pf-username').textContent = p.username ? '@' + p.username : '';
  document.getElementById('pf-location-text').textContent =
    [p.location_city, p.location_country].filter(Boolean).join(', ') || 'Location not set';
  document.getElementById('pf-bio').textContent = p.bio || '';
  document.getElementById('pf-active-count').textContent = p.active_posts_count || 0;
  document.getElementById('pf-total-count').textContent = p.total_posts_count || 0;

  const joinedEl = document.getElementById('pf-joined');
  if (!isOwn && p.created_at) {
    const d = new Date(p.created_at);
    document.getElementById('pf-joined-text').textContent =
      'Joined ' + d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    joinedEl.classList.remove('hidden');
  } else {
    joinedEl.classList.add('hidden');
  }

  const linksEl = document.getElementById('pf-links');
  linksEl.innerHTML = '';
  const linkLabels = { telegram: 'Telegram', github: 'GitHub', instagram: 'Instagram', portfolio: 'Portfolio', website: 'Website' };
  Object.entries(p.social_links || {}).forEach(([key, url]) => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url.startsWith('http') ? url : `https://${url}`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = linkLabels[key] || key;
    linksEl.appendChild(a);
  });

  window._profileActivePosts = p.active_posts || [];
  window._profileAllPosts = p.all_posts || [];

  renderProfilePosts(window._profileActivePosts, isOwn);

  document.querySelectorAll('.stats-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab === 'total' ? window._profileAllPosts : window._profileActivePosts;
      renderProfilePosts(which, isOwn);
    };
  });
  document.querySelector('.stats-tab[data-tab="active"]').classList.add('active');
  document.querySelector('.stats-tab[data-tab="total"]').classList.remove('active');
  const editBtn = document.getElementById('editProfileBtn');
  editBtn.classList.toggle('hidden', !isOwn);
  showProfileReadMode();

  if (isOwn) prefillEditForm(p);

  showModal('profileModal');
}

function renderProfilePosts(posts, isOwn) {
  const postsListEl = document.getElementById('pf-posts-list');
  postsListEl.innerHTML = '';
  if (!posts.length) {
    postsListEl.innerHTML = '<div class="search-empty">No posts yet</div>';
    return;
  }
  posts.forEach(post => {
    const wrap = document.createElement('div');
    wrap.className = 'post-text-bubble';
    const row = document.createElement('div');
    row.className = 'post-bubble-row';
    const textEl = document.createElement('div');
    textEl.className = 'post-bubble-text';
    textEl.textContent = post.text_content;
    textEl.style.cursor = 'pointer';
    textEl.addEventListener('click', () => openSinglePost(post.id));
    row.appendChild(textEl);
    if (isOwn) {
      const delBtn = document.createElement('button');
      delBtn.className = 'post-delete-btn';
      delBtn.title = 'Delete post';
      delBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteProfilePost(post.id, wrap);
      });
      row.appendChild(delBtn);
    }
    wrap.appendChild(row);
    if (post.created_at) {
      const d = new Date(post.created_at);
      const dateEl = document.createElement('div');
      dateEl.className = 'post-date';
      dateEl.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      wrap.appendChild(dateEl);
    }
    postsListEl.appendChild(wrap);
  });
}

function showProfileReadMode() {
  document.getElementById('pf-view').classList.remove('hidden');
  document.getElementById('pf-edit').classList.add('hidden');
}
function showProfileEditMode() {
  document.getElementById('pf-view').classList.add('hidden');
  document.getElementById('pf-edit').classList.remove('hidden');
}

function prefillEditForm(p) {
  document.getElementById('edit-username').value = p.username || '';
  document.getElementById('edit-bio').value = p.bio || '';
  document.getElementById('edit-city').value = p.location_city || '';
  const sl = p.social_links || {};
  document.getElementById('edit-telegram').value = extractUsername(sl.telegram, 't.me/');
  document.getElementById('edit-github').value = extractUsername(sl.github, 'github.com/');
  document.getElementById('edit-instagram').value = extractUsername(sl.instagram, 'instagram.com/');
  document.getElementById('edit-website').value = sl.website || '';
  populateCountrySelect(document.getElementById('edit-country'));
  document.getElementById('edit-country').value = p.location_country || '';
}

function extractUsername(url, domain) {
  if (!url) return '';
  if (url.startsWith('http')) {
    try {
      const path = new URL(url).pathname.replace(/^\/+/, '').replace(/^@+/, '');
      return path || url;
    } catch { return url; }
  }
  return url.replace(/^@+/, '');
}

function buildUrl(username, domain) {
  if (!username) return '';
  username = username.trim().replace(/^@+/, '');
  if (username.startsWith('http://') || username.startsWith('https://')) return username;
  return 'https://' + domain + username;
}

document.getElementById('editProfileBtn').addEventListener('click', showProfileEditMode);
document.getElementById('cancelEditBtn').addEventListener('click', showProfileReadMode);

document.getElementById('saveEditBtn').addEventListener('click', async () => {
  const country = document.getElementById('edit-country').value;
  const coords = country ? COUNTRY_COORDS[country] : null;
  const jittered = coords ? jitterCoords(coords.lat, coords.lng) : null;

  const payload = {
    username: document.getElementById('edit-username').value.trim(),
    bio: document.getElementById('edit-bio').value.trim(),
    location_country: country || null,
    location_city: document.getElementById('edit-city').value.trim() || null,
    social_links: {
      telegram: buildUrl(document.getElementById('edit-telegram').value, 't.me/'),
      github: buildUrl(document.getElementById('edit-github').value, 'github.com/'),
      instagram: buildUrl(document.getElementById('edit-instagram').value, 'instagram.com/'),
      website: document.getElementById('edit-website').value.trim(),
    },
  };
  if (jittered) {
    payload.home_lat = jittered.lat;
    payload.home_lng = jittered.lng;
  }

  const res = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Something went wrong');
    return;
  }
  currentUser = await res.json();
  showToast('Profile updated');
  await openProfileCard(currentUser.id);
  loadMarkers();
});

// ============ Single post view (share link) ============
async function openSinglePost(postId) {
  const res = await fetch(`/api/post/${postId}`);
  if (!res.ok) { showToast('Post not found'); return; }
  const post = await res.json();

  hideModal('profileModal');

  const authorRow = document.getElementById('post-author-row');
  authorRow.innerHTML = `
    <img class="avatar-lg" src="${post.author.avatar_url || ''}" alt="">
    <div>
      <div style="font-family:var(--font-display);font-weight:500;">${escapeHtml(post.author.full_name)}</div>
      <div class="muted">${post.author.username ? '@' + escapeHtml(post.author.username) : ''}</div>
    </div>`;

  const bodyEl = document.getElementById('post-body');
  bodyEl.innerHTML = `<div class="post-text-bubble" style="font-size:16px;">${escapeHtml(post.text_content)}</div>`;

  document.getElementById('shareBtn').onclick = () => sharePost(post.id);

  showModal('postModal');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============ Share ============
async function sharePost(postId) {
  const url = `${window.location.origin}/post/${postId}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Resonance', url });
    } catch (e) { /* user cancelled */ }
  } else {
    await navigator.clipboard.writeText(url);
    showToast('Link copied');
  }
}

// ============ Auth ============
async function checkAuth() {
  const res = await fetch('/auth/me');
  const data = await res.json();
  if (data.authenticated) {
    currentUser = data.user;
    document.getElementById('userChip').classList.remove('hidden');
    document.getElementById('loginBtn').classList.add('hidden');
    document.getElementById('userAvatar').src = currentUser.avatar_url || '';
    document.getElementById('userName').textContent = currentUser.full_name;
    document.getElementById('bbLogin').classList.add('hidden');
    document.getElementById('bbProfile').classList.remove('hidden');
    document.getElementById('bbAvatar').src = currentUser.avatar_url || '';
    document.getElementById('adminBtn').classList.toggle('hidden', !data.is_admin);
  } else {
    document.getElementById('userChip').classList.add('hidden');
    document.getElementById('loginBtn').classList.remove('hidden');
    document.getElementById('bbLogin').classList.remove('hidden');
    document.getElementById('bbProfile').classList.add('hidden');
    document.getElementById('adminBtn').classList.add('hidden');
  }
  return data;
}

document.getElementById('loginBtn').addEventListener('click', () => {
  document.getElementById('googleLoginBtn').href = `/auth/google/login?intent=share_thought`;
  showModal('authModal');
});

document.getElementById('recordTrigger').addEventListener('click', async () => {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    document.getElementById('googleLoginBtn').href = `/auth/google/login?intent=share_thought`;
    showModal('authModal');
    return;
  }
  openRecorderModal();
});

// User menu (avatar chip dropdown)
document.getElementById('userChipBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('userMenu').classList.toggle('hidden');
});
document.addEventListener('click', () => document.getElementById('userMenu').classList.add('hidden'));

document.getElementById('myProfileBtn').addEventListener('click', () => {
  document.getElementById('userMenu').classList.add('hidden');
  if (currentUser && currentUser.username) window.location.href = '/' + currentUser.username;
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  window.location.href = '/auth/logout';
});

// ============ Bottom bar (mobile) ============
document.getElementById('bbSearch').addEventListener('click', () => {
  document.getElementById('searchTrigger').click();
});
document.getElementById('bbRecord').addEventListener('click', () => {
  document.getElementById('recordTrigger').click();
});
document.getElementById('bbLogin').addEventListener('click', () => {
  document.getElementById('loginBtn').click();
});
document.getElementById('bbProfile').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('bbMenu').classList.toggle('hidden');
});
document.addEventListener('click', () => {
  const m = document.getElementById('bbMenu');
  if (m) m.classList.add('hidden');
});
document.getElementById('bbMyProfile').addEventListener('click', () => {
  document.getElementById('bbMenu').classList.add('hidden');
  if (currentUser && currentUser.username) window.location.href = '/' + currentUser.username;
});
document.getElementById('bbLogout').addEventListener('click', () => {
  window.location.href = '/auth/logout';
});

// ============ On page load ============
window.addEventListener('DOMContentLoaded', async () => {
  populateCountrySelect(document.getElementById('in-country'));
  await checkAuth();
});

function openRecorderModal() {
  showModal('recorderModal');
  const title = document.getElementById('recorder-title');
  if (currentUser && currentUser.username && currentUser.bio && currentUser.location_country) {
    document.getElementById('profileFillStep').classList.add('hidden');
    document.getElementById('postTypeStep').classList.remove('hidden');
    title.textContent = 'Share your thought';
  } else {
    document.getElementById('profileFillStep').classList.remove('hidden');
    document.getElementById('postTypeStep').classList.add('hidden');
    title.textContent = 'Set up your profile';
    if (currentUser) {
      document.getElementById('in-username').value = currentUser.username || '';
      document.getElementById('in-bio').value = currentUser.bio || '';
    }
  }
}

// ============ Profile setup (region-based placement) ============
document.getElementById('saveProfileBtn').addEventListener('click', async () => {
  const country = document.getElementById('in-country').value;
  if (!country) { showToast('Please choose your country'); return; }
  const base = COUNTRY_COORDS[country];
  const home = jitterCoords(base.lat, base.lng);

  const payload = {
    username: document.getElementById('in-username').value.trim(),
    bio: document.getElementById('in-bio').value.trim(),
    location_country: country,
    location_city: document.getElementById('in-city').value.trim() || null,
    home_lat: home.lat,
    home_lng: home.lng,
    social_links: {
      telegram: buildUrl(document.getElementById('in-telegram').value, 't.me/'),
      github: buildUrl(document.getElementById('in-github').value, 'github.com/'),
      instagram: buildUrl(document.getElementById('in-instagram').value, 'instagram.com/'),
      website: document.getElementById('in-website').value.trim(),
    },
  };
  const res = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Something went wrong');
    return;
  }
  currentUser = await res.json();
  document.getElementById('profileFillStep').classList.add('hidden');
  document.getElementById('postTypeStep').classList.remove('hidden');
});

// ============ Character counter ============
document.getElementById('in-text-post').addEventListener('input', (e) => {
  const len = e.target.value.length;
  const el = document.getElementById('charCount');
  el.textContent = len;
  const counter = el.parentElement;
  counter.classList.toggle('warn', len >= 450 && len < 500);
  counter.classList.toggle('danger', len >= 500);
});
document.getElementById('publishTextBtn').addEventListener('click', () => {
  document.getElementById('charCount').textContent = '0';
  document.getElementById('charCount').parentElement.classList.remove('warn','danger');
});

// ============ Text post ============
document.getElementById('publishTextBtn').addEventListener('click', async () => {
  const text = document.getElementById('in-text-post').value.trim();
  if (!text) return;

  const res = await fetch('/api/text-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.message || err.error || 'Something went wrong');
    return;
  }
  document.getElementById('in-text-post').value = '';
  hideModal('recorderModal');
  showToast('Your thought is on the map');
  loadMarkers();
});

// ============ Modal helpers ============
function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => hideModal(btn.dataset.close));
});

document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideModal(modal.id);
  });
});

// ============ Search ============
let allSearchUsers = [];

document.getElementById('searchTrigger').addEventListener('click', async () => {
  showModal('searchModal');
  const input = document.getElementById('searchInput');
  input.value = '';
  const box = document.getElementById('searchResults');
  box.innerHTML = '<div class="search-empty">Loading...</div>';
  input.focus();
  if (!allSearchUsers.length) {
    const res = await fetch('/api/search?q=');
    allSearchUsers = await res.json();
  }
  renderSearchResults(allSearchUsers);
});

document.getElementById('searchInput').addEventListener('input', (e) => {
  const q = e.target.value.trim().replace(/^@+/, '').toLowerCase();
  if (!q) { renderSearchResults(allSearchUsers); return; }
  const filtered = allSearchUsers.filter(u =>
    (u.full_name || '').toLowerCase().includes(q) ||
    (u.username || '').toLowerCase().includes(q)
  );
  renderSearchResults(filtered);
});

function renderSearchResults(users) {
  const box = document.getElementById('searchResults');
  if (!users.length) { box.innerHTML = '<div class="search-empty">No users found</div>'; return; }
  box.innerHTML = users.map(u => `
    <div class="search-user-card" data-user-id="${u.id}" data-username="${u.username || ''}">
      <img src="${u.avatar_url || ''}" alt="">
      <div class="search-user-info">
        <div class="name">${u.full_name || ''}</div>
        <div class="username">${u.username ? '@' + u.username : ''}</div>
        ${u.bio ? `<div class="bio">${u.bio}</div>` : ''}
      </div>
    </div>
  `).join('');
  box.querySelectorAll('.search-user-card').forEach(card => {
    card.addEventListener('click', () => {
      hideModal('searchModal');
      if (card.dataset.username) window.location.href = '/' + card.dataset.username;
    });
  });
}