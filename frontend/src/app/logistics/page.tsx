"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authApi, getToken } from "@/lib/api";
import { Truck, Plus, CheckCircle2, MapPin, Package, X, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/ui";

interface Stop {
  clientId: string;
  clientName: string;
  type: "pickup" | "delivery";
  orderIds: string[];
  address?: string;
  completed: boolean;
  notes?: string;
}

interface CourierRoute {
  id: string;
  courierId: string;
  date: string;
  stops: Stop[];
  notes: string | null;
  courier: { id: string; firstName: string; lastName: string; phone: string | null };
}

interface Courier {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

interface PendingOrder {
  id: string;
  orderNumber: string;
  status: string;
  client: { id: string; name: string; shortName: string | null; address: string | null };
  patient: { firstName: string; lastName: string } | null;
  dueDate: string | null;
  isUrgent: boolean;
}

export default function LogisticsPage() {
  const router = useRouter();
  const [routes, setRoutes] = useState<CourierRoute[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create form state
  const [newRoute, setNewRoute] = useState({ courierId: "", date: "", notes: "" });
  const [newStops, setNewStops] = useState<Stop[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authApi(`/logistics/routes?date=${selectedDate}`);
      if (res.ok) {
        const d = await res.json();
        setRoutes(d.data || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [selectedDate]);

  const fetchCouriers = useCallback(async () => {
    try {
      const res = await authApi("/logistics/couriers");
      if (res.ok) {
        const d = await res.json();
        setCouriers(d.data || []);
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);
  useEffect(() => { fetchCouriers(); }, [fetchCouriers]);

  const fetchPendingOrders = async (type: string) => {
    try {
      const res = await authApi(`/logistics/pending-orders?type=${type}`);
      if (res.ok) {
        const d = await res.json();
        setPendingOrders(d.data || []);
      }
    } catch (e) { console.error(e); }
  };

  const openCreateModal = () => {
    setNewRoute({ courierId: couriers[0]?.id || "", date: selectedDate, notes: "" });
    setNewStops([]);
    setPendingOrders([]);
    setShowCreateModal(true);
    fetchPendingOrders("pickup");
  };

  const addStop = (order: PendingOrder, type: "pickup" | "delivery") => {
    // Check if client already has a stop
    const existingIdx = newStops.findIndex(s => s.clientId === order.client.id && s.type === type);
    if (existingIdx >= 0) {
      const updated = [...newStops];
      if (!updated[existingIdx].orderIds.includes(order.id)) {
        updated[existingIdx].orderIds.push(order.id);
      }
      setNewStops(updated);
    } else {
      setNewStops([...newStops, {
        clientId: order.client.id,
        clientName: order.client.shortName || order.client.name,
        type,
        orderIds: [order.id],
        address: order.client.address || "",
        completed: false,
      }]);
    }
  };

  const removeStop = (idx: number) => {
    setNewStops(newStops.filter((_, i) => i !== idx));
  };

  const handleCreate = async () => {
    if (!newRoute.courierId || newStops.length === 0) return;
    setSaving(true);
    try {
      const res = await authApi("/logistics/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courierId: newRoute.courierId,
          date: newRoute.date,
          stops: newStops,
          notes: newRoute.notes || undefined,
        }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        fetchRoutes();
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const toggleStop = async (routeId: string, stopIndex: number, completed: boolean) => {
    try {
      const res = await authApi(`/logistics/routes/${routeId}/stop`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopIndex, completed }),
      });
      if (res.ok) {
        fetchRoutes();
      }
    } catch (e) { console.error(e); }
  };

  const completedStops = (route: CourierRoute) => route.stops.filter(s => s.completed).length;

  // Date navigation
  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  // Delivery stats: aggregate current routes
  const deliveryStats = (() => {
    const courierMap = new Map<string, { name: string; routes: number; stops: number; completed: number }>();
    routes.forEach(r => {
      const key = r.courierId;
      const existing = courierMap.get(key) || { name: `${r.courier.lastName} ${r.courier.firstName}`, routes: 0, stops: 0, completed: 0 };
      existing.routes += 1;
      existing.stops += r.stops.length;
      existing.completed += r.stops.filter(s => s.completed).length;
      courierMap.set(key, existing);
    });
    return Array.from(courierMap.values());
  })();

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader title="Логистика" actions={
            <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Новый маршрут
            </button>
          } />

          {/* Date selector */}
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => changeDate(-1)} className="btn-secondary text-sm px-3 py-1.5">← Вчера</button>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="input-field w-48" />
            <button onClick={() => changeDate(1)} className="btn-secondary text-sm px-3 py-1.5">Завтра →</button>
            <span className="text-sm text-gray-500 capitalize">{formatDate(selectedDate)}</span>
          </div>

          {/* Delivery stats widget */}
          {deliveryStats.length > 0 && (
            <div className="card p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-medium text-gray-700">Статистика доставок за день</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left py-2 px-3">Курьер</th>
                      <th className="text-center py-2 px-3">Маршрутов</th>
                      <th className="text-center py-2 px-3">Остановок</th>
                      <th className="text-center py-2 px-3">Завершено</th>
                      <th className="text-center py-2 px-3">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveryStats.map((s, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 px-3 font-medium">{s.name}</td>
                        <td className="py-2 px-3 text-center">{s.routes}</td>
                        <td className="py-2 px-3 text-center">{s.stops}</td>
                        <td className="py-2 px-3 text-center text-green-600 font-medium">{s.completed}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            s.stops === 0 ? "bg-gray-100 text-gray-500" :
                            s.completed === s.stops ? "bg-green-100 text-green-700" :
                            "bg-yellow-100 text-yellow-700"
                          }`}>
                            {s.stops > 0 ? Math.round((s.completed / s.stops) * 100) : 0}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-400">Загрузка...</div>
          ) : routes.length === 0 ? (
            <div className="card p-12 text-center">
              <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-2">Маршрутов на {formatDate(selectedDate)} нет</p>
              <button onClick={openCreateModal} className="btn-primary mt-2">Создать маршрут</button>
            </div>
          ) : (
            <div className="space-y-3">
              {routes.map(route => (
                <div key={route.id} className="card overflow-hidden">
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedRoute(expandedRoute === route.id ? null : route.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                        completedStops(route) === route.stops.length ? "bg-green-500" : "bg-zetta-500"
                      }`}>
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{route.courier.lastName} {route.courier.firstName}</p>
                        <p className="text-xs text-gray-500">
                          {route.courier.phone && <span>{route.courier.phone} · </span>}
                          {route.stops.length} {route.stops.length === 1 ? "остановка" : route.stops.length < 5 ? "остановки" : "остановок"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm">
                        <span className="font-medium text-green-600">{completedStops(route)}</span>
                        <span className="text-gray-400"> / {route.stops.length}</span>
                      </div>
                      {completedStops(route) === route.stops.length ? (
                        <span className="badge bg-green-100 text-green-700">Завершён</span>
                      ) : (
                        <span className="badge bg-yellow-100 text-yellow-700">В пути</span>
                      )}
                      {expandedRoute === route.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {expandedRoute === route.id && (
                    <div className="border-t border-gray-100 bg-gray-50 p-4">
                      <div className="space-y-2">
                        {route.stops.map((stop, idx) => (
                          <div key={idx} className={`bg-white rounded-lg p-3 flex items-center gap-3 ${stop.completed ? "opacity-60" : ""}`}>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleStop(route.id, idx, !stop.completed); }}
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                stop.completed ? "border-green-500 bg-green-500" : "border-gray-300 hover:border-zetta-500"
                              }`}
                            >
                              {stop.completed && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </button>
                            <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${
                              stop.type === "pickup" ? "bg-blue-100" : "bg-orange-100"
                            }`}>
                              {stop.type === "pickup" ? <Package className="w-3.5 h-3.5 text-blue-600" /> : <MapPin className="w-3.5 h-3.5 text-orange-600" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">{stop.clientName}</p>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  stop.type === "pickup" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                                }`}>
                                  {stop.type === "pickup" ? "Забор" : "Доставка"}
                                </span>
                              </div>
                              {stop.address && <p className="text-xs text-gray-400">{stop.address}</p>}
                              {stop.orderIds.length > 0 && (
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Нарядов: {stop.orderIds.length}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {route.notes && (
                        <p className="text-sm text-gray-500 mt-3 italic">{route.notes}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Новый маршрут</h2>
                <button onClick={() => setShowCreateModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Курьер *</label>
                    <select
                      value={newRoute.courierId}
                      onChange={(e) => setNewRoute(p => ({ ...p, courierId: e.target.value }))}
                      className="input-field"
                    >
                      <option value="">Выберите курьера</option>
                      {couriers.map(c => (
                        <option key={c.id} value={c.id}>{c.lastName} {c.firstName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Дата *</label>
                    <input
                      type="date"
                      value={newRoute.date}
                      onChange={(e) => setNewRoute(p => ({ ...p, date: e.target.value }))}
                      className="input-field"
                    />
                  </div>
                </div>

                <input
                  placeholder="Заметки к маршруту"
                  value={newRoute.notes}
                  onChange={(e) => setNewRoute(p => ({ ...p, notes: e.target.value }))}
                  className="input-field"
                />

                {/* Stops list */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Остановки ({newStops.length})</h3>
                  {newStops.length === 0 ? (
                    <p className="text-sm text-gray-400">Добавьте остановки из списка нарядов ниже</p>
                  ) : (
                    <div className="space-y-2 mb-3">
                      {newStops.map((stop, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            stop.type === "pickup" ? "bg-blue-100 text-blue-600" : "bg-orange-100 text-orange-600"
                          }`}>
                            {stop.type === "pickup" ? "Забор" : "Доставка"}
                          </span>
                          <span className="text-sm flex-1">{stop.clientName}</span>
                          <span className="text-xs text-gray-400">{stop.orderIds.length} нарядов</span>
                          <button onClick={() => removeStop(idx)} className="text-red-400 hover:text-red-600">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pending orders */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-medium text-gray-700">Наряды для включения</h3>
                    <button
                      onClick={() => fetchPendingOrders("pickup")}
                      className="text-xs text-zetta-600 hover:underline"
                    >
                      Забор (новые)
                    </button>
                    <button
                      onClick={() => fetchPendingOrders("delivery")}
                      className="text-xs text-orange-600 hover:underline"
                    >
                      Доставка (готовые)
                    </button>
                  </div>
                  {pendingOrders.length === 0 ? (
                    <p className="text-sm text-gray-400">Нет нарядов</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-auto">
                      {pendingOrders.map(order => (
                        <div key={order.id} className="flex items-center gap-2 text-sm bg-white border rounded-lg p-2">
                          <span className="font-mono text-zetta-600">{order.orderNumber}</span>
                          <span className="flex-1 text-gray-600 truncate">{order.client.shortName || order.client.name}</span>
                          {order.isUrgent && <span className="text-xs bg-red-100 text-red-600 px-1 rounded">Срочный</span>}
                          <button
                            onClick={() => addStop(order, order.status === "READY" ? "delivery" : "pickup")}
                            className="text-xs text-zetta-600 hover:underline"
                          >
                            + Добавить
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowCreateModal(false)} className="btn-secondary">Отмена</button>
                <button
                  onClick={handleCreate}
                  disabled={saving || !newRoute.courierId || newStops.length === 0}
                  className="btn-primary disabled:opacity-50"
                >
                  {saving ? "Сохранение..." : "Создать маршрут"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
