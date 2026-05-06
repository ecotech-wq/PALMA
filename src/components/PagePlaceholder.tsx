import { Wrench } from "lucide-react";

export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
        <div className="inline-flex p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500 mb-4">
          <Wrench size={24} />
        </div>
        <p className="text-slate-700 dark:text-slate-300 font-medium">Module en cours de construction</p>
        <p className="text-sm text-slate-500 dark:text-slate-500 mt-1 max-w-md mx-auto">{description}</p>
      </div>
    </div>
  );
}
