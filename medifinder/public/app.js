const BASE = '/medifinder';

function formatINR(price) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(price);
}

const searchForm = document.getElementById('searchForm');
const resultsArea = document.getElementById('resultsArea');
const symptomArea = document.getElementById('symptomArea');
const useLocationBtn = document.getElementById('useLocationBtn');
const locationStatus = document.getElementById('locationStatus');

let currentLat = null;
let currentLng = null;
let manualOpen = false;

function setLocationStatus(msg, type) {
  locationStatus.textContent = msg;
  locationStatus.className = 'location-status ' + (type || '');
}

function applyCoords(lat, lng, source) {
  currentLat = lat;
  currentLng = lng;
  const label = source === 'manual'
    ? `✓ Location set (${lat.toFixed(4)}, ${lng.toFixed(4)})`
    : `✓ Using your current location`;
  setLocationStatus(label, 'loc-success');
  document.getElementById('distanceRow').classList.remove('hidden');
  useLocationBtn.disabled = false;
  useLocationBtn.textContent = '📍 Use My Location';
}

function clearLocation() {
  currentLat = null;
  currentLng = null;
  document.getElementById('distanceRow').classList.add('hidden');
}

function requestLocation() {
  if (!navigator.geolocation) {
    setLocationStatus('Geolocation not supported — enter location manually below.', 'loc-info');
    openManualLocation();
    return;
  }
  useLocationBtn.disabled = true;
  useLocationBtn.textContent = '⏳ Detecting...';
  setLocationStatus('Detecting your location...', 'loc-info');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      applyCoords(pos.coords.latitude, pos.coords.longitude, 'gps');
    },
    () => {
      useLocationBtn.disabled = false;
      useLocationBtn.textContent = '📍 Use My Location';
      setLocationStatus('📍 Location unavailable — searching all pharmacies', 'loc-info');
      clearLocation();
    },
    { timeout: 8000, maximumAge: 60000 }
  );
}

function openManualLocation() {
  manualOpen = true;
  document.getElementById('manualRow').classList.remove('hidden');
  document.getElementById('manualToggleBtn').textContent = '✕ Hide manual entry';
}

function toggleManualLocation() {
  if (manualOpen) {
    manualOpen = false;
    document.getElementById('manualRow').classList.add('hidden');
    document.getElementById('manualToggleBtn').textContent = '✎ Enter location manually';
  } else {
    openManualLocation();
  }
}

function applyManualLocation() {
  const lat = parseFloat(document.getElementById('lat').value);
  const lng = parseFloat(document.getElementById('lng').value);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    setLocationStatus('Please enter valid latitude (−90 to 90) and longitude (−180 to 180).', 'loc-error');
    return;
  }
  applyCoords(lat, lng, 'manual');
  manualOpen = false;
  document.getElementById('manualRow').classList.add('hidden');
  document.getElementById('manualToggleBtn').textContent = '✎ Enter location manually';
}

useLocationBtn.addEventListener('click', requestLocation);

let currentUser = null;

function getStoredStatuses(userId) {
  try {
    return JSON.parse(localStorage.getItem(`mf_res_statuses_${userId}`) || '{}');
  } catch { return {}; }
}

async function checkUserSession() {
  try {
    const res = await fetch(`${BASE}/user/me`);
    const data = await res.json();
    if (data.loggedIn) {
      currentUser = data.user;
      document.getElementById('userGreeting').textContent = `Hi, ${data.user.username}`;
      document.getElementById('userGreeting').classList.remove('hidden');
      document.getElementById('myAccountBtn').textContent = 'My Reservations';
      document.getElementById('userLogoutBtn').classList.remove('hidden');
      checkNotificationBadge(data.user.id);
    }
  } catch {
    currentUser = null;
  }
}

async function checkNotificationBadge(userId) {
  try {
    const res = await fetch(`${BASE}/user/reservations`);
    const data = await res.json();
    if (!data.reservations) return;
    const stored = getStoredStatuses(userId);
    const hasUnread = data.reservations.some(
      r => (r._id in stored) && stored[r._id] !== r.status
    );
    const btn = document.getElementById('myAccountBtn');
    if (hasUnread) {
      btn.setAttribute('data-badge', '1');
    } else {
      btn.removeAttribute('data-badge');
    }
  } catch { }
}

async function userLogout() {
  await fetch(`${BASE}/user/logout`, { method: 'POST' });
  currentUser = null;
  document.getElementById('userGreeting').classList.add('hidden');
  document.getElementById('myAccountBtn').textContent = 'My Account';
  document.getElementById('userLogoutBtn').classList.add('hidden');
}

window.addEventListener('load', () => {
  requestLocation();
  checkUserSession();
});

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await runSearch();
});

resultsArea.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-suggest]');
  if (chip) {
    runSearch(chip.dataset.suggest);
    return;
  }
  const reserveBtn = e.target.closest('[data-reserve-id]');
  if (reserveBtn) {
    openReserve(
      reserveBtn.dataset.reserveId,
      reserveBtn.dataset.reserveName,
      reserveBtn.dataset.reservePharmacy,
      reserveBtn.dataset.reservePrice
    );
  }
});

async function runSearch(overrideName) {
  const name = overrideName || document.getElementById('medicineName').value.trim();
  const distance = document.getElementById('distance') ? document.getElementById('distance').value : 10;

  if (!name) {
    showMessage('Please enter a medicine name.', 'error');
    return;
  }

  document.getElementById('searchBtnText').textContent = 'Searching...';
  symptomArea.classList.add('hidden');
  resultsArea.innerHTML = '<div class="loading">Searching pharmacies near you...</div>';

  try {
    const params = new URLSearchParams({ name, distance: distance || 10 });
    if (currentLat !== null) params.append('lat', currentLat);
    if (currentLng !== null) params.append('lng', currentLng);

    const res = await fetch(`${BASE}/medicine/search?${params}`);
    const data = await res.json();

    renderResults(data, name);
  } catch (err) {
    resultsArea.innerHTML = `<div class="no-results"><h3>Error</h3><p>${escHtml(err.message)}</p></div>`;
  } finally {
    document.getElementById('searchBtnText').textContent = 'Search Medicine';
  }
}

function renderResults(data, searchName) {
  resultsArea.innerHTML = '';

  if (data.searchMode === 'found' && data.results.length > 0) {
    const hasLoc = currentLat !== null && currentLng !== null;

    let html = `<div class="results-header">
      <h2>Results for "<em>${escHtml(searchName)}</em>"</h2>
      <span class="results-count">${data.results.length} found</span>
    </div>`;

    if (data.distanceFallback) {
      html += `<div class="fallback-banner">
        <span>📍</span>
        <div>No pharmacies found within <strong>${data.requestedDistance} km</strong> of your location — showing the nearest available results instead.</div>
      </div>`;
    }

    html += `<div class="results-grid">`;
    for (const m of data.results) {
      html += buildMedCard(m, hasLoc);
    }
    html += '</div>';
    resultsArea.innerHTML = html;

  } else if (data.searchMode === 'suggestion') {
    let html = `<div class="no-match-banner">
      <span class="no-match-icon">🔍</span>
      <div>
        <strong>No exact match found</strong> for "<em>${escHtml(searchName)}</em>"
      </div>
    </div>`;

    if (data.suggestions.length > 0) {
      html += `<div class="suggestions-box">
        <p class="suggestions-label">Did you mean:</p>
        <div class="suggestion-chips">`;
      for (const s of data.suggestions) {
        html += `<button class="chip" data-suggest="${escAttr(s)}">${escHtml(s)}</button>`;
      }
      html += `</div></div>`;
    } else {
      html += `<div class="no-results"><p>No similar medicines found. Try a different spelling or describe your symptom below.</p></div>`;
    }

    resultsArea.innerHTML = html;
    symptomArea.classList.remove('hidden');

  } else if (data.searchMode === 'symptom' && data.symptomResults.length > 0) {
    const lat = parseFloat(document.getElementById('lat').value);
    const lng = parseFloat(document.getElementById('lng').value);
    const hasLoc = !isNaN(lat) && !isNaN(lng);

    let html = `<div class="results-header">
      <h2>Medicines for your symptom</h2>
      <span class="results-count">${data.symptomResults.length} found</span>
    </div>
    <div class="results-grid">`;
    for (const m of data.symptomResults) {
      html += buildMedCard(m, hasLoc);
    }
    html += '</div>';
    resultsArea.innerHTML = html;

  } else {
    resultsArea.innerHTML = `<div class="no-results">
      <h3>No medicines found for "<em>${escHtml(searchName)}</em>"</h3>
      <p>Try a different name, or describe your symptom below.</p>
    </div>`;
    symptomArea.classList.remove('hidden');
  }
}

function buildMedCard(m, hasLoc) {
  const stockClass = m.stock < 5 ? 'stock-low' : 'stock-ok';
  const stockLabel = m.stock < 5 ? `Low Stock (${m.stock})` : `In Stock (${m.stock})`;
  const distHtml = (hasLoc && m.distanceKm != null)
    ? `<div class="med-distance">📍 ${m.distanceKm} km away</div>`
    : '';
  const displayAddr = m.resolvedAddress || m.address || '';
  const addr = displayAddr ? `<p class="med-info"><strong>Address:</strong> ${escHtml(displayAddr)}</p>` : '';

  const mapLat = m.resolvedLat != null ? m.resolvedLat : (m.location && m.location.lat);
  const mapLng = m.resolvedLng != null ? m.resolvedLng : (m.location && m.location.lng);
  const mapBtn = (mapLat != null && mapLng != null)
    ? `<a class="btn btn-map btn-sm"
         href="https://www.google.com/maps?q=${mapLat},${mapLng}"
         target="_blank" rel="noopener noreferrer">
         🗺️ View on Map
       </a>`
    : '';

  return `<div class="med-card">
    <div class="med-card-header">
      <span class="med-name">${escHtml(m.name)}</span>
      <span class="med-price">${formatINR(m.price)}</span>
    </div>
    <span class="med-badge">${escHtml(m.category)}</span>
    ${distHtml}
    <p class="med-info"><strong>Pharmacy:</strong> ${escHtml(m.pharmacyName)}</p>
    ${addr}
    <p class="med-stock ${stockClass}">${stockLabel}</p>
    <div class="card-actions">
      ${mapBtn}
      <button class="btn btn-primary btn-sm"
        data-reserve-id="${escAttr(m._id)}"
        data-reserve-name="${escAttr(m.name)}"
        data-reserve-pharmacy="${escAttr(m.pharmacyName)}"
        data-reserve-price="${parseFloat(m.price).toFixed(2)}">
        Reserve
      </button>
    </div>
  </div>`;
}

async function searchBySymptom() {
  const symptom = document.getElementById('symptomInput').value.trim();
  if (!symptom) {
    document.getElementById('symptomInput').focus();
    return;
  }

  const btn = document.getElementById('symptomBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Predicting…'; }
  resultsArea.innerHTML = '<div class="loading">🤖 AI is identifying the medicine for your symptom…</div>';

  try {
    // Step 1: Ask the ML model to predict a medicine from the symptom
    const predRes = await fetch(`${BASE}/symptom-predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptom })
    });
    const predData = await predRes.json();

    if (!predRes.ok || predData.error) {
      throw new Error(predData.error || 'ML service error');
    }

    const medicineName = predData.medicine;

    // Show the AI prediction banner, then search pharmacies for that medicine
    resultsArea.innerHTML = `
      <div class="scan-status scan-success" style="margin-bottom:1rem">
        🤖 AI suggests: <strong>${escHtml(medicineName)}</strong> for "<em>${escHtml(symptom)}</em>"
      </div>
      <div class="loading">Finding pharmacies…</div>`;

    // Step 2: Populate the medicine name field and run the full pharmacy search
    document.getElementById('medicineName').value = medicineName;
    await runSearch(medicineName);

  } catch (err) {
    resultsArea.innerHTML = `<div class="no-results">
      <h3>AI prediction unavailable</h3>
      <p>${escHtml(err.message)}</p>
      <p>Make sure the Python ML API is running on port 5000.</p>
    </div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Find Medicine'; }
  }
}

function openReserve(id, name, pharmacy, price) {
  document.getElementById('reserveMedId').value = id;
  document.getElementById('modalMedSummary').innerHTML =
    `<strong>${escHtml(name)}</strong> — ${escHtml(pharmacy)} — ${formatINR(price)}`;
  document.getElementById('reserveName').value = currentUser ? currentUser.username : '';
  document.getElementById('reservePhone').value = '';
  document.getElementById('reserveQty').value = 1;
  document.getElementById('reserveNotes').value = '';
  document.getElementById('reserveMsg').textContent = '';
  document.getElementById('reserveMsg').className = 'msg';
  const submitBtn = document.querySelector('#reservationForm button[type="submit"]');
  submitBtn.disabled = false;
  submitBtn.textContent = 'Confirm Reservation';
  document.getElementById('reservationModal').classList.remove('hidden');
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('reservationModal').classList.add('hidden');
  document.getElementById('modalOverlay').classList.add('hidden');
}

document.getElementById('reservationForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById('reserveMsg');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  if (submitBtn.disabled) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Reserving...';
  msgEl.textContent = '';
  msgEl.className = 'msg';

  const payload = {
    medicineId: document.getElementById('reserveMedId').value,
    userName: document.getElementById('reserveName').value.trim(),
    userPhone: document.getElementById('reservePhone').value.trim(),
    quantity: parseInt(document.getElementById('reserveQty').value),
    notes: document.getElementById('reserveNotes').value.trim()
  };

  try {
    const res = await fetch(`${BASE}/reservation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      msgEl.textContent = '✓ Reservation created! The pharmacist will contact you soon.';
      msgEl.className = 'msg success';
      submitBtn.textContent = '✓ Reserved';
      setTimeout(closeModal, 2200);
    } else if (data.alreadyExists) {
      msgEl.textContent = '⚠ ' + data.error;
      msgEl.className = 'msg error';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm Reservation';
    } else {
      msgEl.textContent = data.error || 'Reservation failed. Please try again.';
      msgEl.className = 'msg error';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm Reservation';
    }
  } catch (err) {
    msgEl.textContent = 'Network error — please try again.';
    msgEl.className = 'msg error';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirm Reservation';
  }
});

function showMessage(text, type) {
  resultsArea.innerHTML = `<div class="no-results"><p class="${type}">${escHtml(text)}</p></div>`;
}

// ── OCR Scan feature ──────────────────────────────────────────────────────────

function onScanFileChange(input) {
  const btn      = document.getElementById('scanBtn');
  const fileText = document.getElementById('scanFileText');
  if (input.files && input.files[0]) {
    fileText.textContent = input.files[0].name;
    btn.disabled = false;
  } else {
    fileText.textContent = 'Choose image…';
    btn.disabled = true;
  }
}

async function scanImage() {
  const input   = document.getElementById('scanImageInput');
  const statusEl = document.getElementById('scanStatus');
  const scanBtn  = document.getElementById('scanBtn');

  if (!input.files || !input.files[0]) return;

  const file = input.files[0];

  // Show loading state
  statusEl.className = 'scan-status scan-loading';
  statusEl.innerHTML = `<span class="scan-spinner">⏳</span> Scanning image and reading text…`;
  statusEl.classList.remove('hidden');
  scanBtn.disabled = true;
  scanBtn.textContent = '⏳ Scanning…';
  resultsArea.innerHTML = '';

  try {
    const formData = new FormData();
    formData.append('image', file);

    const res  = await fetch(`${BASE}/scan-image`, { method: 'POST', body: formData });
    const data = await res.json();

    scanBtn.disabled = false;
    scanBtn.textContent = '🔍 Scan & Search';

    if (data.error) {
      statusEl.className = 'scan-status scan-error';
      statusEl.innerHTML = `⚠ ${escHtml(data.error)}`;
      return;
    }

    if (!data.success) {
      statusEl.className = 'scan-status scan-error';
      statusEl.innerHTML = `⚠ ${escHtml(data.message || 'Could not detect medicine. Try a clearer image.')}`;
      if (data.ocrText) {
        statusEl.innerHTML += `<br><small>Extracted text: "${escHtml(data.ocrText)}"</small>`;
      }
      return;
    }

    // ── Success: show detected medicine + results ─────────────────────────
    statusEl.className = 'scan-status scan-success';
    statusEl.innerHTML = `
      <div class="scan-detected">
        <div class="scan-detected-label">Detected Medicine</div>
        <div class="scan-detected-name">${escHtml(data.detectedMedicine)}</div>
        ${data.ocrText ? `<div class="scan-ocr-raw">Extracted text: "${escHtml(data.ocrText)}"</div>` : ''}
      </div>
      <p class="scan-searching">🔍 Searching nearby pharmacies…</p>`;

    // Populate search field for UX clarity
    document.getElementById('medicineName').value = data.detectedMedicine;

    // Render pharmacy results using existing card builder
    if (data.results && data.results.length > 0) {
      const hasLoc = currentLat !== null && currentLng !== null;

      // Attach distances if user has location
      const results = data.results.map(m => {
        if (hasLoc && m.resolvedLat != null && m.resolvedLng != null) {
          const dist = haversineKm(currentLat, currentLng, m.resolvedLat, m.resolvedLng);
          return { ...m, distanceKm: parseFloat(dist.toFixed(2)) };
        }
        return m;
      }).sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));

      const msg = `Found <strong>${results.length}</strong> pharmacy result(s) for <em>${escHtml(data.detectedMedicine)}</em>`;
      resultsArea.innerHTML = `
        <div class="results-summary">${msg}</div>
        <div class="results-grid">${results.map(m => buildMedCard(m, hasLoc)).join('')}</div>`;

      // Update scanning status
      statusEl.querySelector('.scan-searching').remove();
    }

  } catch (err) {
    scanBtn.disabled = false;
    scanBtn.textContent = '🔍 Scan & Search';
    statusEl.className = 'scan-status scan-error';
    statusEl.innerHTML = `⚠ Network error — ${escHtml(err.message)}`;
  }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
