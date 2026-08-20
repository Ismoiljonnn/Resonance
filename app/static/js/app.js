// ============ Holat ============
let currentUser = null;
let selectedLat = null;
let selectedLng = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordedBlob = null;
let recordSeconds = 0;
let recordTimerInterval = null;

const REACTION_EMOJIS = ["🔥", "❤️", "👏", "😂", "🤯"];
const body = document.body;

// ============ 3D Globus ============
const globe = Globe()(document.getElementById('globeViz'))
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
  .backgroundColor('rgba(0,0,0,0)')
  .atmosphereColor('#4285f4')
  .atmosphereAltitude(0.18)
  .pointOfView({ lat: 41.3, lng: 69.2, altitude: 2.2 });

globe.onGlobeClick(({ lat, lng }) => {
  selectedLat = lat;
  selectedLng = lng;
  showToast('Nuqta tanlandi — endi "Fikr qoldirish"ni bosing');
});

async function loadMarkers() {
  const res = await fetch('/api/markers');
  const markers = await res.json();

  globe
    .pointsData(markers)
    .pointLat('lat')
    .pointLng('lng')
    .pointColor(m => m.post_type === 'text' ? '#ff8a65' : '#00e5c7')
    .pointAltitude(0.012)
    .pointRadius(0.38)
    .pointLabel(m => `<div style="font-family:Roboto,sans-serif;color:#fff;font-size:12px;background:rgba(0,0,0,.7);padding:6px 10px;border-radius:8px;">
        <strong>${m.author_name}</strong>${m.preview ? '<br>' + m.preview + '…' : ''}
      </div>`)
    .onPointClick(m => openProfileCard(m.id));
}
loadMarkers();

// ============ Toast ============
let toastTimeout;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.add('hidden'), 2500);
}

// ============ Public Profile Card ============
async function openProfileCard(userId) {
  const res = await fetch(`/api/profile/${userId}`);
  if (!res.ok) return;
  const p = await res.json();

  document.getElementById('pf-avatar').src = p.avatar_url || '';
  document.getElementById('pf-name').textContent = p.full_name;
  document.getElementById('pf-username').textContent = p.username ? '@' + p.username : '';
  document.getElementById('pf-bio').textContent = p.bio || '';
  document.getElementById('pf-location').textContent = [p.location_city, p.location_country].filter(Boolean).join(', ');
  document.getElementById('pf-listens').textContent = p.total_listens || 0;
  document.getElementById('pf-posts-count').textContent = (p.active_posts || []).length;

  const linksEl = document.getElementById('pf-links');
  linksEl.innerHTML = '';
  const linkLabels = { telegram: 'Telegram', github: 'GitHub', instagram: 'Instagram', portfolio: 'Portfolio' };
  Object.entries(p.social_links || {}).forEach(([key, url]) => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url.startsWith('http') ? url : `https://${url}`;
    a.target = '_blank';
    a.textContent = linkLabels[key] || key;
    linksEl.appendChild(a);
  });

  const postsListEl = document.getElementById('pf-posts-list');
  postsListEl.innerHTML = '';
  (p.active_posts || []).forEach(post => {
    const wrap = document.createElement('div');
    if (post.post_type === 'text') {
      const bubble = document.createElement('div');
      bubble.className = 'post-text-bubble';
      bubble.textContent = post.text_content;
      bubble.style.cursor = 'pointer';
      bubble.addEventListener('click', () => openSinglePost(post.id));
      wrap.appendChild(bubble);
    } else {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = post.audio_url;
      audio.addEventListener('play', () => fetch(`/api/audio/${post.id}/listen`, { method: 'POST' }));
      wrap.appendChild(audio);
    }
    postsListEl.appendChild(wrap);
  });

  showModal('profileModal');
}

// ============ Bitta post ko'rish (share) ============
async function openSinglePost(postId) {
  const res = await fetch(`/api/post/${postId}`);
  if (!res.ok) { showToast('Post topilmadi'); return; }
  const post = await res.json();

  hideModal('profileModal');

  const authorRow = document.getElementById('post-author-row');
  authorRow.innerHTML = `
    <img class="avatar-lg" src="${post.author.avatar_url || ''}" alt="">
    <div>
      <div style="font-family:var(--font-display);font-weight:500;">${post.author.full_name}</div>
      <div class="muted">${post.author.username ? '@' + post.author.username : ''}</div>
    </div>`;

  const bodyEl = document.getElementById('post-body');
  if (post.post_type === 'text') {
    bodyEl.innerHTML = `<div class="post-text-bubble" style="font-size:16px;">${escapeHtml(post.text_content)}</div>`;
  } else {
    bodyEl.innerHTML = `<audio controls style="width:100%;" src="${post.audio_url}"></audio>`;
    bodyEl.querySelector('audio').addEventListener('play', () => fetch(`/api/audio/${post.id}/listen`, { method: 'POST' }));
  }

  renderReactions(post);

  document.getElementById('shareBtn').onclick = () => sharePost(post.id);

  showModal('postModal');
  window.currentOpenPostId = post.id;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============ Reaksiyalar ============
function renderReactions(post) {
  const el = document.getElementById('post-reactions');
  el.innerHTML = '';
  REACTION_EMOJIS.forEach(emoji => {
    const count = (post.reactions && post.reactions[emoji]) || 0;
    const chip = document.createElement('button');
    chip.className = 'reaction-chip' + (post.my_reaction === emoji ? ' active' : '');
    chip.innerHTML = `<span>${emoji}</span>${count > 0 ? `<span class="count">${count}</span>` : ''}`;
    chip.addEventListener('click', () => toggleReaction(post.id, emoji));
    el.appendChild(chip);
  });
}

async function toggleReaction(postId, emoji) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    document.getElementById('googleLoginBtn').href = `/auth/google/login?intent=react&lat=${selectedLat || ''}&lng=${selectedLng || ''}`;
    showModal('authModal');
    return;
  }
  const res = await fetch(`/api/audio/${postId}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji }),
  });
  if (!res.ok) return;
  const updated = await res.json();
  renderReactions(updated);
}

// ============ Ulashish ============
async function sharePost(postId) {
  const url = `${window.location.origin}/post/${postId}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Resonance', url });
    } catch (e) { /* foydalanuvchi bekor qildi */ }
  } else {
    await navigator.clipboard.writeText(url);
    showToast('Havola nusxalandi');
  }
}

// ============ Auth ============
async function checkAuth() {
  const res = await fetch('/auth/me');
  const data = await res.json();
  if (data.authenticated) {
    currentUser = data.user;
    document.getElementById('userChip').classList.remove('hidden');
    document.getElementById('userAvatar').src = currentUser.avatar_url || '';
    document.getElementById('userName').textContent = currentUser.full_name;
  }
  return data;
}

document.getElementById('recordTrigger').addEventListener('click', async () => {
  const auth = await checkAuth();

  if (selectedLat === null) {
    const pov = globe.pointOfView();
    selectedLat = pov.lat;
    selectedLng = pov.lng;
  }

  if (!auth.authenticated) {
    const loginUrl = `/auth/google/login?intent=record_audio&lat=${selectedLat}&lng=${selectedLng}`;
    document.getElementById('googleLoginBtn').href = loginUrl;
    showModal('authModal');
    return;
  }

  openRecorderModal();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  window.location.href = '/auth/logout';
});

// ============ Sahifa yuklanganda ============
window.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();

  if (body.dataset.openRecorder === '1') {
    selectedLat = parseFloat(body.dataset.lat);
    selectedLng = parseFloat(body.dataset.lng);
    openRecorderModal();
  }

  if (body.dataset.openPost) {
    openSinglePost(body.dataset.openPost);
  }
});

function openRecorderModal() {
  showModal('recorderModal');
  if (currentUser && currentUser.username && currentUser.bio) {
    document.getElementById('profileFillStep').classList.add('hidden');
    document.getElementById('postTypeStep').classList.remove('hidden');
  } else {
    document.getElementById('profileFillStep').classList.remove('hidden');
    document.getElementById('postTypeStep').classList.add('hidden');
  }
}

// ============ Ovoz / Matn tab ============
document.getElementById('tabAudio').addEventListener('click', () => switchPostTab('audio'));
document.getElementById('tabText').addEventListener('click', () => switchPostTab('text'));

function switchPostTab(type) {
  document.getElementById('tabAudio').classList.toggle('active', type === 'audio');
  document.getElementById('tabText').classList.toggle('active', type === 'text');
  document.getElementById('audioStep').classList.toggle('hidden', type !== 'audio');
  document.getElementById('textStep').classList.toggle('hidden', type !== 'text');
}

// ============ Profil to'ldirish ============
document.getElementById('saveProfileBtn').addEventListener('click', async () => {
  const payload = {
    username: document.getElementById('in-username').value.trim(),
    bio: document.getElementById('in-bio').value.trim(),
    social_links: {
      telegram: document.getElementById('in-telegram').value.trim(),
      github: document.getElementById('in-github').value.trim(),
      instagram: document.getElementById('in-instagram').value.trim(),
    },
  };
  const res = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Xatolik yuz berdi');
    return;
  }
  currentUser = await res.json();
  document.getElementById('profileFillStep').classList.add('hidden');
  document.getElementById('postTypeStep').classList.remove('hidden');
});

// ============ Audio yozish ============
document.getElementById('recordBtn').addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') return;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  recordedChunks = [];
  recordSeconds = 0;
  document.getElementById('recordBtn').classList.add('recording');

  mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
  mediaRecorder.onstop = () => {
    recordedBlob = new Blob(recordedChunks, { type: 'audio/webm' });
    const player = document.getElementById('previewPlayer');
    player.src = URL.createObjectURL(recordedBlob);
    player.classList.remove('hidden');
    document.getElementById('publishBtn').classList.remove('hidden');
    document.getElementById('recordBtn').classList.remove('recording');
    stream.getTracks().forEach(t => t.stop());
    clearInterval(recordTimerInterval);
  };

  mediaRecorder.start();
  recordTimerInterval = setInterval(() => {
    recordSeconds++;
    const m = String(Math.floor(recordSeconds / 60)).padStart(2, '0');
    const s = String(recordSeconds % 60).padStart(2, '0');
    document.getElementById('recordTimer').textContent = `${m}:${s}`;
    if (recordSeconds >= 15) mediaRecorder.stop();
  }, 1000);
});

document.getElementById('publishBtn').addEventListener('click', async () => {
  if (!recordedBlob) return;

  const formData = new FormData();
  formData.append('audio', recordedBlob, 'voice.webm');
  formData.append('lat', selectedLat);
  formData.append('lng', selectedLng);
  formData.append('duration', recordSeconds);

  const res = await fetch('/api/audio', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.message || err.error || 'Xatolik yuz berdi');
    return;
  }
  hideModal('recorderModal');
  showToast('Ovozingiz xaritaga joylandi 🎉');
  loadMarkers();
});

// ============ Matn posti ============
document.getElementById('publishTextBtn').addEventListener('click', async () => {
  const text = document.getElementById('in-text-post').value.trim();
  if (!text) return;

  const res = await fetch('/api/text-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lat: selectedLat, lng: selectedLng }),
  });
  if (!res.ok) {
    const err = await res.json();
    showToast(err.message || err.error || 'Xatolik yuz berdi');
    return;
  }
  document.getElementById('in-text-post').value = '';
  hideModal('recorderModal');
  showToast('Fikringiz xaritaga joylandi 🎉');
  loadMarkers();
});

// ============ Modal yordamchilari ============
function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => hideModal(btn.dataset.close));
});
