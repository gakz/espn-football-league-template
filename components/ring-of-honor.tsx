import { Badge } from "@/components/ui/badge";
import type { RingOfHonorEntry } from "@/lib/ring-of-honor";

export function RingOfHonor({ entries }: { entries: RingOfHonorEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">No Ring of Honor entries yet.</p>;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => (
        <li
          key={entry.playerId ?? entry.playerName}
          className="space-y-1 rounded-lg border bg-card px-4 py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{entry.playerName}</span>
            {entry.position ? <Badge variant="secondary">{entry.position}</Badge> : null}
          </div>
          <ul className="text-muted-foreground space-y-0.5 text-xs">
            {entry.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {entry.note ? <p className="text-xs italic">{entry.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}
