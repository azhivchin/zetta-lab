"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authApi, getToken } from "@/lib/api";
import {
  Plus, Search, Building2, Phone, Mail, User, ChevronDown, ChevronUp, X,
  DollarSign, BarChart3, FileText, Trash2, Save, Pencil, FileCheck, Check,
} from "lucide-react";
import { useReferences } from "@/lib/useReferences";
import { PageHeader } from "@/components/ui";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";
import { FileSpreadsheet } from "lucide-react";

interface Client {
  id: string;
  name: string;
  shortName: string | null;
  inn: string | null;
  kpp: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contactPerson: string | null;
  isActive: boolean;
  individualCode: string | null;
  contractNumber: string | null;
  contractDate: string | null;
  contractType: string | null;
  legalEntityName: string | null;
  signatoryPosition: string | null;
  signatoryName: string | null;
  signatoryNameGenitive: string | null;
  basisDocument: string | null;
  legalAddress: string | null;
  physicalAddress: string | null;
  ogrn: string | null;
  settlementAccount: string | null;
  correspondentAccount: string | null;
  bik: string | null;
  bankName: string | null;
  courierDirection: string | null;
  courierSchedule: string | null;
  ourRequisitesId: string | null;
  reportDisplayName: string | null;
  _count?: { orders: number; doctors: number };
}

interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phone: string | null;
  specialization: string | null;
}

interface PriceItem {
  id: string;
  clientId: string;
  workItemId: string;
  price: number;
  workItem: { id: string; name: string; code: string; basePrice: number; unit: string };
}

interface WorkItem {
  id: string;
  name: string;
  code: string;
  basePrice: number;
  unit: string;
}

interface ClientStats {
  totalOrders: number;
  totalRevenue: number;
  totalPaid: number;
  balance: number;
  unpaidInvoicesAmount: number;
  unpaidInvoicesCount: number;
}

type TabType = "doctors" | "prices" | "stats";

export default function ClientsPage() {
  const router = useRouter();
  const { asOptions: contractTypeOptions } = useReferences("contract_type");
  const { asOptions: courierDirectionOptions } = useReferences("courier_direction");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("doctors");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [prices, setPrices] = useState<PriceItem[]>([]);
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClient, setNewClient] = useState({
    name: "", shortName: "", phone: "", email: "", address: "", contactPerson: "", inn: "", kpp: "",
    // Расширенные поля (Фаза 1)
    individualCode: "", contractNumber: "", contractDate: "", contractType: "",
    legalEntityName: "", signatoryPosition: "", signatoryName: "", signatoryNameGenitive: "", basisDocument: "",
    legalAddress: "", physicalAddress: "", ogrn: "",
    settlementAccount: "", correspondentAccount: "", bik: "", bankName: "",
    courierDirection: "", courierSchedule: "",
    ourRequisitesId: "", reportDisplayName: "",
  });
  const [saving, setSaving] = useState(false);
  const [clientFormSection, setClientFormSection] = useState<"basic" | "legal" | "bank" | "courier" | "docs">("basic");
  const [orgRequisites, setOrgRequisites] = useState<Array<{id: string; name: string; shortName: string | null; isDefault: boolean}>>([]);

  // Doctor editor state
  const [showDoctorForm, setShowDoctorForm] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [doctorForm, setDoctorForm] = useState({ firstName: "", lastName: "", patronymic: "", phone: "", specialty: "" });

  // Contracts registry
  const [pageView, setPageView] = useState<"clients" | "contracts">("clients");
  const [contracts, setContracts] = useState<any[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);

  // Price editor state
  const [selectedWorkItem, setSelectedWorkItem] = useState("");
  const [newPrice, setNewPrice] = useState("");

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  // Загрузка наших реквизитов (для dropdown в форме клиента)
  const loadOrgRequisites = useCallback(async () => {
    try {
      const res = await authApi("/settings/requisites");
      if (res.ok) {
        const data = await res.json();
        setOrgRequisites(data.data || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadOrgRequisites(); }, [loadOrgRequisites]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await authApi(`/clients${params}`);
      if (res.ok) {
        const data = await res.json();
        const list = data.data?.clients || data.data || [];
        setClients(list);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const loadDoctors = async (clientId: string) => {
    try {
      const res = await authApi(`/clients/${clientId}/doctors`);
      if (res.ok) {
        const data = await res.json();
        setDoctors(data.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadPrices = async (clientId: string) => {
    try {
      const res = await authApi(`/clients/${clientId}/prices`);
      if (res.ok) {
        const data = await res.json();
        setPrices(data.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadStats = async (clientId: string) => {
    try {
      const res = await authApi(`/clients/${clientId}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.data || null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadWorkItems = async () => {
    if (workItems.length > 0) return;
    try {
      const res = await authApi("/work-catalog/items?limit=500");
      if (res.ok) {
        const data = await res.json();
        setWorkItems(data.data?.items || data.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchContracts = useCallback(async () => {
    setContractsLoading(true);
    try {
      const res = await authApi("/clients/contracts-registry");
      if (res.ok) {
        const d = await res.json();
        setContracts(d.data || []);
      }
    } catch (e) { console.error(e); }
    setContractsLoading(false);
  }, []);

  const toggleExpand = async (clientId: string) => {
    if (expandedClient === clientId) {
      setExpandedClient(null);
      return;
    }
    setExpandedClient(clientId);
    setActiveTab("doctors");
    setDoctors([]);
    setPrices([]);
    setStats(null);
    loadDoctors(clientId);
  };

  const switchTab = async (tab: TabType, clientId: string) => {
    setActiveTab(tab);
    if (tab === "doctors") await loadDoctors(clientId);
    if (tab === "prices") { await loadPrices(clientId); await loadWorkItems(); }
    if (tab === "stats") await loadStats(clientId);
  };

  const handleAddPrice = async (clientId: string) => {
    if (!selectedWorkItem || !newPrice) return;
    try {
      const res = await authApi(`/clients/${clientId}/prices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItemId: selectedWorkItem, price: parseFloat(newPrice) }),
      });
      if (res.ok) {
        await loadPrices(clientId);
        setSelectedWorkItem("");
        setNewPrice("");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePrice = async (clientId: string, workItemId: string) => {
    try {
      await authApi(`/clients/${clientId}/prices/${workItemId}`, { method: "DELETE" });
      await loadPrices(clientId);
    } catch (e) {
      console.error(e);
    }
  };

  const openDoctorAdd = () => {
    setEditingDoctor(null);
    setDoctorForm({ firstName: "", lastName: "", patronymic: "", phone: "", specialty: "" });
    setShowDoctorForm(true);
  };

  const openDoctorEdit = (doc: Doctor) => {
    setEditingDoctor(doc);
    setDoctorForm({
      firstName: doc.firstName,
      lastName: doc.lastName,
      patronymic: doc.middleName || "",
      phone: doc.phone || "",
      specialty: doc.specialization || "",
    });
    setShowDoctorForm(true);
  };

  const handleSaveDoctor = async (clientId: string) => {
    if (!doctorForm.firstName.trim() || !doctorForm.lastName.trim()) return;
    try {
      if (editingDoctor) {
        await authApi(`/clients/${clientId}/doctors/${editingDoctor.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(doctorForm),
        });
      } else {
        await authApi(`/clients/${clientId}/doctors`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(doctorForm),
        });
      }
      setShowDoctorForm(false);
      await loadDoctors(clientId);
      fetchClients();
    } catch (e) { console.error(e); }
  };

  const handleDeleteDoctor = async (clientId: string, doctorId: string) => {
    if (!confirm("Удалить врача?")) return;
    try {
      await authApi(`/clients/${clientId}/doctors/${doctorId}`, { method: "DELETE" });
      await loadDoctors(clientId);
      fetchClients();
    } catch (e) { console.error(e); }
  };

  const resetClientForm = () => ({
    name: "", shortName: "", phone: "", email: "", address: "", contactPerson: "", inn: "", kpp: "",
    individualCode: "", contractNumber: "", contractDate: "", contractType: "",
    legalEntityName: "", signatoryPosition: "", signatoryName: "", signatoryNameGenitive: "", basisDocument: "",
    legalAddress: "", physicalAddress: "", ogrn: "",
    settlementAccount: "", correspondentAccount: "", bik: "", bankName: "",
    courierDirection: "", courierSchedule: "",
    ourRequisitesId: "", reportDisplayName: "",
  });

  const handleCreate = async () => {
    if (!newClient.name.trim()) return;
    setSaving(true);
    try {
      // Убираем пустые строки, чтобы не засорять БД
      const payload: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(newClient)) {
        if (val !== "" && val !== undefined) {
          payload[key] = key === "contractDate" ? new Date(val as string).toISOString() : val;
        }
      }
      const res = await authApi("/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewClient(resetClientForm());
        setClientFormSection("basic");
        fetchClients();
      }
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const handleDeactivateClient = async (clientId: string) => {
    if (!confirm("Деактивировать заказчика? Он будет скрыт из списка.")) return;
    try {
      await authApi(`/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      fetchClients();
      setExpandedClient(null);
    } catch (e) { console.error(e); }
  };

  const handleExportClients = (format: "excel" | "pdf") => {
    const headers = ["Название", "Краткое", "Контакт", "Телефон", "Email", "ИНН", "Договор", "Заказов"];
    const rows = clients.map(c => [
      c.name,
      c.shortName || "—",
      c.contactPerson || "—",
      c.phone || "—",
      c.email || "—",
      c.inn || "—",
      c.contractNumber || "—",
      c._count?.orders || 0,
    ]);
    if (format === "excel") exportToExcel("Заказчики", headers, rows);
    else exportToPDF("Заказчики", headers, rows);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader title="Заказчики">
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setPageView("clients")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${pageView === "clients" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  <Building2 className="w-3.5 h-3.5" /> Клиенты
                </button>
                <button
                  onClick={() => { setPageView("contracts"); fetchContracts(); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${pageView === "contracts" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  <FileCheck className="w-3.5 h-3.5" /> Договора
                </button>
              </div>
              {pageView === "clients" && (
                <>
                  <button onClick={() => handleExportClients("excel")} className="btn-secondary flex items-center gap-1.5 text-sm">
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                  <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Новый заказчик
                  </button>
                </>
              )}
            </div>
          </PageHeader>

          {pageView === "clients" && (
          <div className="relative max-w-md mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по названию, ИНН, телефону..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          )}

          {/* CONTRACTS REGISTRY VIEW */}
          {pageView === "contracts" && (
            <div>
              {contractsLoading ? (
                <div className="text-center py-12 text-gray-400">Загрузка...</div>
              ) : contracts.length === 0 ? (
                <div className="card p-12 text-center">
                  <FileCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Нет данных о договорах</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500">
                        <th className="text-left p-3">Клиника</th>
                        <th className="text-left p-3">Юр. лицо</th>
                        <th className="text-left p-3">№ договора</th>
                        <th className="text-left p-3">Дата</th>
                        <th className="text-left p-3">Тип</th>
                        <th className="text-center p-3">Печатный</th>
                        <th className="text-center p-3">Электронный</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contracts.map((c: any) => (
                        <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="p-3 text-sm font-medium">{c.name}</td>
                          <td className="p-3 text-sm text-gray-500">{c.legalEntityName || "—"}</td>
                          <td className="p-3 text-sm font-mono">{c.contractNumber || "—"}</td>
                          <td className="p-3 text-sm text-gray-500">{c.contractDate ? new Date(c.contractDate).toLocaleDateString("ru-RU") : "—"}</td>
                          <td className="p-3 text-sm text-gray-500">{c.contractType || "—"}</td>
                          <td className="p-3 text-center">
                            {c.hasPrinted ? <Check className="w-4 h-4 text-green-600 mx-auto" /> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="p-3 text-center">
                            {c.hasElectronic ? <Check className="w-4 h-4 text-green-600 mx-auto" /> : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* CLIENTS LIST VIEW */}
          {pageView === "clients" && (loading ? (
            <div className="text-center py-12 text-gray-400">Загрузка...</div>
          ) : clients.length === 0 ? (
            <div className="card p-12 text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Заказчиков пока нет</p>
              <button onClick={() => setShowCreateModal(true)} className="btn-primary mt-4">Добавить первого</button>
            </div>
          ) : (
            <div className="space-y-2">
              {clients.map((client) => (
                <div key={client.id} className="card overflow-hidden">
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleExpand(client.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-zetta-100 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-zetta-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{client.shortName || client.name}</h3>
                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-0.5">
                          {client.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.phone}</span>}
                          {client.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{client.email}</span>}
                          {client.contactPerson && <span className="flex items-center gap-1"><User className="w-3 h-3" />{client.contactPerson}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm">
                        <span className="text-gray-500">Заказов: </span>
                        <span className="font-medium">{client._count?.orders || 0}</span>
                      </div>
                      <div className="text-right text-sm">
                        <span className="text-gray-500">Врачей: </span>
                        <span className="font-medium">{client._count?.doctors || 0}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeactivateClient(client.id); }}
                        className="text-gray-400 hover:text-red-500"
                        title="Деактивировать"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {!client.isActive && <span className="badge bg-red-100 text-red-700">Неактивен</span>}
                      {expandedClient === client.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {expandedClient === client.id && (
                    <div className="border-t border-gray-100 bg-gray-50">
                      {/* Info row */}
                      <div className="px-4 pt-4 grid grid-cols-4 gap-4 text-sm">
                        <div><span className="text-gray-500">Полное название:</span><br />{client.name}</div>
                        <div><span className="text-gray-500">ИНН:</span><br />{client.inn || "—"}</div>
                        <div><span className="text-gray-500">Договор:</span><br />{client.contractNumber ? `№${client.contractNumber}` : "—"}</div>
                        <div><span className="text-gray-500">Направление:</span><br />{client.courierDirection || "—"}</div>
                      </div>

                      {/* Tabs */}
                      <div className="px-4 pt-4 flex gap-1 border-b border-gray-200">
                        {([
                          { key: "doctors" as TabType, label: "Врачи", icon: User },
                          { key: "prices" as TabType, label: "Прайс-лист", icon: DollarSign },
                          { key: "stats" as TabType, label: "Статистика", icon: BarChart3 },
                        ]).map(tab => (
                          <button
                            key={tab.key}
                            onClick={() => switchTab(tab.key, client.id)}
                            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                              activeTab === tab.key
                                ? "bg-white text-zetta-600 border border-gray-200 border-b-white -mb-px"
                                : "text-gray-500 hover:text-gray-700"
                            }`}
                          >
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Tab content */}
                      <div className="p-4">
                        {/* Doctors tab */}
                        {activeTab === "doctors" && (
                          <div>
                            {doctors.length === 0 && !showDoctorForm ? (
                              <div className="text-center py-4">
                                <p className="text-sm text-gray-400 mb-2">Врачи не добавлены</p>
                                <button onClick={openDoctorAdd} className="btn-primary text-xs py-1 px-3 inline-flex items-center gap-1">
                                  <Plus className="w-3 h-3" />Добавить врача
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                  {doctors.map((doc) => (
                                    <div key={doc.id} className="bg-white rounded-lg p-3 text-sm flex items-start justify-between group">
                                      <div>
                                        <p className="font-medium">{doc.lastName} {doc.firstName} {doc.middleName || ""}</p>
                                        {doc.specialization && <p className="text-gray-500 text-xs">{doc.specialization}</p>}
                                        {doc.phone && <p className="text-gray-400 text-xs">{doc.phone}</p>}
                                      </div>
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => openDoctorEdit(doc)} className="text-gray-400 hover:text-zetta-600 p-1">
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => handleDeleteDoctor(client.id, doc.id)} className="text-gray-400 hover:text-red-500 p-1">
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {!showDoctorForm && (
                                  <button onClick={openDoctorAdd} className="text-sm text-zetta-600 hover:text-zetta-700 flex items-center gap-1">
                                    <Plus className="w-3.5 h-3.5" />Добавить врача
                                  </button>
                                )}
                              </>
                            )}

                            {showDoctorForm && (
                              <div className="bg-white rounded-lg p-4 border border-gray-200 mt-2">
                                <h4 className="text-sm font-medium mb-3">{editingDoctor ? "Редактировать врача" : "Новый врач"}</h4>
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                  <input placeholder="Фамилия *" value={doctorForm.lastName} onChange={e => setDoctorForm(p => ({...p, lastName: e.target.value}))} className="input-field text-sm" />
                                  <input placeholder="Имя *" value={doctorForm.firstName} onChange={e => setDoctorForm(p => ({...p, firstName: e.target.value}))} className="input-field text-sm" />
                                  <input placeholder="Отчество" value={doctorForm.patronymic} onChange={e => setDoctorForm(p => ({...p, patronymic: e.target.value}))} className="input-field text-sm" />
                                </div>
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                  <input placeholder="Телефон" value={doctorForm.phone} onChange={e => setDoctorForm(p => ({...p, phone: e.target.value}))} className="input-field text-sm" />
                                  <input placeholder="Специализация" value={doctorForm.specialty} onChange={e => setDoctorForm(p => ({...p, specialty: e.target.value}))} className="input-field text-sm" />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleSaveDoctor(client.id)} disabled={!doctorForm.firstName || !doctorForm.lastName} className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50">
                                    {editingDoctor ? "Сохранить" : "Добавить"}
                                  </button>
                                  <button onClick={() => setShowDoctorForm(false)} className="btn-secondary text-xs py-1.5 px-3">Отмена</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Prices tab */}
                        {activeTab === "prices" && (
                          <div>
                            {prices.length > 0 && (
                              <table className="w-full text-sm mb-4">
                                <thead>
                                  <tr className="text-left text-gray-500 text-xs border-b">
                                    <th className="pb-2">Код</th>
                                    <th className="pb-2">Работа</th>
                                    <th className="pb-2 text-right">Базовая цена</th>
                                    <th className="pb-2 text-right">Цена клиента</th>
                                    <th className="pb-2 text-right">Разница</th>
                                    <th className="pb-2"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {prices.map((p) => {
                                    const diff = Number(p.price) - Number(p.workItem.basePrice);
                                    return (
                                      <tr key={p.id} className="border-b border-gray-100">
                                        <td className="py-2 text-gray-500">{p.workItem.code}</td>
                                        <td className="py-2">{p.workItem.name}</td>
                                        <td className="py-2 text-right text-gray-500">{fmt(Number(p.workItem.basePrice))}</td>
                                        <td className="py-2 text-right font-medium">{fmt(Number(p.price))}</td>
                                        <td className={`py-2 text-right ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-gray-400"}`}>
                                          {diff > 0 ? "+" : ""}{fmt(diff)}
                                        </td>
                                        <td className="py-2 text-right">
                                          <button
                                            onClick={() => handleDeletePrice(client.id, p.workItem.id)}
                                            className="text-gray-400 hover:text-red-500"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}

                            {/* Add price form */}
                            <div className="flex items-center gap-2">
                              <select
                                value={selectedWorkItem}
                                onChange={(e) => setSelectedWorkItem(e.target.value)}
                                className="input-field flex-1"
                              >
                                <option value="">Выберите работу...</option>
                                {workItems
                                  .filter(w => !prices.some(p => p.workItem.id === w.id))
                                  .map(w => (
                                    <option key={w.id} value={w.id}>{w.code} — {w.name} (базовая: {fmt(Number(w.basePrice))})</option>
                                  ))
                                }
                              </select>
                              <input
                                type="number"
                                placeholder="Цена"
                                value={newPrice}
                                onChange={(e) => setNewPrice(e.target.value)}
                                className="input-field w-32"
                              />
                              <button
                                onClick={() => handleAddPrice(client.id)}
                                disabled={!selectedWorkItem || !newPrice}
                                className="btn-primary flex items-center gap-1 disabled:opacity-50"
                              >
                                <Save className="w-4 h-4" />
                                Добавить
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Stats tab */}
                        {activeTab === "stats" && (
                          stats ? (
                            <div className="grid grid-cols-3 gap-4">
                              <div className="bg-white rounded-lg p-4">
                                <p className="text-xs text-gray-500 mb-1">Всего заказов</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.totalOrders}</p>
                              </div>
                              <div className="bg-white rounded-lg p-4">
                                <p className="text-xs text-gray-500 mb-1">Общая сумма</p>
                                <p className="text-2xl font-bold text-gray-900">{fmt(stats.totalRevenue)}</p>
                                <p className="text-xs text-gray-400">руб.</p>
                              </div>
                              <div className="bg-white rounded-lg p-4">
                                <p className="text-xs text-gray-500 mb-1">Оплачено</p>
                                <p className="text-2xl font-bold text-green-600">{fmt(stats.totalPaid)}</p>
                                <p className="text-xs text-gray-400">руб.</p>
                              </div>
                              <div className="bg-white rounded-lg p-4">
                                <p className="text-xs text-gray-500 mb-1">Баланс</p>
                                <p className={`text-2xl font-bold ${stats.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {stats.balance >= 0 ? "+" : ""}{fmt(stats.balance)}
                                </p>
                                <p className="text-xs text-gray-400">руб.</p>
                              </div>
                              <div className="bg-white rounded-lg p-4">
                                <p className="text-xs text-gray-500 mb-1">Неоплаченных счетов</p>
                                <p className="text-2xl font-bold text-orange-500">{stats.unpaidInvoicesCount}</p>
                                <p className="text-xs text-gray-400">на {fmt(stats.unpaidInvoicesAmount)} руб.</p>
                              </div>
                              <div className="bg-white rounded-lg p-4 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-gray-300 mr-2" />
                                <span className="text-sm text-gray-400">Детальные отчёты</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-4 text-gray-400">Загрузка...</div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto py-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 my-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Новый заказчик</h2>
                <button onClick={() => { setShowCreateModal(false); setClientFormSection("basic"); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>

              {/* Section tabs */}
              <div className="flex gap-1 border-b border-gray-200 mb-4 text-sm">
                {([
                  { key: "basic" as const, label: "Основное" },
                  { key: "legal" as const, label: "Юр. данные" },
                  { key: "bank" as const, label: "Банк" },
                  { key: "courier" as const, label: "Логистика" },
                  { key: "docs" as const, label: "Документы" },
                ]).map(s => (
                  <button
                    key={s.key}
                    onClick={() => setClientFormSection(s.key)}
                    className={`px-3 py-2 rounded-t-lg transition-colors ${
                      clientFormSection === s.key
                        ? "bg-white text-zetta-600 border border-gray-200 border-b-white -mb-px font-medium"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3 max-h-[60vh] overflow-auto">
                {/* BASIC */}
                {clientFormSection === "basic" && (
                  <>
                    <input placeholder="Название (полное) *" value={newClient.name} onChange={e => setNewClient(p => ({...p, name: e.target.value}))} className="input-field" />
                    <div className="grid grid-cols-2 gap-3">
                      <input placeholder="Краткое название" value={newClient.shortName} onChange={e => setNewClient(p => ({...p, shortName: e.target.value}))} className="input-field" />
                      <input placeholder="Инд. код" value={newClient.individualCode} onChange={e => setNewClient(p => ({...p, individualCode: e.target.value}))} className="input-field" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input placeholder="Телефон" value={newClient.phone} onChange={e => setNewClient(p => ({...p, phone: e.target.value}))} className="input-field" />
                      <input placeholder="Email" value={newClient.email} onChange={e => setNewClient(p => ({...p, email: e.target.value}))} className="input-field" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input placeholder="Контактное лицо" value={newClient.contactPerson} onChange={e => setNewClient(p => ({...p, contactPerson: e.target.value}))} className="input-field" />
                      <input placeholder="Адрес" value={newClient.address} onChange={e => setNewClient(p => ({...p, address: e.target.value}))} className="input-field" />
                    </div>
                  </>
                )}

                {/* LEGAL */}
                {clientFormSection === "legal" && (
                  <>
                    <input placeholder="Юр. лицо (ООО/ИП...)" value={newClient.legalEntityName} onChange={e => setNewClient(p => ({...p, legalEntityName: e.target.value}))} className="input-field" />
                    <div className="grid grid-cols-3 gap-3">
                      <input placeholder="ИНН" value={newClient.inn} onChange={e => setNewClient(p => ({...p, inn: e.target.value}))} className="input-field" />
                      <input placeholder="КПП" value={newClient.kpp} onChange={e => setNewClient(p => ({...p, kpp: e.target.value}))} className="input-field" />
                      <input placeholder="ОГРН" value={newClient.ogrn} onChange={e => setNewClient(p => ({...p, ogrn: e.target.value}))} className="input-field" />
                    </div>
                    <input placeholder="Юридический адрес" value={newClient.legalAddress} onChange={e => setNewClient(p => ({...p, legalAddress: e.target.value}))} className="input-field" />
                    <input placeholder="Фактический адрес" value={newClient.physicalAddress} onChange={e => setNewClient(p => ({...p, physicalAddress: e.target.value}))} className="input-field" />
                    <div className="grid grid-cols-2 gap-3">
                      <input placeholder="Должность руководителя" value={newClient.signatoryPosition} onChange={e => setNewClient(p => ({...p, signatoryPosition: e.target.value}))} className="input-field" />
                      <input placeholder="ФИО руководителя" value={newClient.signatoryName} onChange={e => setNewClient(p => ({...p, signatoryName: e.target.value}))} className="input-field" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input placeholder="ФИО (род. падеж)" value={newClient.signatoryNameGenitive} onChange={e => setNewClient(p => ({...p, signatoryNameGenitive: e.target.value}))} className="input-field" />
                      <input placeholder='Основание ("устава")' value={newClient.basisDocument} onChange={e => setNewClient(p => ({...p, basisDocument: e.target.value}))} className="input-field" />
                    </div>
                  </>
                )}

                {/* BANK */}
                {clientFormSection === "bank" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <input placeholder="Расчётный счёт" value={newClient.settlementAccount} onChange={e => setNewClient(p => ({...p, settlementAccount: e.target.value}))} className="input-field" />
                      <input placeholder="Корр. счёт" value={newClient.correspondentAccount} onChange={e => setNewClient(p => ({...p, correspondentAccount: e.target.value}))} className="input-field" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input placeholder="БИК" value={newClient.bik} onChange={e => setNewClient(p => ({...p, bik: e.target.value}))} className="input-field" />
                      <input placeholder="Банк" value={newClient.bankName} onChange={e => setNewClient(p => ({...p, bankName: e.target.value}))} className="input-field" />
                    </div>
                  </>
                )}

                {/* COURIER */}
                {clientFormSection === "courier" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <select value={newClient.courierDirection} onChange={e => setNewClient(p => ({...p, courierDirection: e.target.value}))} className="input-field">
                        <option value="">— Направление —</option>
                        {courierDirectionOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
                      </select>
                      <input placeholder="График курьера" value={newClient.courierSchedule} onChange={e => setNewClient(p => ({...p, courierSchedule: e.target.value}))} className="input-field" />
                    </div>
                  </>
                )}

                {/* DOCS */}
                {clientFormSection === "docs" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <input placeholder="№ договора" value={newClient.contractNumber} onChange={e => setNewClient(p => ({...p, contractNumber: e.target.value}))} className="input-field" />
                      <input type="date" placeholder="Дата договора" value={newClient.contractDate} onChange={e => setNewClient(p => ({...p, contractDate: e.target.value}))} className="input-field" />
                    </div>
                    <select value={newClient.contractType} onChange={e => setNewClient(p => ({...p, contractType: e.target.value}))} className="input-field">
                      <option value="">— Тип договора —</option>
                      {contractTypeOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
                    </select>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Наши реквизиты для документов</label>
                      <select
                        value={newClient.ourRequisitesId}
                        onChange={e => setNewClient(p => ({...p, ourRequisitesId: e.target.value}))}
                        className="input-field"
                      >
                        <option value="">По умолчанию</option>
                        {orgRequisites.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.shortName || r.name}{r.isDefault ? " (по умолчанию)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input placeholder="Как писать в отчёте" value={newClient.reportDisplayName} onChange={e => setNewClient(p => ({...p, reportDisplayName: e.target.value}))} className="input-field" />
                  </>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button onClick={() => { setShowCreateModal(false); setClientFormSection("basic"); }} className="btn-secondary">Отмена</button>
                <button onClick={handleCreate} disabled={saving || !newClient.name.trim()} className="btn-primary disabled:opacity-50">
                  {saving ? "Сохранение..." : "Создать"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
