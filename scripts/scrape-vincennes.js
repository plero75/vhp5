const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const fs = require('fs');

// URL Equidia des réunions Vincennes (tu peux changer la source si besoin)
const url = "https://www.equidia.fr/courses/hippodromes/vincennes";

// --- Mapping mois en français (corrige si besoin) ---
const mois = {
  "janvier": 1, "février": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
  "juillet": 7, "août": 8, "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12
};

(async () => {
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);

    let races = [];

    // 👇 Bloc des prochaines réunions/courses – adapte si la structure change
    $(".hippodrome__agenda__item").each((i, el) => {
      const rawDate = $(el).find(".hippodrome__agenda__item__date").text().trim();
      const rawTime = $(el).find(".hippodrome__agenda__item__time").text().trim();
      const rawTitle = $(el).find(".hippodrome__agenda__item__title").text().trim() || "Course";

      // Ex de rawDate: "Dimanche 7 juillet" — de rawTime: "16:15"
      const m = rawDate.match(/([a-zéû]+)\s+(\d+)\s+([a-zéû]+)/i);
      if (!m) return;
      const [, dayName, day, monthStr] = m;
      const month = mois[monthStr.toLowerCase()];
      const year = dayjs().year();

      if (!month || !rawTime) return;
      const [hour, minute] = rawTime.split(":");
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${hour}:${minute}:00+02:00`;
      const dateObj = dayjs(dateStr);

      if (!dateObj.isValid() || dateObj.isBefore(dayjs().subtract(1, 'day'))) return; // Ignore les anciennes

      races.push({
        label: rawTitle,
        datetime: dateObj.toISOString()
      });
    });

    // Prend les 5 prochaines (tu peux augmenter ou trier différemment)
    races = races.slice(0, 5);

    // Écrit dans static/races.json
    fs.writeFileSync("static/races.json", JSON.stringify(races, null, 2));
    console.log("Prochaines courses Vincennes exportées:", races);

  } catch (e) {
    console.error("Erreur lors du scraping des courses Vincennes :", e);
    process.exit(1);
  }
})();
