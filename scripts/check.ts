/**
 * Reachability doctor.
 *
 * ESPN restricted access to historical league data in August 2025, so which of
 * your seasons still respond — and whether they need a cookie — is a question
 * only your league can answer. This probes each season with and without
 * credentials and prints the result, so the ingest isn't a guessing game.
 *
 *   npm run espn:check
 */
import { fetchSeason, seasonUrl } from "@/lib/espn/client";
import { unwrapLeague } from "@/lib/espn/client";
import { readConfig, seasonRange } from "./config";

type Outcome = { label: string; detail: string };

async function probe(
  leagueId: string,
  season: number,
  creds: { espnS2?: string; swid?: string },
): Promise<Outcome> {
  try {
    const payload = await fetchSeason(leagueId, season, { ...creds, retries: 1 });
    const league = unwrapLeague(payload);
    const teams = league.teams?.length ?? 0;
    const games = league.schedule?.length ?? 0;
    return { label: "ok", detail: `${teams} teams, ${games} matchups` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /returned (\d{3})/.exec(message)?.[1];
    return { label: status ?? "error", detail: message.split("\n")[0] };
  }
}

async function main() {
  const config = readConfig();
  const seasons = seasonRange(config);
  const hasCreds = Boolean(config.espnS2 && config.swid);

  console.log(`\nLeague ${config.leagueId}, seasons ${seasons[0]}-${seasons.at(-1)}`);
  console.log(hasCreds ? "Credentials: present\n" : "Credentials: NOT SET\n");
  console.log("season  anonymous   with cookies  detail");
  console.log("------  ----------  ------------  ------");

  const needsCookies: number[] = [];
  const unreachable: number[] = [];

  for (const season of seasons) {
    const anon = await probe(config.leagueId, season, {});
    const auth = hasCreds
      ? await probe(config.leagueId, season, { espnS2: config.espnS2, swid: config.swid })
      : { label: "-", detail: "no credentials set" };

    const detail = auth.label === "ok" ? auth.detail : anon.label === "ok" ? anon.detail : auth.detail;
    console.log(
      `${season}    ${anon.label.padEnd(10)}  ${auth.label.padEnd(12)}  ${detail}`,
    );

    if (anon.label !== "ok" && auth.label === "ok") needsCookies.push(season);
    if (anon.label !== "ok" && auth.label !== "ok") unreachable.push(season);
  }

  console.log("");
  if (needsCookies.length > 0) {
    console.log(`Cookies required for: ${needsCookies.join(", ")}`);
  }
  if (unreachable.length > 0) {
    console.log(
      `Unreachable even with cookies: ${unreachable.join(", ")}\n` +
        "  If these predate your league, lower FIRST_SEASON. If they don't, ESPN has\n" +
        "  most likely dropped them from the archive - a snapshot you ingested\n" +
        "  earlier and committed under data/raw/ is then the only copy you have.",
    );
  }
  if (needsCookies.length === 0 && unreachable.length === 0) {
    console.log("Every season is reachable. Run `npm run ingest`.");
  }
  console.log(`\nExample URL: ${seasonUrl(config.leagueId, seasons[0])}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
