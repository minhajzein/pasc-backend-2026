import { League } from "../models/League";

const LEAGUES = [
  { name: "PPL", slug: "ppl", fullName: "PASC Premier League", description: "Football league" },
  { name: "PCL", slug: "pcl", fullName: "PASC Cricket League", description: "Cricket league" },
  { name: "PVL", slug: "pvl", fullName: "PASC Volleyball League", description: "Volleyball league" },
  { name: "PBL", slug: "pbl", fullName: "PASC Badminton League", description: "Badminton league" },
];

export async function seedLeagues(): Promise<void> {
  for (const row of LEAGUES) {
    await League.findOneAndUpdate(
      { slug: row.slug },
      { $set: { name: row.name, fullName: row.fullName, description: row.description } },
      { upsert: true, new: true }
    );
  }
  console.log("Leagues seeded");
}
