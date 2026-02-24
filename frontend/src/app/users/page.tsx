"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authApi, getToken, getUser } from "@/lib/api";
import { UserPlus, Users as UsersIcon, X, Phone, Mail, Calendar, Gift, FileText } from "lucide-react";
import { useReferences } from "@/lib/useReferences";
import { PageHeader } from "@/components/ui";

interface UserItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  patronymic: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  department: string | null;
  birthday: string | null;
  hireDate: string | null;
  salaryCoeff: number | string | null;
  personalPhone: string | null;
  hrNotes: string | null;
}

interface Vacation {
  id: string;
  userId: string;
  type: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  days: number;
  notes: string | null;
  user?: { id: string; firstName: string; lastName: string; department: string | null; role: string };
}

interface Birthday {
  id: string;
  firstName: string;
  lastName: string;
  birthday: string;
  department: string | null;
  role: string;
  daysUntil: number;
  age: number;
}

interface Contract {
  id: string;
  userId: string;
  type: string;
  number: string;
  startDate: string;
  endDate: string | null;
  salary: number | string | null;
  notes: string | null;
  isActive: boolean;
  user?: { id: string; firstName: string; lastName: string; role: string };
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Владелец", ADMIN: "Администратор", SENIOR_TECH: "Ст. техник",
  TECHNICIAN: "Техник", CAD_SPECIALIST: "CAD-специалист", GYPSUM_WORKER: "Гипсовщик",
  CERAMIST: "Керамист", COURIER: "Курьер", ACCOUNTANT: "Бухгалтер",
};
const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-purple-100 text-purple-800", ADMIN: "bg-blue-100 text-blue-800",
  SENIOR_TECH: "bg-zetta-100 text-zetta-800", TECHNICIAN: "bg-green-100 text-green-800",
  CAD_SPECIALIST: "bg-indigo-100 text-indigo-800", GYPSUM_WORKER: "bg-yellow-100 text-yellow-800",
  CERAMIST: "bg-orange-100 text-orange-800", COURIER: "bg-cyan-100 text-cyan-800",
  ACCOUNTANT: "bg-pink-100 text-pink-800",
};
const CREATABLE_ROLES = ["ADMIN", "SENIOR_TECH", "TECHNICIAN", "CAD_SPECIALIST", "GYPSUM_WORKER", "CERAMIST", "COURIER", "ACCOUNTANT"];

const VACATION_TYPE_LABELS: Record<string, string> = {
  VACATION: "Отпуск", SICK_LEAVE: "Больничный", UNPAID: "За свой счёт",
  MATERNITY: "Декрет", OTHER: "Прочее",
};
const VACATION_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Запланирован", APPROVED: "Утверждён", ACTIVE: "Активен",
  COMPLETED: "Завершён", CANCELLED: "Отменён",
};
const VACATION_STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-blue-100 text-blue-700", APPROVED: "bg-green-100 text-green-700",
  ACTIVE: "bg-yellow-100 text-yellow-700", COMPLETED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-red-100 text-red-600",
};
const VACATION_TYPE_COLORS: Record<string, string> = {
  VACATION: "bg-blue-500", SICK_LEAVE: "bg-red-500", UNPAID: "bg-gray-500",
  MATERNITY: "bg-pink-500", OTHER: "bg-purple-500",
};
const CONTRACT_TYPE_LABELS: Record<string, string> = {
  EMPLOYMENT: "Трудовой", GPC: "ГПХ", INTERNSHIP: "Стажировка",
};

export default function UsersPage() {
  const router = useRouter();
  const { asOptions: departmentOptions } = useReferences("department");
  const [tab, setTab] = useState<"team" | "vacations" | "birthdays" | "contracts">("team");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<UserItem | null>(null);
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [currentUser, setCurrentUser] = useState<Record<string, unknown> | null>(null);
  const [vacYear, setVacYear] = useState(new Date().getFullYear());

  const [newUser, setNewUser] = useState({
    email: "", password: "", firstName: "", lastName: "",
    patronymic: "", phone: "", role: "TECHNICIAN",
  });
  const [vacForm, setVacForm] = useState({
    userId: "", type: "VACATION", dateFrom: "", dateTo: "", notes: "",
  });
  const [conForm, setConForm] = useState({
    userId: "", type: "EMPLOYMENT", number: "", startDate: "", endDate: "", salary: "", notes: "",
  });

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    setCurrentUser(getUser());
  }, [router]);

  const isAdmin = currentUser?.role === "OWNER" || currentUser?.role === "ADMIN";

  const fetchUsers = useCallback(async () => {
    try {
      const params = roleFilter ? `?role=${roleFilter}` : "";
      const res = await authApi(`/users${params}`);
      if (res.ok) { const d = await res.json(); setUsers(d.data || []); }
    } catch { /* ignore */ }
  }, [roleFilter]);

  const fetchVacations = useCallback(async () => {
    try {
      const res = await authApi(`/users/vacations/all?year=${vacYear}`);
      if (res.ok) { const d = await res.json(); setVacations(d.data || []); }
    } catch { /* ignore */ }
  }, [vacYear]);

  const fetchBirthdays = useCallback(async () => {
    try {
      const res = await authApi("/users/birthdays");
      if (res.ok) { const d = await res.json(); setBirthdays(d.data || []); }
    } catch { /* ignore */ }
  }, []);

  const fetchContracts = useCallback(async () => {
    try {
      const res = await authApi("/users/contracts/all");
      if (res.ok) { const d = await res.json(); setContracts(d.data || []); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchUsers(), fetchVacations(), fetchBirthdays(), fetchContracts()])
      .finally(() => setLoading(false));
  }, [fetchUsers, fetchVacations, fetchBirthdays, fetchContracts]);

  const handleCreate = async () => {
    if (!newUser.email || !newUser.password || !newUser.firstName || !newUser.lastName) {
      setError("Заполните обязательные поля"); return;
    }
    setSaving(true); setError("");
    try {
      const res = await authApi("/auth/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUser.email, password: newUser.password,
          firstName: newUser.firstName, lastName: newUser.lastName,
          patronymic: newUser.patronymic || undefined, phone: newUser.phone || undefined, role: newUser.role,
        }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewUser({ email: "", password: "", firstName: "", lastName: "", patronymic: "", phone: "", role: "TECHNICIAN" });
        fetchUsers();
      } else { const d = await res.json(); setError(d.error?.message || "Ошибка"); }
    } catch { setError("Ошибка создания"); }
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!showEditModal) return;
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = {
        firstName: showEditModal.firstName, lastName: showEditModal.lastName,
        patronymic: showEditModal.patronymic || undefined, phone: showEditModal.phone || undefined,
        role: showEditModal.role, isActive: showEditModal.isActive,
        department: showEditModal.department || undefined,
        personalPhone: showEditModal.personalPhone || undefined,
        hrNotes: showEditModal.hrNotes || undefined,
        birthday: showEditModal.birthday || undefined,
        hireDate: showEditModal.hireDate || undefined,
        salaryCoeff: showEditModal.salaryCoeff ? Number(showEditModal.salaryCoeff) : undefined,
      };
      const res = await authApi(`/users/${showEditModal.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { setShowEditModal(null); fetchUsers(); fetchBirthdays(); }
      else { const d = await res.json(); setError(d.error?.message || "Ошибка"); }
    } catch { setError("Ошибка обновления"); }
    setSaving(false);
  };

  const toggleActive = async (user: UserItem) => {
    try {
      await authApi(`/users/${user.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      fetchUsers();
    } catch { /* ignore */ }
  };

  const createVacation = async () => {
    if (!vacForm.userId || !vacForm.dateFrom || !vacForm.dateTo) return;
    setSaving(true); setError("");
    try {
      const res = await authApi("/users/vacations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...vacForm, notes: vacForm.notes || undefined }),
      });
      if (res.ok) { setShowVacationModal(false); fetchVacations(); }
      else { const d = await res.json(); setError(d.error?.message || "Ошибка"); }
    } catch { setError("Ошибка создания отпуска"); }
    setSaving(false);
  };

  const updateVacationStatus = async (id: string, status: string) => {
    try {
      await authApi(`/users/vacations/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchVacations();
    } catch { /* ignore */ }
  };

  const deleteVacation = async (id: string) => {
    try {
      await authApi(`/users/vacations/${id}`, { method: "DELETE" });
      fetchVacations();
    } catch { /* ignore */ }
  };

  const createContract = async () => {
    if (!conForm.userId || !conForm.number || !conForm.startDate) return;
    setSaving(true); setError("");
    try {
      const res = await authApi("/users/contracts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...conForm,
          salary: conForm.salary ? Number(conForm.salary) : undefined,
          endDate: conForm.endDate || undefined,
          notes: conForm.notes || undefined,
        }),
      });
      if (res.ok) { setShowContractModal(false); fetchContracts(); }
      else { const d = await res.json(); setError(d.error?.message || "Ошибка"); }
    } catch { setError("Ошибка создания договора"); }
    setSaving(false);
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("ru-RU") : "—";
  const fmtMoney = (n: number | string | null) => n !== null ? Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 0 }) : "—";

  // Months for vacation timeline
  const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

  // Group vacations by user
  const vacByUser = new Map<string, { user: Vacation["user"]; items: Vacation[] }>();
  for (const v of vacations) {
    if (!v.user) continue;
    const key = v.userId;
    if (!vacByUser.has(key)) vacByUser.set(key, { user: v.user, items: [] });
    vacByUser.get(key)!.items.push(v);
  }

  const yearStart = new Date(vacYear, 0, 1).getTime();
  const yearEnd = new Date(vacYear, 11, 31).getTime();
  const yearDays = 365;

  const getBarStyle = (v: Vacation) => {
    const from = Math.max(new Date(v.dateFrom).getTime(), yearStart);
    const to = Math.min(new Date(v.dateTo).getTime(), yearEnd);
    const left = ((from - yearStart) / (yearEnd - yearStart)) * 100;
    const width = Math.max(((to - from) / (yearEnd - yearStart)) * 100, 0.5);
    return { left: `${left}%`, width: `${width}%` };
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader title="Команда">
            <div className="flex gap-2">
              {tab === "team" && isAdmin && (
                <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> Сотрудник
                </button>
              )}
              {tab === "vacations" && isAdmin && (
                <button onClick={() => { setVacForm({ userId: "", type: "VACATION", dateFrom: "", dateTo: "", notes: "" }); setShowVacationModal(true); }}
                  className="btn-primary flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Отпуск
                </button>
              )}
              {tab === "contracts" && isAdmin && (
                <button onClick={() => { setConForm({ userId: "", type: "EMPLOYMENT", number: "", startDate: "", endDate: "", salary: "", notes: "" }); setShowContractModal(true); }}
                  className="btn-primary flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Договор
                </button>
              )}
            </div>
          </PageHeader>

          {/* Tabs */}
          <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg w-fit">
            {([
              { key: "team", label: "Команда", icon: UsersIcon },
              { key: "vacations", label: "Отпуска", icon: Calendar },
              { key: "birthdays", label: "Дни рождения", icon: Gift },
              { key: "contracts", label: "Договора", icon: FileText },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Загрузка...</div>
          ) : tab === "team" ? (
            <>
              {/* Role filter */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <button onClick={() => setRoleFilter("")}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${!roleFilter ? "bg-zetta-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  Все
                </button>
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                  <button key={role} onClick={() => setRoleFilter(role === roleFilter ? "" : role)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${role === roleFilter ? "bg-zetta-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    {label}
                  </button>
                ))}
              </div>

              {users.length === 0 ? (
                <div className="card p-12 text-center">
                  <UsersIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Сотрудников пока нет</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {users.map((user) => (
                    <div key={user.id} className={`card p-4 ${!user.isActive ? "opacity-60" : ""}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${user.isActive ? "bg-zetta-500" : "bg-gray-400"}`}>
                            {user.firstName[0]}{user.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{user.lastName} {user.firstName} {user.patronymic || ""}</p>
                            <span className={`badge text-xs ${ROLE_COLORS[user.role] || "bg-gray-100 text-gray-800"}`}>
                              {ROLE_LABELS[user.role] || user.role}
                            </span>
                            {user.department && (
                              <span className="badge text-xs bg-gray-100 text-gray-600 ml-1">{user.department}</span>
                            )}
                          </div>
                        </div>
                        {!user.isActive && <span className="badge bg-red-100 text-red-700 text-xs">Неактивен</span>}
                      </div>

                      <div className="space-y-1 text-sm text-gray-500">
                        <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {user.email}</p>
                        {user.phone && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {user.phone}</p>}
                        {user.birthday && <p className="flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> {fmtDate(user.birthday)}</p>}
                        {user.hireDate && <p className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> с {fmtDate(user.hireDate)}</p>}
                      </div>

                      {isAdmin && user.role !== "OWNER" && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                          <button onClick={() => setShowEditModal({...user})} className="text-xs text-zetta-600 hover:text-zetta-700">Редактировать</button>
                          <button onClick={() => toggleActive(user)}
                            className={`text-xs ${user.isActive ? "text-red-500 hover:text-red-600" : "text-green-600 hover:text-green-700"}`}>
                            {user.isActive ? "Деактивировать" : "Активировать"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : tab === "vacations" ? (
            <>
              {/* Year selector */}
              <div className="flex items-center gap-3 mb-4">
                <button onClick={() => setVacYear(y => y - 1)} className="px-2 py-1 bg-white border rounded text-sm">←</button>
                <span className="text-lg font-semibold text-gray-800">{vacYear}</span>
                <button onClick={() => setVacYear(y => y + 1)} className="px-2 py-1 bg-white border rounded text-sm">→</button>
              </div>

              {vacByUser.size === 0 ? (
                <div className="card p-12 text-center">
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Отпусков на {vacYear} год не запланировано</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  {/* Month headers */}
                  <div className="flex border-b border-gray-200">
                    <div className="w-48 flex-shrink-0 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">Сотрудник</div>
                    <div className="flex-1 flex">
                      {MONTHS.map(m => (
                        <div key={m} className="flex-1 text-center py-2 text-xs text-gray-400 border-l border-gray-100">{m}</div>
                      ))}
                    </div>
                  </div>

                  {/* Rows */}
                  {Array.from(vacByUser.entries()).map(([uid, { user: u, items }]) => (
                    <div key={uid} className="flex border-b border-gray-100 hover:bg-gray-50">
                      <div className="w-48 flex-shrink-0 px-4 py-3">
                        <p className="text-sm font-medium text-gray-800">{u?.lastName} {u?.firstName}</p>
                        <p className="text-xs text-gray-400">{u?.department || ROLE_LABELS[u?.role || ""]}</p>
                      </div>
                      <div className="flex-1 relative" style={{ minHeight: 40 }}>
                        {/* Month grid lines */}
                        {MONTHS.map((_, i) => (
                          <div key={i} className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: `${(i / 12) * 100}%` }} />
                        ))}
                        {/* Bars */}
                        {items.map(v => {
                          const style = getBarStyle(v);
                          return (
                            <div key={v.id}
                              className={`absolute top-2 h-5 rounded-full ${VACATION_TYPE_COLORS[v.type]} opacity-80 cursor-pointer group`}
                              style={style}
                              title={`${VACATION_TYPE_LABELS[v.type]}: ${fmtDate(v.dateFrom)} — ${fmtDate(v.dateTo)} (${v.days} дн.)`}>
                              <div className="hidden group-hover:block absolute bottom-full left-0 mb-1 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                                {VACATION_TYPE_LABELS[v.type]}: {fmtDate(v.dateFrom)} — {fmtDate(v.dateTo)} ({v.days} дн.)
                                <br/>Статус: {VACATION_STATUS_LABELS[v.status]}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Vacation list */}
              {vacations.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3">Все записи ({vacations.length})</h3>
                  <div className="card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                          <th className="text-left px-4 py-2">Сотрудник</th>
                          <th className="text-left px-4 py-2">Тип</th>
                          <th className="text-left px-4 py-2">Период</th>
                          <th className="text-center px-4 py-2">Дней</th>
                          <th className="text-left px-4 py-2">Статус</th>
                          {isAdmin && <th className="px-4 py-2"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {vacations.map(v => (
                          <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-800">{v.user?.lastName} {v.user?.firstName}</td>
                            <td className="px-4 py-2 text-gray-600">{VACATION_TYPE_LABELS[v.type]}</td>
                            <td className="px-4 py-2 text-gray-600">{fmtDate(v.dateFrom)} — {fmtDate(v.dateTo)}</td>
                            <td className="px-4 py-2 text-center text-gray-800 font-medium">{v.days}</td>
                            <td className="px-4 py-2">
                              {isAdmin ? (
                                <select value={v.status} onChange={e => updateVacationStatus(v.id, e.target.value)}
                                  className={`text-xs px-2 py-1 rounded-full border-0 ${VACATION_STATUS_COLORS[v.status] || "bg-gray-100"}`}>
                                  {Object.entries(VACATION_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                                </select>
                              ) : (
                                <span className={`text-xs px-2 py-1 rounded-full ${VACATION_STATUS_COLORS[v.status]}`}>
                                  {VACATION_STATUS_LABELS[v.status]}
                                </span>
                              )}
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-2 text-right">
                                <button onClick={() => deleteVacation(v.id)} className="text-xs text-red-500 hover:text-red-600">Удалить</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : tab === "birthdays" ? (
            <>
              {birthdays.length === 0 ? (
                <div className="card p-12 text-center">
                  <Gift className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Нет данных о днях рождения. Укажите даты в профилях сотрудников.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {birthdays.map(b => {
                    const isToday = b.daysUntil === 0;
                    const isSoon = b.daysUntil <= 7 && b.daysUntil > 0;
                    return (
                      <div key={b.id} className={`card p-4 ${isToday ? "ring-2 ring-yellow-400 bg-yellow-50" : isSoon ? "bg-orange-50" : ""}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg ${
                            isToday ? "bg-yellow-400 text-white" : "bg-gray-100 text-gray-500"
                          }`}>
                            {isToday ? "🎉" : "🎂"}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{b.lastName} {b.firstName}</p>
                            <p className="text-xs text-gray-500">{ROLE_LABELS[b.role]} {b.department ? `· ${b.department}` : ""}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-800">{fmtDate(b.birthday)}</p>
                            <p className="text-xs text-gray-500">{b.age} лет</p>
                          </div>
                        </div>
                        <div className="mt-2 text-center">
                          {isToday ? (
                            <span className="text-sm font-semibold text-yellow-600">Сегодня!</span>
                          ) : (
                            <span className={`text-sm ${isSoon ? "text-orange-600 font-medium" : "text-gray-500"}`}>
                              через {b.daysUntil} дн.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* Contracts tab */
            <>
              {contracts.length === 0 ? (
                <div className="card p-12 text-center">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Договора не добавлены</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                        <th className="text-left px-4 py-2">Сотрудник</th>
                        <th className="text-left px-4 py-2">Тип</th>
                        <th className="text-left px-4 py-2">Номер</th>
                        <th className="text-left px-4 py-2">Период</th>
                        <th className="text-right px-4 py-2">Оклад</th>
                        <th className="text-left px-4 py-2">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contracts.map(c => (
                        <tr key={c.id} className={`border-t border-gray-100 hover:bg-gray-50 ${!c.isActive ? "opacity-50" : ""}`}>
                          <td className="px-4 py-2 text-gray-800 font-medium">{c.user?.lastName} {c.user?.firstName}</td>
                          <td className="px-4 py-2">
                            <span className="badge bg-gray-100 text-gray-700 text-xs">{CONTRACT_TYPE_LABELS[c.type]}</span>
                          </td>
                          <td className="px-4 py-2 text-gray-600 font-mono text-xs">{c.number}</td>
                          <td className="px-4 py-2 text-gray-600">
                            {fmtDate(c.startDate)} — {c.endDate ? fmtDate(c.endDate) : "бессрочно"}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-800">{c.salary ? `${fmtMoney(c.salary)} ₽` : "—"}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-1 rounded-full ${c.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                              {c.isActive ? "Действует" : "Закрыт"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Create user modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Новый сотрудник</h2>
                <button onClick={() => { setShowCreateModal(false); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Фамилия *" value={newUser.lastName} onChange={e => setNewUser(p => ({...p, lastName: e.target.value}))} className="input-field" />
                  <input placeholder="Имя *" value={newUser.firstName} onChange={e => setNewUser(p => ({...p, firstName: e.target.value}))} className="input-field" />
                </div>
                <input placeholder="Отчество" value={newUser.patronymic} onChange={e => setNewUser(p => ({...p, patronymic: e.target.value}))} className="input-field" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="email" placeholder="Email *" value={newUser.email} onChange={e => setNewUser(p => ({...p, email: e.target.value}))} className="input-field" />
                  <input placeholder="Телефон" value={newUser.phone} onChange={e => setNewUser(p => ({...p, phone: e.target.value}))} className="input-field" />
                </div>
                <input type="password" placeholder="Пароль *" value={newUser.password} onChange={e => setNewUser(p => ({...p, password: e.target.value}))} className="input-field" minLength={6} />
                <select value={newUser.role} onChange={e => setNewUser(p => ({...p, role: e.target.value}))} className="input-field">
                  {CREATABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowCreateModal(false); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={handleCreate} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "Создание..." : "Создать"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit user modal (with HR fields) */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Редактирование сотрудника</h2>
                <button onClick={() => { setShowEditModal(null); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase">Основное</p>
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Фамилия" value={showEditModal.lastName} onChange={e => setShowEditModal(p => p ? {...p, lastName: e.target.value} : null)} className="input-field" />
                  <input placeholder="Имя" value={showEditModal.firstName} onChange={e => setShowEditModal(p => p ? {...p, firstName: e.target.value} : null)} className="input-field" />
                </div>
                <input placeholder="Отчество" value={showEditModal.patronymic || ""} onChange={e => setShowEditModal(p => p ? {...p, patronymic: e.target.value} : null)} className="input-field" />
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Рабочий телефон" value={showEditModal.phone || ""} onChange={e => setShowEditModal(p => p ? {...p, phone: e.target.value} : null)} className="input-field" />
                  <input placeholder="Личный телефон" value={showEditModal.personalPhone || ""} onChange={e => setShowEditModal(p => p ? {...p, personalPhone: e.target.value} : null)} className="input-field" />
                </div>
                <select value={showEditModal.role} onChange={e => setShowEditModal(p => p ? {...p, role: e.target.value} : null)} className="input-field">
                  {CREATABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>

                <p className="text-xs font-semibold text-gray-400 uppercase mt-4">HR</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Отдел</label>
                    <select value={showEditModal.department || ""}
                      onChange={e => setShowEditModal(p => p ? {...p, department: e.target.value || null} : null)} className="input-field">
                      <option value="">— Не указан —</option>
                      {departmentOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Коэфф. к ставке</label>
                    <input type="number" step="0.1" min="0" max="5" placeholder="1.0"
                      value={showEditModal.salaryCoeff ?? ""}
                      onChange={e => setShowEditModal(p => p ? {...p, salaryCoeff: e.target.value || null} : null)} className="input-field" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Дата рождения</label>
                    <input type="date" value={showEditModal.birthday ? showEditModal.birthday.slice(0, 10) : ""}
                      onChange={e => setShowEditModal(p => p ? {...p, birthday: e.target.value || null} : null)} className="input-field" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Дата трудоустройства</label>
                    <input type="date" value={showEditModal.hireDate ? showEditModal.hireDate.slice(0, 10) : ""}
                      onChange={e => setShowEditModal(p => p ? {...p, hireDate: e.target.value || null} : null)} className="input-field" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Заметки</label>
                  <textarea value={showEditModal.hrNotes || ""}
                    onChange={e => setShowEditModal(p => p ? {...p, hrNotes: e.target.value} : null)}
                    className="input-field h-16 resize-none" placeholder="Заметки по сотруднику" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showEditModal.isActive} onChange={e => setShowEditModal(p => p ? {...p, isActive: e.target.checked} : null)} className="w-4 h-4" />
                  <span className="text-sm text-gray-700">Активен</span>
                </label>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowEditModal(null); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={handleUpdate} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "Сохранение..." : "Сохранить"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Vacation modal */}
        {showVacationModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Новый отпуск</h2>
                <button onClick={() => { setShowVacationModal(false); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Сотрудник *</label>
                  <select value={vacForm.userId} onChange={e => setVacForm(f => ({...f, userId: e.target.value}))} className="input-field">
                    <option value="">Выберите</option>
                    {users.filter(u => u.isActive).map(u => <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Тип</label>
                  <select value={vacForm.type} onChange={e => setVacForm(f => ({...f, type: e.target.value}))} className="input-field">
                    {Object.entries(VACATION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">С *</label>
                    <input type="date" value={vacForm.dateFrom} onChange={e => setVacForm(f => ({...f, dateFrom: e.target.value}))} className="input-field" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">По *</label>
                    <input type="date" value={vacForm.dateTo} onChange={e => setVacForm(f => ({...f, dateTo: e.target.value}))} className="input-field" />
                  </div>
                </div>
                <textarea placeholder="Примечание" value={vacForm.notes} onChange={e => setVacForm(f => ({...f, notes: e.target.value}))} className="input-field h-16 resize-none" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowVacationModal(false); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={createVacation} disabled={saving || !vacForm.userId || !vacForm.dateFrom || !vacForm.dateTo}
                  className="btn-primary disabled:opacity-50">{saving ? "Создание..." : "Создать"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Contract modal */}
        {showContractModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Новый договор</h2>
                <button onClick={() => { setShowContractModal(false); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Сотрудник *</label>
                  <select value={conForm.userId} onChange={e => setConForm(f => ({...f, userId: e.target.value}))} className="input-field">
                    <option value="">Выберите</option>
                    {users.filter(u => u.isActive).map(u => <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Тип</label>
                    <select value={conForm.type} onChange={e => setConForm(f => ({...f, type: e.target.value}))} className="input-field">
                      {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Номер *</label>
                    <input placeholder="ТД-001" value={conForm.number} onChange={e => setConForm(f => ({...f, number: e.target.value}))} className="input-field" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Дата начала *</label>
                    <input type="date" value={conForm.startDate} onChange={e => setConForm(f => ({...f, startDate: e.target.value}))} className="input-field" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Дата окончания</label>
                    <input type="date" value={conForm.endDate} onChange={e => setConForm(f => ({...f, endDate: e.target.value}))} className="input-field" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Оклад, ₽</label>
                  <input type="number" min={0} placeholder="50000" value={conForm.salary} onChange={e => setConForm(f => ({...f, salary: e.target.value}))} className="input-field" />
                </div>
                <textarea placeholder="Примечание" value={conForm.notes} onChange={e => setConForm(f => ({...f, notes: e.target.value}))} className="input-field h-16 resize-none" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowContractModal(false); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={createContract} disabled={saving || !conForm.userId || !conForm.number || !conForm.startDate}
                  className="btn-primary disabled:opacity-50">{saving ? "Создание..." : "Создать"}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
