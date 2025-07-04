import fetch from "node-fetch";
import fs from "fs";
import { JSDOM } from "jsdom";

async function findTodayReunion() {
  const url = "https://www.letrot.com/fr/hippodrome/7-vincennes/calendrier";
  console.log(`🌐 Téléchargement du calendrier depuis ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors du téléchargement`);

  const html = await res.text();
  const dom = new JSDOM(html);
  const rows = dom.window.document.querySelectorAll(".table tbody tr");

  const todayStr = new Date().toISOString().slice(0, 10); // yyyy-mm-dd

  for (const row of rows) {
    const dateStr = row.querySelector("td:nth-child(1)")?.textContent?.trim();
    const [day, month, year] = dateStr?.split("/")?.map(Number);
    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    if (isoDate === todayStr) {
      console.log(`✅ Réunion trouvée aujourd'hui : ${isoDate}`);
      return dateStr; // au format dd/mm/yyyy
    }
  }

  console.log("❌ Pas de réunion Vincennes aujourd'hui.");
  return null;
}

async function fetchProgrammePMU(dateFr) {
  const [day, month, year] = dateFr.split("/");
  const dateStr = `${day}${month}${year}`; // ddmmyyyy
  const url = `https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/${dateStr}`;
  console.log(`🌐 Téléchargement du programme PMU : ${url}`);

  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors du téléchargement du programme`);

  const data = await res.json();
  if (!data?.programme?.reunions?.length) throw new Error("Programme vide ou non disponible.");

  fs.mkdirSync("./static", { recursive: true });
  fs.writeFileSync("./static/programme.json", JSON.stringify(data, null, 2));
  console.log("✅ Fichier static/programme.json généré avec succès !");
}

(async () => {
  try {
    const dateFr = await findTodayReunion();
    if (dateFr) {
      await fetchProgrammePMU(dateFr);
    } else {
      console.log("ℹ️ Aucun programme généré car pas de réunion aujourd'hui.");
    }
  } catch (e) {
    console.error("❌ Erreur lors de la génération du programme :", e);
    process.exit(1);
  }
})();
