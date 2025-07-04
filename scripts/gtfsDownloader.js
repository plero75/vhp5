import fetch from "node-fetch";
import unzipper from "unzipper";
import fs from "fs";

export async function downloadGTFS(url, dest) {
  console.log("⬇️ Téléchargement du GTFS...");
  if (fs.existsSync(dest)) {
    console.warn(`⚠️ Fichier déjà existant (${dest}), il sera écrasé.`);
    fs.unlinkSync(dest);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors du téléchargement`);
  const fileStream = fs.createWriteStream(dest);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
  console.log("✅ Téléchargement terminé :", dest);
}

export async function extract(zipPath, outDir) {
  console.log("📦 Extraction de l’archive ZIP...");
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: outDir })).promise();
  console.log("✅ Extraction effectuée dans :", outDir);
}
