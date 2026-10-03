/* =========================================
   API KEYS & CONFIG
========================================= */
// IMPORTANT: Paste your free Gemini API key here
const GEMINI_API_KEY = ""; // Do NOT put a real key in front-end code (anyone can read it). Use a backend proxy for a public site.

/* =========================================
   MASTER DATASETS & LIVE CONTEXT HOLDERS
========================================= */
let liveNWSAlertsText = "No active severe weather alerts.";

const resourceData = [
  { id: 1, name: "Texas Health Harris Hosp.", type: "hospital", lat: 32.730, lng: -97.340, status: "Critical Vol", health: "red", capacityNum: 95 },
  { id: 2, name: "FW Fire Station 43", type: "fire", lat: 32.780, lng: -97.310, status: "Operational", health: "green", capacityNum: 20 },
  { id: 3, name: "Will Rogers Shelter", type: "shelter", lat: 32.747, lng: -97.368, status: "Filling Fast", health: "yellow", capacityNum: 80 },
  { id: 4, name: "JPS Health Network", type: "hospital", lat: 32.715, lng: -97.320, status: "Backup Power", health: "yellow", capacityNum: 75 },
  { id: 5, name: "Northside Community Center", type: "shelter", lat: 32.790, lng: -97.350, status: "Open", health: "green", capacityNum: 40 },
  { id: 6, name: "Tarrant Water/Food Depot", type: "supply", lat: 32.755, lng: -97.300, status: "High Stock", health: "green", capacityNum: 30 }
];

const weatherProtocols = {
  tornado: { alertLevel: "HIGH VULNERABILITY", before: ["Identify basement/interior room.", "Charge radios."], during: ["Go to interior room away from windows.", "Cover your head."], after: ["Check for injuries.", "Avoid power lines."] },
  flood: { alertLevel: "FAST-MOVING RISK", before: ["Move items to higher floors.", "Clear gutters."], during: ["Turn Around, Don't Drown.", "Abandon stranded cars."], after: ["Avoid floodwater.", "Document damage."] },
  power: { alertLevel: "UTILITY INTERRUPTION", before: ["Charge power banks.", "Freeze water containers."], during: ["Keep fridge closed.", "Disconnect major appliances."], after: ["Check food temps.", "Turn electronics on gradually."] }
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

const socialPosts = [
  { source: "X (Twitter)", user: "@DFWwx", text: "Water completely over road at University Dr! #fwtx", time: "2m ago" },
  { source: "Nextdoor", user: "Sarah M.", text: "Transformer blew in Fairmount. No power here.", time: "12m ago" }
];

const missingPersons = [
  { name: "Example Person A", age: 72, lastSeen: "Example Area 1" },
  { name: "Example Person B", age: 8, lastSeen: "Example Area 2" }
];

/* =========================================
   GLOBAL STATE
========================================= */
let map, radarLayer, outageLayer, trafficLayer, userMarker, accuracyCircle, routingControl;
let isLowBandwidth = false;
let currentRole = 'public'; 
let currentCategory = 'all';
let userLocation = null;
const markersMap = {};

/* =========================================
   UI & TOAST ALERTS
========================================= */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function showToast(message, type = 'warning') {
  const toast = document.getElementById('toastNotification');
  if(!toast) return;
  toast.innerText = message;
  toast.style.background = type === 'error' ? 'var(--primary)' : 'var(--warning)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/* =========================================
   INITIALIZATION
========================================= */
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  startLiveClock();
  fetchLiveWeather();
  fetchLiveNWSAlerts();
  loadChecklistState();
  initSupplyChart();
  setInterval(() => { fetchLiveWeather(); fetchLiveNWSAlerts(); }, 300000); // refresh every 5 min
  
  renderList(resourceData);
  renderMarkers(resourceData);
  renderSocial();
  renderMissing();
  renderCADTicker();
  switchWeatherTab('tornado', document.querySelector('.protocol-tabs .btn'));
  fetchFemaShelters();
  renderCheckins();
  initLanguage();
});

function startLiveClock() {
  const tick = () => {
    const clockEl = document.getElementById('liveClock');
    if (clockEl) clockEl.innerText = new Date().toLocaleTimeString('en-US', { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

/* =========================================
   LIVE WEATHER & NWS FEEDS
========================================= */
async function fetchLiveWeather() {
  const box = document.getElementById('liveWeatherBox');
  if(!box) return;
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=32.7555&longitude=-97.3308&current_weather=true&temperature_unit=fahrenheit&windspeed_unit=mph');
    if (!res.ok) throw new Error('weather ' + res.status);
    const data = await res.json();
    const w = data.current_weather;
    const codes = { 0:"Clear", 1:"Mostly Clear", 2:"Partly Cloudy", 3:"Overcast", 45:"Fog", 48:"Freezing Fog", 51:"Light Drizzle", 53:"Drizzle", 55:"Heavy Drizzle", 61:"Light Rain", 63:"Rain", 65:"Heavy Rain", 71:"Light Snow", 73:"Snow", 75:"Heavy Snow", 80:"Rain Showers", 81:"Heavy Showers", 82:"Violent Showers", 95:"Thunderstorm", 96:"Thunderstorm + Hail", 99:"Severe Thunderstorm + Hail" };
    const cond = codes[w.weathercode] || "Active Weather";

    box.innerHTML = `<div><div style="font-size:0.8rem; opacity:0.8">Fort Worth, TX</div><div class="weather-temp">${Math.round(w.temperature)}°F</div></div>
                     <div class="weather-details"><div>${cond}</div><div>Wind: ${w.windspeed} mph</div></div>`;
  } catch (e) {
    box.innerHTML = "<h4>Weather Feed Offline</h4>";
  }
}

async function fetchLiveNWSAlerts() {
  const easContainer = document.getElementById('easFeed');
  const banners = document.getElementById('alertBannersContainer');
  try {
    const res = await fetch('https://api.weather.gov/alerts/active?zone=TXC439');
    if (!res.ok) throw new Error('NWS status ' + res.status);
    const data = await res.json();
    const alerts = data.features || [];

    if (alerts.length) {
      liveNWSAlertsText = alerts.map(a => '- ' + a.properties.headline).join('\n');
      if (easContainer) easContainer.innerHTML = alerts.map(a =>
        `<div class="feed-item"><div class="feed-header"><span class="eas-tag">NWS Alert</span> <span>Live</span></div><div class="feed-body"><b>${escapeHtml(a.properties.headline)}</b></div></div>`).join('');
      if (banners) banners.innerHTML = alerts.slice(0, 3).map(a => {
        const sev = a.properties.severity;
        const cls = (sev === 'Extreme' || sev === 'Severe') ? 'critical' : 'warning';
        return `<div class="alert-banner ${cls}"><span class="alert-tag">${escapeHtml(a.properties.event)}</span><span class="alert-text">${escapeHtml(a.properties.headline)}</span></div>`;
      }).join('');
    } else {
      liveNWSAlertsText = "No active NWS weather warnings.";
      if (banners) banners.innerHTML = '';
      if (easContainer) easContainer.innerHTML = `<div class="feed-item"><div class="feed-body">No active emergency warnings for Tarrant County.</div></div>`;
    }
  } catch (e) {
    liveNWSAlertsText = "NWS Feed temporarily unavailable.";
    if (easContainer) easContainer.innerHTML = `<div class="feed-item"><div class="feed-body">Alert feed unavailable. Check weather.gov directly.</div></div>`;
  }
}

/* =========================================
   ROLES, BANDWIDTH, & TABS
========================================= */
function toggleRole() {
  currentRole = document.getElementById('roleToggle').value;
  document.body.className = `role-${currentRole}`;
  if (isLowBandwidth) document.body.classList.add('low-bandwidth');

  if (currentRole === 'public') {
    if (outageLayer && map.hasLayer(outageLayer)) toggleOutageLayer();
    const ops = document.getElementById('tab-ops');
    if (ops && ops.classList.contains('active')) switchRightTab('weather', document.querySelector('.tab-btn'));
  }
}

function toggleLowBandwidth() {
  isLowBandwidth = !isLowBandwidth;
  const btn = document.getElementById('bandwidthToggleBtn');
  if(!btn) return;
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
  const target = document.getElementById(`tab-${tabId}`);
  if(target) target.classList.add('active');
}

/* =========================================
   MAP & LAYERS (FIXED ZOOM RESTRICTIONS)
========================================= */
function initMap() {
  map = L.map('map', { minZoom: 4, maxZoom: 19 }).setView([32.755, -97.330], 11);
  
  const esri = (name, opts = {}) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${name}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, attribution: 'Tiles &copy; Esri', ...opts });
  const street = esri('World_Street_Map');
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
  const satellite = esri('World_Imagery');
  const dark = L.layerGroup([esri('Canvas/World_Dark_Gray_Base', { maxNativeZoom: 16 }), esri('Canvas/World_Dark_Gray_Reference', { maxNativeZoom: 16 })]);
  street.addTo(map);
  L.control.layers({ 'Street (detailed)': street, 'OpenStreetMap': osm, 'Satellite': satellite, 'Dark': dark }, null, { position: 'bottomright' }).addTo(map);

  outageLayer = L.layerGroup([ L.circle([32.72, -97.33], { radius: 2000, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.3 }).bindPopup("Grid Failure") ]);
  trafficLayer = L.layerGroup([ L.polyline([[32.75, -97.36], [32.73, -97.36]], { color: '#991b1b', weight: 5 }).bindPopup("Road Closed") ]);

  map.on('click', function(e) {
    if (currentRole === 'public') {
      if (confirm("Report a hazard at this location?")) {
        L.circleMarker(e.latlng, { color: '#94a3b8', radius: 8, fillOpacity: 0.8 })
          .addTo(map).bindPopup("<b>User Reported Hazard</b><br>Pending Commander Verification");
        showToast("Hazard submitted for EOC verification.");
      }
    }
  });
}

async function toggleRadarLayer() {
  if (isLowBandwidth) { showToast("Radar disabled in Low-Bandwidth mode.", "error"); return; }
  const btn = document.getElementById('radarToggleBtn');
  
  if (radarLayer && map.hasLayer(radarLayer)) {
    map.removeLayer(radarLayer);
    if(btn) { btn.innerText = "🌪️ Radar: Off"; btn.classList.remove('active-layer'); }
  } else {
    try {
      if(btn) btn.innerText = "Loading...";
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      if (!res.ok) throw new Error('radar ' + res.status);
      const data = await res.json();
      const frame = data.radar.past[data.radar.past.length - 1];
      
      radarLayer = L.tileLayer(`${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, { 
        opacity: 0.65, maxNativeZoom: 7, 
        minZoom: 4,
        maxZoom: 18,
        attribution: 'Radar © RainViewer' 
      }).addTo(map);
      
      if(btn) { btn.innerText = "🌪️ Radar: On"; btn.classList.add('active-layer'); }
    } catch (e) { 
      if(btn) btn.innerText = "🌪️ Radar: Off";
      showToast("Unable to connect to weather satellite.", "error"); 
    }
  }
}

function toggleOutageLayer() {
  const btn = document.getElementById('outageToggleBtn');
  if(!btn) return;
  if (map.hasLayer(outageLayer)) { map.removeLayer(outageLayer); btn.classList.remove('active-layer'); }
  else { outageLayer.addTo(map); btn.classList.add('active-layer'); }
}

function toggleTrafficLayer() {
  const btn = document.getElementById('trafficToggleBtn');
  if(!btn) return;
  if (map.hasLayer(trafficLayer)) { map.removeLayer(trafficLayer); btn.classList.remove('active-layer'); }
  else { trafficLayer.addTo(map); btn.classList.add('active-layer'); }
}

function createCustomIcon(type) {
  const isShelter = type === 'shelter' || type === 'hospital';
  const isUser = type === 'user';
  let color = isShelter ? '#d32f2f' : '#38bdf8';
  if (isUser) color = '#10b981';
  let svg = isUser ? '<circle cx="12" cy="12" r="6"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>' : '<path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10"/>';
  return L.divIcon({
    className: 'custom-map-icon',
    html: `<div class="icon-wrapper"><div class="pulse-ring ${isUser ? 'user' : 'shelter'}"></div><svg width="24" height="24" viewBox="0 0 24 24" fill="${color}" stroke="#ffffff" stroke-width="1.5">${svg}</svg></div>`,
    iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16]
  });
}

function renderMarkers(data) {
  Object.keys(markersMap).forEach(id => { map.removeLayer(markersMap[id]); delete markersMap[id]; });
  data.forEach(loc => {
    const marker = L.marker([loc.lat, loc.lng], { icon: createCustomIcon(loc.type) }).addTo(map);
    marker.bindPopup(`<b>${loc.name}</b><br>Type: ${loc.type}<br>Status: ${loc.status}`);
    markersMap[loc.id] = marker;
  });
}

/* =========================================
   GPS & ROUTING
========================================= */
function getUserLocation() {
  const btn = document.getElementById('gpsStatusBtn');
  if (!navigator.geolocation) { showToast("GPS not supported by your browser.", "error"); return; }
  
  if(btn) btn.innerText = "Locating...";
  navigator.geolocation.getCurrentPosition(pos => {
    userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (userMarker) map.removeLayer(userMarker);
    if (accuracyCircle) map.removeLayer(accuracyCircle);
    
    userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: createCustomIcon('user') }).addTo(map);
    accuracyCircle = L.circle([userLocation.lat, userLocation.lng], { radius: pos.coords.accuracy, color: '#10b981', fillOpacity: 0.15 }).addTo(map);
    map.flyTo([userLocation.lat, userLocation.lng], 13);
    if(btn) btn.innerText = "📍 GPS: Active";
    
    calculateDistances();
    filterLocations();
  }, err => { if(btn) btn.innerText = "GPS Error"; showToast("Failed to retrieve GPS location.", "error"); });
}

function calculateDistances() {
  if (!userLocation) return;
  resourceData.forEach(loc => {
    const R = 3958.8;
    const dLat = (loc.lat - userLocation.lat) * Math.PI / 180;
    const dLon = (loc.lng - userLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(userLocation.lat*Math.PI/180)*Math.cos(loc.lat*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    loc.distance = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  });
  resourceData.sort((a, b) => (a.distance || 0) - (b.distance || 0));
}

function routeToLocation(lat, lng) {
  if (!userLocation) { showToast("Please enable 'Locate Me (GPS)' first to get directions."); return; }
  if (routingControl) map.removeControl(routingControl);
  
  routingControl = L.Routing.control({
    waypoints: [ L.latLng(userLocation.lat, userLocation.lng), L.latLng(lat, lng) ],
    routeWhileDragging: false, addWaypoints: false,
    lineOptions: { styles: [{ color: '#38bdf8', weight: 6 }] },
    show: false
  }).addTo(map);
  routingControl.on('routingerror', () => showToast("Could not find a route.", "error"));
  showToast("Calculating route...", "warning");
}

/* =========================================
   UI RENDERERS
========================================= */
function renderList(data) {
  const container = document.getElementById('locationList');
  if (!container) return;
  container.innerHTML = '';
  data.forEach(loc => {
    const capColor = loc.capacityNum >= 80 ? '#ef4444' : loc.capacityNum >= 60 ? '#f59e0b' : '#10b981';
    const distBadge = loc.distance ? `<span class="distance-tag">${loc.distance.toFixed(1)} mi</span>` : '';
    const capText = loc.capText || `${loc.capacityNum}% ${currentLang === 'es' ? 'lleno' : 'full'}`;
    const tag = loc.sample ? '<span class="eas-tag">EXAMPLE</span> ' : '';
    const div = document.createElement('div');
    div.className = `location-card status-${loc.health}`;
    div.innerHTML = `<h4>${tag}${escapeHtml(loc.name)}</h4><div class="card-meta"><span>${loc.type.toUpperCase()} - ${escapeHtml(loc.status)}</span>${distBadge}</div>
                     <div class="card-meta"><span>${escapeHtml(capText)}</span></div>
                     <div class="capacity-meter-bg"><div class="capacity-meter-fill" style="width: ${loc.capacityNum}%; background: ${capColor};"></div></div>`;
    div.onclick = () => {
      map.flyTo([loc.lat, loc.lng], 14);
      if (markersMap[loc.id]) markersMap[loc.id].openPopup();
      routeToLocation(loc.lat, loc.lng);
    };
    container.appendChild(div);
  });
}

function filterLocations() {
  const searchInput = document.getElementById('searchInput');
  const q = searchInput ? searchInput.value.toLowerCase() : '';
  const filtered = resourceData.filter(f => (currentCategory === 'all' || f.type === currentCategory) && (f.name.toLowerCase().includes(q) || f.status.toLowerCase().includes(q)));
  const counter = document.getElementById('resultsCounter');
  if(counter) counter.innerText = `Showing ${filtered.length} locations`;
  renderList(filtered);
  renderMarkers(filtered);
}

function setCategory(cat, btn) { 
  currentCategory = cat; 
  document.querySelectorAll('.left-panel .btn').forEach(b => b.classList.remove('active')); 
  if(btn) btn.classList.add('active'); 
  filterLocations(); 
}

/* =========================================
   SAFETY PROTOCOLS & CHECKLIST
========================================= */
function switchWeatherTab(key, btn) {
  currentProtocol = key;
  if (btn) { document.querySelectorAll('.protocol-tabs .btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
  const data = (currentLang === 'es' ? weatherProtocolsEs : weatherProtocols)[key];
  const bodyEl = document.getElementById('protocolBody');
  if (bodyEl && data) {
    const list = arr => `<ul>${arr.map(i => `<li>${i}</li>`).join('')}</ul>`;
    bodyEl.innerHTML = `<span style="background:var(--primary); padding:2px 6px; border-radius:3px; font-weight:bold; font-size:0.7rem;">${data.alertLevel}</span>
      <div style="margin-top:8px;"><b>BEFORE:</b> ${list(data.before)}</div>
      <div style="margin-top:8px; color:var(--warning);"><b>DURING:</b> ${list(data.during)}</div>
      <div style="margin-top:8px; color:var(--success);"><b>AFTER:</b> ${list(data.after)}</div>`;
  }
}

function renderChecklist() {
  const c = document.getElementById('checklist'); 
  if(!c) return;
  c.innerHTML = '';
  let checkedCount = 0;
  checklistData.forEach((item, i) => {
    if(item.checked) checkedCount++;
    c.innerHTML += `<li><label style="cursor:pointer;"><input type="checkbox" ${item.checked?'checked':''} onchange="toggleCheckItem(${i})"> <span style="${item.checked?'text-decoration:line-through; color:#64748b;':''}">${escapeHtml(item.text)}</span></label>
    <button aria-label="Delete item" onclick="deleteCheckItem(${i})" style="background:transparent; color:#ef4444; border:none; cursor:pointer;">✕</button></li>`;
  });
  const pct = checklistData.length ? (checkedCount / checklistData.length) * 100 : 0;
  const countEl = document.getElementById('checkCount');
  const fillEl = document.getElementById('progressFill');
  if(countEl) countEl.innerText = `${checkedCount} / ${checklistData.length}`;
  if(fillEl) {
    fillEl.style.width = `${pct}%`;
    fillEl.style.background = pct === 100 ? '#10b981' : 'var(--accent)';
  }
}
function toggleCheckItem(i) { checklistData[i].checked = !checklistData[i].checked; saveChecklist(); renderChecklist(); }
function deleteCheckItem(i) { checklistData.splice(i, 1); saveChecklist(); renderChecklist(); }
function addCustomChecklistItem() {
  const inputEl = document.getElementById('customItemInput');
  if(!inputEl) return;
  const v = inputEl.value.trim();
  if(!v) return;
  checklistData.push({ id: 'c'+Date.now(), text: v, checked: false });
  inputEl.value = ''; saveChecklist(); renderChecklist();
}
function handleCustomItemKey(e) { if(e.key === 'Enter') addCustomChecklistItem(); }
function saveChecklist() { localStorage.setItem('eoc_checklist', JSON.stringify(checklistData)); }
function loadChecklistState() { const saved = localStorage.getItem('eoc_checklist'); if(saved) { try { checklistData = JSON.parse(saved); } catch(e) {} } renderChecklist(); }

/* =========================================
   LIVE DYNAMIC AI ASSISTANT
========================================= */
async function askAI() {
  const input = document.getElementById('aiInput');
  const chat = document.getElementById('aiChatBox');
  if(!input || !chat) return;
  
  const query = input.value.trim();
  if (!query) return;

  chat.innerHTML += `<p style="margin-top:8px; color:var(--accent);"><b>You:</b> ${escapeHtml(query)}</p>`;
  input.value = '';
  
  chat.innerHTML += `<p id="aiTyping" style="margin-top:8px; color:var(--text-muted);"><em>AI is processing live regional feeds...</em></p>`;
  chat.scrollTop = chat.scrollHeight;

  if (!GEMINI_API_KEY) {
    document.getElementById('aiTyping').remove();
    chat.innerHTML += `<p style="margin-top:8px; color:#ef4444;"><b>System Error:</b> Please insert your free Gemini API Key at the top of script.js.</p>`;
    return;
  }

  const aiContext = `You are an Emergency Operations Center (EOC) Assistant for Tarrant County, Fort Worth.
    Live National Weather Service data:
    ${liveNWSAlertsText}
    EXAMPLE CAD incidents: ${JSON.stringify(cadIncidents)}
    EXAMPLE social reports: ${JSON.stringify(socialPosts)}
    Give brief, 2-3 sentence safety advice based on this context and the conversation so far. If anyone may be in immediate danger, tell them to call 911. Do not invent facts that are not in the data above. Reply in ${currentLang === 'es' ? 'Spanish' : 'English'}.`;
  chatHistory.push({ role: 'user', parts: [{ text: query }] });

  try {
    // Check Google's current model list if this model name stops working
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: aiContext }] }, contents: chatHistory.slice(-11) })
    });
    
    const data = await response.json();
    const typingEl = document.getElementById('aiTyping');
    if(typingEl) typingEl.remove();
    
    if (data.error) throw new Error(data.error.message);
    
    const aiResponse = data.candidates[0].content.parts[0].text;
    chatHistory.push({ role: 'model', parts: [{ text: aiResponse }] });
    chat.innerHTML += `<p style="margin-top:8px; color:var(--success);"><b>EOC AI:</b> ${escapeHtml(aiResponse)}</p>`;
    
  } catch (error) {
    chatHistory.pop(); // drop the unanswered question
    const typingEl = document.getElementById('aiTyping');
    if(typingEl) typingEl.remove();
    chat.innerHTML += `<p style="margin-top:8px; color:#ef4444;"><b>Connection Error:</b> ${error.message}</p>`;
  }
  
  chat.scrollTop = chat.scrollHeight;
}
/* =========================================
   OPS CHARTS & FEEDS
========================================= */
function initSupplyChart() {
  const ctx = document.getElementById('supplyChart');
  if(!ctx) return;
  new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: { labels: ['Water', 'Blankets', 'MREs', 'Kits'], datasets: [{ data: [85, 42, 90, 60], backgroundColor: ['#38bdf8', '#38bdf8', '#38bdf8', '#d32f2f'], borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { max: 100, grid: { color: '#334155' } }, x: { grid: { display: false } } } }
  });
}

function renderSocial() {
  const el = document.getElementById('socialFeed');
  if (el) el.innerHTML = socialPosts.map(p => `<div class="feed-item"><div class="feed-header"><strong>${escapeHtml(p.user)}</strong> <span><span class="eas-tag">EXAMPLE</span> ${escapeHtml(p.source)}</span></div><div class="feed-body">${escapeHtml(p.text)}</div></div>`).join('');
}
function renderMissing() {
  const el = document.getElementById('missingList');
  if (el) el.innerHTML = missingPersons.map(p => `<li><span class="eas-tag">EXAMPLE</span> <strong>${escapeHtml(p.name)}</strong> (${p.age}) - LKA: ${escapeHtml(p.lastSeen)}</li>`).join('');
}
function renderCADTicker() { 
  const el = document.getElementById('cadTickerList');
  if(el) el.innerHTML = [...cadIncidents, ...cadIncidents].map(i => `<li class="ticker-item"><span class="time">[${i.time}]</span> <span class="${i.level}">${i.code}</span> - ${i.type} @ ${i.loc}</li>`).join(''); 
}

/* =========================================
   EXTRA STATE
========================================= */
let chatHistory = [];
let currentProtocol = 'tornado';
let currentLang = localStorage.getItem('eoc_lang') || 'en';
let checkins = [];
try { checkins = JSON.parse(localStorage.getItem('eoc_checkins')) || []; } catch (e) {}
resourceData.forEach(r => r.sample = true); // built-in facilities are example data

/* =========================================
   LIVE SHELTERS (FEMA National Shelter System,
   synced daily with the American Red Cross shelter database)
========================================= */
async function fetchFemaShelters() {
  const url = 'https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0/query?where=1%3D1&geometry=-98.2,32.2,-96.5,33.3&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=json';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('FEMA ' + res.status);
    const data = await res.json();
    const feats = (data.features || []).filter(f => f.geometry);
    if (!feats.length) { showToast("No open shelters reported nearby right now. Showing example data."); return; }
    for (let i = resourceData.length - 1; i >= 0; i--) {
      if (resourceData[i].sample && resourceData[i].type === 'shelter') resourceData.splice(i, 1);
    }
    feats.forEach((f, i) => {
      const a = f.attributes || {};
      const cap = Number(a.EVACUATION_CAPACITY || a.POST_IMPACT_CAPACITY) || 0;
      const pop = Number(a.TOTAL_POPULATION) || 0;
      const pct = cap ? Math.min(100, Math.round(pop / cap * 100)) : 0;
      resourceData.push({ id: 1000 + i, name: a.SHELTER_NAME || 'Shelter', type: 'shelter', lat: f.geometry.y, lng: f.geometry.x,
        status: 'Open', health: pct >= 80 ? 'red' : pct >= 60 ? 'yellow' : 'green', capacityNum: pct,
        capText: cap ? `${pop} / ${cap} people` : 'Capacity not reported' });
    });
    if (userLocation) calculateDistances();
    filterLocations();
    showToast(`Loaded ${feats.length} live shelters (FEMA/Red Cross).`);
  } catch (e) {
    showToast("Live shelter feed unavailable. Showing example data.", "error");
  }
}

/* =========================================
   SAFE & WELL CHECK-IN
========================================= */
function submitSafeWell() {
  const name = document.getElementById('swName').value.trim();
  const status = document.getElementById('swStatus').value;
  const loc = document.getElementById('swLocation').value.trim();
  if (!name) { showToast("Please enter your name.", "error"); return; }
  checkins.unshift({ name, status, loc, time: new Date().toLocaleString() });
  checkins = checkins.slice(0, 50);
  localStorage.setItem('eoc_checkins', JSON.stringify(checkins));
  document.getElementById('swName').value = '';
  document.getElementById('swLocation').value = '';
  renderCheckins();
  showToast(status === 'help' ? "Saved. If you are in danger, call 911 now." : "Check-in saved. Stay safe!");
}
function renderCheckins() {
  const el = document.getElementById('checkinList');
  if (!el) return;
  el.innerHTML = checkins.length ? checkins.map(c =>
    `<li>${c.status === 'help' ? '🆘' : '✅'} <strong>${escapeHtml(c.name)}</strong> - ${escapeHtml(c.loc || 'No location')}<br><span style="color:var(--text-muted)">${escapeHtml(c.time)}</span></li>`).join('')
    : '<li>No check-ins yet.</li>';
}

/* =========================================
   PRINT CHECKLIST
========================================= */
function printChecklist() {
  let area = document.getElementById('printArea');
  if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
  area.innerHTML = `<h1>${currentLang === 'es' ? 'Lista de supervivencia' : 'Survival Checklist'}</h1><ul>` +
    checklistData.map(i => `<li>${i.checked ? '☑' : '☐'} ${escapeHtml(i.text)}</li>`).join('') + '</ul>';
  document.body.classList.add('print-checklist');
  window.print();
  setTimeout(() => document.body.classList.remove('print-checklist'), 500);
}

/* =========================================
   SPANISH / ENGLISH
========================================= */
const weatherProtocolsEs = {
  tornado: { alertLevel: "ALTA VULNERABILIDAD", before: ["Identifique un sótano o cuarto interior.", "Cargue las radios."], during: ["Vaya a un cuarto interior lejos de las ventanas.", "Cúbrase la cabeza."], after: ["Revise si hay heridos.", "Evite los cables eléctricos."] },
  flood: { alertLevel: "RIESGO DE CRECIDA RÁPIDA", before: ["Suba sus cosas a pisos altos.", "Limpie los canalones."], during: ["Dé la vuelta, no se ahogue.", "Abandone los vehículos atrapados."], after: ["Evite el agua de la inundación.", "Documente los daños."] },
  power: { alertLevel: "CORTE DE ELECTRICIDAD", before: ["Cargue baterías portátiles.", "Congele envases de agua."], during: ["Mantenga cerrado el refrigerador.", "Desconecte los aparatos grandes."], after: ["Revise la temperatura de los alimentos.", "Encienda los aparatos poco a poco."] }
};
const ES = {
  "North Texas Safety & Operations": "Seguridad y Operaciones del Norte de Texas", "DEMO DATA": "DATOS DE EJEMPLO", "View As:": "Ver como:",
  "Public Citizen": "Ciudadano", "Incident Commander": "Comandante de Incidentes", "📶 Standard Mode": "📶 Modo estándar", "⚡ Low-BW Mode": "⚡ Bajo ancho de banda",
  "Facilities & Resources": "Instalaciones y Recursos", "All": "Todo", "Med": "Médico", "Shelters": "Refugios", "Supplies": "Suministros",
  "🌪️ Radar: Off": "🌪️ Radar: No", "🌪️ Radar: On": "🌪️ Radar: Sí", "⚡ Utilities: Off": "⚡ Servicios: No", "🚧 Roads: Off": "🚧 Carreteras: No",
  "📍 Locate Me (GPS)": "📍 Ubicarme (GPS)", "📍 GPS: Active": "📍 GPS: Activo", "Live Intel": "En vivo", "Safety": "Seguridad", "AI Triage": "Asistente IA", "Ops Center": "Operaciones",
  "Loading Local Weather...": "Cargando clima local...", "Official Broadcasts (EAS)": "Avisos oficiales (EAS)", "Community Geo-Feed": "Reportes de la comunidad",
  "Emergency Protocols": "Protocolos de emergencia", "Tornado": "Tornado", "Flood": "Inundación", "Grid Fail": "Apagón",
  "Emergency Contacts": "Contactos de emergencia", "Life-threatening emergencies": "Emergencias que ponen en riesgo la vida", "Texas help & shelter info": "Ayuda e info de refugios en Texas", "American Red Cross": "Cruz Roja Americana",
  "Safe & Well Check-In": "Registro: Estoy bien", "I'm safe": "Estoy a salvo", "I need help": "Necesito ayuda", "Submit Check-In": "Enviar registro",
  "Survival Checklist": "Lista de supervivencia", "Add": "Agregar", "🖨️ Print": "🖨️ Imprimir", "AI Safety Assistant": "Asistente de seguridad con IA", "Ask": "Preguntar",
  "Casualty & Missing Tracker (EXAMPLE DATA)": "Víctimas y desaparecidos (DATOS DE EJEMPLO)", "Fatal": "Fallecidos", "Injured": "Heridos", "Missing": "Desaparecidos",
  "Safe & Well Check-Ins": "Registros: Estoy bien", "Regional Supply Levels (EXAMPLE)": "Suministros regionales (EJEMPLO)", "EXAMPLE CAD FEED": "DESPACHO (EJEMPLO)", "EXAMPLE": "EJEMPLO",
  "BEFORE:": "ANTES:", "DURING:": "DURANTE:", "AFTER:": "DESPUÉS:", "No check-ins yet.": "Aún no hay registros.",
  "1 Gallon Water/Person/Day": "1 galón de agua/persona/día", "3-Day Non-Perishable Food": "Comida no perecedera para 3 días", "First Aid & Meds": "Primeros auxilios y medicinas", "Weather Radio & Batteries": "Radio meteorológico y pilas"
};
const ES_PH = {
  "Search hospitals, shelters...": "Buscar hospitales, refugios...", "Add custom item...": "Agregar artículo...", "e.g., Is I-35 flooded?": "ej. ¿Está inundada la I-35?",
  "Your name": "Su nombre", "Where are you? (neighborhood / shelter)": "¿Dónde está? (vecindario / refugio)"
};
const origText = new WeakMap();
const LANG_ROOTS = '.navbar, aside, .map-controls-overlay, footer, #alertBannersContainer';
let langScheduled = false;
const langObserver = new MutationObserver(() => {
  if (currentLang !== 'es' || langScheduled) return;
  langScheduled = true;
  requestAnimationFrame(() => { langObserver.disconnect(); translateNodes(); observeLang(); langScheduled = false; });
});
function observeLang() {
  document.querySelectorAll(LANG_ROOTS).forEach(r => langObserver.observe(r, { childList: true, subtree: true, characterData: true }));
}
function translateNodes() {
  document.querySelectorAll(LANG_ROOTS).forEach(root => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (currentLang === 'es') {
        const t = n.nodeValue.trim();
        if (ES[t]) { if (!origText.has(n)) origText.set(n, n.nodeValue); n.nodeValue = n.nodeValue.replace(t, ES[t]); }
      } else if (origText.has(n)) { n.nodeValue = origText.get(n); origText.delete(n); }
    }
  });
  document.querySelectorAll('input[placeholder]').forEach(i => {
    if (!i.dataset.en) i.dataset.en = i.placeholder;
    i.placeholder = currentLang === 'es' ? (ES_PH[i.dataset.en] || i.dataset.en) : i.dataset.en;
  });
  document.documentElement.lang = currentLang;
}
function setLanguage(lang) {
  langObserver.disconnect();
  currentLang = lang;
  localStorage.setItem('eoc_lang', lang);
  filterLocations();
  switchWeatherTab(currentProtocol);
  renderChecklist();
  renderCheckins();
  translateNodes();
  observeLang();
}
function initLanguage() {
  const sel = document.getElementById('langToggle');
  if (sel) sel.value = currentLang;
  if (currentLang === 'es') setLanguage('es');
}