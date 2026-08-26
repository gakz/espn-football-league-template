import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadLeagueView } from "@/lib/data";
import { formatPct, formatPoints, formatRecord, ordinal } from "@/lib/utils";
import { gamesPlayed, winPct } from "@/lib/types";

export const dynamic = "force-static";

export function generateStaticParams() {
  return loadLeagueView().careers.map((career) => ({ slug: career.manager.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const career = loadLeagueView().careers.find((c) => c.manager.slug === slug);
  return { title: career?.manager.name ?? "Manager" };
}

export default async function ManagerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { careers } = loadLeagueView();
  const career = careers.find((c) => c.manager.slug === slug);

  if (!career) notFound();

  const streak = (s: typeof career.longestWinStreak) =>
    s.length > 0 && s.from && s.to
      ? {
          value: `${s.length} games`,
          detail: `${s.from.seasonId} wk ${s.from.week} to ${s.to.seasonId} wk ${s.to.week}`,
        }
      : { value: "None", detail: undefined };

  const winStreak = streak(career.longestWinStreak);
  const loseStreak = streak(career.longestLoseStreak);

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{career.manager.name}</h1>
          {career.championships > 0 ? (
            <Badge variant="trophy">
              <Trophy className="size-3" />
              {career.championships}x champion
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground">
          {career.seasonsPlayed} seasons, {formatRecord(career.combined)} all-time (
          {formatPct(career.winPct)}).
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Regular season"
          value={formatRecord(career.regular)}
          detail={`${formatPct(winPct(career.regular))} win rate`}
        />
        <StatTile
          label="Playoffs"
          value={formatRecord(career.playoff)}
          detail={`${career.playoffAppearances} appearances`}
        />
        <StatTile
          label="Points per game"
          value={formatPoints(career.pointsPerGame)}
          detail={`${formatPoints(career.combined.pointsFor, 0)} total`}
        />
        <StatTile
          label="All-play"
          value={formatPct(career.allPlayWinPct)}
          detail="Win rate vs the whole league"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label="Highest score"
          value={career.highestWeek ? formatPoints(career.highestWeek.points, 2) : "-"}
          detail={
            career.highestWeek
              ? `${career.highestWeek.seasonId} week ${career.highestWeek.week} vs ${career.highestWeek.opponentName}`
              : undefined
          }
        />
        <StatTile
          label="Lowest score"
          value={career.lowestWeek ? formatPoints(career.lowestWeek.points, 2) : "-"}
          detail={
            career.lowestWeek
              ? `${career.lowestWeek.seasonId} week ${career.lowestWeek.week} vs ${career.lowestWeek.opponentName}`
              : undefined
          }
        />
        <StatTile label="Longest win streak" value={winStreak.value} detail={winStreak.detail} />
        <StatTile
          label="Longest losing streak"
          value={loseStreak.value}
          detail={loseStreak.detail}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Season by season</h2>
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Season</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Regular</TableHead>
                <TableHead className="text-right">Playoffs</TableHead>
                <TableHead className="text-right">PF</TableHead>
                <TableHead className="text-right">PPG</TableHead>
                <TableHead className="text-right">All-play</TableHead>
                <TableHead className="text-right">Finish</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {career.seasons.map((season) => (
                <TableRow key={season.seasonId}>
                  <TableCell className="tabular font-medium">{season.seasonId}</TableCell>
                  <TableCell className="text-muted-foreground">{season.teamName}</TableCell>
                  <TableCell className="tabular text-right">{formatRecord(season.regular)}</TableCell>
                  <TableCell className="tabular text-right">
                    {gamesPlayed(season.playoff) > 0 ? formatRecord(season.playoff) : "-"}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatPoints(season.combined.pointsFor, 0)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatPoints(season.pointsPerGame)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {gamesPlayed(season.allPlay) > 0 ? formatRecord(season.allPlay) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {season.isChampion ? (
                      <Badge variant="trophy">
                        <Trophy className="size-3" />
                        Champion
                      </Badge>
                    ) : season.isRunnerUp ? (
                      <Badge variant="secondary">Runner-up</Badge>
                    ) : season.finalRank ? (
                      <span className="text-muted-foreground tabular">
                        {ordinal(season.finalRank)}
                      </span>
                    ) : season.madePlayoffs ? (
                      <span className="text-muted-foreground">Playoffs</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
