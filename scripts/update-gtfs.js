import fetch from "node-fetch";
import unzipper from "unzipper";
import fs from "fs";
import { parse } from "csv-parse/sync";
import path from "path";

const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const GTFS_PRIM_URL = PROXY + encodeURIComponent("https://prim.iledefrance-mobilites.fr/marketplace/v2/gtfs-static");
const ZIP_DEST = "./gtfs.zip";
const EXTRACT_DIR = "./gtfs";
const STATIC_DIR = "./static";

async function downloadGTFS() {
  const res = await fetch(GTFS_PRIM_URL);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors du téléchargement du GTFS PRIM`);
  const fileStream = fs.createWriteStream(ZIP_DEST);
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

async function main() {
  await downloadGTFS();
  await extract(ZIP_DEST, EXTRACT_DIR);

  ensureDirSync(STATIC_DIR);

  // Arrête ici si tu veux, ou continue avec la génération dynamique “first/last” comme plus haut
  const stopsFile = path.join(EXTRACT_DIR, "stops.txt");
  parseStops(stopsFile, path.join(STATIC_DIR, "gtfs-stops.json"));

  // ... Suite : parsing stop_times.txt, trips.txt, calendar.txt pour générer le fichier first/last automatique
  // ... (tu peux réutiliser le code déjà fourni dans les versions précédentes)
}

main().catch(err => {
  console.error("❌ Erreur lors de la mise à jour du GTFS :", err);
  process.exit(1);
});
