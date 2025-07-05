// Configuration des lignes à afficher
const lines = [
  {
    id: "rer-a",
    label: "RER A – Joinville-le-Pont",
    monitoringRef: "STIF:StopArea:SP:43135:",
    lineRef: "STIF:Line::C00001:",
    gtfsId: "RER-A"
  },
  {
    id: "bus-77",
    label: "Bus 77 – Hippodrome",
    monitoringRef: "STIF:StopArea:SP:463641:",
    lineRef: "STIF:Line::C01777:",
    gtfsId: "BUS-77"
  },
  {
    id: "bus-201",
    label: "Bus 201 – Pyramide/Breuil",
    monitoringRef: "STIF:StopArea:SP:463644:",
    lineRef: "STIF:Line::C02101:",
    gtfsId: "BUS-201"
  }
];

// Chemins vers tes datas statiques
const GTFS_FIRSTLAST_URL = "static/gtfs-firstlast.json";
const GTFS_STOPS_URL = "static/gtfs-stops.json";

// Proxy pour les appels PRIM
const proxyBase = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

let gtfsFirstLast = {};
let gtfsStops = {};

async function loadStaticGTFS() {
  // Charge tes fallback GTFS une seule fois
  try {
    gtfsFirstLast = await (await fetch(GTFS_FIRSTLAST_URL)).json();
  } catch { gtfsFirstLast = {}; }
  try {
    gtfsStops = await (await fetch(GTFS_STOPS_URL)).json();
  } catch { gtfsStops = {}; }
}

async function buildDashboard() {
  await loadStaticGTFS();

  for (const line of lines) {
    // 1. Fetch temps réel passages
    const stopMonitoringUrl = proxyBase + encodeURIComponent(
      `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${line.monitoringRef}`
    );
    let visits = [];
    try {
      const res = await fetch(stopMonitoringUrl);
      if (res.ok) {
        const data = await res.json();
        visits = data.Siri.ServiceDelivery.StopMonitoringDelivery[0].MonitoredStopVisit || [];
      }
    } catch { /* Ignore, fallback plus bas */ }

    // 2. Regroupe par sens (direction)
    const directions = {};
    visits.forEach(v => {
      let dir = (v.MonitoredVehicleJourney.DirectionRef || "unk").replace(/[:.]/g, "-");
      if (!directions[dir]) directions[dir] = [];
      directions[dir].push(v);
    });

    // 3. Pour chaque sens/direction, affiche passages, arrêts desservis, trafic, premier/dernier
    for (const sense of ["up", "down"]) {
      const containerId = `${line.id}-${sense}`;
      const container = document.getElementById(containerId);
      if (!container) continue;
      container.innerHTML = ""; // reset

      // 3.1. Prochains passages (temps réel, sinon vide)
      const trips = directions[sense] || [];
      if (trips.length === 0) {
        container.innerHTML = "<div class='status warn'>Aucun passage temps réel. Service terminé ou données indisponibles.</div>";
      } else {
        for (const trip of trips) {
          // Heures + destination
          const aimed = new Date(trip.MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime);
          const expected = new Date(trip.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime);
          const diffMin = Math.round((expected - new Date()) / 60000);
          const dest = trip.MonitoredVehicleJourney.DestinationName;
          const jpRef = trip.MonitoredVehicleJourney.JourneyPatternRef;
          let stopsText = "";

          // 3.2. Récupère arrêts desservis (PRIM ou fallback GTFS)
          stopsText = await fetchStopsForJourney(jpRef, line.gtfsId, sense);

          // Affichage passage
          const div = document.createElement("div");
          div.classList.add("passage");
          div.innerHTML = `🕒 ${expected.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} – ${dest} (dans ${diffMin} min)
            <div class="stops">${stopsText}</div>`;
          container.appendChild(div);
        }
      }

      // 3.3. Ajoute alertes trafic dynamiques pour ce sens
      await injectTraffic(line.lineRef, container);

      // 3.4. Premier/dernier passage (fallback GTFS)
      const schedule = getFirstLastTimes(line.gtfsId, sense);
      if (schedule) {
        const schedDiv = document.createElement("div");
        schedDiv.className = "schedule";
        schedDiv.innerHTML = `Premier : ${schedule.first} | Dernier : ${schedule.last}`;
        container.appendChild(schedDiv);
      }
    }
  }
}

// Récupère les arrêts pour un trip donné (PRIM, sinon GTFS)
async function fetchStopsForJourney(journeyPatternRef, gtfsId, sense) {
  if (!journeyPatternRef) return "";
  // 1. Essaye PRIM
  try {
    const jpUrl = proxyBase + encodeURIComponent(
      `https://prim.iledefrance-mobilites.fr/marketplace/journey-patterns/${journeyPatternRef}`
    );
    const res = await fetch(jpUrl);
    if (res.ok) {
      const jpData = await res.json();
      if (jpData.stopPoints && jpData.stopPoints.length > 1) {
        return "Dessert : " + jpData.stopPoints.map(sp => sp.name).join(" ➔ ");
      }
    }
  } catch { /* Ignore */ }
  // 2. Fallback GTFS local
  if (gtfsStops[gtfsId] && gtfsStops[gtfsId][sense]) {
    return "Dessert : " + gtfsStops[gtfsId][sense].join(" ➔ ");
  }
  return "Arrêts inconnus";
}

// Ajoute les messages trafic (alertes) pour la ligne
async function injectTraffic(lineRef, container) {
  try {
    const trafficUrl = proxyBase + encodeURIComponent(
      `https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${lineRef}`
    );
    const res = await fetch(trafficUrl);
    if (!res.ok) return;
    const data = await res.json();
    const messages = data.Siri.ServiceDelivery.GeneralMessageDelivery[0].InfoMessage || [];
    const now = new Date();
    messages.forEach(m => {
      const start = new Date(m.ValidityPeriod.StartTime);
      const end = new Date(m.ValidityPeriod.EndTime);
      if (now >= start && now <= end) {
        const alertDiv = document.createElement("div");
        alertDiv.classList.add("traffic-alert");
        alertDiv.textContent = `⚠️ ${m.Message.Text}`;
        container.appendChild(alertDiv);
      }
    });
  } catch { /* Ignore */ }
}

// Retourne horaires premier/dernier train/bus depuis GTFS fallback
function getFirstLastTimes(gtfsId, sense) {
  if (!gtfsFirstLast[gtfsId] || !gtfsFirstLast[gtfsId][sense]) return null;
  return gtfsFirstLast[gtfsId][sense]; // {first: "05:12", last: "00:40"}
}

// -------------- modules météo, velib, courses comme avant ----------------
async function fetchWeather() {
  const lat = 48.828, lon = 2.442;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) { document.getElementById("weather").innerHTML = "🌤 Erreur météo"; return; }
    const data = await res.json();
    const w = data.current_weather;
    document.getElementById("weather").innerHTML = `<h2>🌤 Météo</h2>
      Temp : ${w.temperature}°C<br>Vent : ${w.windspeed} km/h<br>Condition : ${w.weathercode}`;
  } catch {
    document.getElementById("weather").innerHTML = "🌤 Erreur météo";
  }
}

async function fetchVelib() {
  const url = "https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_status.json";
  try {
    const res = await fetch(url);
    if (!res.ok) { document.getElementById("velib").innerHTML = "🚲 Erreur Vélib"; return; }
    const data = await res.json();
    const joinville = data.data.stations.find(s => s.station_id == "12104");
    const breuil = data.data.stations.find(s => s.station_id == "12123");
    document.getElementById("velib").innerHTML = `<h2>🚲 Vélib’</h2>
      Joinville : 🚲 ${joinville?.num_bikes_available ?? "?"} vélos<br>
      Breuil : 🚲 ${breuil?.num_bikes_available ?? "?"} vélos`;
  } catch {
    document.getElementById("velib").innerHTML = "🚲 Erreur Vélib";
  }
}

async function setupCourses() {
  const container = document.getElementById("courses");
  container.innerHTML = "<h2>🐎 Prochaines Courses</h2>";

  // Lis ton fichier JSON dynamique
  let races = [];
  try {
    const res = await fetch("static/races.json");
    if (res.ok) {
      races = await res.json();
    }
  } catch {
    container.innerHTML += "<div>Erreur chargement courses</div>";
    return;
  }

  if (!races.length) {
    container.innerHTML += "<div>Aucune course à venir.</div>";
    return;
  }

  // Affiche chaque course dynamiquement
  races.forEach((race, i) => {
    // Formatage date/heure propre (ex: "Dim 6/07" ou "Mar 8/07")
    const date = new Date(race.datetime);
    const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const label = `${dayNames[date.getDay()]} ${date.getDate()}/${String(date.getMonth()+1).padStart(2,"0")}`;
    const hour = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const raceId = `countdown-race${i}`;
    const block = document.createElement("div");
    block.innerHTML = `🗓 ${label} – ${race.label} – Départ : ${hour}<div class="countdown" id="${raceId}"></div>`;
    container.appendChild(block);

    // Lancer le countdown
    startCountdown(raceId, date);
  });
}

function startCountdown(id, target) {
  function update() {
    const now = new Date(), diff = target - now;
    const el = document.getElementById(id);
    if (!el) return;
    if (diff <= 0) { el.textContent = "🏁 Départ !"; return; }
    const d = Math.floor(diff / (1000*60*60*24)),
          h = Math.floor((diff/3600000)%24),
          m = Math.floor((diff/60000)%60),
          s = Math.floor((diff/1000)%60);
    el.textContent = `⏳ ${d}j ${h}h ${m}m ${s}s`;
  }
  update(); setInterval(update,1000);
}

// Lance tout au chargement
buildDashboard();
fetchWeather();
fetchVelib();
setupCourses();
