/* =========================================
   MERGED MASTER DATASETS
========================================= */
const resourceData = [
  { id: 1, name: "Texas Health Harris Hosp.", type: "hospital", lat: 32.730, lng: -97.340, status: "Critical Vol", health: "red", capacityNum: 95 },
  { id: 2, name: "FW Fire Station 43", type: "fire", lat: 32.780, lng: -97.310, status: "Operational", health: "green", capacityNum: 20 },
  { id: 3, name: "Will Rogers Shelter", type: "shelter", lat: 32.747, lng: -97.368, status: "Filling Fast", health: "yellow", capacityNum: 80 },
  { id: 4, name: "JPS Health Network", type: "hospital", lat: 32.715, lng: -97.320, status: "Backup Power", health: "yellow", capacityNum: 75 },
  { id: 5, name: "Northside Community Center", type: "shelter", lat: 32.790, lng: -97.350, status: "Open", health: "green", capacityNum: 40 },
  { id: 6, name: "Tarrant Water/Food Depot", type: "supply", lat: 32.755, lng: -97.300, status: "High Stock", health: "green", capacityNum: 30 }
];

const weatherProtocols = {
  tornado: {
    alertLevel: "HIGH VULNERABILITY",
    before: ["Identify basement/interior room.", "Charge radios."],
    during: ["Go to interior room away from windows.", "Cover your head."],
    after: ["Check for injuries.", "Avoid power lines."]
  },
  flood: {
    alertLevel: "FAST-MOVING RISK",
    before: ["Move items to higher floors.", "Clear gutters."],
    during: ["Turn Around, Don't Drown.", "Abandon stranded cars."],
    after: ["Avoid floodwater.", "Document damage."]
  },
  power: {
    alertLevel: "UTILITY INTERRUPTION",
    before: ["Charge power banks.", "Freeze water containers."],
    during: ["Keep fridge closed.", "Disconnect major appliances."],
    after: ["Check food temps.", "Turn electronics on gradually."]
  }
};

let checklistData = [
  { id: 'c1', text: '1 Gallon Water/Person/Day', checked: false },
  { id: 'c2', text: '3-Day Non-Perishable Food', checked: false },
  { id: 'c3', text: 'First Aid & Meds', checked: false },
  { id: 'c4', text: 'Weather Radio & Batteries', checked: false }
];

const cadIncidents = [
  { time: "10:01", code: "CODE 3", type: "Water Rescue", loc: "Trinity River Trails", level: "level-1" },
  { time: "09:58", code: "ALARM", type: "Structure Fire", loc: "Camp Bowie Blvd", level: "level-1" },
  { time: "09:54", code: "INFO", type: "Power Line Down", loc: "Magnolia Ave", level: "level-2" }
];

const easBroadcasts = [
  { time: "09:30 AM", agency: "NWS Fort Worth", msg: "Tornado Warning for Tarrant County. Take cover." },
  { time: "08:15 AM", agency: "City Gov", msg: "Boil water notice issued for zones north of I-820." }
];

const socialPosts = [
  { source: "X (Twitter)", user: "@DFWwx", text: "Water completely over road at University Dr! #fwtx", time: "2m ago" },
  { source: "Nextdoor", user: "Sarah M.", text: "Transformer blew in Fairmount. No power here.", time: "12m ago" }
];

const missingPersons = [
  { name: "John Doe", age: 72, lastSeen: "Meadowbrook Area" },
  { name: "Jane Smith", age: 8, lastSeen: "Trinity Park" }
];

/* =========================================
   GLOBAL STATE
========================================= */
let map, radarLayer, outageLayer, trafficLayer, userMarker, accuracyCircle;
let isLowBandwidth = false;
let currentRole = 'public'; 
let currentCategory = 'all';
let userLocation = null;
const markersMap = {};

/* =========================================
   INITIALIZATION
========================================= */
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  startLiveClock();
  fetchLiveWeather();
  loadChecklistState();
  initSupplyChart();
  
  // Render UIs
  renderList(resourceData);
  renderMarkers(resourceData);
  renderEAS();
  renderSocial();
  renderMissing();
  renderCADTicker();
  switchWeatherTab('tornado', document.querySelector('.protocol-tabs .btn'));
  
  if ('serviceWorker' in navigator) {
    localStorage.setItem('eoc_master_cache', JSON.stringify(resourceData));
  }
});

function startLiveClock() {
  setInterval(() => {
    document.getElementById('liveClock').innerText = new Date().toLocaleTimeString('en-US', { hour12: false });
  }, 1000);
}

/* =========================================
   LIVE WEATHER API (Open-Meteo)
========================================= */
async function fetchLiveWeather() {
  const box = document.getElementById('liveWeatherBox');
  try {
    // Fort Worth Coordinates - Fixed temperature_unit parameter added
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=32.75&longitude=-97.33&current_weather=true&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch');
    const data = await res.json();
    const w = data.current_weather;
    
    // WMO Weather interpretation
    const codes = { 0:"Clear", 1:"Mostly Clear", 2:"Partly Cloudy", 3:"Overcast", 45:"Fog", 61:"Rain", 63:"Heavy Rain", 95:"Thunderstorm" };
    const cond = codes[w.weathercode] || "Active Weather";

    box.innerHTML = `
      <div>
        <div style="font-size:0.8rem; opacity:0.8">Fort Worth, TX</div>
        <div class="weather-temp">${Math.round(w.temperature)}°F</div>
      </div>
      <div class="weather-details">
        <div>${cond}</div>
        <div>Wind: ${w.windspeed} mph</div>
      </div>
    `;
  } catch (e) {
    box.innerHTML = "<h4>Weather Feed Offline</h4>";
  }
}

/* =========================================
   ROLES, BANDWIDTH, & TABS
========================================= */
function toggleRole() {
  currentRole = document.getElementById('roleToggle').value;
  document.body.className = `role-${currentRole}`;
  if (isLowBandwidth) document.body.classList.add('low-bandwidth');
  
  // Security restrictions
  if (currentRole === 'public') {
    if (outageLayer && map.hasLayer(outageLayer)) toggleOutageLayer(); 
    document.getElementById('outageToggleBtn').style.display = 'none';
    document.querySelector('.tab-btn.commander-only').style.display = 'none';
    if (document.getElementById('tab-ops').classList.contains('active')) {
      switchRightTab('weather', document.querySelector('.tab-btn'));
    }
  } else {
    document.getElementById('outageToggleBtn').style.display = 'inline-block';
    document.querySelector('.tab-btn.commander-only').style.display = 'inline-block';
  }
}

function toggleLowBandwidth() {
  isLowBandwidth = !isLowBandwidth;
  const btn = document.getElementById('bandwidthToggleBtn');
  if (isLowBandwidth) {
    document.body.classList.add('low-bandwidth');
    btn.innerText = "⚡ Low-BW Mode";
    btn.style.color = "var(--warning)";
    if (radarLayer && map.hasLayer(radarLayer)) toggleRadarLayer();
  } else {
    document.body.classList.remove('low-bandwidth');
    btn.innerText = "📶 Standard Mode";
    btn.style.color = "var(--text)";
  }
}

function switchRightTab(tabId, btnElement) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btnElement.classList.add('active');
  document.getElementById(`tab-${tabId}`).classList.add('active');
}

/* =========================================
   MAP & LAYERS (With Animations & Haversine)
========================================= */
function initMap() {
  map = L.map('map').setView([32.755, -97.330], 11);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18, attribution: '&copy; Esri'
  }).addTo(map);

  outageLayer = L.layerGroup([
    L.circle([32.72, -97.33], { radius: 2000, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.3 }).bindPopup("Grid Failure")
  ]);
  trafficLayer = L.layerGroup([
    L.polyline([[32.75, -97.36], [32.73, -97.36]], { color: '#991b1b', weight: 5 }).bindPopup("Road Closed")
  ]);
}

async function toggleRadarLayer() {
  if (isLowBandwidth) { alert("Radar disabled in Low-Bandwidth."); return; }
  const btn = document.getElementById('radarToggleBtn');
  
  const isRadarVisible = radarLayer && map.hasLayer(radarLayer);
  
  if (isRadarVisible) {
    map.removeLayer(radarLayer);
    btn.innerText = "🌪️ Radar: Off"; 
    btn.classList.remove('active-layer');
  } else {
    try {
      btn.innerText = "Loading...";
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const data = await res.json();
      const latestTime = data.radar.past[data.radar.past.length - 1].time;
      radarLayer = L.tileLayer(`https://tilecache.rainviewer.com/v2/radar/${latestTime}/256/{z}/{x}/{y}/2/1_1.png`, {
        opacity: 0.65, maxZoom: 18, maxNativeZoom: 12
      }).addTo(map);
      btn.innerText = "🌪️ Radar: On"; 
      btn.classList.add('active-layer');
    } catch (e) { btn.innerText = "Radar Err"; }
  }
}

function toggleOutageLayer() {
  const btn = document.getElementById('outageToggleBtn');
  if (map.hasLayer(outageLayer)) { map.removeLayer(outageLayer); btn.classList.remove('active-layer'); }
  else { outageLayer.addTo(map); btn.classList.add('active-layer'); }
}

function toggleTrafficLayer() {
  const btn = document.getElementById('trafficToggleBtn');
  if (map.hasLayer(trafficLayer)) { map.removeLayer(trafficLayer); btn.classList.remove('active-layer'); }
  else { trafficLayer.addTo(map); btn.classList.add('active-layer'); }
}

// Custom Animated Markers
function createCustomIcon(type) {
  const isShelter = type === 'shelter' || type === 'hospital';
  const isUser = type === 'user';
  let color = isShelter ? '#d32f2f' : '#38bdf8';
  if (isUser) color = '#10b981';
  
  let svg = isUser 
    ? '<circle cx="12" cy="12" r="6"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>'
    : '<path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10"/>';

  return L.divIcon({
    className: 'custom-map-icon',
    html: `<div class="icon-wrapper"><div class="pulse-ring ${isUser ? 'user' : 'shelter'}"></div>
           <svg width="24" height="24" viewBox="0 0 24 24" fill="${color}" stroke="#ffffff" stroke-width="1.5">${svg}</svg></div>`,
    iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16]
  });
}

function renderMarkers(data) {
  Object.keys(markersMap).forEach(id => map.removeLayer(markersMap[id]));
  data.forEach(loc => {
    const marker = L.marker([loc.lat, loc.lng], { icon: createCustomIcon(loc.type) }).addTo(map);
    marker.bindPopup(`<b>${loc.name}</b><br>Type: ${loc.type}<br>Status: ${loc.status}`);
    markersMap[loc.id] = marker;
  });
}

// GPS & Distance Tracking
function getUserLocation() {
  const btn = document.getElementById('gpsStatusBtn');
  if (!navigator.geolocation) return alert("GPS not supported");
  
  btn.innerText = "Locating...";
  navigator.geolocation.getCurrentPosition(pos => {
    userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (userMarker) map.removeLayer(userMarker);
    if (accuracyCircle) map.removeLayer(accuracyCircle);
    
    userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: createCustomIcon('user') }).addTo(map);
    accuracyCircle = L.circle([userLocation.lat, userLocation.lng], { radius: pos.coords.accuracy, color: '#10b981', fillOpacity: 0.15 }).addTo(map);
    map.flyTo([userLocation.lat, userLocation.lng], 12);
    btn.innerText = "📍 GPS: Active";
    
    calculateDistances();
    filterLocations();
  }, err => btn.innerText = "GPS Error");
}

function calculateDistances() {
  if (!userLocation) return;
  resourceData.forEach(loc => {
    const R = 3958.8; // miles
    const dLat = (loc.lat - userLocation.lat) * Math.PI / 180;
    const dLon = (loc.lng - userLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(userLocation.lat*Math.PI/180)*Math.cos(loc.lat*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    loc.distance = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  });
  resourceData.sort((a, b) => (a.distance || 0) - (b.distance || 0));
}

/* =========================================
   UI RENDERERS (List, Charts, Checklist)
========================================= */
function renderList(data) {
  const container = document.getElementById('locationList');
  container.innerHTML = '';
  data.forEach(loc => {
    let capColor = loc.capacityNum >= 80 ? '#ef4444' : loc.capacityNum >= 60 ? '#f59e0b' : '#10b981';
    let distBadge = loc.distance ? `<span class="distance-tag">${loc.distance.toFixed(1)} mi away</span>` : '';
    
    const div = document.createElement('div');
    div.className = `location-card status-${loc.health}`;
    div.innerHTML = `
      <h4>${loc.name}</h4>
      <div class="card-meta">
        <span>${loc.type.toUpperCase()} - ${loc.status}</span>
        ${distBadge}
      </div>
      <div class="capacity-meter-bg"><div class="capacity-meter-fill" style="width: ${loc.capacityNum}%; background: ${capColor};"></div></div>
    `;
    div.onclick = () => { map.flyTo([loc.lat, loc.lng], 14); markersMap[loc.id].openPopup(); };
    container.appendChild(div);
  });
}

function filterLocations() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const filtered = resourceData.filter(f => (currentCategory === 'all' || f.type === currentCategory) && (f.name.toLowerCase().includes(q) || f.status.toLowerCase().includes(q)));
  document.getElementById('resultsCounter').innerText = `Showing ${filtered.length} locations`;
  renderList(filtered);
  renderMarkers(filtered);
}
function setCategory(cat, btn) { currentCategory = cat; document.querySelectorAll('.left-panel .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); filterLocations(); }

// Safety Protocols
function switchWeatherTab(key, btn) {
  if (btn) { document.querySelectorAll('.protocol-tabs .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
  const data = weatherProtocols[key];
  document.getElementById('protocolBody').innerHTML = `
    <span style="background:var(--primary); padding:2px 6px; border-radius:3px; font-weight:bold; font-size:0.7rem;">${data.alertLevel}</span>
    <div style="margin-top:8px;"><b>BEFORE:</b> <ul>${data.before.map(i=>`<li>${i}</li>`).join('')}</ul></div>
    <div style="margin-top:8px; color:var(--warning);"><b>DURING:</b> <ul>${data.during.map(i=>`<li>${i}</li>`).join('')}</ul></div>
  `;
}

// Checklist
function renderChecklist() {
  const c = document.getElementById('checklist'); c.innerHTML = '';
  let checkedCount = 0;
  checklistData.forEach((item, i) => {
    if(item.checked) checkedCount++;
    c.innerHTML += `<li><label style="cursor:pointer;"><input type="checkbox" ${item.checked?'checked':''} onchange="toggleCheckItem(${i})"> <span style="${item.checked?'text-decoration:line-through; color:#64748b;':''}">${item.text}</span></label>
    <button onclick="deleteCheckItem(${i})" style="background:transparent; color:#ef4444; border:none; cursor:pointer;">✕</button></li>`;
  });
  const pct = checklistData.length ? (checkedCount / checklistData.length) * 100 : 0;
  document.getElementById('checkCount').innerText = `${checkedCount} / ${checklistData.length}`;
  document.getElementById('progressFill').style.width = `${pct}%`;
  document.getElementById('progressFill').style.background = pct === 100 ? '#10b981' : 'var(--accent)';
}
function toggleCheckItem(i) { checklistData[i].checked = !checklistData[i].checked; saveChecklist(); renderChecklist(); }
function deleteCheckItem(i) { checklistData.splice(i, 1); saveChecklist(); renderChecklist(); }
function addCustomChecklistItem() {
  const v = document.getElementById('customItemInput').value.trim();
  if(!v) return;
  checklistData.push({ id: 'c'+Date.now(), text: v, checked: false });
  document.getElementById('customItemInput').value = '';
  saveChecklist(); renderChecklist();
}
function handleCustomItemKey(e) { if(e.key === 'Enter') addCustomChecklistItem(); }
function saveChecklist() { localStorage.setItem('eoc_checklist', JSON.stringify(checklistData)); }
function loadChecklistState() { const saved = localStorage.getItem('eoc_checklist'); if(saved) checklistData = JSON.parse(saved); renderChecklist(); }

// Ops Chart
function initSupplyChart() {
  new Chart(document.getElementById('supplyChart').getContext('2d'), {
    type: 'bar',
    data: { labels: ['Water', 'Blankets', 'MREs', 'Kits'], datasets: [{ data: [85, 42, 90, 60], backgroundColor: ['#38bdf8', '#38bdf8', '#38bdf8', '#d32f2f'], borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { max: 100, grid: { color: '#334155' } }, x: { grid: { display: false } } } }
  });
}

// Feeds & Ticker
function renderEAS() { document.getElementById('easFeed').innerHTML = easBroadcasts.map(m => `<div class="feed-item"><div class="feed-header"><span class="eas-tag">${m.agency}</span> <span>${m.time}</span></div><div class="feed-body">${m.msg}</div></div>`).join(''); }
function renderSocial() { document.getElementById('socialFeed').innerHTML = socialPosts.map(p => `<div class="feed-item"><div class="feed-header"><strong>${p.user}</strong> <span>${p.source}</span></div><div class="feed-body">${p.text}</div></div>`).join(''); }
function renderMissing() { document.getElementById('missingList').innerHTML = missingPersons.map(p => `<li><strong>${p.name}</strong> (${p.age}) - LKA: ${p.lastSeen}</li>`).join(''); }
function renderCADTicker() { document.getElementById('cadTickerList').innerHTML = [...cadIncidents, ...cadIncidents].map(i => `<li class="ticker-item"><span class="time">[${i.time}]</span> <span class="${i.level}">${i.code}</span> - ${i.type} @ ${i.loc}</li>`).join(''); }