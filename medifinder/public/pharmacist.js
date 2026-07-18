const BASE = '/medifinder';

function formatINR(price) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(price);
}

let currentPharmacy = '';
let currentProfile = null;

async function checkAuth() {
  const res = await fetch(`${BASE}/auth/me`);
  const data = await res.json();
  if (data.loggedIn) {
    currentPharmacy = data.pharmacyName;
    currentProfile  = data;
    showDashboard(data.pharmacyName);
  }
}

function showDashboard(pharmacyName) {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('dashboardSection').classList.remove('hidden');
  document.getElementById('pharmacyTitle').textContent = pharmacyName;
  document.getElementById('logoutBtn').classList.remove('hidden');
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.tabs-container .tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.tabs-container .tab').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId).classList.remove('hidden');
  btn.classList.add('active');
}

function switchDashTab(tabId, btn) {
  document.querySelectorAll('.dash-tabs-container .tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.dash-tabs-container .tab').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId).classList.remove('hidden');
  btn.classList.add('active');
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById('loginMsg');
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  try {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      msgEl.textContent = 'Login successful!';
      msgEl.className = 'msg success';
      setTimeout(() => { currentPharmacy = data.pharmacyName; showDashboard(data.pharmacyName); }, 500);
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
  const payload = {
    username:      document.getElementById('regUsername').value.trim(),
    password:      document.getElementById('regPassword').value,
    pharmacyName:  document.getElementById('regPharmacy').value.trim(),
    address:       document.getElementById('regAddress').value.trim(),
    lat:           document.getElementById('regLat').value,
    lng:           document.getElementById('regLng').value,
    contactNumber: document.getElementById('regContact').value.trim()
  };
  try {
    const res = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      msgEl.textContent = 'Registered! Logging you in...';
      msgEl.className = 'msg success';
      setTimeout(() => { currentPharmacy = data.pharmacyName; showDashboard(data.pharmacyName); }, 600);
    } else {
      msgEl.textContent = data.error || 'Registration failed';
      msgEl.className = 'msg error';
    }
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.className = 'msg error';
  }
});

document.getElementById('addMedForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById('addMedMsg');
  const payload = {
    name:     document.getElementById('medName').value.trim(),
    category: document.getElementById('medCategory').value.trim(),
    price:    parseFloat(document.getElementById('medPrice').value),
    stock:    parseInt(document.getElementById('medStock').value)
  };
  try {
    const res = await fetch(`${BASE}/medicine/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      msgEl.textContent = `"${data.medicine.name}" added successfully!`;
      msgEl.className = 'msg success';
      document.getElementById('addMedForm').reset();
      setTimeout(() => { msgEl.textContent = ''; }, 3000);
    } else {
      msgEl.textContent = data.error || 'Failed to add medicine';
      msgEl.className = 'msg error';
    }
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.className = 'msg error';
  }
});

async function loadMyMeds() {
  const container = document.getElementById('myMedsList');
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const res = await fetch(`${BASE}/medicine/my`);
    const data = await res.json();
    if (!data.medicines || data.medicines.length === 0) {
      container.innerHTML = '<div class="no-results"><h3>No medicines added yet</h3><p>Use the "Add Medicine" tab to add your first medicine.</p></div>';
      return;
    }
    let html = '<div class="meds-list">';
    for (const m of data.medicines) {
      html += `<div class="meds-row">
        <div class="meds-row-info">
          <div class="meds-row-name">${escHtml(m.name)}</div>
          <div class="meds-row-meta">
            ${escHtml(m.category)} · ${formatINR(m.price)} · Stock: ${m.stock}
          </div>
        </div>
      </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="no-results"><p class="error">${err.message}</p></div>`;
  }
}

async function loadReservations() {
  const container = document.getElementById('reservationsList');
  container.innerHTML = '<div class="loading">Loading reservations...</div>';
  try {
    const res = await fetch(`${BASE}/reservation/my`);
    const data = await res.json();
    if (!data.reservations || data.reservations.length === 0) {
      container.innerHTML = '<div class="no-results"><h3>No reservations yet</h3><p>Reservations from users will appear here.</p></div>';
      return;
    }

    const pending   = data.reservations.filter(r => r.status === 'pending');
    const confirmed = data.reservations.filter(r => r.status === 'confirmed');
    const history   = data.reservations.filter(r => r.status === 'completed' || r.status === 'cancelled');

    let html = '';
    html += renderPharmacistSection('⏳ Pending', pending);
    html += renderPharmacistSection('✓ Confirmed', confirmed);
    html += renderPharmacistSection('📋 Completed / History', history);

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="no-results"><p class="error">${err.message}</p></div>`;
  }
}

function renderPharmacistSection(title, reservations) {
  let html = `<div class="res-section">
    <div class="res-section-header">
      <span>${title}</span>
      <span class="res-section-count">${reservations.length}</span>
    </div>`;
  if (reservations.length === 0) {
    html += `<p class="res-section-empty">None</p>`;
  } else {
    for (const r of reservations) html += renderPharmacistRow(r);
  }
  html += `</div>`;
  return html;
}

function renderPharmacistRow(r) {
  const medName  = r.medicineId ? r.medicineId.name  : 'Unknown';
  const medPrice = r.medicineId ? r.medicineId.price : 0;
  const statusClass = `status-${r.status}`;
  const statusLabel = r.status.charAt(0).toUpperCase() + r.status.slice(1);
  const date = new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  let actions = '';
  if (r.status === 'pending') {
    actions = `<div class="res-actions">
      <button class="btn btn-success btn-sm" onclick="updateStatus('${r._id}','confirmed')">✓ Confirm</button>
      <button class="btn btn-danger btn-sm"  onclick="updateStatus('${r._id}','cancelled')">✕ Cancel</button>
    </div>`;
  } else if (r.status === 'confirmed') {
    actions = `<div class="res-actions">
      <button class="btn btn-complete btn-sm" onclick="updateStatus('${r._id}','completed')">✔ Mark as Completed</button>
      <button class="btn btn-danger btn-sm"   onclick="updateStatus('${r._id}','cancelled')">✕ Cancel</button>
    </div>`;
  }

  return `<div class="reservation-row">
    <div class="reservation-row-header">
      <span class="res-name">${escHtml(r.userName)}</span>
      <span class="status-badge ${statusClass}">${statusLabel}</span>
    </div>
    <div class="res-meta">
      Medicine: <strong>${escHtml(medName)}</strong> · Qty: ${r.quantity} · ${formatINR(medPrice)}
      ${r.userPhone ? ' · 📞 ' + escHtml(r.userPhone) : ''}
      · ${date}
    </div>
    ${r.notes ? `<div class="res-meta" style="margin-top:0.3rem">Notes: ${escHtml(r.notes)}</div>` : ''}
    ${actions}
  </div>`;
}

async function updateStatus(id, status) {
  try {
    const res = await fetch(`${BASE}/reservation/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (data.success) loadReservations();
  } catch (err) {
    alert(err.message);
  }
}

async function loadProfile() {
  const container = document.getElementById('profileContent');
  container.innerHTML = '<div class="loading">Loading profile...</div>';
  try {
    const res = await fetch(`${BASE}/auth/me`);
    const data = await res.json();
    if (!data.loggedIn) { container.innerHTML = '<p class="error">Not logged in.</p>'; return; }
    currentProfile = data;

    container.innerHTML = `
      <div class="profile-card">
        <h3 class="profile-title">Pharmacy Profile</h3>
        <div class="profile-info">
          <div class="profile-row"><span class="profile-label">Pharmacy Name</span><span class="profile-value">${escHtml(data.pharmacyName)}</span></div>
          <div class="profile-row"><span class="profile-label">Address</span><span class="profile-value">${escHtml(data.address || '—')}</span></div>
          <div class="profile-row"><span class="profile-label">Latitude</span><span class="profile-value">${data.lat != null ? data.lat : '—'}</span></div>
          <div class="profile-row"><span class="profile-label">Longitude</span><span class="profile-value">${data.lng != null ? data.lng : '—'}</span></div>
          <div class="profile-row"><span class="profile-label">Contact</span><span class="profile-value">${escHtml(data.contactNumber || '—')}</span></div>
          ${(data.lat != null && data.lng != null) ? `<div class="profile-row"><span class="profile-label">Map</span><span class="profile-value"><a href="https://www.google.com/maps?q=${data.lat},${data.lng}" target="_blank" class="btn btn-map btn-sm">🗺️ View Location</a></span></div>` : ''}
        </div>
      </div>

      <div class="profile-card" style="margin-top:1.5rem">
        <h3 class="profile-title">Update Profile</h3>
        <form id="profileForm">
          <div class="field">
            <label>Pharmacy Name</label>
            <input type="text" id="profilePharmacyName" value="${escHtml(data.pharmacyName)}" placeholder="Pharmacy name" />
          </div>
          <div class="field">
            <label>Address</label>
            <input type="text" id="profileAddress" value="${escHtml(data.address || '')}" placeholder="e.g. 123 Main St, Kuala Lumpur" />
          </div>
          <div class="field">
            <label>Location</label>
            <button type="button" class="btn btn-outline btn-locate" id="profileLocateBtn" onclick="fetchCurrentLocation('profileLat','profileLng','profileLocateBtn','profileLocateStatus')">
              📍 Use My Current Location
            </button>
            <span id="profileLocateStatus" class="locate-status"></span>
          </div>
          <div class="form-row two-cols">
            <div class="field">
              <label>Latitude</label>
              <input type="number" id="profileLat" step="any" value="${data.lat != null ? data.lat : ''}" placeholder="e.g. 3.1390" />
            </div>
            <div class="field">
              <label>Longitude</label>
              <input type="number" id="profileLng" step="any" value="${data.lng != null ? data.lng : ''}" placeholder="e.g. 101.6869" />
            </div>
          </div>
          <div class="field">
            <label>Contact Number</label>
            <input type="text" id="profileContact" value="${escHtml(data.contactNumber || '')}" placeholder="e.g. +60123456789" />
          </div>
          <p class="field-hint">⚠️ Updating your location will apply to newly added medicines. Existing medicine records keep their stored location.</p>
          <button type="submit" class="btn btn-primary">Save Changes</button>
          <div id="profileMsg" class="msg" style="margin-top:0.75rem"></div>
        </form>
      </div>`;

    document.getElementById('profileForm').addEventListener('submit', saveProfile);
  } catch (err) {
    container.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function saveProfile(e) {
  e.preventDefault();
  const msgEl = document.getElementById('profileMsg');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  const payload = {
    pharmacyName:  document.getElementById('profilePharmacyName').value.trim(),
    address:       document.getElementById('profileAddress').value.trim(),
    lat:           document.getElementById('profileLat').value,
    lng:           document.getElementById('profileLng').value,
    contactNumber: document.getElementById('profileContact').value.trim()
  };

  try {
    const res = await fetch(`${BASE}/auth/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      msgEl.textContent = '✓ Profile updated successfully!';
      msgEl.className = 'msg success';
      if (data.user.pharmacyName) {
        document.getElementById('pharmacyTitle').textContent = data.user.pharmacyName;
        currentPharmacy = data.user.pharmacyName;
      }
      setTimeout(() => loadProfile(), 1200);
    } else {
      msgEl.textContent = data.error || 'Update failed';
      msgEl.className = 'msg error';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.className = 'msg error';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
  }
}

function fetchCurrentLocation(latInputId, lngInputId, btnId, statusId) {
  const btn    = document.getElementById(btnId);
  const status = document.getElementById(statusId);

  if (!navigator.geolocation) {
    status.textContent = '⚠ Geolocation is not supported by your browser.';
    status.className = 'locate-status locate-error';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Detecting location...';
  status.textContent = '';
  status.className = 'locate-status';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      document.getElementById(latInputId).value = lat;
      document.getElementById(lngInputId).value = lng;
      btn.disabled = false;
      btn.textContent = '📍 Use My Current Location';
      status.textContent = `✓ Location detected: ${lat}, ${lng}`;
      status.className = 'locate-status locate-success';
    },
    (err) => {
      btn.disabled = false;
      btn.textContent = '📍 Use My Current Location';
      const msgs = {
        1: 'Permission denied — please allow location access in your browser.',
        2: 'Location unavailable — check your device settings.',
        3: 'Request timed out — please try again.'
      };
      status.textContent = '⚠ ' + (msgs[err.code] || err.message);
      status.className = 'locate-status locate-error';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

async function logout() {
  await fetch(`${BASE}/auth/logout`, { method: 'POST' });
  location.reload();
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

checkAuth();
