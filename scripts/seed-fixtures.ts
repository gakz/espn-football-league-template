/**
 * Writes the fixture league into data/ so the site can be developed and
 * screenshotted without ESPN access at all.
 *
 *   npm run seed:fixtures
 *
 * It refuses to clobber real data — delete data/league.json first if you
 * genuinely want the sample league back.
 */
import fs from "node:fs";
import { buildManagerIndex } from "@/lib/espn/owners";
import { normalizeSeason } from "@/lib/espn/normalize";
import type { LeagueData } from "@/lib/types";
import { fixtureOwnersConfig, makeLeagueFixture } from "@/fixtures/espn-fixture";
import { LEAGUE_FILE, writeJson } from "./config";

const force = process.argv.includes("--force");

if (fs.existsSync(LEAGUE_FILE) && !force) {
  const existing = JSON.parse(fs.readFileSync(LEAGUE_FILE, "utf8")) as LeagueData;
  if (existing.leagueId !== "fixture") {
    console.error(
      "\ndata/league.json holds real league data. Refusing to overwrite it.\n" +
        "Pass --force if you really want the sample league back.\n",
    );
    process.exit(1);
  }
}

const fixture = makeLeagueFixture();
const index = buildManagerIndex(
  fixture.map((f) => f.payload),
  fixtureOwnersConfig,
);

const league: LeagueData = {
  leagueId: "fixture",
  leagueName: "League of Doom",
  generatedAt: new Date().toISOString(),
  managers: index.managers,
  seasons: fixture.map((f) => normalizeSeason(f.payload, f.season, index)),
};

writeJson(LEAGUE_FILE, league);
console.log(
  `Seeded data/league.json with the sample league: ${league.seasons.length} seasons, ${league.managers.length} managers.`,
);
