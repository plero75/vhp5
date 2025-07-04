import fs from "fs";

export function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getFirstLastForStop(stop_id, stopTimes, trips, calendar, todayServiceIds) {
  const todayTrips = stopTimes
    .filter(s => s.stop_id === stop_id && todayServiceIds.has(trips[s.trip_id]?.service_id))
    .map(s => s.departure_time)
    .filter(Boolean)
    .map(t => t.padStart(8, "0"));
  if (!todayTrips.length) {
    console.warn(`⚠️ Aucun horaire trouvé pour l’arrêt ${stop_id}`);
    return { first: null, last: null };
  }
  todayTrips.sort();
  return {
    first: todayTrips[0]?.slice(0, 5) || null,
    last: todayTrips[todayTrips.length - 1]?.slice(0, 5) || null,
  };
}

export function getTodayServiceIds(calendar) {
  const today = new Date();
  const weekday = [
    "sunday","monday","tuesday","wednesday","thursday","friday","saturday"
  ][today.getDay()];
  return new Set(
    calendar.filter(cal =>
      cal[`${weekday}`] === "1" &&
      (!cal.start_date || cal.start_date <= formatYYYYMMDD(today)) &&
      (!cal.end_date || cal.end_date >= formatYYYYMMDD(today))
    ).map(cal => cal.service_id)
  );
}

// Fonction privée, utilisée uniquement dans ce module
function formatYYYYMMDD(d) {
  return d.toISOString().slice(0,10).replace(/-/g,"");
}
