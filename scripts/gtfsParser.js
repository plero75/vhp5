// scripts/gtfsParser.js
import fs from "fs";
import { parse } from "csv-parse";
import { once } from "events";

export async function parseCsvStream(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Fichier manquant : ${filePath}`);
  const records = [];
  const parser = fs.createReadStream(filePath).pipe(parse({ columns: true }));
  parser.on('data', row => records.push(row));
  await once(parser, 'end');
  return records;
}

export async function parseCsvSync(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Fichier manquant : ${filePath}`);
  const { parse: parseSync } = await import("csv-parse/sync");
  return parseSync(fs.readFileSync(filePath, "utf8"), { columns: true });
}
