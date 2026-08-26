import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shown when data/league.json is missing or empty — i.e. a fresh clone where
 * the ingest hasn't run yet. Better than a blank page or a build failure.
 */
export function SetupPrompt() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No league data yet</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-4 text-sm">
        <p>Pull your league history from ESPN to fill this site in:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Copy <code className="text-foreground">.env.example</code> to{" "}
            <code className="text-foreground">.env.local</code> and set{" "}
            <code className="text-foreground">LEAGUE_ID</code> and{" "}
            <code className="text-foreground">FIRST_SEASON</code>.
          </li>
          <li>
            Add your <code className="text-foreground">ESPN_S2</code> and{" "}
            <code className="text-foreground">SWID</code> cookies from a browser signed in to
            ESPN (DevTools, Application, Cookies).
          </li>
          <li>
            Run <code className="text-foreground">npm run espn:check</code> to see which seasons
            respond, then <code className="text-foreground">npm run ingest</code>.
          </li>
          <li>
            Commit <code className="text-foreground">data/</code> and deploy.
          </li>
        </ol>
        <p>
          Just want to see the site? <code className="text-foreground">npm run seed:fixtures</code>{" "}
          loads a sample league.
        </p>
      </CardContent>
    </Card>
  );
}
