import { cn } from "@/lib/utils";

const colors = {
  slate: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  blue: "bg-brand-100 text-brand-700",
  green: "bg-green-100 text-green-700",
  yellow: "bg-yellow-100 text-yellow-800",
  orange: "bg-orange-100 text-orange-700",
  red: "bg-red-100 text-red-700",
  purple: "bg-purple-100 text-purple-700",
} as const;

export type BadgeColor = keyof typeof colors;

export function Badge({
  children,
  color = "slate",
  className,
}: {
  children: React.ReactNode;
  color?: BadgeColor;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        colors[color],
        className
      )}
    >
      {children}
    </span>
  );
}
