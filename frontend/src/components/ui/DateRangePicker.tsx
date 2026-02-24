"use client";

const MONTHS = [
  { label: "Янв", value: "01" }, { label: "Фев", value: "02" }, { label: "Мар", value: "03" },
  { label: "Апр", value: "04" }, { label: "Май", value: "05" }, { label: "Июн", value: "06" },
  { label: "Июл", value: "07" }, { label: "Авг", value: "08" }, { label: "Сен", value: "09" },
  { label: "Окт", value: "10" }, { label: "Ноя", value: "11" }, { label: "Дек", value: "12" },
];

interface DateRangePickerProps {
  value: string; // month string like "03" or "" for all
  onChange: (month: string) => void;
  year?: number;
  onYearChange?: (year: number) => void;
  showAll?: boolean;
  allLabel?: string;
}

export default function DateRangePicker({
  value,
  onChange,
  year,
  onYearChange,
  showAll = true,
  allLabel = "Все",
}: DateRangePickerProps) {
  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      {onYearChange && year && (
        <div className="flex items-center gap-1 mr-2">
          <button onClick={() => onYearChange(year - 1)} className="px-2 py-1 bg-white border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50">
            &larr;
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-[3rem] text-center">{year}</span>
          <button onClick={() => onYearChange(year + 1)} className="px-2 py-1 bg-white border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50">
            &rarr;
          </button>
        </div>
      )}
      {showAll && (
        <button
          onClick={() => onChange("")}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            !value ? "bg-zetta-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {allLabel}
        </button>
      )}
      {MONTHS.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value === value ? "" : m.value)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            m.value === value ? "bg-zetta-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
