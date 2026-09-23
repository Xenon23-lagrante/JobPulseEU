import { matchJobToPreferences } from "../lib/jobs/src/services/matching";

const jobs = [
  { id: 1, title: "Alternance Cybersécurité Paris", description: "", country: "France", region: "Ile-de-France", city: "Paris", contractTypes: ["Alternance"], publishedAt: new Date() },
  { id: 2, title: "Alternance Cybersécurité Bruxelles", description: "", country: "Belgique", region: "Bruxelles", city: "Bruxelles", contractTypes: ["Alternance"], publishedAt: new Date() },
  { id: 3, title: "Alternance Réseaux Berlin", description: "", country: "Allemagne", region: "Berlin", city: "Berlin", contractTypes: ["Alternance"], publishedAt: new Date() },
];

const users = {
  A: { jobSector: "Cybersécurité", contractTypes: ["Alternance"], countries: ["France"] },
  B: { jobSector: "Cybersécurité", contractTypes: ["Alternance"], countries: ["Belgique", "Luxembourg"] },
  C: { jobSector: "Réseaux", contractTypes: ["Alternance"], countries: ["Toute l'Europe"] },
};

for (const [uid, prefs] of Object.entries(users)) {
  console.log(`\nUser ${uid} preferences:`, prefs);
  for (const j of jobs) {
    const res = matchJobToPreferences(j as any, prefs as any);
    console.log(` Job ${j.id} (${j.title}) -> outcome=${res.outcome} score=${res.score.toFixed(2)} reasons=${res.reasons.join(",")}`);
  }
}
