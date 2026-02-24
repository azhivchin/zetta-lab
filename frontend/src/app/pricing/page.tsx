"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authApi, getToken } from "@/lib/api";
import {
  Plus, X, Save, Trash2, Copy, Star, Pencil, Users, BarChart3, ArrowLeftRight,
  ChevronRight, Check,
} from "lucide-react";
import { PageHeader } from "@/components/ui";

// TYPES

interface PriceList {
  id: string;
  name: string;
  code: string;
  type: string;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  isDefault: boolean;
  _count?: { items: number; clientPriceLists: number };
}

interface PriceListDetail extends PriceList {
  items: Array<{
    id: string;
    workItemId: string;
    price: number;
    workItem: { id: string; code: string; name: string; basePrice: number; unit: string };
  }>;
  clientPriceLists: Array<{
    id: string;
    client: { id: string; name: string; shortName: string | null };
  }>;
}

interface MatrixRow {
  workItem: { id: string; code: string; name: string; basePrice: number; unit: string };
  prices: Record<string, number | null>;
}

interface MatrixColumn {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
}

interface ComparisonItem {
  workItem: { id: string; code: string; name: string; basePrice: number };
  priceA: number | null;
  priceB: number | null;
  diff: number | null;
}

type TabType = "lists" | "matrix" | "compare";

const EMPTY_FORM = {
  name: "", code: "", type: "CLIENT", validFrom: "", validTo: "", isActive: true, isDefault: false,
};

// COMPONENT

export default function PricingPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>("lists");

  // Lists tab
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingList, setEditingList] = useState<PriceList | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Detail view
  const [selectedList, setSelectedList] = useState<PriceListDetail | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Matrix tab
  const [matrixColumns, setMatrixColumns] = useState<MatrixColumn[]>([]);
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [editingCell, setEditingCell] = useState<{row: number; col: string} | null>(null);
  const [cellValue, setCellValue] = useState("");

  // Compare tab
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [comparison, setComparison] = useState<ComparisonItem[]>([]);
  const [compareNames, setCompareNames] = useState<{a: string; b: string}>({a: "", b: ""});
  const [loadingCompare, setLoadingCompare] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  // PRICE LISTS

  const fetchLists = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authApi("/pricing");
      if (res.ok) {
        const data = await res.json();
        setPriceLists(data.data || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  const openCreate = () => {
    setEditingList(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (pl: PriceList) => {
    setEditingList(pl);
    setForm({
      name: pl.name, code: pl.code, type: pl.type,
      validFrom: pl.validFrom?.slice(0, 10) || "", validTo: pl.validTo?.slice(0, 10) || "",
      isActive: pl.isActive, isDefault: pl.isDefault,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) return;
    setSaving(true);
    try {
      const method = editingList ? "PATCH" : "POST";
      const url = editingList ? `/pricing/${editingList.id}` : "/pricing";
      const res = await authApi(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowForm(false);
        fetchLists();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Ошибка");
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить прайс-лист? Все привязки к клиентам будут удалены.")) return;
    try {
      await authApi(`/pricing/${id}`, { method: "DELETE" });
      fetchLists();
    } catch (e) { console.error(e); }
  };

  const handleClone = async (id: string) => {
    try {
      const res = await authApi(`/pricing/${id}/clone`, { method: "POST" });
      if (res.ok) fetchLists();
    } catch (e) { console.error(e); }
  };

  const openDetail = async (id: string) => {
    try {
      const res = await authApi(`/pricing/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedList(data.data);
        setShowDetail(true);
      }
    } catch (e) { console.error(e); }
  };

  // MATRIX

  const fetchMatrix = useCallback(async () => {
    setLoadingMatrix(true);
    try {
      const res = await authApi("/pricing/matrix");
      if (res.ok) {
        const data = await res.json();
        setMatrixColumns(data.data?.columns || []);
        setMatrixRows(data.data?.rows || []);
      }
    } catch (e) { console.error(e); }
    setLoadingMatrix(false);
  }, []);

  useEffect(() => {
    if (tab === "matrix") fetchMatrix();
  }, [tab, fetchMatrix]);

  const handleCellSave = async (rowIdx: number, colId: string) => {
    const value = parseFloat(cellValue);
    if (isNaN(value) || value < 0) { setEditingCell(null); return; }

    const workItemId = matrixRows[rowIdx].workItem.id;
    try {
      await authApi(`/pricing/${colId}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ workItemId, price: value }] }),
      });
      setMatrixRows(prev => prev.map((row, i) => {
        if (i !== rowIdx) return row;
        return { ...row, prices: { ...row.prices, [colId]: value } };
      }));
    } catch (e) { console.error(e); }
    setEditingCell(null);
  };

  // COMPARE

  const fetchCompare = useCallback(async () => {
    if (!compareA || !compareB || compareA === compareB) return;
    setLoadingCompare(true);
    try {
      const res = await authApi(`/pricing/compare?a=${compareA}&b=${compareB}`);
      if (res.ok) {
        const data = await res.json();
        setComparison(data.data?.comparison || []);
        setCompareNames({
          a: data.data?.listA?.name || "",
          b: data.data?.listB?.name || "",
        });
      }
    } catch (e) { console.error(e); }
    setLoadingCompare(false);
  }, [compareA, compareB]);

  const fmt = (n: number | null) => n !== null ? n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) : "—";

  // RENDER

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader title="Прайс-листы" />

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 mb-6">
            {([
              { key: "lists" as TabType, label: "Прайс-листы", icon: BarChart3 },
              { key: "matrix" as TabType, label: "Матрица цен", icon: BarChart3 },
              { key: "compare" as TabType, label: "Сравнение", icon: ArrowLeftRight },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                  tab === t.key
                    ? "bg-white text-zetta-600 border border-gray-200 border-b-white -mb-px"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* ==================== LISTS TAB ==================== */}
          {tab === "lists" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">
                  Шаблоны прайс-листов. Привязывайте к клиентам для автоматического ценообразования.
                </p>
                <button onClick={openCreate} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Новый прайс-лист
                </button>
              </div>

              {loading ? (
                <div className="text-center py-12 text-gray-400">Загрузка...</div>
              ) : priceLists.length === 0 ? (
                <div className="card p-12 text-center">
                  <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-2">Прайс-листов нет</p>
                  <button onClick={openCreate} className="btn-primary">Создать первый</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {priceLists.map(pl => (
                    <div key={pl.id} className="card p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900">{pl.name}</h3>
                            {pl.isDefault && <Star className="w-3.5 h-3.5 text-amber-500" />}
                          </div>
                          <p className="text-xs text-gray-500 font-mono">{pl.code}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${pl.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {pl.isActive ? "Активен" : "Неактивен"}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                        <span>{pl._count?.items || 0} позиций</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {pl._count?.clientPriceLists || 0} клиентов
                        </span>
                      </div>

                      {(pl.validFrom || pl.validTo) && (
                        <p className="text-xs text-gray-400 mb-3">
                          {pl.validFrom && `с ${new Date(pl.validFrom).toLocaleDateString("ru-RU")}`}
                          {pl.validTo && ` по ${new Date(pl.validTo).toLocaleDateString("ru-RU")}`}
                        </p>
                      )}

                      <div className="flex items-center gap-1 border-t pt-3">
                        <button onClick={() => openDetail(pl.id)} className="text-xs text-zetta-600 hover:text-zetta-700 flex items-center gap-1">
                          Позиции <ChevronRight className="w-3 h-3" />
                        </button>
                        <div className="flex-1" />
                        <button onClick={() => openEdit(pl)} className="p-1.5 text-gray-400 hover:text-zetta-600"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleClone(pl.id)} className="p-1.5 text-gray-400 hover:text-blue-600" title="Клонировать"><Copy className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(pl.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Create/Edit form modal */}
              {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold">{editingList ? "Редактировать" : "Новый прайс-лист"}</h2>
                      <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
                    </div>
                    <div className="space-y-3">
                      <input placeholder="Название *" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} className="input-field" />
                      <div className="grid grid-cols-2 gap-3">
                        <input placeholder="Код * (напр. N_2025)" value={form.code} onChange={e => setForm(p => ({...p, code: e.target.value}))} className="input-field" disabled={!!editingList} />
                        <select value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value}))} className="input-field">
                          <option value="CLIENT">Для клиентов</option>
                          <option value="SUBCONTRACTOR">Для субподрядчиков</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Действует с</label>
                          <input type="date" value={form.validFrom} onChange={e => setForm(p => ({...p, validFrom: e.target.value}))} className="input-field" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Действует до</label>
                          <input type="date" value={form.validTo} onChange={e => setForm(p => ({...p, validTo: e.target.value}))} className="input-field" />
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({...p, isActive: e.target.checked}))} className="rounded" />
                          Активен
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={form.isDefault} onChange={e => setForm(p => ({...p, isDefault: e.target.checked}))} className="rounded" />
                          По умолчанию
                        </label>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                      <button onClick={() => setShowForm(false)} className="btn-secondary">Отмена</button>
                      <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.code.trim()} className="btn-primary disabled:opacity-50">
                        {saving ? "Сохранение..." : "Сохранить"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Detail modal (items list) */}
              {showDetail && selectedList && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto py-4">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl p-6 my-auto max-h-[85vh] overflow-auto">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-bold">{selectedList.name}</h2>
                        <p className="text-xs text-gray-500 font-mono">{selectedList.code} — {selectedList.items.length} позиций</p>
                      </div>
                      <button onClick={() => setShowDetail(false)}><X className="w-5 h-5 text-gray-400" /></button>
                    </div>

                    {selectedList.clientPriceLists.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs text-gray-500 mb-1">Привязанные клиенты:</p>
                        <div className="flex flex-wrap gap-1">
                          {selectedList.clientPriceLists.map(cpl => (
                            <span key={cpl.id} className="text-xs bg-zetta-50 text-zetta-700 px-2 py-0.5 rounded-full">
                              {cpl.client.shortName || cpl.client.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedList.items.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <p className="text-sm">Позиции не добавлены. Используйте вкладку "Матрица" для заполнения.</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 border-b">
                            <th className="pb-2">Код</th>
                            <th className="pb-2">Работа</th>
                            <th className="pb-2 text-right">Базовая</th>
                            <th className="pb-2 text-right">Прайс</th>
                            <th className="pb-2 text-right">Разница</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedList.items.map(item => {
                            const diff = Number(item.price) - Number(item.workItem.basePrice);
                            return (
                              <tr key={item.id} className="border-b border-gray-100">
                                <td className="py-2 font-mono text-gray-500">{item.workItem.code}</td>
                                <td className="py-2">{item.workItem.name}</td>
                                <td className="py-2 text-right text-gray-400">{fmt(Number(item.workItem.basePrice))}</td>
                                <td className="py-2 text-right font-medium">{fmt(Number(item.price))}</td>
                                <td className={`py-2 text-right ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-gray-400"}`}>
                                  {diff > 0 ? "+" : ""}{fmt(diff)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== MATRIX TAB ==================== */}
          {tab === "matrix" && (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                Кликните на ячейку, чтобы изменить цену. Пустые ячейки — цена не задана (используется базовая).
              </p>

              {loadingMatrix ? (
                <div className="text-center py-12 text-gray-400">Загрузка матрицы...</div>
              ) : matrixColumns.length === 0 ? (
                <div className="card p-12 text-center">
                  <p className="text-gray-500 mb-2">Нет активных прайс-листов</p>
                  <button onClick={() => setTab("lists")} className="btn-primary">Создать прайс-лист</button>
                </div>
              ) : (
                <div className="card overflow-auto max-h-[70vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="border-b">
                        <th className="text-left px-3 py-2 text-xs text-gray-500 w-16">Код</th>
                        <th className="text-left px-3 py-2 text-xs text-gray-500 min-w-[200px]">Работа</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500 w-24">Базовая</th>
                        {matrixColumns.map(col => (
                          <th key={col.id} className="text-right px-3 py-2 text-xs text-gray-500 w-28" title={col.code}>
                            {col.name}
                            {col.isDefault && <Star className="w-2.5 h-2.5 inline ml-1 text-amber-500" />}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixRows.map((row, rowIdx) => (
                        <tr key={row.workItem.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-mono text-xs text-gray-400">{row.workItem.code}</td>
                          <td className="px-3 py-1.5 text-xs">{row.workItem.name}</td>
                          <td className="px-3 py-1.5 text-right text-xs text-gray-400">{fmt(Number(row.workItem.basePrice))}</td>
                          {matrixColumns.map(col => {
                            const price = row.prices[col.id];
                            const isEditing = editingCell?.row === rowIdx && editingCell?.col === col.id;

                            return (
                              <td key={col.id} className="px-1 py-1">
                                {isEditing ? (
                                  <div className="flex items-center gap-0.5">
                                    <input
                                      type="number"
                                      value={cellValue}
                                      onChange={e => setCellValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") handleCellSave(rowIdx, col.id);
                                        if (e.key === "Escape") setEditingCell(null);
                                      }}
                                      className="w-20 text-right text-xs border rounded px-1 py-0.5 focus:ring-1 focus:ring-zetta-400"
                                      autoFocus
                                    />
                                    <button onClick={() => handleCellSave(rowIdx, col.id)} className="text-green-600 p-0.5">
                                      <Check className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setEditingCell({ row: rowIdx, col: col.id });
                                      setCellValue(price !== null ? String(price) : String(Number(row.workItem.basePrice)));
                                    }}
                                    className={`w-full text-right text-xs px-2 py-1 rounded hover:bg-zetta-50 transition-colors ${
                                      price !== null ? "font-medium text-gray-900" : "text-gray-300"
                                    }`}
                                  >
                                    {price !== null ? fmt(price) : "—"}
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ==================== COMPARE TAB ==================== */}
          {tab === "compare" && (
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Прайс-лист A</label>
                  <select value={compareA} onChange={e => setCompareA(e.target.value)} className="input-field">
                    <option value="">Выберите...</option>
                    {priceLists.map(pl => (
                      <option key={pl.id} value={pl.id}>{pl.name} ({pl.code})</option>
                    ))}
                  </select>
                </div>
                <ArrowLeftRight className="w-5 h-5 text-gray-400 mt-5" />
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Прайс-лист B</label>
                  <select value={compareB} onChange={e => setCompareB(e.target.value)} className="input-field">
                    <option value="">Выберите...</option>
                    {priceLists.map(pl => (
                      <option key={pl.id} value={pl.id}>{pl.name} ({pl.code})</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={fetchCompare}
                  disabled={!compareA || !compareB || compareA === compareB || loadingCompare}
                  className="btn-primary mt-5 disabled:opacity-50"
                >
                  Сравнить
                </button>
              </div>

              {loadingCompare && <div className="text-center py-8 text-gray-400">Загрузка...</div>}

              {comparison.length > 0 && (
                <div className="card overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-gray-500">
                        <th className="text-left px-4 py-2">Код</th>
                        <th className="text-left px-4 py-2">Работа</th>
                        <th className="text-right px-4 py-2">Базовая</th>
                        <th className="text-right px-4 py-2 bg-blue-50">{compareNames.a}</th>
                        <th className="text-right px-4 py-2 bg-green-50">{compareNames.b}</th>
                        <th className="text-right px-4 py-2">Разница</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map(item => (
                        <tr key={item.workItem.id} className="border-b border-gray-50">
                          <td className="px-4 py-2 font-mono text-gray-400">{item.workItem.code}</td>
                          <td className="px-4 py-2">{item.workItem.name}</td>
                          <td className="px-4 py-2 text-right text-gray-400">{fmt(Number(item.workItem.basePrice))}</td>
                          <td className="px-4 py-2 text-right bg-blue-50/50 font-medium">{fmt(item.priceA)}</td>
                          <td className="px-4 py-2 text-right bg-green-50/50 font-medium">{fmt(item.priceB)}</td>
                          <td className={`px-4 py-2 text-right font-medium ${
                            item.diff !== null && item.diff > 0 ? "text-green-600" :
                            item.diff !== null && item.diff < 0 ? "text-red-600" : "text-gray-400"
                          }`}>
                            {item.diff !== null ? `${item.diff > 0 ? "+" : ""}${fmt(item.diff)}` : "—"}
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
      </main>
    </div>
  );
}
