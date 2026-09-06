import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadLeagueView } from "@/lib/data";
import { formatPct, formatPoints, formatRecord } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teams",
};

export default async function TeamsPage() {
  const { careers } = await loadLeagueView();

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
        <p className="text-muted-foreground">
          Every team profile in the league history, sorted by championships, win rate, and points.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {careers.map((career) => (
          <Card key={career.manager.id} className="gap-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <Link href={`/managers/${career.manager.slug}`} className="hover:underline">
                  {career.manager.name}
                </Link>
                {career.championships > 0 ? (
                  <Badge variant="trophy" className="tabular">
                    <Trophy className="size-3" />
                    {career.championships}
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-muted-foreground text-sm">
                {career.seasonsPlayed} seasons, {formatRecord(career.combined)} all-time.
              </div>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">Win%</dt>
                  <dd className="tabular mt-1 font-semibold">{formatPct(career.winPct)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">PF</dt>
                  <dd className="tabular mt-1 font-semibold">
                    {formatPoints(career.combined.pointsFor, 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                    Playoffs
                  </dt>
                  <dd className="tabular mt-1 font-semibold">{career.playoffAppearances}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
