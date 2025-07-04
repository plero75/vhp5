import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import fs from "fs";

async function scrapeVincennesCalendar() {
  const url = "https://www.letrot.com/fr/hippodrome/7-vincennes/calendrier";
  console.log(`🌐 Téléchargement du calendrier depuis ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });

  if (!res.ok) throw new Error(`Erreur HTTP ${res.status} lors du téléchargement`);

  const html = await res.text();
  const dom = new JSDOM(html);
  const rows = dom.window.document.querySelectorAll(".table tbody tr");

  const races = [];
  rows.forEach(row => {
    const dateStr = row.querySelector("td:nth-child(1)")?.textContent?.trim();
    const heureStr = row.querySelector("td:nth-child(2)")?.textContent?.trim() || "00:00";
    const description = row.querySelector("td:nth-child(3)")?.textContent?.trim() || "Réunion Vincennes";

    if (dateStr) {
      const [day, month, year] = dateStr.split("/").map(Number);
      if (!year || !month || !day) return; // Skip invalid rows
      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      races.push({ date: isoDate, heure: heureStr, description });
    }
  });

  if (!races.length) throw new Error("Aucune réunion détectée dans la page.");

  fs.mkdirSync("./static", { recursive: true });
  fs.writeFileSync("./static/races.json", JSON.stringify(races, null, 2));
  console.log("✅ Fichier static/races.json généré automatiquement !");
}

scrapeVincennesCalendar().catch(err => {
  console.error("❌ Erreur lors du scraping :", err);
  process.exit(1);
});
