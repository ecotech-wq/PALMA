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
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300 mb-1"
          >
            <ChevronLeft size={14} />
            Retour
          </Link>
        )}
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">{title}</h1>
        {description && <div className="text-sm text-slate-500 dark:text-slate-500 mt-1">{description}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
