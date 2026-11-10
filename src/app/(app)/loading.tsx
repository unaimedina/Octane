import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="h-full p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Skeleton className="h-6 w-40" />
        <div className="space-y-3">
          <Skeleton className="h-24 w-2/3" />
          <Skeleton className="ml-auto h-16 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
