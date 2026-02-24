"use client";
import { ReactNode } from "react";
import { Search } from "lucide-react";

interface FilterBarProps {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  children?: ReactNode;
  className?: string;
}

export default function FilterBar({ search, children, className = "" }: FilterBarProps) {
  return (
    <div className={`flex gap-3 mb-4 flex-wrap items-end ${className}`}>
      {search && (
        <div className="relative flex-1 max-w-md min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={search.placeholder || "Поиск..."}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      )}
      {children}
    </div>
  );
}
