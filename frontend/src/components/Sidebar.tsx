"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearAuth, getUser, authApi } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  SENIOR_TECH: "Ст. техник",
  TECHNICIAN: "Техник",
  CAD_SPECIALIST: "CAD-специалист",
  GYPSUM_WORKER: "Гипсовщик",
  CERAMIST: "Керамист",
  COURIER: "Курьер",
  ACCOUNTANT: "Бухгалтер",
};

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: "main",
    label: "Основное",
    items: [
      { href: "/dashboard", label: "Дашборд", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
      { href: "/orders", label: "Наряды", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
    ],
  },
  {
    key: "crm",
    label: "CRM",
    items: [
      { href: "/clients", label: "Заказчики", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
      { href: "/subcontractors", label: "Субподрядчики", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
    ],
  },
  {
    key: "production",
    label: "Производство",
    items: [
      { href: "/work-catalog", label: "Каталог работ", icon: "M4 6h16M4 10h16M4 14h16M4 18h16" },
      { href: "/warehouse", label: "Склад", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
      { href: "/logistics", label: "Логистика", icon: "M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" },
      { href: "/quality", label: "Качество", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
    ],
  },
  {
    key: "finance",
    label: "Финансы",
    items: [
      { href: "/finance", label: "Финансы", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
      { href: "/budget", label: "Бюджет", icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
      { href: "/salary", label: "Зарплата", icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" },
      { href: "/pricing", label: "Прайс-листы", icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
    ],
  },
  {
    key: "analytics",
    label: "Аналитика",
    items: [
      { href: "/analytics", label: "Аналитика", icon: "M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" },
      { href: "/reports", label: "Отчёты", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
    ],
  },
  {
    key: "settings",
    label: "Настройки",
    items: [
      { href: "/users", label: "Команда", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
      { href: "/settings", label: "Настройки", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    const u = getUser();
    if (!u) { router.push("/login"); return; }
    setUser(u);
  }, [router]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await authApi("/notifications?limit=10");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.data?.notifications || []);
        setUnreadCount(data.data?.unreadCount || 0);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchBadges = useCallback(async () => {
    try {
      const res = await authApi("/dashboard");
      if (res.ok) {
        const d = (await res.json()).data;
        setOverdueCount(d.counters?.overdueOrders || 0);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    fetchBadges();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user, fetchNotifications, fetchBadges]);

  const markAsRead = async (id: string) => {
    try {
      await authApi(`/notifications/${id}/read`, { method: "PATCH" });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await authApi("/notifications/read-all", { method: "PATCH" });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "только что";
    if (mins < 60) return `${mins} мин`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ч`;
    const days = Math.floor(hrs / 24);
    return `${days} д`;
  };

  const getBadge = (href: string) => {
    if (href === "/orders" && overdueCount > 0) return overdueCount;
    return undefined;
  };

  const isGroupActive = (group: NavGroup) =>
    group.items.some(item => pathname === item.href || pathname?.startsWith(item.href + "/"));

  return (
    <aside className="w-64 bg-dark min-h-screen flex flex-col relative flex-shrink-0">
      <div className="p-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zetta-400 tracking-tight">
            ZETTA<span className="text-zetta-200 font-light ml-1">LAB</span>
          </h1>
          {user && (
            <p className="text-gray-400 text-xs mt-1">
              {(user.organization as Record<string, string>)?.name}
            </p>
          )}
        </div>

        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative p-2 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center min-w-[18px] h-[18px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>

      {showNotifications && (
        <div className="absolute top-16 left-2 right-2 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-h-80 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700">
            <span className="text-sm font-medium text-gray-200">Уведомления</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-zetta-400 hover:text-zetta-300">
                Прочитать все
              </button>
            )}
          </div>
          <div className="overflow-auto max-h-64">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">Нет уведомлений</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => !n.isRead && markAsRead(n.id)}
                  className={`px-4 py-2.5 border-b border-gray-800 cursor-pointer hover:bg-gray-800/50 transition-colors ${
                    !n.isRead ? "bg-gray-800/30" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && <div className="w-2 h-2 rounded-full bg-zetta-400 mt-1.5 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${!n.isRead ? "text-gray-100" : "text-gray-400"}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{n.message}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 overflow-auto">
        {NAV_GROUPS.map((group) => {
          const collapsed = collapsedGroups[group.key];
          const active = isGroupActive(group);

          return (
            <div key={group.key} className="mb-1">
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center justify-between px-4 py-1.5 mt-2 group"
              >
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                  active ? "text-zetta-400" : "text-gray-600"
                }`}>
                  {group.label}
                </span>
                <ChevronDown className={`w-3 h-3 text-gray-600 transition-transform ${
                  collapsed ? "-rotate-90" : ""
                }`} />
              </button>

              {!collapsed && group.items.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                const badge = getBadge(item.href);
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg mb-0.5 transition-colors ${
                      isActive ? "bg-zetta-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                    }`}>
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                    <span className="text-sm font-medium flex-1">{item.label}</span>
                    {badge !== undefined && badge > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {user && (
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-zetta-600 flex items-center justify-center text-white text-sm font-medium">
              {String(user.firstName || "").charAt(0)}{String(user.lastName || "").charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 truncate">{String(user.firstName)} {String(user.lastName)}</p>
              <p className="text-xs text-gray-500">{ROLE_LABELS[String(user.role)] || String(user.role)}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="mt-3 text-xs text-gray-500 hover:text-red-400 transition-colors">
            Выйти
          </button>
        </div>
      )}
    </aside>
  );
}
