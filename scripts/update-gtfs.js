import fetch from "node-fetch";
import unzipper from "unzipper";
import fs from "fs";
import { parse } from "csv-parse/sync";
import path from "path";

// Ton proxy Cloudflare Worker :
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
// URL open data GTFS IDFM à appeler via proxy :
const META_URL = PROXY + encodeURIComponent("https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/offre-horaires-tc-gtfs-idfm/exports/json");
const LAST_UPDATE_FILE = "./last-update.txt";
const ZIP_DEST = "./gtfs.zip";
const EXTRACT_DIR = "./gtfs";
const STATIC_DIR = "./static";

const STOP_IDS = {
  rer: "STIF:StopArea:SP:43135:",
  bus77: "STIF:StopArea:SP:463641:",
  bus201: "STIF:StopArea:SP:463644:",
};

async function getLatestInfo() {
  const res = await fetch(META_URL);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} en récupérant les métadonnées`);
  const data = await res.json();
  const dataset = data[0];
  const modified = dataset?.metadata?.modified;
  const url = dataset?.attachments?.[0]?.url;
  if (!modified || !url) throw new Error("Date ou lien de téléchargement introuvables dans la réponse JSON.");
  return { modified, url };
}

async function needUpdate(modified) {
  if (!fs.existsSync(LAST_UPDATE_FILE)) return true;
  const last = fs.readFileSync(LAST_UPDATE_FILE, "utf8").trim();
  return last !== modified;
}

async function download(url, pathFile) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors du téléchargement`);
  const fileStream = fs.createWriteStream(pathFile);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
}

async function extract(zipPath, outDir) {
  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: outDir })).promise();
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
    .map(t => t.padStart(8, "0")); // 7:30:00 → 07:30:00

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
  const { modified, url } = await getLatestInfo();
  if (!(await needUpdate(modified))) {
    console.log("👍 GTFS déjà à jour, rien à faire !");
    return;
  }

  // Téléchargement du ZIP via proxy :
  const proxiedZipUrl = PROXY + encodeURIComponent(url);
  await download(proxiedZipUrl, ZIP_DEST);
  await extract(ZIP_DEST, EXTRACT_DIR);

  ensureDirSync(STATIC_DIR);

  // Générer stops.json comme avant
  const stopsFile = path.join(EXTRACT_DIR, "stops.txt");
  if (!fs.existsSync(stopsFile)) throw new Error("Le fichier stops.txt n'existe pas dans le GTFS !");
  parseStops(stopsFile, path.join(STATIC_DIR, "gtfs-stops.json"));

  // Génération dynamique de gtfs-firstlast.json
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

  fs.writeFileSync(LAST_UPDATE_FILE, modified);

  try { fs.unlinkSync(ZIP_DEST); } catch(e) { }
  try { fs.rmSync(EXTRACT_DIR, { recursive: true, force: true }); } catch(e) { }
  console.log("🎉 Mise à jour GTFS terminée !");
}

main().catch(err => {
  console.error("❌ Erreur lors de la mise à jour du GTFS :", err);
  process.exit(1);
});
