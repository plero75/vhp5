import fetch from "node-fetch";
import unzipper from "unzipper";
import fs from "fs";
import parse from "csv-parse/sync";

const PAGE_URL = "https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-gtfs-idfm/information/";
const ZIP_DEST = "./gtfs.zip";
const EXTRACT_DIR = "./gtfs";

async function getLatestGTFSUrl() {
  console.log("Scraping la page IDFM pour trouver le lien du GTFS...");
  const res = await fetch(PAGE_URL);
  const html = await res.text();
  const regex = /href="(https:\/\/[^"]+\.zip)"/i;
  const match = html.match(regex);
  if (!match) throw new Error("Lien du GTFS non trouvé sur la page IDFM.");
  console.log("✅ Lien GTFS trouvé :", match[1]);
  return match[1];
}

async function download(url, path) {
  console.log("Téléchargement du GTFS...");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
  const fileStream = fs.createWriteStream(path);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
  console.log("✅ Téléchargé :", path);
}

async function extract(zipPath, outDir) {
  console.log("Extraction du GTFS...");
  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: outDir })).promise();
  console.log("✅ Extraction terminée");
}

function parseStops(stopsPath, outJson) {
  console.log("Parsing stops.txt...");
  const csv = fs.readFileSync(stopsPath, "utf8");
  const records = parse.parse(csv, { columns: true });
  fs.writeFileSync(outJson, JSON.stringify(records, null, 2));
  console.log("✅ Fichier généré :", outJson);
}

async function main() {
  const gtfsUrl = await getLatestGTFSUrl();
  await download(gtfsUrl, ZIP_DEST);
  await extract(ZIP_DEST, EXTRACT_DIR);

  parseStops(`${EXTRACT_DIR}/stops.txt`, "./static/gtfs-stops.json");

  const firstLast = {
    rer: { first: "05:30", last: "23:30" },
    bus77: { first: "06:00", last: "22:00" },
    bus201: { first: "06:15", last: "21:45" },
  };
  fs.writeFileSync("./static/gtfs-firstlast.json", JSON.stringify(firstLast, null, 2));
  console.log("✅ Fichier généré : ./static/gtfs-firstlast.json");

  fs.unlinkSync(ZIP_DEST);
  fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
  console.log("🎉 Mise à jour GTFS terminée !");
}

main().catch(err => {
  console.error("Erreur lors de la mise à jour du GTFS :", err);
  process.exit(1);
});
