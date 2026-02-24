"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authApi, getToken } from "@/lib/api";
import {
  Plus, X, Save, Trash2, Building, BookOpen, Star, Pencil, ChevronDown, ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui";

// ==========================================
// TYPES
// ==========================================

interface OrgRequisites {
  id: string;
  name: string;
  shortName: string | null;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  legalAddress: string | null;
  physicalAddress: string | null;
  settlementAccount: string | null;
  correspondentAccount: string | null;
  bik: string | null;
  bankName: string | null;
  signatoryPosition: string | null;
  signatoryName: string | null;
  signatoryNameGenitive: string | null;
  basisDocument: string | null;
  phone: string | null;
  email: string | null;
  isDefault: boolean;
}

interface ReferenceItem {
  id: string;
  type: string;
  code: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  children?: ReferenceItem[];
}

interface RefType {
  type: string;
  label: string;
  count: number;
}

type TabType = "requisites" | "references";

const EMPTY_REQUISITES = {
  name: "", shortName: "", inn: "", kpp: "", ogrn: "",
  legalAddress: "", physicalAddress: "",
  settlementAccount: "", correspondentAccount: "", bik: "", bankName: "",
  signatoryPosition: "", signatoryName: "", signatoryNameGenitive: "", basisDocument: "",
  phone: "", email: "", isDefault: false,
};

// ==========================================
// COMPONENT
// ==========================================

export default function SettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>("requisites");

  // Requisites state
  const [requisites, setRequisites] = useState<OrgRequisites[]>([]);
  const [loadingReq, setLoadingReq] = useState(true);
  const [showReqForm, setShowReqForm] = useState(false);
  const [editingReq, setEditingReq] = useState<OrgRequisites | null>(null);
  const [reqForm, setReqForm] = useState(EMPTY_REQUISITES);
  const [savingReq, setSavingReq] = useState(false);

  // References state
  const [refTypes, setRefTypes] = useState<RefType[]>([]);
  const [selectedRefType, setSelectedRefType] = useState<string>("");
  const [refItems, setRefItems] = useState<ReferenceItem[]>([]);
  const [loadingRef, setLoadingRef] = useState(false);
  const [showRefForm, setShowRefForm] = useState(false);
  const [editingRef, setEditingRef] = useState<ReferenceItem | null>(null);
  const [refForm, setRefForm] = useState({ code: "", name: "", sortOrder: 0 });
  const [savingRef, setSavingRef] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  // ==========================================
  // REQUISITES
  // ==========================================

  const fetchRequisites = useCallback(async () => {
    setLoadingReq(true);
    try {
      const res = await authApi("/settings/requisites");
      if (res.ok) {
        const data = await res.json();
        setRequisites(data.data || []);
      }
    } catch (e) { console.error(e); }
    setLoadingReq(false);
  }, []);

  useEffect(() => {
    if (tab === "requisites") fetchRequisites();
  }, [tab, fetchRequisites]);

  const openReqCreate = () => {
    setEditingReq(null);
    setReqForm(EMPTY_REQUISITES);
    setShowReqForm(true);
  };

  const openReqEdit = (req: OrgRequisites) => {
    setEditingReq(req);
    setReqForm({
      name: req.name,
      shortName: req.shortName || "",
      inn: req.inn || "",
      kpp: req.kpp || "",
      ogrn: req.ogrn || "",
      legalAddress: req.legalAddress || "",
      physicalAddress: req.physicalAddress || "",
      settlementAccount: req.settlementAccount || "",
      correspondentAccount: req.correspondentAccount || "",
      bik: req.bik || "",
      bankName: req.bankName || "",
      signatoryPosition: req.signatoryPosition || "",
      signatoryName: req.signatoryName || "",
      signatoryNameGenitive: req.signatoryNameGenitive || "",
      basisDocument: req.basisDocument || "",
      phone: req.phone || "",
      email: req.email || "",
      isDefault: req.isDefault,
    });
    setShowReqForm(true);
  };

  const handleSaveReq = async () => {
    if (!reqForm.name.trim()) return;
    setSavingReq(true);
    try {
      const method = editingReq ? "PATCH" : "POST";
      const url = editingReq ? `/settings/requisites/${editingReq.id}` : "/settings/requisites";
      const res = await authApi(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqForm),
      });
      if (res.ok) {
        setShowReqForm(false);
        fetchRequisites();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Ошибка сохранения");
      }
    } catch (e) { console.error(e); }
    setSavingReq(false);
  };

  const handleDeleteReq = async (id: string) => {
    if (!confirm("Удалить эти реквизиты?")) return;
    try {
      const res = await authApi(`/settings/requisites/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchRequisites();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Ошибка удаления");
      }
    } catch (e) { console.error(e); }
  };

  // ==========================================
  // REFERENCES
  // ==========================================

  const fetchRefTypes = useCallback(async () => {
    try {
      const res = await authApi("/settings/references/types");
      if (res.ok) {
        const data = await res.json();
        const types = data.data || [];
        setRefTypes(types);
        if (types.length > 0 && !selectedRefType) {
          setSelectedRefType(types[0].type);
        }
      }
    } catch (e) { console.error(e); }
  }, [selectedRefType]);

  const fetchRefItems = useCallback(async (type: string) => {
    if (!type) return;
    setLoadingRef(true);
    try {
      const res = await authApi(`/settings/references?type=${type}`);
      if (res.ok) {
        const data = await res.json();
        setRefItems(data.data || []);
      }
    } catch (e) { console.error(e); }
    setLoadingRef(false);
  }, []);

  useEffect(() => {
    if (tab === "references") fetchRefTypes();
  }, [tab, fetchRefTypes]);

  useEffect(() => {
    if (selectedRefType) fetchRefItems(selectedRefType);
  }, [selectedRefType, fetchRefItems]);

  const openRefCreate = () => {
    setEditingRef(null);
    setRefForm({ code: "", name: "", sortOrder: (refItems.length + 1) * 10 });
    setShowRefForm(true);
  };

  const openRefEdit = (item: ReferenceItem) => {
    setEditingRef(item);
    setRefForm({ code: item.code, name: item.name, sortOrder: item.sortOrder });
    setShowRefForm(true);
  };

  const handleSaveRef = async () => {
    if (!refForm.code.trim() || !refForm.name.trim()) return;
    setSavingRef(true);
    try {
      const method = editingRef ? "PATCH" : "POST";
      const url = editingRef ? `/settings/references/${editingRef.id}` : "/settings/references";
      const body = editingRef
        ? { name: refForm.name, sortOrder: refForm.sortOrder }
        : { type: selectedRefType, ...refForm };
      const res = await authApi(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowRefForm(false);
        fetchRefItems(selectedRefType);
        fetchRefTypes();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Ошибка сохранения");
      }
    } catch (e) { console.error(e); }
    setSavingRef(false);
  };

  const handleDeleteRef = async (id: string) => {
    if (!confirm("Удалить элемент справочника?")) return;
    try {
      const res = await authApi(`/settings/references/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchRefItems(selectedRefType);
        fetchRefTypes();
      }
    } catch (e) { console.error(e); }
  };

  const handleToggleRefActive = async (item: ReferenceItem) => {
    try {
      await authApi(`/settings/references/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      fetchRefItems(selectedRefType);
    } catch (e) { console.error(e); }
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader title="Настройки" />

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 mb-6">
            {([
              { key: "requisites" as TabType, label: "Наши реквизиты", icon: Building },
              { key: "references" as TabType, label: "Справочники", icon: BookOpen },
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

          {/* ==================== REQUISITES TAB ==================== */}
          {tab === "requisites" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">
                  Юридические лица вашей лаборатории. Используются в счетах, актах и ТОРГ-12.
                </p>
                <button onClick={openReqCreate} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Добавить юрлицо
                </button>
              </div>

              {loadingReq ? (
                <div className="text-center py-12 text-gray-400">Загрузка...</div>
              ) : requisites.length === 0 ? (
                <div className="card p-12 text-center">
                  <Building className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-2">Реквизиты не добавлены</p>
                  <p className="text-sm text-gray-400 mb-4">Добавьте юридическое лицо для формирования документов</p>
                  <button onClick={openReqCreate} className="btn-primary">Добавить</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {requisites.map(req => (
                    <div key={req.id} className="card p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-gray-900">{req.name}</h3>
                            {req.isDefault && (
                              <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                <Star className="w-3 h-3" />По умолчанию
                              </span>
                            )}
                          </div>
                          {req.shortName && <p className="text-sm text-gray-500 mb-2">{req.shortName}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openReqEdit(req)} className="p-2 text-gray-400 hover:text-zetta-600">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteReq(req.id)} className="p-2 text-gray-400 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm mt-3">
                        <div><span className="text-gray-500">ИНН:</span> {req.inn || "—"}</div>
                        <div><span className="text-gray-500">КПП:</span> {req.kpp || "—"}</div>
                        <div><span className="text-gray-500">ОГРН:</span> {req.ogrn || "—"}</div>
                        <div><span className="text-gray-500">БИК:</span> {req.bik || "—"}</div>
                        <div><span className="text-gray-500">Банк:</span> {req.bankName || "—"}</div>
                        <div><span className="text-gray-500">р/с:</span> {req.settlementAccount ? `...${req.settlementAccount.slice(-6)}` : "—"}</div>
                        <div className="col-span-2"><span className="text-gray-500">Юр. адрес:</span> {req.legalAddress || "—"}</div>
                        <div><span className="text-gray-500">Подписант:</span> {req.signatoryName || "—"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Requisites form modal */}
              {showReqForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto py-8">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 my-auto">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold">
                        {editingReq ? "Редактировать реквизиты" : "Новые реквизиты"}
                      </h2>
                      <button onClick={() => setShowReqForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
                    </div>

                    <div className="space-y-4 max-h-[70vh] overflow-auto">
                      {/* Основное */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Основное</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <input placeholder="Полное наименование *" value={reqForm.name} onChange={e => setReqForm(p => ({...p, name: e.target.value}))} className="input-field col-span-2" />
                          <input placeholder="Краткое наименование" value={reqForm.shortName} onChange={e => setReqForm(p => ({...p, shortName: e.target.value}))} className="input-field" />
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={reqForm.isDefault} onChange={e => setReqForm(p => ({...p, isDefault: e.target.checked}))} id="isDefault" className="rounded" />
                            <label htmlFor="isDefault" className="text-sm text-gray-700">По умолчанию</label>
                          </div>
                        </div>
                      </div>

                      {/* Реквизиты */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Реквизиты</h3>
                        <div className="grid grid-cols-3 gap-3">
                          <input placeholder="ИНН" value={reqForm.inn} onChange={e => setReqForm(p => ({...p, inn: e.target.value}))} className="input-field" />
                          <input placeholder="КПП" value={reqForm.kpp} onChange={e => setReqForm(p => ({...p, kpp: e.target.value}))} className="input-field" />
                          <input placeholder="ОГРН" value={reqForm.ogrn} onChange={e => setReqForm(p => ({...p, ogrn: e.target.value}))} className="input-field" />
                        </div>
                      </div>

                      {/* Адреса */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Адреса</h3>
                        <div className="space-y-3">
                          <input placeholder="Юридический адрес" value={reqForm.legalAddress} onChange={e => setReqForm(p => ({...p, legalAddress: e.target.value}))} className="input-field" />
                          <input placeholder="Фактический адрес" value={reqForm.physicalAddress} onChange={e => setReqForm(p => ({...p, physicalAddress: e.target.value}))} className="input-field" />
                        </div>
                      </div>

                      {/* Банк */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Банковские реквизиты</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <input placeholder="Расчётный счёт" value={reqForm.settlementAccount} onChange={e => setReqForm(p => ({...p, settlementAccount: e.target.value}))} className="input-field" />
                          <input placeholder="Корр. счёт" value={reqForm.correspondentAccount} onChange={e => setReqForm(p => ({...p, correspondentAccount: e.target.value}))} className="input-field" />
                          <input placeholder="БИК" value={reqForm.bik} onChange={e => setReqForm(p => ({...p, bik: e.target.value}))} className="input-field" />
                          <input placeholder="Банк" value={reqForm.bankName} onChange={e => setReqForm(p => ({...p, bankName: e.target.value}))} className="input-field" />
                        </div>
                      </div>

                      {/* Подписант */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Подписант</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <input placeholder="Должность (напр. Генеральный директор)" value={reqForm.signatoryPosition} onChange={e => setReqForm(p => ({...p, signatoryPosition: e.target.value}))} className="input-field" />
                          <input placeholder="ФИО (напр. Иванов И.И.)" value={reqForm.signatoryName} onChange={e => setReqForm(p => ({...p, signatoryName: e.target.value}))} className="input-field" />
                          <input placeholder="ФИО род. падеж (напр. Иванова Ивана Ивановича)" value={reqForm.signatoryNameGenitive} onChange={e => setReqForm(p => ({...p, signatoryNameGenitive: e.target.value}))} className="input-field" />
                          <input placeholder='Основание (напр. "устава")' value={reqForm.basisDocument} onChange={e => setReqForm(p => ({...p, basisDocument: e.target.value}))} className="input-field" />
                        </div>
                      </div>

                      {/* Контакты */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Контакты</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <input placeholder="Телефон" value={reqForm.phone} onChange={e => setReqForm(p => ({...p, phone: e.target.value}))} className="input-field" />
                          <input placeholder="Email" value={reqForm.email} onChange={e => setReqForm(p => ({...p, email: e.target.value}))} className="input-field" />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                      <button onClick={() => setShowReqForm(false)} className="btn-secondary">Отмена</button>
                      <button onClick={handleSaveReq} disabled={savingReq || !reqForm.name.trim()} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {savingReq ? "Сохранение..." : "Сохранить"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== REFERENCES TAB ==================== */}
          {tab === "references" && (
            <div className="flex gap-6">
              {/* Types list (left panel) */}
              <div className="w-64 flex-shrink-0">
                <p className="text-sm text-gray-500 mb-3">Типы справочников</p>
                <div className="space-y-1">
                  {refTypes.map(rt => (
                    <button
                      key={rt.type}
                      onClick={() => setSelectedRefType(rt.type)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedRefType === rt.type
                          ? "bg-zetta-50 text-zetta-700 font-medium"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <span>{rt.label}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{rt.count}</span>
                    </button>
                  ))}
                  {refTypes.length === 0 && (
                    <p className="text-sm text-gray-400 px-3 py-2">Справочники пока пусты. Они создаются автоматически при регистрации.</p>
                  )}
                </div>
              </div>

              {/* Items list (right panel) */}
              <div className="flex-1">
                {selectedRefType && (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium text-gray-900">
                        {refTypes.find(t => t.type === selectedRefType)?.label || selectedRefType}
                      </h3>
                      <button onClick={openRefCreate} className="btn-primary flex items-center gap-2 text-sm">
                        <Plus className="w-4 h-4" />
                        Добавить
                      </button>
                    </div>

                    {loadingRef ? (
                      <div className="text-center py-8 text-gray-400">Загрузка...</div>
                    ) : refItems.length === 0 ? (
                      <div className="card p-8 text-center">
                        <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Нет элементов</p>
                      </div>
                    ) : (
                      <div className="card overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-500 text-xs bg-gray-50 border-b">
                              <th className="px-4 py-2">Код</th>
                              <th className="px-4 py-2">Название</th>
                              <th className="px-4 py-2 text-center">Порядок</th>
                              <th className="px-4 py-2 text-center">Статус</th>
                              <th className="px-4 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {refItems.filter(i => !i.parentId).map(item => (
                              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-4 py-2.5 font-mono text-gray-500">{item.code}</td>
                                <td className="px-4 py-2.5">{item.name}</td>
                                <td className="px-4 py-2.5 text-center text-gray-400">{item.sortOrder}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <button
                                    onClick={() => handleToggleRefActive(item)}
                                    className={`text-xs px-2 py-0.5 rounded-full ${
                                      item.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                                    }`}
                                  >
                                    {item.isActive ? "Активен" : "Неактивен"}
                                  </button>
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-1 justify-end">
                                    <button onClick={() => openRefEdit(item)} className="p-1 text-gray-400 hover:text-zetta-600">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => handleDeleteRef(item.id)} className="p-1 text-gray-400 hover:text-red-500">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Reference form modal */}
                    {showRefForm && (
                      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold">
                              {editingRef ? "Редактировать" : "Новый элемент"}
                            </h2>
                            <button onClick={() => setShowRefForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
                          </div>
                          <div className="space-y-3">
                            <input
                              placeholder="Код *"
                              value={refForm.code}
                              onChange={e => setRefForm(p => ({...p, code: e.target.value}))}
                              className="input-field"
                              disabled={!!editingRef}
                            />
                            <input
                              placeholder="Название *"
                              value={refForm.name}
                              onChange={e => setRefForm(p => ({...p, name: e.target.value}))}
                              className="input-field"
                            />
                            <input
                              type="number"
                              placeholder="Порядок сортировки"
                              value={refForm.sortOrder}
                              onChange={e => setRefForm(p => ({...p, sortOrder: parseInt(e.target.value) || 0}))}
                              className="input-field"
                            />
                          </div>
                          <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowRefForm(false)} className="btn-secondary">Отмена</button>
                            <button
                              onClick={handleSaveRef}
                              disabled={savingRef || !refForm.code.trim() || !refForm.name.trim()}
                              className="btn-primary flex items-center gap-2 disabled:opacity-50"
                            >
                              <Save className="w-4 h-4" />
                              {savingRef ? "Сохранение..." : "Сохранить"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!selectedRefType && (
                  <div className="text-center py-12 text-gray-400">
                    Выберите тип справочника слева
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
