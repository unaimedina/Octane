import { Skeleton } from "@/components/ui/skeleton";

/** Mimics the log-style transcript: a title, left-aligned rows, one right-aligned user message. */
export default function WorkspaceLoading() {
  return (
    <div className="h-full p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="ml-auto h-12 w-1/2" />
        <div className="space-y-2.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
