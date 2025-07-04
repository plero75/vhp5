import { CONFIG } from './config.js';

const proxy = CONFIG.proxy;
const lineMap = {
  "STIF:StopArea:SP:43135:": "STIF:Line::C01742:",
  "STIF:StopArea:SP:463641:": "STIF:Line::C01789:",
  "STIF:StopArea:SP:463644:": "STIF:Line::C01805:",
};
const cache = { stops: null, firstLast: null, lastFetch: 0 };
const ONE_DAY = 86_400_000;

document.addEventListener("DOMContentLoaded", async () => {
  await loadStatic();
  loop();
  setInterval(loop, 60_000);
  startWeatherLoop();
  if (typeof trouverProchaineCourseVincennes === "function") trouverProchaineCourseVincennes();
});

function loop() {
  clock();
  fetchAll();
}

function clock() {
  document.getElementById("datetime").textContent =
    new Date().toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function loadStatic() {
  try {
    const saved = JSON.parse(localStorage.getItem("dashStatic") || "null");
    if (saved && Date.now() - saved.lastFetch < ONE_DAY) {
      Object.assign(cache, saved);
      return;
    }
    const [stops, firstLast] = await Promise.all([
      fetch("./static/gtfs-stops.json").then((r) => r.ok ? r.json() : []),
      fetch("./static/gtfs-firstlast.json").then((r) => r.ok ? r.json() : {}),
    ]);
    Object.assign(cache, { stops, firstLast, lastFetch: Date.now() });
    localStorage.setItem("dashStatic", JSON.stringify(cache));
  } catch (e) {
    console.warn("Static GTFS indisponible :", e);
  }
}

function fetchAll() {
  horaire("rer", CONFIG.stops.rer, "🚆 RER A");
  horaire("bus77", CONFIG.stops.bus77, "🚌 Bus 77");
  horaire("bus201", CONFIG.stops.bus201, "🚌 Bus 201");
  meteo();
  news();
}

async function horaire(id, stop, title) {
  const scheduleEl = document.getElementById(`${id}-schedules`);
  const firstlastEl = document.getElementById(`${id}-firstlast`);
  scheduleEl.innerHTML = "<span style='color:#888;'>Chargement…</span>";

  try {
    const url = proxy + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${stop}`);
    const data = await fetch(url).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    const visits = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];

    let horairesHTML = "";
    const fl = cache.firstLast?.[id];
    if (fl && fl.first && fl.last) {
      firstlastEl.innerHTML = `♦️ ${fl.first} – ${fl.last}`;
    } else {
      firstlastEl.innerHTML = `♦️ Horaires premiers/derniers non renseignés`;
    }

    if (!visits.length) {
      const now = new Date();
      const firstTime = parseTimeToDate(fl?.first);
      const lastTime = parseTimeToDate(fl?.last);
      if (firstTime && now < firstTime) {
        scheduleEl.innerHTML = `Service non commencé – premier départ prévu à ${fl?.first ?? "heure inconnue"}`;
        return;
      }
      if (lastTime && now > lastTime) {
        scheduleEl.innerHTML = `Service terminé – prochain départ prévu à ${fl?.first ?? "heure inconnue"}`;
        return;
      }
      scheduleEl.innerHTML = "Aucun passage prévu pour l’instant (affichage théorique uniquement)";
      return;
    }

    const passagesByDest = {};
    for (let v of visits.slice(0, 8)) {
      const call = v.MonitoredVehicleJourney.MonitoredCall;
      const dest = Array.isArray(call.DestinationDisplay) ? call.DestinationDisplay[0]?.value : call.DestinationDisplay || "Indisponible";
      if (!passagesByDest[dest]) passagesByDest[dest] = [];
      passagesByDest[dest].push(v);
    }

    for (const [dest, passages] of Object.entries(passagesByDest)) {
      const first = passages[0];
      const callFirst = first.MonitoredVehicleJourney.MonitoredCall;
      const expFirst = new Date(callFirst.ExpectedDepartureTime);
      const now = new Date();
      const timeToExpMin = isNaN(expFirst - now) ? "?" : Math.max(0, Math.round((expFirst - now) / 60000));
      const timeStr = isNaN(expFirst.getTime()) ? "heure inconnue" : expFirst.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
      horairesHTML += `<h3>Vers ${dest} – prochain départ dans : ${timeToExpMin} min (à ${timeStr})</h3>`;

      passages.forEach((v, idx) => {
        const call = v.MonitoredVehicleJourney.MonitoredCall;
        const aimed = new Date(call.AimedDepartureTime);
        const exp = new Date(call.ExpectedDepartureTime);
        const diff = Math.round((exp - aimed) / 60000);
        const late = diff > 1;
        const cancel = (call.ArrivalStatus || "").toLowerCase() === "cancelled";
        const aimedStr = isNaN(aimed.getTime()) ? "heure inconnue" : aimed.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
        const expStr = isNaN(exp.getTime()) ? "heure inconnue" : exp.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
        const timeToExpMin = isNaN(exp - now) ? "?" : Math.max(0, Math.round((exp - now) / 60000));

        let crowd = "";
        const occ = v.MonitoredVehicleJourney?.OccupancyStatus || v.MonitoredVehicleJourney?.Occupancy || "";
        if (occ) {
          if (/full|crowd|high/i.test(occ)) crowd = "🔴";
          else if (/standing|medium|average/i.test(occ)) crowd = "🟡";
          else if (/seats|low|few|empty|available/i.test(occ)) crowd = "🟢";
        }

        let tag = "";
        if (fl?.first === aimedStr) tag = "🚦 Premier départ";
        if (fl?.last === aimedStr) tag = "🛑 Dernier départ";
        if (typeof timeToExpMin === "number" && timeToExpMin > 0 && timeToExpMin < 2) tag = "🟢 Imminent";
        const status = call.StopPointStatus || call.ArrivalProximityText || "";
        if (/arrivée|en gare|at stop|stopped/i.test(status) && id === "rer") tag = "🚉 En gare";
        if (/at stop|stopped/i.test(status) && id.startsWith("bus")) tag = "🚌 À l'arrêt";

        let ligne = "";
        if (cancel) {
          ligne += `❌ <s>${aimedStr} → ${dest}</s> train supprimé<br>`;
        } else if (late) {
          ligne += `🕒 <s>${aimedStr}</s> → ${expStr} (+${diff} min) → ${dest} ${crowd} <b>${tag}</b> (dans ${timeToExpMin} min)<br>`;
        } else {
          ligne += `🕒 ${expStr} → ${dest} ${crowd} <b>${tag}</b> (dans ${timeToExpMin} min)<br>`;
        }
        horairesHTML += ligne;

        if (idx === 0) {
          const journey = v.MonitoredVehicleJourney?.VehicleJourneyRef;
          if (journey) {
            horairesHTML += `<div id="gares-${journey}" class="stops-scroll">🚉 Chargement des arrêts…</div>`;
            loadStops(journey);
          }
        }
      });
    }
    scheduleEl.innerHTML = horairesHTML;
  } catch (e) {
    scheduleEl.innerHTML = "Erreur horaire ou données indisponibles (temps réel inaccessible)";
  }
}

async function loadStops(journey) {
  try {
    const url = proxy + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/vehicle_journeys/${journey}`);
    const data = await fetch(url).then(r => r.ok ? r.json() : null);

    const stops = data?.vehicle_journeys?.[0]?.stop_times;
    const div = document.getElementById(`gares-${journey}`);

    if (!stops?.length) {
      if (div) div.textContent = "Liste des arrêts indisponible";
      return;
    }

    const list = stops.map(s => s.stop_point.name).join(" ➔ ");
    const finalDest = stops[stops.length - 1]?.stop_point?.name || "Destination inconnue";

    if (div) div.innerHTML = `🚉 Destination finale : <b>${finalDest}</b><br>Trajet : ${list}`;
  } catch (e) {
    const div = document.getElementById(`gares-${journey}`);
    if (div) div.textContent = "Erreur lors du chargement des arrêts";
  }
}

 
async function lineAlert(stop) {
  const line = lineMap[stop];
  if (!line) {
    console.warn("Pas de LineRef pour ce stop :", stop);
    return "";
  }
  try {
    const url = proxy + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/general-message?LineRef=${line}`);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Erreur HTTP infos trafic : ${res.status} pour LineRef ${line}`);
      return "";
    }
    const data = await res.json();
    const messages = data?.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
    if (!messages.length) return "";
    const msg = messages[0]?.Content?.MessageText || messages[0]?.Message || "";
    return msg ? `⚠️ ${msg}` : "";
  } catch (e) {
    console.error("Erreur lors de la récupération des infos trafic :", e);
    return "";
  }
}

async function loadStops(journey) {
  try {
    const url = proxy + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/vehicle_journeys/${journey}`);
    const data = await fetch(url).then(r => r.ok ? r.json() : null);
    const list = data?.vehicle_journeys?.[0]?.stop_times?.map(s => s.stop_point.name).join(" ➔ ");
    const div = document.getElementById(`gares-${journey}`);
    if (div) div.textContent = list ? `🚉 ${list}` : "Liste des arrêts indisponible";
  } catch {
    const div = document.getElementById(`gares-${journey}`);
    if (div) div.textContent = "Liste des arrêts indisponible";
  }
}

async function news() {
  const el = document.getElementById("newsTicker");
  el.textContent = "Chargement des actus…";
  try {
    const r = await fetch("https://api.rss2json.com/v1/api.json?rss_url=https://www.francetvinfo.fr/titres.rss");
    el.textContent = (await r.json()).items.slice(0,3).map(i=>i.title).join(" • ");
  } catch { el.textContent = "Actus indisponibles"; }
}

async function meteo() {
  const el = document.getElementById("meteo");
  el.innerHTML = "Chargement météo…";
  try {
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=48.8402&longitude=2.4274&current_weather=true");
    const c = (await r.json()).current_weather;
    el.innerHTML = `<h2>🌤 Météo locale</h2>${c.temperature} °C | Vent ${c.windspeed} km/h`;
  } catch { el.textContent = "Erreur météo"; }
}

function startWeatherLoop() {
  meteo();
  setInterval(meteo, 30 * 60 * 1000);
}

function parseTimeToDate(timeStr) {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}
