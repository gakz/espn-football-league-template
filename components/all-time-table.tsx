"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Trophy } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ManagerCareer } from "@/lib/stats";
import { cn, formatPct, formatPoints, formatRecord } from "@/lib/utils";

type Row = {
  slug: string;
  name: string;
  seasons: number;
  record: string;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsPerGame: number;
  allPlayPct: number;
  titles: number;
  playoffs: number;
};

type ColumnId = keyof Omit<Row, "slug" | "record" | "name">;

interface Column {
  id: ColumnId;
  label: string;
  /** Long form shown on hover — the abbreviations are conventional but not obvious. */
  help?: string;
  align: "left" | "right";
  format: (row: Row) => React.ReactNode;
}

const columns: Column[] = [
  { id: "seasons", label: "Yrs", help: "Seasons played", align: "right", format: (r) => r.seasons },
  {
    id: "winPct",
    label: "Win%",
    help: "All games, ties counted as half a win",
    align: "right",
    format: (r) => formatPct(r.winPct),
  },
  {
    id: "pointsFor",
    label: "PF",
    help: "Total points scored",
    align: "right",
    format: (r) => formatPoints(r.pointsFor, 0),
  },
  {
    id: "pointsAgainst",
    label: "PA",
    help: "Total points allowed",
    align: "right",
    format: (r) => formatPoints(r.pointsAgainst, 0),
  },
  {
    id: "pointsPerGame",
    label: "PPG",
    help: "Average points per game",
    align: "right",
    format: (r) => formatPoints(r.pointsPerGame),
  },
  {
    id: "allPlayPct",
    label: "All-play",
    help: "Win rate if you had played every team every week. Strips out schedule luck.",
    align: "right",
    format: (r) => formatPct(r.allPlayPct),
  },
  {
    id: "playoffs",
    label: "Playoffs",
    help: "Playoff appearances",
    align: "right",
    format: (r) => r.playoffs,
  },
  {
    id: "titles",
    label: "Titles",
    help: "Championships won",
    align: "right",
    format: (r) =>
      r.titles > 0 ? (
        <Badge variant="trophy" className="tabular">
          <Trophy className="size-3" />
          {r.titles}
        </Badge>
      ) : (
        <span className="text-muted-foreground">0</span>
      ),
  },
];

export function AllTimeTable({ careers }: { careers: ManagerCareer[] }) {
  const rows = React.useMemo<Row[]>(
    () =>
      careers.map((career) => ({
        slug: career.manager.slug,
        name: career.manager.name,
        seasons: career.seasonsPlayed,
        record: formatRecord(career.combined),
        winPct: career.winPct,
        pointsFor: career.combined.pointsFor,
        pointsAgainst: career.combined.pointsAgainst,
        pointsPerGame: career.pointsPerGame,
        allPlayPct: career.allPlayWinPct,
        titles: career.championships,
        playoffs: career.playoffAppearances,
      })),
    [careers],
  );

  const [sort, setSort] = React.useState<{ id: ColumnId; desc: boolean }>({
    id: "titles",
    desc: true,
  });

  const sorted = React.useMemo(() => {
    return [...rows].sort((a, b) => {
      const delta = a[sort.id] - b[sort.id];
      // Points for is the tiebreak everywhere, so equal rows keep a stable order.
      const tie = a.pointsFor - b.pointsFor;
      const value = delta !== 0 ? delta : tie;
      return sort.desc ? -value : value;
    });
  }, [rows, sort]);

  const toggle = (id: ColumnId) =>
    setSort((prev) => (prev.id === id ? { id, desc: !prev.desc } : { id, desc: true }));

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-right">#</TableHead>
            <TableHead>Manager</TableHead>
            <TableHead>Record</TableHead>
            {columns.map((column) => (
              <TableHead key={column.id} className="text-right">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => toggle(column.id)}
                      aria-label={`Sort by ${column.help ?? column.label}`}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-foreground transition-colors",
                        sort.id === column.id && "text-foreground font-semibold",
                      )}
                    >
                      {column.label}
                      {sort.id === column.id ? (
                        sort.desc ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ArrowUp className="size-3" />
                        )
                      ) : null}
                    </button>
                  </TooltipTrigger>
                  {column.help ? <TooltipContent>{column.help}</TooltipContent> : null}
                </Tooltip>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row, i) => (
            <TableRow key={row.slug}>
              <TableCell className="tabular text-muted-foreground text-right">{i + 1}</TableCell>
              <TableCell className="font-medium">
                <Link href={`/managers/${row.slug}`} className="hover:underline">
                  {row.name}
                </Link>
              </TableCell>
              <TableCell className="tabular text-muted-foreground">{row.record}</TableCell>
              {columns.map((column) => (
                <TableCell key={column.id} className="tabular text-right">
                  {column.format(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
