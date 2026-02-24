"use client";
import { ReactNode } from "react";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: { value: number; label?: string };
  color?: "default" | "green" | "red" | "yellow" | "blue" | "purple";
  onClick?: () => void;
}

const COLOR_MAP = {
  default: "bg-gray-50 text-gray-600",
  green: "bg-green-50 text-green-600",
  red: "bg-red-50 text-red-600",
  yellow: "bg-yellow-50 text-yellow-600",
  blue: "bg-blue-50 text-blue-600",
  purple: "bg-purple-50 text-purple-600",
};

export default function StatsCard({ label, value, icon, trend, color = "default", onClick }: StatsCardProps) {
  return (
    <div
      className={`card p-5 ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {trend && (
            <p className={`text-xs mt-1 ${trend.value >= 0 ? "text-green-600" : "text-red-500"}`}>
              {trend.value >= 0 ? "+" : ""}{trend.value}%{trend.label ? ` ${trend.label}` : ""}
            </p>
          )}
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${COLOR_MAP[color]}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
