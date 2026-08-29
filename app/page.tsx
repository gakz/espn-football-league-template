import Link from "next/link";
import { Trophy } from "lucide-react";
import { AllTimeTable } from "@/components/all-time-table";
import { SetupPrompt } from "@/components/setup-prompt";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadLeagueView } from "@/lib/data";
import { formatPoints } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { careers, summary, league, hasData } = await loadLeagueView();

  if (!hasData) return <SetupPrompt />;

  const managerName = (ids: string[]) =>
    ids
      .map((id) => league.managers.find((m) => m.id === id))
      .filter((m) => m !== undefined)
      .map((m) => m.name)
      .join(" & ") || "Unknown";

  const managerSlug = (ids: string[]) =>
    league.managers.find((m) => m.id === ids[0])?.slug;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">All-time standings</h1>
        <p className="text-muted-foreground">
          {summary.seasonsPlayed} seasons, {summary.managerCount} teams,{" "}
          {formatPoints(summary.gamesPlayed, 0)} games played.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Seasons"
          value={String(summary.seasonsPlayed)}
          detail={`${summary.firstSeason} to ${summary.lastSeason}`}
        />
        <StatTile label="Teams" value={String(summary.managerCount)} detail="All-time" />
        <StatTile
          label="Games"
          value={formatPoints(summary.gamesPlayed, 0)}
          detail="Regular season and playoffs"
        />
        <StatTile
          label="Points scored"
          value={formatPoints(summary.totalPoints, 0)}
          detail="Across league history"
        />
      </section>

      {summary.champions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4 text-trophy" />
              Champions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {summary.champions.map((champion) => {
                const slug = managerSlug(champion.managerIds);
                const label = (
                  <>
                    <span className="tabular font-semibold">{champion.seasonId}</span>
                    <span className="text-muted-foreground">{managerName(champion.managerIds)}</span>
                  </>
                );
                return (
                  <li key={champion.seasonId}>
                    {slug ? (
                      <Link
                        href={`/managers/${slug}`}
                        className="hover:bg-accent flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                        {label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">Career records</h2>
          <p className="text-muted-foreground text-sm">
            Click a column to sort. Regular season and playoffs combined.
          </p>
        </div>
        <div className="rounded-xl border">
          <AllTimeTable careers={careers} />
        </div>
        <p className="text-muted-foreground text-xs">
          Consolation-bracket games are excluded from every record on this page.{" "}
          {league.seasons.some((s) => !s.complete) ? (
            <Badge variant="outline" className="ml-1">
              {league.seasons.filter((s) => !s.complete).map((s) => s.id).join(", ")} still in
              progress
            </Badge>
          ) : null}
        </p>
      </section>
    </div>
  );
}
