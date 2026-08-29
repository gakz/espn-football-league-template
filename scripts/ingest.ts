/**
 * Local/debug ESPN pull. Production refreshes happen in Netlify's scheduled
 * function and are written to Netlify Blobs.
 *
 * This script writes two things into data/:
 *
 *   raw/<year>.json  the untouched ESPN payload
 *   league.json      the normalized model for inspection
 *
 *   npm run ingest                 every season
 *   npm run ingest -- --season 2026  just one
 *   npm run ingest -- --force        re-fetch seasons already on disk
 */
import fs from "node:fs";
import { fetchSeason } from "@/lib/espn/client";
import { buildLeagueData } from "@/lib/espn/build-league";
import {
  LEAGUE_FILE,
  rawPath,
  readConfig,
  readOwnersConfig,
  seasonRange,
  writeJson,
} from "./config";

function parseArgs(argv: string[]) {
  const seasonFlag = argv.indexOf("--season");
  return {
    force: argv.includes("--force"),
    season: seasonFlag >= 0 ? Number(argv[seasonFlag + 1]) : undefined,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readConfig();
  const seasons = seasonRange(config, args.season);

  if (!config.espnS2 || !config.swid) {
    console.warn(
      "! ESPN_S2/SWID are not both set. Private leagues will return 401, and since\n" +
        "  August 2025 ESPN also requires a signed-in cookie for pre-2018 seasons.\n",
    );
  }

  console.log(`Ingesting league ${config.leagueId}, seasons ${seasons[0]}-${seasons.at(-1)}\n`);

  const payloads: Array<{ season: number; payload: unknown }> = [];
  const failures: Array<{ season: number; message: string }> = [];

  for (const season of seasons) {
    const cached = fs.existsSync(rawPath(season));
    const isCurrent = season === config.lastSeason;

    // Finished seasons never change, so don't re-fetch them by default. The
    // current season always refreshes.
    if (cached && !args.force && !isCurrent) {
      payloads.push({ season, payload: JSON.parse(fs.readFileSync(rawPath(season), "utf8")) });
      console.log(`  ${season}  cached`);
      continue;
    }

    try {
      const payload = await fetchSeason(config.leagueId, season, {
        espnS2: config.espnS2,
        swid: config.swid,
      });
      writeJson(rawPath(season), payload);
      payloads.push({ season, payload });
      console.log(`  ${season}  fetched`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ season, message });
      console.log(`  ${season}  FAILED`);

      // A season we failed to fetch but already have on disk is still usable.
      if (cached) {
        payloads.push({ season, payload: JSON.parse(fs.readFileSync(rawPath(season), "utf8")) });
        console.log(`  ${season}  using cached copy instead`);
      }
    }
  }

  if (payloads.length === 0) {
    console.error("\nNo seasons could be read. Nothing written.\n");
    for (const failure of failures) console.error(`  ${failure.message}`);
    process.exit(1);
  }

  const league = buildLeagueData({
    leagueId: config.leagueId,
    payloads,
    owners: readOwnersConfig(),
  });

  writeJson(LEAGUE_FILE, league);

  console.log(
    `\nWrote ${league.seasons.length} seasons and ${league.managers.length} managers to data/league.json`,
  );

  const unnamed = league.managers.filter((m) => m.name === "Unknown manager");
  if (unnamed.length > 0) {
    console.log(
      `\n${unnamed.length} manager(s) have no display name from ESPN. Add them to data/owners.json:\n` +
        unnamed.map((m) => `  "${m.id}": { "name": "..." }`).join("\n"),
    );
  }

  if (failures.length > 0) {
    console.log("\nSeasons that could not be fetched:");
    for (const failure of failures) console.log(`  ${failure.message}`);
  }

  console.log("\nLocal/debug files written. Production reads from Netlify Blobs.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
