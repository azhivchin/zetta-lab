"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { PageHeader } from "@/components/ui";
import { authApi, getToken } from "@/lib/api";
import { Plus, Package, AlertTriangle, Search, X, ArrowDown, Trash2, Save, BookOpen, Truck, Pencil, FileSpreadsheet, FileText } from "lucide-react";
import { useReferences } from "@/lib/useReferences";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";

interface Material {
  id: string;
  name: string;
  unit: string;
  currentStock: string | number;
  minStock: string | number;
  avgPrice: string | number;
  category: string | null;
  isActive: boolean;
}

interface Movement {
  id: string;
  type: string;
  quantity: string | number;
  price: string | number | null;
  notes: string | null;
  createdAt: string;
  material: { name: string; unit: string };
}

interface MaterialNorm {
  id: string;
  workItemId: string;
  materialId: string;
  quantity: string | number;
  workItem: { id: string; name: string; code: string };
  material: { id: string; name: string; unit: string };
}

interface WorkItem {
  id: string;
  name: string;
  code: string;
  basePrice: number;
}

const TYPE_LABELS: Record<string, string> = {
  IN: "Приход", OUT: "Расход", WRITE_OFF: "Списание", INVENTORY: "Инвентаризация",
};
const TYPE_COLORS: Record<string, string> = {
  IN: "text-green-600", OUT: "text-red-600", WRITE_OFF: "text-orange-600", INVENTORY: "text-blue-600",
};

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  _count: { movements: number };
}

type TabType = "materials" | "movements" | "norms" | "suppliers";

export default function WarehousePage() {
  const router = useRouter();
  const { asOptions: unitOptions } = useReferences("material_unit");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [norms, setNorms] = useState<MaterialNorm[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showLowStock, setShowLowStock] = useState(false);
  const [tab, setTab] = useState<TabType>("materials");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [newMaterial, setNewMaterial] = useState({ name: "", unit: "шт", minStock: "0", avgPrice: "0", category: "" });
  const [newMovement, setNewMovement] = useState({ materialId: "", type: "IN", quantity: "", price: "", notes: "" });

  const [editMaterial, setEditMaterial] = useState<Material | null>(null);
  const [editForm, setEditForm] = useState({ name: "", unit: "шт", minStock: "0", avgPrice: "0", category: "" });

  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", contactPerson: "", phone: "", email: "", notes: "" });

  // Norms form
  const [normWorkItem, setNormWorkItem] = useState("");
  const [normMaterial, setNormMaterial] = useState("");
  const [normQuantity, setNormQuantity] = useState("");

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (showLowStock) params.set("lowStock", "true");
      const res = await authApi(`/warehouse/materials?${params}`);
      if (res.ok) {
        const d = await res.json();
        setMaterials(d.data?.materials || []);
        setCategories(d.data?.categories || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [search, showLowStock]);

  const fetchMovements = useCallback(async () => {
    try {
      const res = await authApi("/warehouse/movements?limit=50");
      if (res.ok) {
        const d = await res.json();
        setMovements(d.data?.movements || []);
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchNorms = async () => {
    try {
      const res = await authApi("/warehouse/norms");
      if (res.ok) {
        const d = await res.json();
        setNorms(d.data || []);
      }
    } catch (e) { console.error(e); }
  };

  const fetchWorkItems = async () => {
    if (workItems.length > 0) return;
    try {
      const res = await authApi("/work-catalog/items?limit=500");
      if (res.ok) {
        const d = await res.json();
        setWorkItems(d.data?.items || d.data || []);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchMaterials();
    fetchMovements();
  }, [fetchMaterials, fetchMovements]);

  const fetchSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const res = await authApi("/suppliers");
      if (res.ok) {
        const d = await res.json();
        setSuppliers(d.data || []);
      }
    } catch (e) { console.error(e); }
    setSuppliersLoading(false);
  }, []);

  const handleCreateSupplier = async () => {
    if (!newSupplier.name.trim()) { setError("Укажите название"); return; }
    setSaving(true); setError("");
    try {
      const res = await authApi("/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSupplier.name,
          contactPerson: newSupplier.contactPerson || undefined,
          phone: newSupplier.phone || undefined,
          email: newSupplier.email || undefined,
          notes: newSupplier.notes || undefined,
        }),
      });
      if (res.ok) {
        setShowSupplierModal(false);
        setNewSupplier({ name: "", contactPerson: "", phone: "", email: "", notes: "" });
        fetchSuppliers();
      } else {
        const d = await res.json();
        setError(d.error?.message || "Ошибка");
      }
    } catch { setError("Ошибка"); }
    setSaving(false);
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!confirm("Деактивировать поставщика?")) return;
    try {
      await authApi(`/suppliers/${id}`, { method: "DELETE" });
      fetchSuppliers();
    } catch (e) { console.error(e); }
  };

  const switchTab = (t: TabType) => {
    setTab(t);
    if (t === "norms") { fetchNorms(); fetchWorkItems(); }
    if (t === "suppliers") { fetchSuppliers(); }
  };

  const isLow = (m: Material) => Number(m.currentStock) < Number(m.minStock);

  const handleCreate = async () => {
    if (!newMaterial.name.trim()) { setError("Укажите название"); return; }
    setSaving(true); setError("");
    try {
      const res = await authApi("/warehouse/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newMaterial.name,
          unit: newMaterial.unit,
          minStock: parseFloat(newMaterial.minStock) || 0,
          avgPrice: parseFloat(newMaterial.avgPrice) || 0,
          category: newMaterial.category || undefined,
        }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewMaterial({ name: "", unit: "шт", minStock: "0", avgPrice: "0", category: "" });
        fetchMaterials();
      } else {
        const d = await res.json();
        setError(d.error?.message || "Ошибка");
      }
    } catch { setError("Ошибка"); }
    setSaving(false);
  };

  const handleMovement = async () => {
    if (!newMovement.materialId || !newMovement.quantity) { setError("Заполните поля"); return; }
    setSaving(true); setError("");
    try {
      const res = await authApi("/warehouse/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: newMovement.materialId,
          type: newMovement.type,
          quantity: parseFloat(newMovement.quantity),
          price: newMovement.price ? parseFloat(newMovement.price) : undefined,
          notes: newMovement.notes || undefined,
        }),
      });
      if (res.ok) {
        setShowMovementModal(false);
        setNewMovement({ materialId: "", type: "IN", quantity: "", price: "", notes: "" });
        fetchMaterials();
        fetchMovements();
      } else {
        const d = await res.json();
        setError(d.error?.message || "Ошибка");
      }
    } catch { setError("Ошибка"); }
    setSaving(false);
  };

  const handleEditMaterial = async () => {
    if (!editMaterial || !editForm.name.trim()) return;
    setSaving(true); setError("");
    try {
      const res = await authApi(`/warehouse/materials/${editMaterial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          unit: editForm.unit,
          minStock: parseFloat(editForm.minStock) || 0,
          avgPrice: parseFloat(editForm.avgPrice) || 0,
          category: editForm.category || undefined,
        }),
      });
      if (res.ok) {
        setEditMaterial(null);
        fetchMaterials();
      } else {
        const d = await res.json();
        setError(d.error?.message || "Ошибка");
      }
    } catch { setError("Ошибка"); }
    setSaving(false);
  };

  const openEditMaterial = (m: Material) => {
    setEditForm({
      name: m.name,
      unit: m.unit,
      minStock: String(m.minStock),
      avgPrice: String(m.avgPrice),
      category: m.category || "",
    });
    setEditMaterial(m);
  };

  const handleExportMaterials = (format: "excel" | "pdf") => {
    const headers = ["Название", "Категория", "Остаток", "Ед.", "Минимум", "Цена", "Статус"];
    const rows = materials.map(m => [
      m.name, m.category || "—", fmt(m.currentStock), m.unit, fmt(m.minStock), fmt(m.avgPrice), isLow(m) ? "Нехватка" : "Норма",
    ]);
    if (format === "excel") exportToExcel("Склад - Материалы", headers, rows);
    else exportToPDF("Склад - Материалы", headers, rows);
  };

  const handleAddNorm = async () => {
    if (!normWorkItem || !normMaterial || !normQuantity) return;
    try {
      const res = await authApi("/warehouse/norms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workItemId: normWorkItem,
          materialId: normMaterial,
          quantity: parseFloat(normQuantity),
        }),
      });
      if (res.ok) {
        setNormWorkItem("");
        setNormMaterial("");
        setNormQuantity("");
        fetchNorms();
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteNorm = async (id: string) => {
    try {
      await authApi(`/warehouse/norms/${id}`, { method: "DELETE" });
      fetchNorms();
    } catch (e) { console.error(e); }
  };

  const lowCount = materials.filter(isLow).length;
  const fmt = (n: number | string) => Number(n).toLocaleString("ru-RU");

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader
            title="Склад"
            subtitle={lowCount > 0 ? `${lowCount} материалов ниже минимума` : undefined}
          >
            <div className="flex gap-2">
              <button onClick={() => handleExportMaterials("excel")} className="btn-secondary flex items-center gap-1.5 text-sm" title="Excel">
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </button>
              <button onClick={() => handleExportMaterials("pdf")} className="btn-secondary flex items-center gap-1.5 text-sm" title="PDF">
                <FileText className="w-4 h-4" /> PDF
              </button>
              <button onClick={() => setShowMovementModal(true)} className="btn-secondary flex items-center gap-2 text-sm">
                <ArrowDown className="w-4 h-4" /> Приход/расход
              </button>
              <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> Материал
              </button>
            </div>
          </PageHeader>

          {/* Tabs */}
          <div className="flex gap-4 mb-4 border-b border-gray-200">
            {([
              { key: "materials" as TabType, label: "Материалы" },
              { key: "movements" as TabType, label: "Движения" },
              { key: "norms" as TabType, label: "Нормы расхода" },
              { key: "suppliers" as TabType, label: "Поставщики" },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-zetta-500 text-zetta-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Materials tab */}
          {tab === "materials" && (
            <>
              <div className="flex gap-3 mb-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск материала..." className="input-field pl-10" />
                </div>
                <button
                  onClick={() => setShowLowStock(!showLowStock)}
                  className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors ${showLowStock ? "bg-red-100 text-red-700" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Нехватка
                </button>
              </div>

              {loading ? (
                <div className="text-center py-12 text-gray-400">Загрузка...</div>
              ) : materials.length === 0 ? (
                <div className="card p-12 text-center">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Материалов нет</p>
                  <button onClick={() => setShowCreateModal(true)} className="btn-primary mt-4">Добавить</button>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Название</th>
                        <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Категория</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Остаток</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Минимум</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Цена</th>
                        <th className="text-center p-3 text-xs font-medium text-gray-500 uppercase">Статус</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map(m => (
                        <tr key={m.id} className={`border-b border-gray-100 ${isLow(m) ? "bg-red-50" : ""}`}>
                          <td className="p-3 text-sm font-medium">{m.name}</td>
                          <td className="p-3 text-sm text-gray-500">{m.category || "—"}</td>
                          <td className="p-3 text-sm text-right font-medium">{fmt(m.currentStock)} {m.unit}</td>
                          <td className="p-3 text-sm text-right text-gray-500">{fmt(m.minStock)} {m.unit}</td>
                          <td className="p-3 text-sm text-right">{fmt(m.avgPrice)} ₽</td>
                          <td className="p-3 text-center">
                            {isLow(m) ? (
                              <span className="badge bg-red-100 text-red-700 text-xs">Нехватка</span>
                            ) : (
                              <span className="badge bg-green-100 text-green-700 text-xs">Норма</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button onClick={(e) => { e.stopPropagation(); openEditMaterial(m); }} className="text-gray-400 hover:text-zetta-600">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Movements tab */}
          {tab === "movements" && (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Дата</th>
                    <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Тип</th>
                    <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Материал</th>
                    <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Кол-во</th>
                    <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Цена</th>
                    <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Примечание</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-gray-400">Нет движений</td></tr>
                  ) : movements.map(mv => (
                    <tr key={mv.id} className="border-b border-gray-100">
                      <td className="p-3 text-sm text-gray-500">{new Date(mv.createdAt).toLocaleDateString("ru-RU")}</td>
                      <td className={`p-3 text-sm font-medium ${TYPE_COLORS[mv.type] || ""}`}>{TYPE_LABELS[mv.type] || mv.type}</td>
                      <td className="p-3 text-sm">{mv.material.name}</td>
                      <td className="p-3 text-sm text-right font-medium">{fmt(mv.quantity)} {mv.material.unit}</td>
                      <td className="p-3 text-sm text-right">{mv.price ? `${fmt(mv.price)} ₽` : "—"}</td>
                      <td className="p-3 text-sm text-gray-500">{mv.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Suppliers tab */}
          {tab === "suppliers" && (
            <>
              <div className="flex justify-end mb-4">
                <button onClick={() => setShowSupplierModal(true)} className="btn-primary flex items-center gap-2 text-sm">
                  <Plus className="w-4 h-4" /> Поставщик
                </button>
              </div>
              {suppliersLoading ? (
                <div className="text-center py-12 text-gray-400">Загрузка...</div>
              ) : suppliers.length === 0 ? (
                <div className="card p-12 text-center">
                  <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Поставщиков нет</p>
                  <button onClick={() => setShowSupplierModal(true)} className="btn-primary mt-4">Добавить</button>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Название</th>
                        <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Контакт</th>
                        <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Телефон</th>
                        <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                        <th className="text-center p-3 text-xs font-medium text-gray-500 uppercase">Поставок</th>
                        <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Примечание</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.map(s => (
                        <tr key={s.id} className={`border-b border-gray-100 ${!s.isActive ? "opacity-50" : ""}`}>
                          <td className="p-3 text-sm font-medium">{s.name}</td>
                          <td className="p-3 text-sm text-gray-500">{s.contactPerson || "—"}</td>
                          <td className="p-3 text-sm text-gray-500">{s.phone || "—"}</td>
                          <td className="p-3 text-sm text-gray-500">{s.email || "—"}</td>
                          <td className="p-3 text-sm text-center">{s._count?.movements || 0}</td>
                          <td className="p-3 text-sm text-gray-400 max-w-[150px] truncate">{s.notes || "—"}</td>
                          <td className="p-3 text-right">
                            <button onClick={() => handleDeleteSupplier(s.id)} className="text-gray-400 hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Norms tab */}
          {tab === "norms" && (
            <div>
              <div className="card p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-gray-500" />
                  <h3 className="text-sm font-medium text-gray-700">
                    Нормы расхода материалов на единицу работы
                  </h3>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  При завершении наряда материалы автоматически списываются со склада по указанным нормам.
                </p>

                {/* Add norm form */}
                <div className="flex items-end gap-2 bg-gray-50 p-3 rounded-lg">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Работа</label>
                    <select value={normWorkItem} onChange={(e) => setNormWorkItem(e.target.value)} className="input-field text-sm">
                      <option value="">Выберите работу...</option>
                      {workItems.map(w => (
                        <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Материал</label>
                    <select value={normMaterial} onChange={(e) => setNormMaterial(e.target.value)} className="input-field text-sm">
                      <option value="">Выберите материал...</option>
                      {materials.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-32">
                    <label className="text-xs text-gray-500 mb-1 block">Кол-во</label>
                    <input
                      type="number"
                      step="0.001"
                      placeholder="0"
                      value={normQuantity}
                      onChange={(e) => setNormQuantity(e.target.value)}
                      className="input-field text-sm"
                    />
                  </div>
                  <button
                    onClick={handleAddNorm}
                    disabled={!normWorkItem || !normMaterial || !normQuantity}
                    className="btn-primary flex items-center gap-1 disabled:opacity-50 h-[42px]"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {norms.length === 0 ? (
                <div className="card p-12 text-center">
                  <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Нормы расхода не заданы</p>
                  <p className="text-xs text-gray-400 mt-1">Добавьте нормы выше для автоматического списания</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Код</th>
                        <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Работа</th>
                        <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Материал</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Норма</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {norms.map(n => (
                        <tr key={n.id} className="border-b border-gray-100">
                          <td className="p-3 text-sm text-gray-500">{n.workItem.code}</td>
                          <td className="p-3 text-sm font-medium">{n.workItem.name}</td>
                          <td className="p-3 text-sm">{n.material.name}</td>
                          <td className="p-3 text-sm text-right font-medium">{fmt(n.quantity)} {n.material.unit}</td>
                          <td className="p-3 text-right">
                            <button onClick={() => handleDeleteNorm(n.id)} className="text-gray-400 hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Create material modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Новый материал</h2>
                <button onClick={() => { setShowCreateModal(false); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <input placeholder="Название *" value={newMaterial.name} onChange={(e) => setNewMaterial(p => ({...p, name: e.target.value}))} className="input-field" />
                <div className="grid grid-cols-2 gap-3">
                  <select value={newMaterial.unit} onChange={(e) => setNewMaterial(p => ({...p, unit: e.target.value}))} className="input-field">
                    {unitOptions.length > 0
                      ? unitOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)
                      : <><option value="шт">шт</option><option value="мл">мл</option><option value="г">г</option><option value="м">м</option><option value="л">л</option><option value="кг">кг</option></>
                    }
                  </select>
                  <input placeholder="Категория" value={newMaterial.category} onChange={(e) => setNewMaterial(p => ({...p, category: e.target.value}))} className="input-field" list="mat-cats" />
                  <datalist id="mat-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Мин. остаток" value={newMaterial.minStock} onChange={(e) => setNewMaterial(p => ({...p, minStock: e.target.value}))} className="input-field" />
                  <input type="number" placeholder="Цена закупки" value={newMaterial.avgPrice} onChange={(e) => setNewMaterial(p => ({...p, avgPrice: e.target.value}))} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowCreateModal(false); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={handleCreate} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "..." : "Создать"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Supplier modal */}
        {showSupplierModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Новый поставщик</h2>
                <button onClick={() => { setShowSupplierModal(false); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <input placeholder="Название *" value={newSupplier.name} onChange={e => setNewSupplier(p => ({...p, name: e.target.value}))} className="input-field" />
                <input placeholder="Контактное лицо" value={newSupplier.contactPerson} onChange={e => setNewSupplier(p => ({...p, contactPerson: e.target.value}))} className="input-field" />
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Телефон" value={newSupplier.phone} onChange={e => setNewSupplier(p => ({...p, phone: e.target.value}))} className="input-field" />
                  <input placeholder="Email" value={newSupplier.email} onChange={e => setNewSupplier(p => ({...p, email: e.target.value}))} className="input-field" />
                </div>
                <input placeholder="Примечание" value={newSupplier.notes} onChange={e => setNewSupplier(p => ({...p, notes: e.target.value}))} className="input-field" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowSupplierModal(false); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={handleCreateSupplier} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "..." : "Создать"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit material modal */}
        {editMaterial && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Редактировать материал</h2>
                <button onClick={() => { setEditMaterial(null); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <input placeholder="Название *" value={editForm.name} onChange={(e) => setEditForm(p => ({...p, name: e.target.value}))} className="input-field" />
                <div className="grid grid-cols-2 gap-3">
                  <select value={editForm.unit} onChange={(e) => setEditForm(p => ({...p, unit: e.target.value}))} className="input-field">
                    {unitOptions.length > 0
                      ? unitOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)
                      : <><option value="шт">шт</option><option value="мл">мл</option><option value="г">г</option><option value="м">м</option><option value="л">л</option><option value="кг">кг</option></>
                    }
                  </select>
                  <input placeholder="Категория" value={editForm.category} onChange={(e) => setEditForm(p => ({...p, category: e.target.value}))} className="input-field" list="mat-cats" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Мин. остаток" value={editForm.minStock} onChange={(e) => setEditForm(p => ({...p, minStock: e.target.value}))} className="input-field" />
                  <input type="number" placeholder="Цена закупки" value={editForm.avgPrice} onChange={(e) => setEditForm(p => ({...p, avgPrice: e.target.value}))} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setEditMaterial(null); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={handleEditMaterial} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "..." : "Сохранить"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Movement modal */}
        {showMovementModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Приход / Расход</h2>
                <button onClick={() => { setShowMovementModal(false); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <select value={newMovement.materialId} onChange={(e) => setNewMovement(p => ({...p, materialId: e.target.value}))} className="input-field">
                  <option value="">— Выберите материал —</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({Number(m.currentStock)} {m.unit})</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <select value={newMovement.type} onChange={(e) => setNewMovement(p => ({...p, type: e.target.value}))} className="input-field">
                    <option value="IN">Приход</option><option value="OUT">Расход</option><option value="WRITE_OFF">Списание</option><option value="INVENTORY">Инвентаризация</option>
                  </select>
                  <input type="number" placeholder="Кол-во *" value={newMovement.quantity} onChange={(e) => setNewMovement(p => ({...p, quantity: e.target.value}))} className="input-field" />
                </div>
                {newMovement.type === "IN" && (
                  <input type="number" placeholder="Цена закупки" value={newMovement.price} onChange={(e) => setNewMovement(p => ({...p, price: e.target.value}))} className="input-field" />
                )}
                <input placeholder="Примечание" value={newMovement.notes} onChange={(e) => setNewMovement(p => ({...p, notes: e.target.value}))} className="input-field" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowMovementModal(false); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={handleMovement} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "..." : "Записать"}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
