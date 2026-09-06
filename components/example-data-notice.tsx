import { ExternalLink, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SETUP_DIRECTIONS_URL = "https://github.com/gakz/ffl-template#readme";

export function ExampleDataNotice() {
  return (
    <aside className="fixed inset-x-4 bottom-4 z-50 sm:left-auto sm:max-w-md">
      <Card className="border-trophy/40 bg-card/95 py-4 shadow-lg backdrop-blur">
        <CardHeader className="gap-2 px-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="size-4 text-trophy" />
            Example data is showing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 text-sm">
          <a
            href={SETUP_DIRECTIONS_URL}
            target="_blank"
            rel="noreferrer"
            className="text-foreground hover:text-trophy inline-flex items-center gap-1.5 font-medium transition-colors"
          >
            Setup directions on GitHub
            <ExternalLink className="size-3.5" />
          </a>
          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-4">
            <li>
              Set <code className="text-foreground">LEAGUE_ID</code>,{" "}
              <code className="text-foreground">FIRST_SEASON</code>,{" "}
              <code className="text-foreground">ESPN_S2</code>, and{" "}
              <code className="text-foreground">SWID</code> in Netlify.
            </li>
            <li>Trigger a new deploy so the function gets those values.</li>
            <li>
              Run <code className="text-foreground">refresh-espn</code> once from Netlify
              Functions.
            </li>
          </ol>
        </CardContent>
      </Card>
    </aside>
  );
}
