"use client";
import { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon,
  title = "Нет данных",
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-gray-400">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <p className="text-gray-500 font-medium mb-1">{title}</p>
      {description && <p className="text-sm text-gray-400 mb-4 text-center max-w-sm">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
