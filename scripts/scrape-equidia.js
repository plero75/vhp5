import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import fs from "fs";

const MONTHS_AHEAD = 3; // nombre de mois à scraper à partir d'aujourd'hui

async function scrapeEquidiaVincennes() {
  const today = new Date();
  const races = [];

  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const targetDate = new Date(today.getFullYear(), today.getMonth() + i);
    const monthStr = targetDate.toISOString().slice(0,7); // "YYYY-MM"
    const url = `https://www.equidia.fr/courses-hippique/trot?month=${monthStr}`;

    console.log(`🌐 Téléchargement du calendrier pour ${monthStr} depuis ${url}`);
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) {
      console.warn(`⚠️ Erreur HTTP ${res.status} pour ${url}, on passe au mois suivant.`);
      continue;
    }

    const html = await res.text();
    const dom = new JSDOM(html);
    const rows = dom.window.document.querySelectorAll("table tbody tr");

    rows.forEach(row => {
      const dateEl = row.querySelector("td:nth-child(1)");
      const hippoEl = row.querySelector("td:nth-child(2)");

      const dateStr = dateEl?.textContent?.trim();
      const hippo = hippoEl?.textContent?.trim()?.toLowerCase();

      if (!dateStr || !hippo) return;

      if (hippo.includes("vincennes")) {
        const isoDate = new Date(dateStr.split("/").reverse().join("-")).toISOString().slice(0,10);
        races.push({
          date: isoDate,
          heure: "00:00",
          description: "Réunion Vincennes"
        });
      }
    });
  }

  if (!races.length) throw new Error("Aucune réunion Vincennes trouvée sur Equidia.");
  fs.mkdirSync("./static", { recursive: true });
  fs.writeFileSync("./static/races.json", JSON.stringify(races, null, 2));
  console.log(`✅ Fichier static/races.json généré avec ${races.length} réunions !`);
}

scrapeEquidiaVincennes().catch(err => {
  console.error("❌ Erreur lors de la génération de races.json :", err);
  process.exit(1);
});
