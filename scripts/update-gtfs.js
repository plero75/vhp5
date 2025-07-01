import fetch from "node-fetch";
import fs from "fs";

async function download(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
  const data = await res.text();
  fs.writeFileSync(path, data);
  console.log(`✅ Fichier mis à jour : ${path}`);
}

(async () => {
  try {
    await download(
      "https://data.iledefrance-mobilites.fr/explore/dataset/arrets-tc-idf/files/gtfs-stops.json",
      "./static/gtfs-stops.json"
    );
    await download(
      "https://data.iledefrance-mobilites.fr/explore/dataset/horaires-theoriques/files/gtfs-firstlast.json",
      "./static/gtfs-firstlast.json"
    );
  } catch (e) {
    console.error("Erreur lors de la mise à jour des fichiers GTFS :", e);
    process.exit(1);
  }
})();
