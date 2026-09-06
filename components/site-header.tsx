import Link from "next/link";
import { Trophy } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "/", label: "All-time" },
  { href: "/managers", label: "Teams" },
  { href: "/records", label: "Record book" },
] as const;

export function SiteHeader({ leagueName }: { leagueName: string }) {
  return (
    <header className="border-b sticky top-0 z-40 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Trophy className="size-4 text-trophy" />
          <span className="truncate">{leagueName}</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
