"use client";

import { useRouter } from "next/navigation";

export function DatePicker({ date }: { date: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      defaultValue={date}
      onChange={(e) => {
        const v = e.target.value;
        if (v) router.push(`/pointage?date=${v}`);
      }}
      className="text-sm font-medium bg-transparent border-0 focus:outline-none cursor-pointer"
    />
  );
}
