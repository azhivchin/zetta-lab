"use client";
import { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EmptyState from "./EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  compact?: boolean;
  stickyHeader?: boolean;
}

export default function DataTable<T>({
  columns,
  data,
  loading,
  rowKey,
  onRowClick,
  rowClassName,
  emptyTitle,
  emptyDescription,
  emptyAction,
  pagination,
  compact,
  stickyHeader,
}: DataTableProps<T>) {
  const cellPad = compact ? "px-2 py-1.5" : "px-3 py-2.5";

  return (
    <div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-b border-gray-200 bg-gray-50 ${stickyHeader ? "sticky top-0 z-10" : ""}`}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`text-left ${cellPad} text-xs font-medium text-gray-500 uppercase whitespace-nowrap ${col.headerClassName || ""}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="p-0">
                    <div className="space-y-0">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex gap-4 px-3 py-3 border-b border-gray-100 animate-pulse">
                          {columns.map((col) => (
                            <div key={col.key} className="flex-1">
                              <div className="h-4 bg-gray-200 rounded w-3/4" />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => (
                  <tr
                    key={rowKey(row)}
                    className={`border-b border-gray-100 ${
                      onRowClick ? "hover:bg-gray-50 cursor-pointer" : ""
                    } ${rowClassName ? rowClassName(row) : ""}`}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={`${cellPad} text-sm ${col.className || ""}`}>
                        {col.render(row, idx)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Всего: {pagination.total}</p>
          <div className="flex items-center gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="p-1.5 rounded-md border hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm">{pagination.page} / {pagination.totalPages}</span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="p-1.5 rounded-md border hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
