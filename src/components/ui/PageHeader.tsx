import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  backHref,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  backHref?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
      <div className="min-w-0 flex-1">
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 mb-1"
          >
            <ChevronLeft size={14} />
            Retour
          </Link>
        )}
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 break-words">
          {title}
        </h1>
        {description && (
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {description}
          </div>
        )}
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {action}
        </div>
      )}
    </div>
  );
}
