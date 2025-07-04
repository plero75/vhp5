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
  trouverProchaineCourseVincennes();
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
  const alertEl = document.getElementById(`${id}-alert`);
  const firstlastEl = document.getElementById(`${id}-firstlast`);
  try {
    const url = proxy + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${stop}`);
    const data = await fetch(url).then(r => r.json());
    const visits = data.Siri.ServiceDelivery.StopMonitoringDelivery[0]?.MonitoredStopVisit || [];

    let horairesHTML = "";
    const fl = cache.firstLast?.[id];
    if (fl) firstlastEl.innerHTML = `♦️ ${fl.first} – ${fl.last}`;

    if (!visits.length) {
      const now = new Date();
      const firstTime = parseTimeToDate(fl?.first);
      const lastTime = parseTimeToDate(fl?.last);
      if (firstTime && now < firstTime) {
        scheduleEl.innerHTML = `Service non commencé – premier départ prévu à ${fl.first}`;
        return;
      }
      if (lastTime && now > lastTime) {
        scheduleEl.innerHTML = `Service terminé – prochain départ prévu à ${fl.first}`;
        return;
      }
      scheduleEl.innerHTML = "Aucun passage prévu pour l’instant";
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
      const timeToExpMin = Math.max(0, Math.round((expFirst - now)/60000));
      const timeStr = expFirst.toLocaleTimeString("fr-FR",{hour:'2-digit',minute:'2-digit'});
      horairesHTML += `<h3>Vers ${dest} – prochain départ dans : ${timeToExpMin} min (à ${timeStr})</h3>`;

      passages.forEach((v, idx) => {
        const call = v.MonitoredVehicleJourney.MonitoredCall;
        const aimed = new Date(call.AimedDepartureTime);
        const exp   = new Date(call.ExpectedDepartureTime);
        const diff  = Math.round((exp - aimed) / 60000);
        const late  = diff > 1;
        const cancel = (call.ArrivalStatus || "").toLowerCase() === "cancelled";
        const aimedStr = aimed.toLocaleTimeString("fr-FR",{hour:'2-digit',minute:'2-digit'});
        const timeToExpMin = Math.max(0, Math.round((exp - now)/60000));

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
        if (timeToExpMin > 0 && timeToExpMin < 2) tag = "🟢 Imminent";
        const status = call.StopPointStatus || call.ArrivalProximityText || "";
        if (/arrivée|en gare|at stop|stopped/i.test(status) && id === "rer") tag = "🚉 En gare";
        if (/at stop|stopped/i.test(status) && id.startsWith("bus")) tag = "🚌 À l'arrêt";

        let ligne = "";
        if (cancel) {
          ligne += `❌ <s>${aimedStr} → ${dest}</s> train supprimé<br>`;
        } else if (late) {
          ligne += `🕒 <s>${aimedStr}</s> → ${exp.toLocaleTimeString("fr-FR",{hour:'2-digit',minute:'2-digit'})} (+${diff} min) → ${dest} ${crowd} <b>${tag}</b> (dans ${timeToExpMin} min)<br>`;
        } else {
          ligne += `🕒 ${exp.toLocaleTimeString("fr-FR",{hour:'2-digit',minute:'2-digit'})} → ${dest} ${crowd} <b>${tag}</b> (dans ${timeToExpMin} min)<br>`;
        }
        horairesHTML += ligne;

        if (idx === 0) {
          const journey = v.MonitoredVehicleJourney?.VehicleJourneyRef;
          if (journey) {
            horairesHTML += `<div id="gares-${journey}" class="stops-scroll">🚉 …</div>`;
            loadStops(journey);
          }
        }
      });

      const alert = await lineAlert(stop);
      if (alert) horairesHTML += `<div class="info">⚠️ ${alert}</div>`;
    }
    scheduleEl.innerHTML = horairesHTML;
  } catch (e) {
    scheduleEl.innerHTML = "Erreur horaire";
  }
}

async function lineAlert(stop) {
  const line = lineMap[stop];
  if (!line) return "";
  try {
    const url = proxy + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${line}`);
    const res = await fetch(url);
    if (!res.ok) return "";
    const data = await res.json();
    const messages = data?.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
    if (!messages.length) return "";
    const msg = messages[0]?.Content?.MessageText || messages[0]?.Message || "";
    return msg ? `⚠️ ${msg}` : "";
  } catch { return ""; }
}

async function loadStops(journey) {
  try {
    const url = proxy + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/vehicle_journeys/${journey}`);
    const data = await fetch(url).then(r => r.ok ? r.json() : null);
    const list = data?.vehicle_journeys?.[0]?.stop_times?.map(s => s.stop_point.name).join(" ➔ ");
    const div = document.getElementById(`gares-${journey}`);
    if (div) div.textContent = list ? `🚉 ${list}` : "";
  } catch { /* ignore */ }
}

async function news() {
  const elNews = document.getElementById("news-content");
  try {
    const r = await fetch("https://api.rss2json.com/v1/api.json?rss_url=https://www.francetvinfo.fr/titres.rss");
    elNews.textContent = (await r.json()).items.slice(0,3).map(i=>i.title).join(" • ");
  } catch { elNews.textContent = "Actus indisponibles"; }
}
async function detecterProchaineReunionEtChargerProgramme() {
  const el = document.getElementById("nextRace");
  try {
    const data = await fetch("./static/races.json").then(r => r.json());
    const now = new Date();

    const prochaine = data
      .map(r => ({ ...r, dateTime: new Date(`${r.date}T${r.heure}`) }))
      .filter(r => r.dateTime > now)
      .sort((a, b) => a.dateTime - b.dateTime)[0];

    if (!prochaine) {
      el.innerHTML = "Aucune réunion PMU à venir.";
      return;
    }

    const today = new Date();
    const reunionDate = new Date(prochaine.date);

    if (today.toDateString() === reunionDate.toDateString()) {
      // Si c'est aujourd'hui, appelle le programme détaillé :
      const dateStr = prochaine.date.split("-").reverse().join(""); // yyyy-mm-dd -> ddmmyyyy
      chargerProgrammePMU(dateStr);
    } else {
      const options = { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };
      const dateStr = prochaine.dateTime.toLocaleString("fr-FR", options);
      el.innerHTML = `🏇 Prochaine réunion : <b>${prochaine.description}</b><br>📅 ${dateStr}`;
    }
  } catch (e) {
    console.error(e);
    el.innerHTML = "Erreur lors de la détection de la prochaine réunion PMU.";
  }
}

async function chargerProgrammePMU(dateStr) {
  const el = document.getElementById("nextRace");
  try {
    const url = `https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/${dateStr}`;
    const data = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    }).then(r => r.ok ? r.json() : null);

    if (!data?.programme?.reunions?.length) {
      el.innerHTML = "Aucune réunion disponible pour aujourd’hui.";
      return;
    }

    const reunion = data.programme.reunions[0];
    let html = `<h3>🏇 Programme PMU Vincennes du ${reunion.dateReunion}</h3>`;
    html += "<ul>";
    reunion.courses.forEach(c => {
      html += `<li>🕒 ${c.heureDepart} – Course ${c.numOrdre}: ${c.intitule}</li>`;
    });
    html += "</ul>";
    el.innerHTML = html;
  } catch (e) {
    console.error(e);
    el.innerHTML = "Erreur lors du chargement du programme PMU.";
  }
}

async function meteo() {
  const el = document.getElementById("meteo");
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

async function trouverProchaineCourseVincennes() {
  const elCourses = document.getElementById("courses-content");
  const now = new Date();
  let dateToCheck = new Date(now);

  for (let i=0; i<15; i++) {
    const dateStr = dateToCheck.toISOString().slice(0,10).split("-").reverse().join("");
    const url = `https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/${dateStr}`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();

    for (const reunion of data.reunions) {
      if (reunion.hippodrome.nomCourt.toUpperCase() === "VINCENNES") {
        const firstCourse = reunion.courses[0];
        const courseDateTime = new Date(`${dateToCheck.toISOString().slice(0,10)}T${firstCourse.heureDepart}`);
        lancerCompteARebours(courseDateTime, firstCourse.libelle, elCourses);
        return;
      }
    }
    dateToCheck.setDate(dateToCheck.getDate() + 1);
  }
  elCourses.innerHTML = "Aucune course prévue à Vincennes dans les 15 prochains jours.";
}

function lancerCompteARebours(targetDate, courseName, el) {
  function update() {
    const now = new Date();
    let diffMs = targetDate - now;
    if (diffMs <= 0) {
      el.innerHTML = `La prochaine course « ${courseName} » est en cours ou terminée !`;
      clearInterval(intervalId);
      return;
    }
    const diffSec = Math.floor(diffMs/1000);
    const days = Math.floor(diffSec/86400);
    const hours = Math.floor((diffSec%86400)/3600);
    const minutes = Math.floor((diffSec%3600)/60);
    const seconds = diffSec%60;

    const countdown = `${days} jour${days!==1?"s":""} ${hours} heure${hours!==1?"s":""} ${minutes} minute${minutes!==1?"s":""} et ${seconds} seconde${seconds!==1?"s":""}`;
    el.innerHTML = `Prochaine course à l’Hippodrome de Vincennes dans ${countdown} : « ${courseName} »`;
  }
  update();
  const intervalId = setInterval(update, 1000);
}
