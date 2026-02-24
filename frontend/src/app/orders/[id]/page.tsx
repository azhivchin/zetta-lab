"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authApi, getToken } from "@/lib/api";
import {
  ArrowLeft, User, Building2, Calendar, MessageSquare, Send,
  CheckCircle2, Camera, Upload, X, Image, Edit3, Save, Play,
  SkipForward, UserPlus, Palette, Zap, CreditCard, ChevronDown, Printer,
} from "lucide-react";

interface OrderPhoto {
  id: string;
  url: string;
  filename: string;
  caption: string | null;
  stage: string | null;
  createdAt: string;
}

interface Stage {
  id: string;
  name: string;
  status: string;
  sortOrder: number;
  assignee: { id: string; firstName: string; lastName: string } | null;
  assignedTo?: { firstName: string; lastName: string } | null;
  startedAt: string | null;
  completedAt: string | null;
  dueDate: string | null;
  notes: string | null;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  client: { id: string; name: string; shortName: string | null; phone: string | null };
  doctor: { firstName: string; lastName: string; middleName?: string | null; patronymic?: string | null } | null;
  patient: { firstName: string; lastName: string; middleName?: string | null; patronymic?: string | null } | null;
  items: { id: string; workItem: { name: string; code: string }; quantity: number; price: number | string; total: number | string; unitPrice?: number; totalPrice?: number }[];
  stages: Stage[];
  comments: { id: string; text: string; user: { firstName: string; lastName: string }; createdAt: string }[];
  totalPrice: number | string;
  dueDate: string | null;
  toothFormula: string | null;
  color: string | null;
  implantSystem: string | null;
  hasStl: boolean;
  notes: string | null;
  isUrgent: boolean;
  isPaid: boolean;
  frameworkDate: string | null;
  settingDate: string | null;
  fittingSentAt: string | null;
  fittingBackAt: string | null;
  deliveredAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

const ALL_STATUSES = ["NEW", "IN_PROGRESS", "ON_FITTING", "REWORK", "ASSEMBLY", "READY", "DELIVERED", "CANCELLED"];
const STATUS_LABELS: Record<string, string> = {
  NEW: "Новый", IN_PROGRESS: "В работе", ON_FITTING: "Примерка", REWORK: "Доработка",
  ASSEMBLY: "Сборка", READY: "Готов", DELIVERED: "Сдан", CANCELLED: "Отменён",
};
const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800", IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  ON_FITTING: "bg-purple-100 text-purple-800", REWORK: "bg-red-100 text-red-800",
  ASSEMBLY: "bg-orange-100 text-orange-800", READY: "bg-green-100 text-green-800",
  DELIVERED: "bg-gray-100 text-gray-800", CANCELLED: "bg-gray-200 text-gray-500",
};
const STAGE_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED"];
const STAGE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Ожидание", IN_PROGRESS: "В работе", COMPLETED: "Завершён", SKIPPED: "Пропущен",
};
const STAGE_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600", IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700", SKIPPED: "bg-gray-100 text-gray-400",
};
const ROLE_LABELS: Record<string, string> = {
  OWNER: "Владелец", ADMIN: "Админ", SENIOR_TECH: "Ст. техник", TECHNICIAN: "Техник",
  CAD_SPECIALIST: "CAD", GYPSUM_WORKER: "Гипсовщик", CERAMIST: "Керамист", COURIER: "Курьер",
};

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [photos, setPhotos] = useState<OrderPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Editing states
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [assignModal, setAssignModal] = useState<{ stageId: string; stageName: string } | null>(null);
  const [statusDropdown, setStatusDropdown] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await authApi(`/orders/${orderId}`);
      if (res.ok) {
        const data = await res.json();
        setOrder(data.data);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [orderId]);

  const fetchPhotos = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await authApi(`/photos/order/${orderId}`);
      if (res.ok) {
        const data = await res.json();
        setPhotos(data.data || []);
      }
    } catch (e) { console.error(e); }
  }, [orderId]);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await authApi("/users");
      if (res.ok) {
        const data = await res.json();
        setTeam(data.data || []);
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchOrder(); fetchPhotos(); fetchTeam(); }, [fetchOrder, fetchPhotos, fetchTeam]);

  // Start editing
  const startEdit = () => {
    if (!order) return;
    setEditData({
      color: order.color || "",
      toothFormula: order.toothFormula || "",
      implantSystem: order.implantSystem || "",
      notes: order.notes || "",
      dueDate: order.dueDate ? order.dueDate.split("T")[0] : "",
      frameworkDate: order.frameworkDate ? order.frameworkDate.split("T")[0] : "",
      settingDate: order.settingDate ? order.settingDate.split("T")[0] : "",
      fittingSentAt: order.fittingSentAt ? order.fittingSentAt.split("T")[0] : "",
      fittingBackAt: order.fittingBackAt ? order.fittingBackAt.split("T")[0] : "",
      isUrgent: order.isUrgent,
      isPaid: order.isPaid,
      hasStl: order.hasStl,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (editData.color !== (order?.color || "")) body.color = editData.color;
      if (editData.toothFormula !== (order?.toothFormula || "")) body.toothFormula = editData.toothFormula;
      if (editData.implantSystem !== (order?.implantSystem || "")) body.implantSystem = editData.implantSystem;
      if (editData.notes !== (order?.notes || "")) body.notes = editData.notes;
      if (editData.isUrgent !== order?.isUrgent) body.isUrgent = editData.isUrgent;
      if (editData.isPaid !== order?.isPaid) body.isPaid = editData.isPaid;
      if (editData.hasStl !== order?.hasStl) body.hasStl = editData.hasStl;
      const dateFields = ["dueDate", "frameworkDate", "settingDate", "fittingSentAt", "fittingBackAt"] as const;
      for (const f of dateFields) {
        const origVal = order?.[f] ? (order[f] as string).split("T")[0] : "";
        if (editData[f] !== origVal && editData[f]) body[f] = editData[f];
      }

      if (Object.keys(body).length > 0) {
        const res = await authApi(`/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          fetchOrder();
        }
      }
      setEditing(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  // Change order status
  const changeStatus = async (newStatus: string) => {
    setStatusDropdown(false);
    try {
      const res = await authApi(`/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        // Auto write-off materials when order is delivered
        if (newStatus === "DELIVERED") {
          if (confirm("Списать материалы по нормам для этого заказа?")) {
            try {
              const woRes = await authApi(`/warehouse/write-off-order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId }),
              });
              if (woRes.ok) {
                const woData = await woRes.json();
                alert(`Списано материалов: ${woData.data?.count || 0}`);
              } else {
                const err = await woRes.json();
                alert(`Ошибка списания: ${err.error?.message || "Неизвестная ошибка"}`);
              }
            } catch (e) {
              console.error("Write-off error:", e);
            }
          }
        }
        fetchOrder();
      }
    } catch (e) { console.error(e); }
  };

  // Change stage status
  const changeStageStatus = async (stageId: string, status: string) => {
    try {
      const res = await authApi(`/orders/${orderId}/stages/${stageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) fetchOrder();
    } catch (e) { console.error(e); }
  };

  // Assign technician to stage
  const assignTechnician = async (stageId: string, userId: string) => {
    try {
      const res = await authApi(`/orders/${orderId}/stages/${stageId}/assign`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: userId }),
      });
      if (res.ok) fetchOrder();
    } catch (e) { console.error(e); }
    setAssignModal(null);
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setSendingComment(true);
    try {
      const res = await authApi(`/orders/${orderId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: comment }),
      });
      if (res.ok) { setComment(""); fetchOrder(); }
    } catch (e) { console.error(e); }
    setSendingComment(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) formData.append("photos", files[i]);
      const res = await authApi(`/photos/upload/${orderId}`, { method: "POST", body: formData });
      if (res.ok) fetchPhotos();
    } catch (e) { console.error(e); }
    setUploading(false);
    e.target.value = "";
  };

  const deletePhoto = async (photoId: string) => {
    try {
      const res = await authApi(`/photos/${photoId}`, { method: "DELETE" });
      if (res.ok) fetchPhotos();
    } catch (e) { console.error(e); }
  };

  const photoUrl = (url: string) => {
    if (url.startsWith("http")) return url;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/zetta${url}`;
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  };
  const formatDateTime = (d: string) => new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const fmt = (n: number | string) => Number(n).toLocaleString("ru-RU");

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center"><p className="text-gray-400">Загрузка...</p></main>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center flex-col gap-3">
          <p className="text-gray-500">Наряд не найден</p>
          <button onClick={() => router.push("/orders")} className="btn-primary">К списку</button>
        </main>
      </div>
    );
  }

  const stageAssignee = (s: Stage) => s.assignee || s.assignedTo;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <button onClick={() => router.push("/orders")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
            <ArrowLeft className="w-4 h-4" /> Назад к списку
          </button>

          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Наряд {order.orderNumber}</h1>
                {/* Status dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setStatusDropdown(!statusDropdown)}
                    className={`badge text-sm cursor-pointer hover:opacity-80 flex items-center gap-1 ${STATUS_COLORS[order.status] || "bg-gray-100"}`}
                  >
                    {STATUS_LABELS[order.status] || order.status}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {statusDropdown && (
                    <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border z-20 py-1 min-w-40">
                      {ALL_STATUSES.filter(s => s !== order.status).map(s => (
                        <button key={s} onClick={() => changeStatus(s)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[s]?.split(" ")[0] || "bg-gray-200"}`} />
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {order.isUrgent && <span className="badge bg-red-100 text-red-700 text-xs flex items-center gap-1"><Zap className="w-3 h-3" />Срочный</span>}
                {order.isPaid && <span className="badge bg-green-100 text-green-700 text-xs flex items-center gap-1"><CreditCard className="w-3 h-3" />Оплачен</span>}
              </div>
              <p className="text-sm text-gray-500 mt-1">Создан {formatDate(order.createdAt)}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{fmt(order.totalPrice)} ₽</p>
                {order.dueDate && <p className="text-sm text-gray-500 flex items-center gap-1 justify-end"><Calendar className="w-3.5 h-3.5" />Срок: {formatDate(order.dueDate)}</p>}
              </div>
              {!editing ? (
                <div className="flex gap-2">
                  <button onClick={async () => {
                    try {
                      const res = await authApi(`/orders/${orderId}/print-pdf`);
                      if (res.ok) {
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `order-${order.orderNumber}.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }
                    } catch (e) { console.error(e); }
                  }} className="btn-secondary flex items-center gap-1 text-sm">
                    <Printer className="w-4 h-4" /> Печать
                  </button>
                  <button onClick={startEdit} className="btn-secondary flex items-center gap-1 text-sm">
                    <Edit3 className="w-4 h-4" /> Ред.
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className="btn-secondary text-sm">Отмена</button>
                  <button onClick={saveEdit} disabled={saving} className="btn-primary flex items-center gap-1 text-sm">
                    <Save className="w-4 h-4" /> {saving ? "..." : "Сохранить"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2 space-y-6">
              {/* Info cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="card p-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Building2 className="w-4 h-4" />Заказчик</div>
                  <p className="font-medium">{order.client?.shortName || order.client?.name}</p>
                  {order.client?.phone && <p className="text-xs text-gray-400">{order.client.phone}</p>}
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><User className="w-4 h-4" />Врач</div>
                  <p className="font-medium">{order.doctor ? `${order.doctor.lastName} ${order.doctor.firstName} ${order.doctor.patronymic || order.doctor.middleName || ""}`.trim() : "—"}</p>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><User className="w-4 h-4" />Пациент</div>
                  <p className="font-medium">{order.patient ? `${order.patient.lastName} ${order.patient.firstName}` : "—"}</p>
                </div>
              </div>

              {/* Editable details */}
              <div className="card p-4">
                <h2 className="font-medium mb-3">Детали</h2>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <label className="text-gray-500 text-xs">Цвет</label>
                    {editing ? (
                      <input value={editData.color as string} onChange={e => setEditData(p => ({ ...p, color: e.target.value }))} className="input-field mt-1 text-sm" placeholder="A2, A3..." />
                    ) : (
                      <p className="font-medium">{order.color || "—"}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs">Зубная формула</label>
                    {editing ? (
                      <input value={editData.toothFormula as string} onChange={e => setEditData(p => ({ ...p, toothFormula: e.target.value }))} className="input-field mt-1 text-sm" />
                    ) : (
                      <p className="font-medium">{order.toothFormula || "—"}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs">Система имплантов</label>
                    {editing ? (
                      <input value={editData.implantSystem as string} onChange={e => setEditData(p => ({ ...p, implantSystem: e.target.value }))} className="input-field mt-1 text-sm" />
                    ) : (
                      <p className="font-medium">{order.implantSystem || "—"}</p>
                    )}
                  </div>
                </div>

                {/* Dates row */}
                <div className="grid grid-cols-5 gap-3 mt-4 text-sm">
                  {([
                    ["dueDate", "Срок сдачи"],
                    ["frameworkDate", "Каркас"],
                    ["settingDate", "Постановка"],
                    ["fittingSentAt", "Примерка отпр."],
                    ["fittingBackAt", "Примерка верн."],
                  ] as const).map(([field, label]) => (
                    <div key={field}>
                      <label className="text-gray-500 text-xs">{label}</label>
                      {editing ? (
                        <input type="date" value={editData[field] as string || ""} onChange={e => setEditData(p => ({ ...p, [field]: e.target.value }))} className="input-field mt-1 text-xs" />
                      ) : (
                        <p className="text-xs font-medium">{formatDate(order[field])}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Toggles row */}
                {editing && (
                  <div className="flex gap-6 mt-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editData.isUrgent as boolean} onChange={e => setEditData(p => ({ ...p, isUrgent: e.target.checked }))} className="rounded" />
                      <Zap className="w-4 h-4 text-red-500" /> Срочный
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editData.isPaid as boolean} onChange={e => setEditData(p => ({ ...p, isPaid: e.target.checked }))} className="rounded" />
                      <CreditCard className="w-4 h-4 text-green-500" /> Оплачен
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editData.hasStl as boolean} onChange={e => setEditData(p => ({ ...p, hasStl: e.target.checked }))} className="rounded" />
                      STL
                    </label>
                  </div>
                )}

                {/* Notes */}
                <div className="mt-4">
                  <label className="text-gray-500 text-xs">Примечания</label>
                  {editing ? (
                    <textarea value={editData.notes as string} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} className="input-field mt-1 text-sm" rows={2} />
                  ) : (
                    <p className="text-sm text-gray-600 mt-1">{order.notes || "—"}</p>
                  )}
                </div>
              </div>

              {/* Work items */}
              <div className="card overflow-hidden">
                <div className="p-4 border-b border-gray-100"><h2 className="font-medium">Работы</h2></div>
                <table className="w-full">
                  <thead><tr className="bg-gray-50 text-xs text-gray-500"><th className="text-left p-3">Код</th><th className="text-left p-3">Наименование</th><th className="text-center p-3">Кол-во</th><th className="text-right p-3">Цена</th><th className="text-right p-3">Сумма</th></tr></thead>
                  <tbody>
                    {order.items?.map((item) => (
                      <tr key={item.id} className="border-t border-gray-50">
                        <td className="p-3 text-sm font-mono text-zetta-600">{item.workItem?.code}</td>
                        <td className="p-3 text-sm">{item.workItem?.name}</td>
                        <td className="p-3 text-sm text-center">{item.quantity}</td>
                        <td className="p-3 text-sm text-right">{fmt(item.price || item.unitPrice || 0)} ₽</td>
                        <td className="p-3 text-sm text-right font-medium">{fmt(item.total || item.totalPrice || 0)} ₽</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Stages with management */}
              <div className="card overflow-hidden">
                <div className="p-4 border-b border-gray-100"><h2 className="font-medium">Этапы производства</h2></div>
                <div className="p-4 space-y-2">
                  {order.stages?.sort((a, b) => a.sortOrder - b.sortOrder).map((stage) => (
                    <div key={stage.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                      {/* Status indicator */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        stage.status === "COMPLETED" ? "bg-green-100" :
                        stage.status === "IN_PROGRESS" ? "bg-yellow-100" :
                        stage.status === "SKIPPED" ? "bg-gray-200" : "bg-gray-100"
                      }`}>
                        {stage.status === "COMPLETED" ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : stage.status === "IN_PROGRESS" ? (
                          <Play className="w-4 h-4 text-yellow-600" />
                        ) : stage.status === "SKIPPED" ? (
                          <SkipForward className="w-3.5 h-3.5 text-gray-400" />
                        ) : (
                          <span className="text-xs font-medium text-gray-400">{stage.sortOrder}</span>
                        )}
                      </div>

                      {/* Stage info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{stage.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${STAGE_STATUS_COLORS[stage.status] || ""}`}>
                            {STAGE_STATUS_LABELS[stage.status] || stage.status}
                          </span>
                          {stageAssignee(stage) && (
                            <span className="text-xs text-gray-500">
                              {stageAssignee(stage)!.firstName} {stageAssignee(stage)!.lastName}
                            </span>
                          )}
                          {stage.completedAt && <span className="text-xs text-gray-400">{formatDateTime(stage.completedAt)}</span>}
                          {!stage.completedAt && stage.startedAt && <span className="text-xs text-gray-400">с {formatDateTime(stage.startedAt)}</span>}
                        </div>
                      </div>

                      {/* Stage actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Assign button */}
                        <button
                          onClick={() => setAssignModal({ stageId: stage.id, stageName: stage.name })}
                          className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                          title="Назначить техника"
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>

                        {/* Status change buttons */}
                        {stage.status === "PENDING" && (
                          <button onClick={() => changeStageStatus(stage.id, "IN_PROGRESS")} className="text-xs btn-primary py-1 px-2" title="Начать">
                            <Play className="w-3 h-3" />
                          </button>
                        )}
                        {stage.status === "IN_PROGRESS" && (
                          <button onClick={() => changeStageStatus(stage.id, "COMPLETED")} className="text-xs bg-green-500 hover:bg-green-600 text-white py-1 px-2 rounded-lg" title="Завершить">
                            <CheckCircle2 className="w-3 h-3" />
                          </button>
                        )}
                        {(stage.status === "PENDING" || stage.status === "IN_PROGRESS") && (
                          <button onClick={() => changeStageStatus(stage.id, "SKIPPED")} className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600" title="Пропустить">
                            <SkipForward className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Photos */}
              <div className="card overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-gray-400" />
                    <h2 className="font-medium">Фото</h2>
                    <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded-full">{photos.length}</span>
                  </div>
                  <label className={`btn-secondary text-xs flex items-center gap-1 cursor-pointer ${uploading ? "opacity-50" : ""}`}>
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? "Загрузка..." : "Загрузить"}
                    <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploading} />
                  </label>
                </div>
                <div className="p-4">
                  {photos.length === 0 ? (
                    <div className="text-center py-6">
                      <Image className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Нет фото</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {photos.map(photo => (
                        <div key={photo.id} className="relative group">
                          <img
                            src={photoUrl(photo.url)}
                            alt={photo.caption || photo.filename}
                            className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-80"
                            onClick={() => setLightboxPhoto(photoUrl(photo.url))}
                          />
                          <button
                            onClick={() => deletePhoto(photo.id)}
                            className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right sidebar - comments */}
            <div className="space-y-4">
              <div className="card flex flex-col" style={{ height: "calc(100vh - 200px)" }}>
                <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-gray-400" />
                  <h2 className="font-medium">Комментарии</h2>
                  <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded-full">{order.comments?.length || 0}</span>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-3">
                  {order.comments?.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-8">Нет комментариев</p>
                  )}
                  {order.comments?.map((c) => (
                    <div key={c.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700">{c.user.firstName} {c.user.lastName}</span>
                        <span className="text-xs text-gray-400">{formatDateTime(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-600">{c.text}</p>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t border-gray-100">
                  <div className="flex gap-2">
                    <input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addComment()}
                      placeholder="Комментарий..."
                      className="input-field flex-1 text-sm"
                    />
                    <button onClick={addComment} disabled={sendingComment || !comment.trim()} className="btn-primary p-2">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Photo Lightbox */}
        {lightboxPhoto && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setLightboxPhoto(null)}>
            <button onClick={() => setLightboxPhoto(null)} className="absolute top-4 right-4 text-white hover:text-gray-300"><X className="w-8 h-8" /></button>
            <img src={lightboxPhoto} alt="Photo" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
          </div>
        )}

        {/* Assign Technician Modal */}
        {assignModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Назначить на: {assignModal.stageName}</h2>
                <button onClick={() => setAssignModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="space-y-2 max-h-80 overflow-auto">
                {team.filter(t => ["SENIOR_TECH", "TECHNICIAN", "CAD_SPECIALIST", "GYPSUM_WORKER", "CERAMIST"].includes(t.role)).map(member => (
                  <button
                    key={member.id}
                    onClick={() => assignTechnician(assignModal.stageId, member.id)}
                    className="w-full text-left p-3 rounded-lg hover:bg-gray-50 flex items-center gap-3 border"
                  >
                    <div className="w-8 h-8 rounded-full bg-zetta-100 flex items-center justify-center text-sm font-medium text-zetta-600">
                      {member.firstName[0]}{member.lastName[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{member.lastName} {member.firstName}</p>
                      <p className="text-xs text-gray-500">{ROLE_LABELS[member.role] || member.role}</p>
                    </div>
                  </button>
                ))}
                {team.filter(t => ["SENIOR_TECH", "TECHNICIAN", "CAD_SPECIALIST", "GYPSUM_WORKER", "CERAMIST"].includes(t.role)).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">Нет доступных техников</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
