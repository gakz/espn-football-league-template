import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card px-4 py-3", className)}>
      <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold">{value}</div>
      {detail ? <div className="text-muted-foreground mt-0.5 text-xs">{detail}</div> : null}
    </div>
  );
}
