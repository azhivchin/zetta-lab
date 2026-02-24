"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authApi, getToken } from "@/lib/api";
import { Plus, ChevronDown, ChevronRight, FolderOpen, Wrench, X, Pencil, Trash2, FileSpreadsheet, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";

interface WorkItem {
  id: string;
  code: string;
  name: string;
  defaultPrice: number;
  unit: string;
  estimatedMinutes: number | null;
}

interface Category {
  id: string;
  name: string;
  code: string;
  description: string | null;
  items: WorkItem[];
}

export default function WorkCatalogPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [showCreateItem, setShowCreateItem] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState({ name: "", code: "", description: "" });
  const [newItem, setNewItem] = useState({ name: "", code: "", defaultPrice: "", unit: "шт", estimatedMinutes: "" });
  const [saving, setSaving] = useState(false);
  const [editItem, setEditItem] = useState<WorkItem | null>(null);
  const [editItemForm, setEditItemForm] = useState({ name: "", code: "", defaultPrice: "", unit: "шт", estimatedMinutes: "" });
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editCatForm, setEditCatForm] = useState({ name: "", code: "", description: "" });

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authApi("/work-catalog/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.data || []);
        if (data.data?.length) {
          setExpandedCategories(new Set(data.data.map((c: Category) => c.id)));
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim() || !newCategory.code.trim()) return;
    setSaving(true);
    try {
      const res = await authApi("/work-catalog/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCategory),
      });
      if (res.ok) {
        setShowCreateCategory(false);
        setNewCategory({ name: "", code: "", description: "" });
        fetchCategories();
      }
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleCreateItem = async (categoryId: string) => {
    if (!newItem.name.trim() || !newItem.code.trim()) return;
    setSaving(true);
    try {
      const res = await authApi("/work-catalog/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newItem,
          categoryId,
          defaultPrice: parseFloat(newItem.defaultPrice) || 0,
          estimatedMinutes: newItem.estimatedMinutes ? parseInt(newItem.estimatedMinutes) : null,
        }),
      });
      if (res.ok) {
        setShowCreateItem(null);
        setNewItem({ name: "", code: "", defaultPrice: "", unit: "шт", estimatedMinutes: "" });
        fetchCategories();
      }
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleEditItem = async () => {
    if (!editItem || !editItemForm.name.trim() || !editItemForm.code.trim()) return;
    setSaving(true);
    try {
      const res = await authApi(`/work-catalog/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editItemForm.name,
          code: editItemForm.code,
          basePrice: parseFloat(editItemForm.defaultPrice) || 0,
          unit: editItemForm.unit,
          estimatedDays: editItemForm.estimatedMinutes ? parseInt(editItemForm.estimatedMinutes) : undefined,
        }),
      });
      if (res.ok) { setEditItem(null); fetchCategories(); }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Деактивировать работу?")) return;
    try {
      await authApi(`/work-catalog/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      fetchCategories();
    } catch (e) { console.error(e); }
  };

  const handleEditCategory = async () => {
    if (!editCategory || !editCatForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await authApi(`/work-catalog/categories/${editCategory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editCatForm.name,
          code: editCatForm.code,
        }),
      });
      if (res.ok) { setEditCategory(null); fetchCategories(); }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const openEditItem = (item: WorkItem) => {
    setEditItemForm({
      name: item.name,
      code: item.code,
      defaultPrice: String(item.defaultPrice),
      unit: item.unit,
      estimatedMinutes: item.estimatedMinutes ? String(item.estimatedMinutes) : "",
    });
    setEditItem(item);
  };

  const handleExport = (format: "excel" | "pdf") => {
    const headers = ["Категория", "Код", "Наименование", "Цена", "Ед.", "Время (мин)"];
    const rows: (string | number)[][] = [];
    categories.forEach(cat => {
      cat.items?.forEach(item => {
        rows.push([cat.name, item.code, item.name, item.defaultPrice, item.unit, item.estimatedMinutes || "—"]);
      });
    });
    if (format === "excel") exportToExcel("Каталог работ", headers, rows);
    else exportToPDF("Каталог работ", headers, rows);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader title="Каталог работ" actions={
            <div className="flex gap-2">
              <button onClick={() => handleExport("excel")} className="btn-secondary flex items-center gap-1.5 text-sm">
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </button>
              <button onClick={() => handleExport("pdf")} className="btn-secondary flex items-center gap-1.5 text-sm">
                <FileText className="w-4 h-4" /> PDF
              </button>
              <button onClick={() => setShowCreateCategory(true)} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Категория
              </button>
            </div>
          } />

          {loading ? (
            <div className="text-center py-12 text-gray-400">Загрузка...</div>
          ) : categories.length === 0 ? (
            <div className="card p-12 text-center">
              <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">Каталог пуст</p>
              <button onClick={() => setShowCreateCategory(true)} className="btn-primary">Создать первую категорию</button>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map((cat) => (
                <div key={cat.id} className="card overflow-hidden">
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleCategory(cat.id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedCategories.has(cat.id) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      <div className="w-8 h-8 rounded-lg bg-zetta-100 flex items-center justify-center">
                        <span className="text-sm font-bold text-zetta-600">{cat.code}</span>
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{cat.name}</h3>
                        {cat.description && <p className="text-xs text-gray-500">{cat.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={(e) => { e.stopPropagation(); setEditCatForm({ name: cat.name, code: cat.code, description: cat.description || "" }); setEditCategory(cat); }} className="text-gray-400 hover:text-zetta-600">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm text-gray-400">{cat.items?.length || 0} работ</span>
                    </div>
                  </div>

                  {expandedCategories.has(cat.id) && (
                    <div className="border-t border-gray-100">
                      {cat.items?.length > 0 ? (
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50 text-xs text-gray-500">
                              <th className="text-left p-2 pl-14">Код</th>
                              <th className="text-left p-2">Наименование</th>
                              <th className="text-right p-2">Цена</th>
                              <th className="text-center p-2">Ед.</th>
                              <th className="text-right p-2">Время (мин)</th>
                              <th className="text-right p-2 pr-4 w-20"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {cat.items.map((item) => (
                              <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50">
                                <td className="p-2 pl-14 font-mono text-xs text-zetta-600">{item.code}</td>
                                <td className="p-2 text-sm">{item.name}</td>
                                <td className="p-2 text-sm text-right font-medium">{item.defaultPrice.toLocaleString("ru-RU")} р.</td>
                                <td className="p-2 text-sm text-center text-gray-500">{item.unit}</td>
                                <td className="p-2 text-sm text-right text-gray-500">{item.estimatedMinutes || "—"}</td>
                                <td className="p-2 text-right pr-4">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => openEditItem(item)} className="text-gray-400 hover:text-zetta-600">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => handleDeleteItem(item.id)} className="text-gray-400 hover:text-red-500">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="p-4 pl-14 text-sm text-gray-400">Работы не добавлены</p>
                      )}
                      <div className="p-2 pl-14 border-t border-gray-100">
                        {showCreateItem === cat.id ? (
                          <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                            <input placeholder="Код" value={newItem.code} onChange={(e) => setNewItem(p => ({...p, code: e.target.value}))} className="input-field w-24 text-sm" />
                            <input placeholder="Наименование" value={newItem.name} onChange={(e) => setNewItem(p => ({...p, name: e.target.value}))} className="input-field flex-1 text-sm" />
                            <input placeholder="Цена" value={newItem.defaultPrice} onChange={(e) => setNewItem(p => ({...p, defaultPrice: e.target.value}))} className="input-field w-24 text-sm" type="number" />
                            <input placeholder="Мин" value={newItem.estimatedMinutes} onChange={(e) => setNewItem(p => ({...p, estimatedMinutes: e.target.value}))} className="input-field w-20 text-sm" type="number" />
                            <button onClick={() => handleCreateItem(cat.id)} disabled={saving} className="btn-primary text-sm py-1.5 px-3">OK</button>
                            <button onClick={() => setShowCreateItem(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <button onClick={() => setShowCreateItem(cat.id)} className="text-sm text-zetta-600 hover:text-zetta-700 flex items-center gap-1">
                            <Plus className="w-3.5 h-3.5" /> Добавить работу
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {showCreateCategory && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Новая категория</h2>
                <button onClick={() => setShowCreateCategory(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="space-y-3">
                <input placeholder="Код (например: 1)" value={newCategory.code} onChange={(e) => setNewCategory(p => ({...p, code: e.target.value}))} className="input-field" />
                <input placeholder="Название *" value={newCategory.name} onChange={(e) => setNewCategory(p => ({...p, name: e.target.value}))} className="input-field" />
                <input placeholder="Описание" value={newCategory.description} onChange={(e) => setNewCategory(p => ({...p, description: e.target.value}))} className="input-field" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowCreateCategory(false)} className="btn-secondary">Отмена</button>
                <button onClick={handleCreateCategory} disabled={saving} className="btn-primary">{saving ? "..." : "Создать"}</button>
              </div>
            </div>
          </div>
        )}

        {editItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Редактировать работу</h2>
                <button onClick={() => setEditItem(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="space-y-3">
                <input placeholder="Код" value={editItemForm.code} onChange={(e) => setEditItemForm(p => ({...p, code: e.target.value}))} className="input-field" />
                <input placeholder="Наименование" value={editItemForm.name} onChange={(e) => setEditItemForm(p => ({...p, name: e.target.value}))} className="input-field" />
                <div className="grid grid-cols-3 gap-3">
                  <input type="number" placeholder="Цена" value={editItemForm.defaultPrice} onChange={(e) => setEditItemForm(p => ({...p, defaultPrice: e.target.value}))} className="input-field" />
                  <input placeholder="Ед." value={editItemForm.unit} onChange={(e) => setEditItemForm(p => ({...p, unit: e.target.value}))} className="input-field" />
                  <input type="number" placeholder="Мин." value={editItemForm.estimatedMinutes} onChange={(e) => setEditItemForm(p => ({...p, estimatedMinutes: e.target.value}))} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setEditItem(null)} className="btn-secondary">Отмена</button>
                <button onClick={handleEditItem} disabled={saving} className="btn-primary">{saving ? "..." : "Сохранить"}</button>
              </div>
            </div>
          </div>
        )}

        {editCategory && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Редактировать категорию</h2>
                <button onClick={() => setEditCategory(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="space-y-3">
                <input placeholder="Код" value={editCatForm.code} onChange={(e) => setEditCatForm(p => ({...p, code: e.target.value}))} className="input-field" />
                <input placeholder="Название" value={editCatForm.name} onChange={(e) => setEditCatForm(p => ({...p, name: e.target.value}))} className="input-field" />
                <input placeholder="Описание" value={editCatForm.description} onChange={(e) => setEditCatForm(p => ({...p, description: e.target.value}))} className="input-field" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setEditCategory(null)} className="btn-secondary">Отмена</button>
                <button onClick={handleEditCategory} disabled={saving} className="btn-primary">{saving ? "..." : "Сохранить"}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
