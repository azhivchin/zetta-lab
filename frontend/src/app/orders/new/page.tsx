"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authApi, getToken } from "@/lib/api";
import { ArrowLeft, Plus, Trash2, Zap, Search } from "lucide-react";
import { PageHeader } from "@/components/ui";

interface Client {
  id: string;
  name: string;
  shortName: string | null;
}

interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
  patronymic: string | null;
}

interface WorkCategory {
  id: string;
  name: string;
  code: string;
  items: WorkItem[];
}

interface WorkItem {
  id: string;
  code: string;
  name: string;
  basePrice: number | string;
  unit: string;
}

interface OrderItemForm {
  workItemId: string;
  workItemName: string;
  workItemCode: string;
  quantity: number;
  price: number;
  discount: number;
  notes: string;
}

export default function NewOrderPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [categories, setCategories] = useState<WorkCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [clientId, setClientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [toothFormula, setToothFormula] = useState("");
  const [color, setColor] = useState("");
  const [implantSystem, setImplantSystem] = useState("");
  const [hasStl, setHasStl] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItemForm[]>([]);

  // Work item picker
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  // Load clients and work categories
  useEffect(() => {
    const loadData = async () => {
      try {
        const [clientsRes, catalogRes] = await Promise.all([
          authApi("/clients?limit=200"),
          authApi("/work-catalog/categories"),
        ]);
        if (clientsRes.ok) {
          const d = await clientsRes.json();
          // API returns { clients, pagination } in data, or data as array
          const list = d.data?.clients || d.data || [];
          setClients(list);
        }
        if (catalogRes.ok) {
          const d = await catalogRes.json();
          setCategories(d.data || []);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadData();
  }, []);

  // Load doctors when client changes
  useEffect(() => {
    if (!clientId) {
      setDoctors([]);
      setDoctorId("");
      return;
    }
    const loadDoctors = async () => {
      try {
        const res = await authApi(`/clients/${clientId}/doctors`);
        if (res.ok) {
          const d = await res.json();
          setDoctors(d.data || []);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadDoctors();
  }, [clientId]);

  const addWorkItem = (item: WorkItem) => {
    // Check if already added
    if (items.find(i => i.workItemId === item.id)) return;
    setItems(prev => [...prev, {
      workItemId: item.id,
      workItemName: item.name,
      workItemCode: item.code,
      quantity: 1,
      price: Number(item.basePrice) || 0,
      discount: 0,
      notes: "",
    }]);
    setShowPicker(false);
    setPickerSearch("");
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof OrderItemForm, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const totalPrice = items.reduce((sum, item) => {
    const line = item.price * item.quantity;
    return sum + line - (line * item.discount / 100);
  }, 0);
  const totalDiscount = items.reduce((sum, item) => {
    const line = item.price * item.quantity;
    return sum + (line * item.discount / 100);
  }, 0);

  const handleSubmit = async () => {
    setError("");
    if (!clientId) { setError("Выберите заказчика"); return; }
    if (items.length === 0) { setError("Добавьте хотя бы одну работу"); return; }

    setSaving(true);
    try {
      const body = {
        clientId,
        doctorId: doctorId || undefined,
        patientName: patientName.trim() || undefined,
        toothFormula: toothFormula.trim() || undefined,
        color: color.trim() || undefined,
        implantSystem: implantSystem.trim() || undefined,
        hasStl,
        isUrgent,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        items: items.map(i => ({
          workItemId: i.workItemId,
          quantity: i.quantity,
          price: i.price,
          discount: i.discount || 0,
          notes: i.notes || undefined,
        })),
      };

      const res = await authApi("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/orders/${data.data.id}`);
      } else {
        const errData = await res.json();
        setError(errData.error?.message || "Ошибка создания наряда");
      }
    } catch (e) {
      setError("Не удалось создать наряд");
    }
    setSaving(false);
  };

  // Filter work items for picker
  const filteredCategories = categories.map(cat => ({
    ...cat,
    items: (cat.items || []).filter(item =>
      !pickerSearch ||
      item.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
      item.code.toLowerCase().includes(pickerSearch.toLowerCase())
    ),
  })).filter(cat => cat.items.length > 0);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-4xl">
          <button onClick={() => router.push("/orders")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
            <ArrowLeft className="w-4 h-4" /> Назад к списку
          </button>

          <PageHeader title="Новый наряд">
            {isUrgent && (
              <span className="badge bg-orange-100 text-orange-800 flex items-center gap-1">
                <Zap className="w-3 h-3" /> Срочный
              </span>
            )}
          </PageHeader>

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
          )}

          <div className="space-y-6">
            {/* Client & Doctor */}
            <div className="card p-5">
              <h2 className="font-medium text-gray-900 mb-4">Заказчик и врач</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Заказчик (клиника) *</label>
                  <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input-field">
                    <option value="">— Выберите заказчика —</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.shortName || c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Врач</label>
                  <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="input-field" disabled={!clientId}>
                    <option value="">— Выберите врача —</option>
                    {doctors.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.lastName} {d.firstName} {d.patronymic || ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-sm text-gray-600 mb-1">Пациент (ФИО)</label>
                <input
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Иванов Иван Иванович"
                  className="input-field"
                />
              </div>
            </div>

            {/* Dental details */}
            <div className="card p-5">
              <h2 className="font-medium text-gray-900 mb-4">Детали работы</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Зубная формула</label>
                  <input value={toothFormula} onChange={(e) => setToothFormula(e.target.value)} placeholder="14-15-25, б/к" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Цвет</label>
                  <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="A2, A3, BL1" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Система имплантов</label>
                  <input value={implantSystem} onChange={(e) => setImplantSystem(e.target.value)} placeholder="Dentium MU, Nobel..." className="input-field" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Дата сдачи</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input-field" />
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hasStl} onChange={(e) => setHasStl(e.target.checked)} className="w-4 h-4 text-zetta-500 rounded" />
                    <span className="text-sm text-gray-700">STL-файлы</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} className="w-4 h-4 text-orange-500 rounded" />
                    <span className="text-sm text-gray-700 flex items-center gap-1"><Zap className="w-3 h-3 text-orange-500" /> Срочный</span>
                  </label>
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-sm text-gray-600 mb-1">Примечания</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Дополнительная информация..." className="input-field" />
              </div>
            </div>

            {/* Work items */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-medium text-gray-900">Работы *</h2>
                <button onClick={() => setShowPicker(true)} className="btn-primary text-sm flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Добавить работу
                </button>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">Добавьте работы из каталога</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 font-medium px-1">
                    <div className="col-span-1">Код</div>
                    <div className="col-span-3">Наименование</div>
                    <div className="col-span-1 text-center">Кол-во</div>
                    <div className="col-span-2 text-right">Цена</div>
                    <div className="col-span-1 text-center">Скидка %</div>
                    <div className="col-span-2 text-right">Сумма</div>
                    <div className="col-span-2 text-right">Итого</div>
                  </div>
                  {items.map((item, idx) => {
                    const lineTotal = item.price * item.quantity;
                    const discountAmt = lineTotal * item.discount / 100;
                    const finalTotal = lineTotal - discountAmt;
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-lg p-2">
                        <div className="col-span-1 font-mono text-xs text-zetta-600">{item.workItemCode}</div>
                        <div className="col-span-3 text-sm">{item.workItemName}</div>
                        <div className="col-span-1">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                            className="input-field text-center text-sm py-1"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min="0"
                            value={item.price}
                            onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                            className="input-field text-right text-sm py-1"
                          />
                        </div>
                        <div className="col-span-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={item.discount}
                            onChange={(e) => updateItem(idx, "discount", parseFloat(e.target.value) || 0)}
                            className="input-field text-center text-sm py-1"
                          />
                        </div>
                        <div className="col-span-2 text-right text-sm text-gray-500">
                          {lineTotal.toLocaleString("ru-RU")} ₽
                          {item.discount > 0 && <span className="block text-xs text-red-500">-{discountAmt.toLocaleString("ru-RU")}</span>}
                        </div>
                        <div className="col-span-2 flex items-center justify-end gap-1">
                          <span className="font-medium text-sm">{finalTotal.toLocaleString("ru-RU")} ₽</span>
                          <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500 ml-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex justify-end pt-2 gap-6">
                    {totalDiscount > 0 && (
                      <div className="text-right">
                        <span className="text-sm text-gray-400">Скидка: </span>
                        <span className="text-sm text-red-500">-{totalDiscount.toLocaleString("ru-RU")} ₽</span>
                      </div>
                    )}
                    <div className="text-right">
                      <span className="text-sm text-gray-500">Итого: </span>
                      <span className="text-lg font-bold text-gray-900">{totalPrice.toLocaleString("ru-RU")} ₽</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex items-center justify-between">
              <button onClick={() => router.push("/orders")} className="btn-secondary">Отмена</button>
              <button onClick={handleSubmit} disabled={saving} className="btn-primary px-8 disabled:opacity-50">
                {saving ? "Создание..." : "Создать наряд"}
              </button>
            </div>
          </div>
        </div>

        {/* Work item picker modal */}
        {showPicker && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold">Выбор работы из каталога</h2>
                  <button onClick={() => { setShowPicker(false); setPickerSearch(""); }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Поиск по названию или коду..."
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    className="input-field pl-10"
                    autoFocus
                  />
                </div>
              </div>
              <div className="overflow-auto flex-1 p-4">
                {filteredCategories.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">Ничего не найдено</p>
                ) : (
                  <div className="space-y-4">
                    {filteredCategories.map(cat => (
                      <div key={cat.id}>
                        <h3 className="text-sm font-medium text-gray-500 mb-2">{cat.code}. {cat.name}</h3>
                        <div className="space-y-1">
                          {cat.items.map(item => {
                            const alreadyAdded = items.some(i => i.workItemId === item.id);
                            return (
                              <button
                                key={item.id}
                                onClick={() => !alreadyAdded && addWorkItem(item)}
                                disabled={alreadyAdded}
                                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-colors ${
                                  alreadyAdded
                                    ? "bg-zetta-50 text-zetta-600 cursor-default"
                                    : "hover:bg-gray-100 cursor-pointer"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-xs text-gray-400 w-12">{item.code}</span>
                                  <span className="text-sm">{item.name}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium">{Number(item.basePrice).toLocaleString("ru-RU")} ₽</span>
                                  {alreadyAdded && <span className="text-xs text-zetta-600">Добавлено</span>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
