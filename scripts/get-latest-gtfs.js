import fetch from "node-fetch";

const META_URL = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/offre-horaires-tc-gtfs-idfm/exports/json";

export async function getLatestGTFSInfo() {
  const res = await fetch(META_URL);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} en récupérant les métadonnées`);
  const data = await res.json();
  const dataset = data[0];

  const modified = dataset?.metadata?.modified;
  let url = dataset?.attachments?.[0]?.url;

  if (!modified || !url) throw new Error("Date ou lien de téléchargement introuvables dans la réponse JSON.");

  if (url.startsWith("/")) url = "https://data.iledefrance-mobilites.fr" + url;

  console.log(`✅ Dernière mise à jour : ${modified}`);
  console.log(`✅ Lien complet du GTFS : ${url}`);

  return { modified, url };
}
