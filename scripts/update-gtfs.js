import fetch from "node-fetch";
import unzipper from "unzipper";
import fs from "fs";
import { parse } from "csv-parse/sync";
import path from "path";

const ZIP_URL = "https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-gtfs-idfm/files/a925e164271e4bca93433756d6a340d1/download/"; // <-- Mets ici le lien actuel du GTFS
const ZIP_DEST = "./gtfs.zip";
const EXTRACT_DIR = "./gtfs";
const STATIC_DIR = "./static";

const STOP_IDS = {
  rer: "STIF:StopArea:SP:43135:",
  bus77: "STIF:StopArea:SP:463641:",
  bus201: "STIF:StopArea:SP:463644:",
};

async function downloadGTFS() {
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors du téléchargement du GTFS`);
  const fileStream = fs.createWriteStream(ZIP_DEST);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
  console.log("✅ GTFS téléchargé !");
}

async function extract(zipPath, outDir) {
  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: outDir })).promise();
  console.log("✅ Extraction terminée !");
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function parseStops(stopsPath, outJson) {
  const csv = fs.readFileSync(stopsPath, "utf8");
  const records = parse(csv, { columns: true });
  fs.writeFileSync(outJson, JSON.stringify(records, null, 2));
}

function getFirstLastForStop(stop_id, stopTimes, trips, calendar, todayServiceIds) {
  const todayTrips = stopTimes
    .filter(s => s.stop_id === stop_id && todayServiceIds.has(trips[s.trip_id]?.service_id))
    .map(s => s.departure_time)
    .filter(Boolean)
    .map(t => t.padStart(8, "0"));
  if (!todayTrips.length) return { first: null, last: null };
  todayTrips.sort();
  return {
    first: todayTrips[0]?.slice(0, 5) || null,
    last: todayTrips[todayTrips.length - 1]?.slice(0, 5) || null,
  };
}

function getTodayServiceIds(calendar) {
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
function formatYYYYMMDD(d) {
  return d.toISOString().slice(0,10).replace(/-/g,"");
}

async function main() {
  await downloadGTFS();
  await extract(ZIP_DEST, EXTRACT_DIR);

  ensureDirSync(STATIC_DIR);

  const stopsFile = path.join(EXTRACT_DIR, "stops.txt");
  parseStops(stopsFile, path.join(STATIC_DIR, "gtfs-stops.json"));

  const stopTimes = parse(fs.readFileSync(path.join(EXTRACT_DIR, "stop_times.txt"), "utf8"), { columns: true });
  const trips = Object.fromEntries(
    parse(fs.readFileSync(path.join(EXTRACT_DIR, "trips.txt"), "utf8"), { columns: true }).map(t => [t.trip_id, t])
  );
  const calendar = parse(fs.readFileSync(path.join(EXTRACT_DIR, "calendar.txt"), "utf8"), { columns: true });
  const todayServiceIds = getTodayServiceIds(calendar);

  const firstLast = {};
  for (const [key, stop_id] of Object.entries(STOP_IDS)) {
    firstLast[key] = getFirstLastForStop(stop_id, stopTimes, trips, calendar, todayServiceIds);
  }
  fs.writeFileSync(path.join(STATIC_DIR, "gtfs-firstlast.json"), JSON.stringify(firstLast, null, 2));
  console.log("✅ Fichier généré :", path.join(STATIC_DIR, "gtfs-firstlast.json"));

  try { fs.unlinkSync(ZIP_DEST); } catch(e) { }
  try { fs.rmSync(EXTRACT_DIR, { recursive: true, force: true }); } catch(e) { }
  console.log("🎉 Mise à jour GTFS terminée !");
}

main().catch(err => {
  console.error("❌ Erreur lors de la mise à jour du GTFS :", err);
  process.exit(1);
});
