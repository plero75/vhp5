import fetch from "node-fetch";
import unzipper from "unzipper";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { once } from "events";
import { getLatestZipUrl } from "./get-latest-gtfs.js";

const ZIP_DEST = "./gtfs.zip";
const EXTRACT_DIR = "./gtfs";
const STATIC_DIR = "./static";

const STOP_IDS = {
  rer: "STIF:StopArea:SP:43135:",
  bus77: "STIF:StopArea:SP:463641:",
  bus201: "STIF:StopArea:SP:463644:",
};

// Lecture efficace (stream) d'un très gros CSV
async function parseCsvStream(filePath) {
  const records = [];
  const parser = fs.createReadStream(filePath).pipe(parse({ columns: true }));
  parser.on('data', row => records.push(row));
  await once(parser, 'end');
  return records;
}

function parseCsvSync(filePath) {
  const { parse: parseSync } = require("csv-parse/sync");
  return parseSync(fs.readFileSync(filePath, "utf8"), { columns: true });
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function downloadGTFS(zipUrl) {
  const res = await fetch(zipUrl);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors du téléchargement du GTFS`);
  const fileStream = fs.createWriteStream(ZIP_DEST);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
  console.log("✅ GTFS téléchargé :", zipUrl);
}

async function extract(zipPath, outDir) {
  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: outDir })).promise();
  console.log("✅ Extraction terminée !");
}

function parseStops(stopsPath, outJson) {
  const records = parseCsvSync(stopsPath);
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
  // 1. Scrape le lien GTFS à jour
  const zipUrl = await getLatestZipUrl();
  console.log("🔗 Dernier GTFS public trouvé :", zipUrl);

  // 2. Télécharge le ZIP
  await downloadGTFS(zipUrl);

  // 3. Décompresse
  await extract(ZIP_DEST, EXTRACT_DIR);

  ensureDirSync(STATIC_DIR);

  // 4. Parse stops.txt → gtfs-stops.json (petit fichier, pas besoin de stream)
  parseStops(path.join(EXTRACT_DIR, "stops.txt"), path.join(STATIC_DIR, "gtfs-stops.json"));

  // 5. Parse stop_times.txt (stream) et les autres (lecture classique)
  const stopTimes = await parseCsvStream(path.join(EXTRACT_DIR, "stop_times.txt"));
  const trips = Object.fromEntries(
    parseCsvSync(path.join(EXTRACT_DIR, "trips.txt")).map(t => [t.trip_id, t])
  );
  const calendar = parseCsvSync(path.join(EXTRACT_DIR, "calendar.txt"));
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
