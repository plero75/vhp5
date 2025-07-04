// scripts/gtfsDownloader.js
import fetch from "node-fetch";
import unzipper from "unzipper";
import fs from "fs";

export async function downloadGTFS(url, dest) {
  console.log("Téléchargement du GTFS...");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
  const fileStream = fs.createWriteStream(dest);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
  console.log("✅ GTFS téléchargé :", url);
}

export async function extract(zipPath, outDir) {
  console.log("Extraction du ZIP...");
  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: outDir })).promise();
  console.log("✅ Extraction terminée !");
}
