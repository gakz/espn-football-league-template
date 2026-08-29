import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shown when the Netlify Blob snapshot has not been seeded yet. Better than a
 * blank page or a request-time crash.
 */
export function SetupPrompt() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No league data yet</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-4 text-sm">
        <p>Seed the Netlify Blob snapshot to fill this site in:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            In Netlify, set <code className="text-foreground">LEAGUE_ID</code>,{" "}
            <code className="text-foreground">FIRST_SEASON</code>,{" "}
            <code className="text-foreground">ESPN_S2</code>, and{" "}
            <code className="text-foreground">SWID</code>.
          </li>
          <li>
            Deploy the site so Netlify publishes the{" "}
            <code className="text-foreground">refresh-espn</code> scheduled function.
          </li>
          <li>
            In the Netlify Functions UI, run the scheduled function once to backfill the Blob.
            Future runs refresh automatically.
          </li>
        </ol>
        <p>
          For local debugging, run through{" "}
          <code className="text-foreground">netlify dev</code> so Blobs are available.
        </p>
      </CardContent>
    </Card>
  );
}
