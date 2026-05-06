import { type LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
      <div className="inline-flex p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500 mb-4">
        <Icon size={24} />
      </div>
      <p className="text-slate-700 dark:text-slate-300 font-medium">{title}</p>
      {description && <p className="text-sm text-slate-500 dark:text-slate-500 mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
