// scripts/main.js
import path from "path";
import fs from "fs";
import { downloadGTFS, extract } from "./gtfsDownloader.js";
import { parseCsvSync, parseCsvStream } from "./gtfsParser.js";
import { ensureDirSync, getFirstLastForStop, getTodayServiceIds } from "./gtfsUtils.js";

const GTFS_URL = "https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-gtfs-idfm/files/a925e164271e4bca93433756d6a340d1/download/";
const ZIP_DEST = "./gtfs.zip";
const EXTRACT_DIR = "./gtfs";
const STATIC_DIR = "./static";

const STOP_IDS = {
  rer: "STIF:StopArea:SP:43135:",
  bus77: "STIF:StopArea:SP:463641:",
  bus201: "STIF:StopArea:SP:463644:",
};

async function main() {
  try {
    await downloadGTFS(GTFS_URL, ZIP_DEST);
    await extract(ZIP_DEST, EXTRACT_DIR);
    ensureDirSync(STATIC_DIR);

    const stopsRecords = await parseCsvSync(path.join(EXTRACT_DIR, "stops.txt"));
    fs.writeFileSync(path.join(STATIC_DIR, "gtfs-stops.json"), JSON.stringify(stopsRecords, null, 2));

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

    try { fs.unlinkSync(ZIP_DEST); } catch(e) { console.warn("⚠️ ZIP non supprimé :", e); }
    try { fs.rmSync(EXTRACT_DIR, { recursive: true, force: true }); } catch(e) { console.warn("⚠️ Dossier extraction non supprimé :", e); }
    console.log("🎉 Mise à jour GTFS terminée !");
  } catch (err) {
    console.error("❌ Erreur globale :", err);
    process.exit(1);
  }
}

main();
