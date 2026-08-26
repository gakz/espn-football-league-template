import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">That page isn&apos;t part of this league&apos;s history.</p>
      <Button asChild variant="outline">
        <Link href="/">Back to all-time standings</Link>
      </Button>
    </div>
  );
}
