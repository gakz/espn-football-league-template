import Link from "next/link";
import { ChevronDown, Trophy } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface TeamNavItem {
  slug: string;
  label: string;
  detail: string;
}

export function SiteHeader({
  leagueName,
  teams,
}: {
  leagueName: string;
  teams: TeamNavItem[];
}) {
  return (
    <header className="border-b sticky top-0 z-40 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold">
          <Trophy className="size-4 text-trophy" />
          <span className="truncate">{leagueName}</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <details className="group relative">
            <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-1 transition-colors outline-none focus-visible:text-foreground [&::-webkit-details-marker]:hidden">
              Teams
              <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
            </summary>
            <div className="bg-popover text-popover-foreground absolute left-0 top-full mt-3 w-72 overflow-hidden rounded-lg border shadow-lg">
              <Link
                href="/managers"
                className="hover:bg-accent hover:text-accent-foreground block px-3 py-2 text-sm font-medium transition-colors"
              >
                All teams
              </Link>
              <div className="border-t" />
              <div className="max-h-[min(28rem,calc(100vh-6rem))] overflow-y-auto py-1">
                {teams.map((team) => (
                  <Link
                    key={team.slug}
                    href={`/managers/${team.slug}` as `/managers/${string}`}
                    className="hover:bg-accent hover:text-accent-foreground block px-3 py-2 transition-colors"
                  >
                    <span className="block truncate font-medium">{team.label}</span>
                    <span className="text-muted-foreground block truncate text-xs">{team.detail}</span>
                  </Link>
                ))}
              </div>
            </div>
          </details>
          <Link
            href="/records"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Record book
          </Link>
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
