/**
 * Pulls every season of the league from ESPN and writes two things into data/:
 *
 *   raw/<year>.json  the untouched ESPN payload
 *   league.json      the normalized model the site renders
 *
 * Both are committed. Keeping the raw payloads means adding a draft page or a
 * head-to-head grid later is a pure code change: no cookies, no re-fetching a
 * decade of history, and no risk that ESPN has since dropped an old season.
 *
 * Run it from your own machine — ESPN credentials never need to reach Netlify,
 * because the deploy builds from the committed JSON.
 *
 *   npm run ingest                 every season
 *   npm run ingest -- --season 2026  just one
 *   npm run ingest -- --force        re-fetch seasons already on disk
 */
import fs from "node:fs";
import { fetchSeason } from "@/lib/espn/client";
import { buildManagerIndex } from "@/lib/espn/owners";
import { normalizeSeason } from "@/lib/espn/normalize";
import type { LeagueData, Season } from "@/lib/types";
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

  const owners = readOwnersConfig();
  const index = buildManagerIndex(
    payloads.map((p) => p.payload),
    owners,
  );

  const normalized: Season[] = [];
  for (const { season, payload } of payloads) {
    try {
      normalized.push(normalizeSeason(payload, season, index));
    } catch (error) {
      failures.push({
        season,
        message: `${season}: could not normalize the payload (${error instanceof Error ? error.message : String(error)})`,
      });
    }
  }

  normalized.sort((a, b) => a.id - b.id);

  const league: LeagueData = {
    leagueId: config.leagueId,
    leagueName: normalized.at(-1)?.leagueName ?? "League History",
    generatedAt: new Date().toISOString(),
    managers: index.managers,
    seasons: normalized,
  };

  writeJson(LEAGUE_FILE, league);

  console.log(
    `\nWrote ${normalized.length} seasons and ${index.managers.length} managers to data/league.json`,
  );

  const unnamed = index.managers.filter((m) => m.name === "Unknown manager");
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

  console.log("\nCommit data/ to publish. Run `npm run dev` to see it locally.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
