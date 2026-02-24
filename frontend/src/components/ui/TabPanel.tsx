"use client";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabPanelProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  variant?: "default" | "pills";
}

export default function TabPanel({ tabs, active, onChange, variant = "default" }: TabPanelProps) {
  if (variant === "pills") {
    return (
      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              active === t.key
                ? "bg-zetta-500 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                active === t.key ? "bg-white/20" : "bg-gray-100"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="border-b border-gray-200 mb-6">
      <div className="flex gap-0 -mb-px">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              active === t.key
                ? "border-zetta-500 text-zetta-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                active === t.key ? "bg-zetta-50 text-zetta-600" : "bg-gray-100 text-gray-500"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
