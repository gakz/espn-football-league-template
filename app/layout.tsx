import type { Metadata } from "next";
import "./globals.css";
import { ExampleDataNotice } from "@/components/example-data-notice";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { isExampleLeague, loadLeague, loadLeagueView } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const league = await loadLeague();
  // Before the first ingest there is no league name, and the fallback already
  // reads as a title on its own - don't stutter it into "League History - League History".
  const hasData = league.seasons.length > 0;

  return {
    title: {
      default: hasData ? `${league.leagueName} - League History` : league.leagueName,
      template: `%s - ${league.leagueName}`,
    },
    description: hasData
      ? `All-time standings, records and champions for ${league.leagueName}.`
      : "All-time standings, records and champions for an ESPN fantasy football league.",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { league, careers } = await loadLeagueView();
  const example = isExampleLeague(league);
  const teams = careers.map((career) => ({
    slug: career.manager.slug,
    label: career.manager.name,
    detail: `${career.seasonsPlayed} season${career.seasonsPlayed === 1 ? "" : "s"}`,
  }));

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <SiteHeader leagueName={league.leagueName} teams={teams} />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="text-muted-foreground mx-auto max-w-6xl px-4 pb-10 text-xs">
            {!example && league.generatedAt
              ? `Data pulled from ESPN on ${new Date(league.generatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}.`
              : null}
          </footer>
          {example ? <ExampleDataNotice /> : null}
        </ThemeProvider>
      </body>
    </html>
  );
}
