import fetch from "node-fetch";
import fs from "fs";

// URL de la page publique du dataset GTFS
const DATASET_PAGE = "https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-gtfs-idfm/files/";

// Fonction robuste pour obtenir le lien ZIP
export async function getLatestZipUrl() {
  const res = await fetch(DATASET_PAGE, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; GTFSbot/1.0)"
    }
  });
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors du chargement de la page`);
  const html = await res.text();

  // Décommenter pour debug si besoin :
  // fs.writeFileSync("debug_idfm.html", html);

  // Regex robuste pour simple/double quote, toutes casses
  const matches = [...html.matchAll(/href=['"]([^'"]*\/files\/[a-zA-Z0-9]+\/download\/)['"]/gi)];
  if (!matches.length) throw new Error("Aucun lien GTFS ZIP trouvé sur la page ! (regarde debug_idfm.html si besoin)");
  return "https://data.iledefrance-mobilites.fr" + matches[0][1];
}

// Si exécuté directement
if (
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] &&
  (process.argv[1].endsWith("get-latest-gtfs.js") || process.argv[1].endsWith("get-latest-gtfs.mjs"))
) {
  getLatestZipUrl()
    .then(url => {
      console.log("Dernier ZIP GTFS public :", url);
    })
    .catch(err => {
      console.error("❌ Erreur :", err);
      process.exit(1);
    });
}
