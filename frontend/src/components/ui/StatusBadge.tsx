"use client";

const PRESET_COLORS: Record<string, string> = {
  // Order statuses
  NEW: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  ON_FITTING: "bg-purple-100 text-purple-800",
  REWORK: "bg-red-100 text-red-800",
  ASSEMBLY: "bg-orange-100 text-orange-800",
  READY: "bg-green-100 text-green-800",
  DELIVERED: "bg-gray-100 text-gray-800",
  CANCELLED: "bg-gray-200 text-gray-500",
  // Rework statuses
  OPEN: "bg-red-100 text-red-700",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-600",
  // Subcontractor order statuses
  SENT: "bg-blue-100 text-blue-800",
  RETURNED: "bg-orange-100 text-orange-800",
  COMPLETED: "bg-green-100 text-green-800",
  // Payment
  UNPAID: "bg-gray-100 text-gray-600",
  PARTIAL: "bg-orange-100 text-orange-700",
  PAID: "bg-green-100 text-green-700",
  // Boolean
  true: "bg-green-100 text-green-700",
  false: "bg-gray-100 text-gray-500",
  // Generic
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-800",
  danger: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  neutral: "bg-gray-100 text-gray-600",
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  colorClass?: string;
  size?: "sm" | "md";
}

export default function StatusBadge({ status, label, colorClass, size = "sm" }: StatusBadgeProps) {
  const colors = colorClass || PRESET_COLORS[status] || "bg-gray-100 text-gray-600";
  const sizeClass = size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs";

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${colors} ${sizeClass}`}>
      {label || status}
    </span>
  );
}
