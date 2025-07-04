import fetch from "node-fetch";
import unzipper from "unzipper";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { once } from "events";

const GTFS_URL = "https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-gtfs-idfm/files/a925e164271e4bca93433756d6a340d1/download/"; // à mettre à jour manuellement
const ZIP_DEST = "./gtfs.zip";
const EXTRACT_DIR = "./gtfs";
const STATIC_DIR = "./static";

const STOP_IDS = {
  rer: "STIF:StopArea:SP:43135:",
  bus77: "STIF:StopArea:SP:463641:",
  bus201: "STIF:StopArea:SP:463644:",
};

async function downloadGTFS() {
  const res = await fetch(GTFS_URL);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors du téléchargement du GTFS`);
  const fileStream = fs.createWriteStream(ZIP_DEST);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
  console.log("✅ GTFS téléchargé :", GTFS_URL);
}

async function extract(zipPath, outDir) {
  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: outDir })).promise();
  console.log("✅ Extraction terminée !");
}

async function parseCsvStream(filePath) {
  const records = [];
  const parser = fs.createReadStream(filePath).pipe(parse({ columns: true }));
  parser.on('data', row => records.push(row));
  await once(parser, 'end');
  return records;
}

async function parseCsvSync(filePath) {
  const { parse: parseSync } = await import("csv-parse/sync");
  return parseSync(fs.readFileSync(filePath, "utf8"), { columns: true });
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
  console.log("🚦 Téléchargement du GTFS en cours...");
  await downloadGTFS();
  await extract(ZIP_DEST, EXTRACT_DIR);

  ensureDirSync(STATIC_DIR);

  console.log("📦 Parsing des arrêts...");
  const stopsRecords = await parseCsvSync(path.join(EXTRACT_DIR, "stops.txt"));
  fs.writeFileSync(path.join(STATIC_DIR, "gtfs-stops.json"), JSON.stringify(stopsRecords, null, 2));

  console.log("📅 Parsing des horaires...");
  const stopTimes = await parseCsvStream(path.join(EXTRACT_DIR, "stop_times.txt"));
  const tripsArr = await parseCsvSync(path.join(EXTRACT_DIR, "trips.txt"));
  const trips = Object.fromEntries(tripsArr.map(t => [t.trip_id, t]));
  const calendar = await parseCsvSync(path.join(EXTRACT_DIR, "calendar.txt"));
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
