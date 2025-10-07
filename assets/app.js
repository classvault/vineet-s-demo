/* globals L */
(function () {
  const ENDPOINT = '/cgi-bin/bed.cgi';
  const POLL_INTERVAL_MS = 5000;

  /** @typedef {{hospital:string, ward:string, total:number, available:number, lat:number, lng:number}} Record */

  let allRecords = /** @type {Record[]} */([]);
  let filteredRecords = /** @type {Record[]} */([]);
  let previousAvailabilityByKey = new Map();
  let sortState = { key: 'available', direction: 'desc' };
  let pollTimer = null;

  // DOM elements
  const tbody = document.querySelector('#bedsTable tbody');
  const searchInput = document.getElementById('searchInput');
  const wardFilter = document.getElementById('wardFilter');
  const clearFiltersBtn = document.getElementById('clearFilters');
  const refreshBtn = document.getElementById('refreshBtn');

  // Summaries
  const generalSummary = document.getElementById('generalSummary');
  const icuSummary = document.getElementById('icuSummary');
  const emergencySummary = document.getElementById('emergencySummary');
  const operationSummary = document.getElementById('operationSummary');

  // Lists per ward
  const generalList = document.getElementById('generalList');
  const icuList = document.getElementById('icuList');
  const emergencyList = document.getElementById('emergencyList');
  const operationList = document.getElementById('operationList');

  // Chatbot
  const chatToggle = document.getElementById('chatToggle');
  const chatPanel = document.getElementById('chatPanel');
  const chatClose = document.getElementById('chatClose');
  const chatBody = document.getElementById('chatBody');
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');

  // Map
  let leafletMap = null;
  let markerLayer = null;

  function showToast(message) {
    const toasts = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 5000);

    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        try { new Notification('Bed Availability', { body: message }); } catch (_) {}
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            try { new Notification('Bed Availability', { body: message }); } catch (_) {}
          }
        });
      }
    }
  }

  function recordKey(rec) { return `${rec.hospital}__${rec.ward}`; }

  function classifyBadgeClass(available) {
    if (available > 10) return 'badge green';
    if (available > 0) return 'badge orange';
    return 'badge red';
  }

  function compare(a, b, key, direction) {
    const mul = direction === 'asc' ? 1 : -1;
    let va = a[key], vb = b[key];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    return 0;
  }

  async function fetchRecords() {
    const url = `${ENDPOINT}/list`;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to fetch records');
    const json = await res.json();
    allRecords = Array.isArray(json.records) ? json.records : [];
  }

  function applyFilters() {
    const query = (searchInput.value || '').trim().toLowerCase();
    const ward = wardFilter.value;
    filteredRecords = allRecords.filter((r) => {
      const matchesHospital = r.hospital.toLowerCase().includes(query);
      const matchesWard = !ward || r.ward === ward;
      return matchesHospital && matchesWard;
    });
  }

  function applySort() {
    const { key, direction } = sortState;
    filteredRecords.sort((a, b) => compare(a, b, key, direction));
  }

  function renderTable() {
    tbody.innerHTML = '';
    for (const rec of filteredRecords) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${rec.hospital}</td>
        <td>${rec.ward}</td>
        <td>${rec.total}</td>
        <td><span class="${classifyBadgeClass(rec.available)}">${rec.available}</span></td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderSummaries() {
    const totals = { General: { t: 0, a: 0 }, ICU: { t: 0, a: 0 }, Emergency: { t: 0, a: 0 }, Operation: { t: 0, a: 0 } };
    for (const r of allRecords) {
      if (!totals[r.ward]) continue;
      totals[r.ward].t += r.total;
      totals[r.ward].a += r.available;
    }
    generalSummary.textContent = `${totals.General.a} / ${totals.General.t} available`;
    icuSummary.textContent = `${totals.ICU.a} / ${totals.ICU.t} available`;
    emergencySummary.textContent = `${totals.Emergency.a} / ${totals.Emergency.t} available`;
    operationSummary.textContent = `${totals.Operation.a} / ${totals.Operation.t} available`;
  }

  function renderWardList(targetEl, wardName) {
    targetEl.innerHTML = '';
    const items = allRecords.filter(r => r.ward === wardName).sort((a,b) => b.available - a.available);
    for (const r of items) {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `
        <div>
          <div style="font-weight:600">${r.hospital}</div>
          <div style="opacity:0.7;font-size:12px">Total: ${r.total}</div>
        </div>
        <div class="${classifyBadgeClass(r.available)} badge">${r.available}</div>
      `;
      targetEl.appendChild(el);
    }
  }

  function updateWardLists() {
    renderWardList(generalList, 'General');
    renderWardList(icuList, 'ICU');
    renderWardList(emergencyList, 'Emergency');
    renderWardList(operationList, 'Operation');
  }

  function updateMap() {
    if (!window.L) return;
    if (!leafletMap) {
      leafletMap = L.map('map', { zoomControl: true }).setView([22.885, 78.9629], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(leafletMap);
      markerLayer = L.layerGroup().addTo(leafletMap);
    }
    markerLayer.clearLayers();

    const byHospital = new Map();
    for (const r of allRecords) {
      const key = r.hospital;
      const agg = byHospital.get(key) || { hospital: r.hospital, lat: r.lat, lng: r.lng, total: 0, available: 0 };
      agg.total += r.total; agg.available += r.available; agg.lat = r.lat; agg.lng = r.lng;
      byHospital.set(key, agg);
    }
    for (const [, h] of byHospital) {
      const color = h.available > 10 ? '#22c55e' : (h.available > 0 ? '#f59e0b' : '#ef4444');
      const radius = Math.max(6, Math.min(18, 6 + h.available));
      const marker = L.circleMarker([h.lat, h.lng], { radius, color, fillColor: color, fillOpacity: 0.6, weight: 2 });
      marker.bindPopup(`<b>${h.hospital}</b><br/>Available: ${h.available}<br/>Total: ${h.total}`);
      markerLayer.addLayer(marker);
    }
  }

  function detectAvailabilityIncreases() {
    for (const rec of allRecords) {
      const key = recordKey(rec);
      const prev = previousAvailabilityByKey.get(key) ?? rec.available;
      if (rec.available > prev) {
        showToast(`${rec.ward}: ${rec.hospital} increased to ${rec.available} available`);
      }
    }
    previousAvailabilityByKey.clear();
    for (const rec of allRecords) previousAvailabilityByKey.set(recordKey(rec), rec.available);
  }

  async function refresh() {
    try {
      await fetchRecords();
      applyFilters();
      applySort();
      renderTable();
      renderSummaries();
      updateWardLists();
      updateMap();
      detectAvailabilityIncreases();
    } catch (err) {
      console.error(err);
      showToast('Failed to refresh data');
    }
  }

  function setupSorting() {
    const headers = document.querySelectorAll('#bedsTable thead th');
    headers.forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-key');
        if (!key) return;
        if (sortState.key === key) {
          sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
          sortState.key = key;
          sortState.direction = key === 'hospital' || key === 'ward' ? 'asc' : 'desc';
        }
        applySort();
        renderTable();
      });
    });
  }

  function setupFilters() {
    searchInput.addEventListener('input', () => { applyFilters(); applySort(); renderTable(); });
    wardFilter.addEventListener('change', () => { applyFilters(); applySort(); renderTable(); });
    clearFiltersBtn.addEventListener('click', () => {
      searchInput.value = '';
      wardFilter.value = '';
      applyFilters(); applySort(); renderTable();
    });
  }

  function addChatMessage(kind, text) {
    const el = document.createElement('div');
    el.className = `message ${kind}`;
    el.textContent = text;
    chatBody.appendChild(el);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function parseWardFromText(text) {
    const t = text.toLowerCase();
    if (t.includes('icu')) return 'ICU';
    if (t.includes('emergency') || t.includes('er')) return 'Emergency';
    if (t.includes('operation') || t.includes('ot')) return 'Operation';
    return 'General';
  }

  function hospitalsWithWard(ward) {
    return allRecords.filter(r => r.ward === ward).reduce((map, r) => {
      const best = map.get(r.hospital);
      if (!best || r.available > best.available) map.set(r.hospital, r);
      return map;
    }, new Map());
  }

  function haversineKm(aLat, aLng, bLat, bLng) {
    const R = 6371;
    const dLat = (bLat - aLat) * Math.PI / 180;
    const dLng = (bLng - aLng) * Math.PI / 180;
    const s1 = Math.sin(dLat/2), s2 = Math.sin(dLng/2);
    const c = s1*s1 + Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*s2*s2;
    const d = 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1-c));
    return R * d;
  }

  function suggestHospitals(ward, userLoc) {
    const byHosp = hospitalsWithWard(ward);
    const list = Array.from(byHosp.values());
    if (userLoc) {
      list.sort((a, b) => {
        const da = haversineKm(userLoc.lat, userLoc.lng, a.lat, a.lng);
        const db = haversineKm(userLoc.lat, userLoc.lng, b.lat, b.lng);
        if (a.available === 0 && b.available > 0) return 1;
        if (b.available === 0 && a.available > 0) return -1;
        return da - db;
      });
    } else {
      list.sort((a, b) => b.available - a.available);
    }
    return list.slice(0, 3);
  }

  function handleChatSend() {
    const text = chatInput.value.trim();
    if (!text) return;
    addChatMessage('user', text);
    chatInput.value = '';
    const ward = parseWardFromText(text);

    const wantsNearby = /near\s*me|closest|nearby|around/i.test(text);

    const reply = (loc) => {
      const suggestions = suggestHospitals(ward, loc);
      if (suggestions.length === 0) {
        addChatMessage('bot', `No ${ward} availability found right now.`);
      } else {
        const lines = suggestions.map(s => `${s.hospital}: ${s.available} available`).join(' | ');
        addChatMessage('bot', `${ward} suggestions: ${lines}`);
      }
    };

    if (wantsNearby && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => reply({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reply(null),
        { enableHighAccuracy: false, timeout: 5000 }
      );
    } else {
      reply(null);
    }
  }

  function setupChatbot() {
    chatToggle.addEventListener('click', () => { chatPanel.style.display = 'block'; });
    chatClose.addEventListener('click', () => { chatPanel.style.display = 'none'; });
    chatSend.addEventListener('click', handleChatSend);
    chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleChatSend(); });
  }

  function setupRefresh() {
    refreshBtn.addEventListener('click', refresh);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
  }

  function init() {
    setupSorting();
    setupFilters();
    setupChatbot();
    setupRefresh();
    refresh();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
