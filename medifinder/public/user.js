const BASE = '/medifinder';

function formatINR(price) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(price);
}

let refreshTimer = null;
let currentUserId = null;

function getStoredStatuses(userId) {
  try {
    return JSON.parse(localStorage.getItem(`mf_res_statuses_${userId}`) || '{}');
  } catch { return {}; }
}

function saveStoredStatuses(userId, statuses) {
  localStorage.setItem(`mf_res_statuses_${userId}`, JSON.stringify(statuses));
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => {
    if (p.closest('.tabs-container') === btn.closest('.tabs-container')) {
      p.classList.add('hidden');
    }
  });
  btn.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.remove('hidden');
  btn.classList.add('active');
}

function switchDashTab(tabId, btn) {
  btn.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  btn.closest('.dash-tabs-container').querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
}

function showAuth() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('dashboardSection').classList.add('hidden');
  document.getElementById('logoutBtn').classList.add('hidden');
}

function showDashboard(user) {
  currentUserId = user.id;
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('dashboardSection').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  document.getElementById('userDisplayName').textContent = user.username;
  document.getElementById('userEmailDisplay').textContent = user.email;
  loadMyReservations();
  startAutoRefresh();
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    const dash = document.getElementById('dashboardSection');
    if (dash && !dash.classList.contains('hidden')) {
      loadMyReservations(true);
    }
  }, 30000);
}

async function checkSession() {
  try {
    const res = await fetch(`${BASE}/user/me`);
    const data = await res.json();
    if (data.loggedIn) {
      showDashboard(data.user);
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById('loginMsg');
  msgEl.textContent = '';
  msgEl.className = 'msg';
  const payload = {
    email: document.getElementById('loginEmail').value.trim(),
    password: document.getElementById('loginPassword').value
  };
  try {
    const res = await fetch(`${BASE}/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showDashboard(data.user);
    } else {
      msgEl.textContent = data.error || 'Login failed';
      msgEl.className = 'msg error';
    }
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.className = 'msg error';
  }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById('registerMsg');
  msgEl.textContent = '';
  msgEl.className = 'msg';
  const payload = {
    username: document.getElementById('regUsername').value.trim(),
    email: document.getElementById('regEmail').value.trim(),
    password: document.getElementById('regPassword').value
  };
  try {
    const res = await fetch(`${BASE}/user/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showDashboard(data.user);
    } else {
      msgEl.textContent = data.error || 'Registration failed';
      msgEl.className = 'msg error';
    }
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.className = 'msg error';
  }
});

async function logout() {
  await fetch(`${BASE}/user/logout`, { method: 'POST' });
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  showAuth();
}

async function loadMyReservations(silent = false) {
  const listEl = document.getElementById('myReservationsList');
  if (!silent) {
    listEl.innerHTML = '<div class="loading">Loading...</div>';
  }
  try {
    const res = await fetch(`${BASE}/user/reservations`);
    const data = await res.json();

    if (data.error) {
      listEl.innerHTML = `<div class="no-results"><p>${escHtml(data.error)}</p></div>`;
      return;
    }
    if (!data.reservations || data.reservations.length === 0) {
      listEl.innerHTML = `<div class="no-results">
        <h3>No reservations yet</h3>
        <p>Search for medicines and make a reservation to see them here.</p>
        <a href="/medifinder/" class="btn btn-primary" style="display:inline-flex;margin-top:1rem;">Search Medicines</a>
      </div>`;
      return;
    }

    const stored = getStoredStatuses(currentUserId);
    const notifications = [];
    const newStatuses = {};

    for (const r of data.reservations) {
      newStatuses[r._id] = r.status;
      if (r._id in stored && stored[r._id] !== r.status) {
        notifications.push({
          medicineName: (r.medicineId && r.medicineId.name) || 'your medicine',
          status: r.status
        });
      }
    }

    saveStoredStatuses(currentUserId, newStatuses);

    let html = '';

    if (notifications.length > 0) {
      for (const n of notifications) {
        if (n.status === 'confirmed') {
          html += `<div class="notif-banner notif-confirmed">
            <span class="notif-icon">🎉</span>
            <div>
              <strong>Reservation confirmed!</strong>
              Your reservation for <strong>${escHtml(n.medicineName)}</strong> has been confirmed by the pharmacy. You can pick it up now.
            </div>
          </div>`;
        } else if (n.status === 'completed') {
          html += `<div class="notif-banner notif-completed">
            <span class="notif-icon">✅</span>
            <div>
              <strong>Order completed!</strong>
              Your reservation for <strong>${escHtml(n.medicineName)}</strong> has been marked as completed. Thank you!
            </div>
          </div>`;
        } else if (n.status === 'cancelled') {
          html += `<div class="notif-banner notif-cancelled">
            <span class="notif-icon">⚠️</span>
            <div>
              <strong>Reservation cancelled.</strong>
              Your reservation for <strong>${escHtml(n.medicineName)}</strong> was cancelled. Please try another pharmacy.
            </div>
          </div>`;
        }
      }
    }

    html += renderReservations(data.reservations);
    listEl.innerHTML = html;

  } catch (err) {
    if (!silent) {
      listEl.innerHTML = `<div class="no-results"><p>Error: ${escHtml(err.message)}</p></div>`;
    }
  }
}

function renderReservations(reservations) {
  const active  = reservations.filter(r => r.status === 'pending' || r.status === 'confirmed');
  const history = reservations.filter(r => r.status === 'completed' || r.status === 'cancelled');

  let html = '';

  html += `<div class="user-res-section">
    <div class="user-res-section-header">Active Reservations</div>`;
  if (active.length === 0) {
    html += `<p class="res-section-empty">No active reservations.</p>`;
  } else {
    html += `<div class="reservations-list">`;
    for (const r of active) html += buildUserResCard(r);
    html += `</div>`;
  }
  html += `</div>`;

  if (history.length > 0) {
    html += `<div class="user-res-section">
      <div class="user-res-section-header">Completed Orders</div>
      <div class="reservations-list">`;
    for (const r of history) html += buildUserResCard(r);
    html += `</div></div>`;
  }

  return html;
}

function buildUserResCard(r) {
  const med = r.medicineId || {};
  const statusClass = r.status === 'confirmed'  ? 'status-confirmed'
    : r.status === 'cancelled'  ? 'status-cancelled'
    : r.status === 'completed'  ? 'status-completed'
    : 'status-pending';
  const statusLabel = r.status === 'confirmed'  ? '✓ Confirmed'
    : r.status === 'cancelled'  ? '✕ Cancelled'
    : r.status === 'completed'  ? '✔ Completed'
    : '⏳ Pending';
  const cardExtra = r.status === 'confirmed'  ? ' res-card-confirmed'
    : r.status === 'cancelled'  ? ' res-card-cancelled'
    : r.status === 'completed'  ? ' res-card-completed'
    : '';
  const date = new Date(r.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
  return `<div class="reservation-card${cardExtra}">
    <div class="res-card-top">
      <div>
        <span class="res-med-name">${escHtml(med.name || 'Unknown medicine')}</span>
        <span class="res-pharmacy">${escHtml(med.pharmacyName || '')}</span>
      </div>
      <span class="res-status ${statusClass}">${statusLabel}</span>
    </div>
    <div class="res-card-details">
      <span>Qty: <strong>${r.quantity}</strong></span>
      <span>${formatINR(med.price || 0)} each</span>
      <span class="res-date">${date}</span>
    </div>
    ${r.notes ? `<p class="res-notes">"${escHtml(r.notes)}"</p>` : ''}
  </div>`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

checkSession();
