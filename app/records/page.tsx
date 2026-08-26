import type { Metadata } from "next";
import Link from "next/link";
import { SetupPrompt } from "@/components/setup-prompt";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadLeagueView } from "@/lib/data";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "Record book" };

export default function RecordsPage() {
  const { records, league, hasData } = loadLeagueView();

  if (!hasData) return <SetupPrompt />;

  const slugFor = (ids: string[]) => league.managers.find((m) => m.id === ids[0])?.slug;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Record book</h1>
        <p className="text-muted-foreground">
          The best and worst of {league.leagueName}, regular season and playoffs. Consolation
          games are excluded throughout.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {records.map((record) => {
          const slug = slugFor(record.managerIds);
          return (
            <Card key={record.label}>
              <CardHeader>
                <CardDescription className="text-xs uppercase tracking-wide">
                  {record.label}
                </CardDescription>
                <CardTitle className="tabular text-2xl">{record.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {slug ? (
                  <Link href={`/managers/${slug}`} className="hover:text-foreground hover:underline">
                    {record.detail}
                  </Link>
                ) : (
                  record.detail
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
