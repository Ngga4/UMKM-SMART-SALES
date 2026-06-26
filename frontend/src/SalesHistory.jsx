import { useState, useMemo, useEffect } from "react";
import {
  Download,
  Calendar,
  Trash2,
  Filter,
  FileSpreadsheet,
  Clock,
  Pencil,
  X,
  Check,
  Plus,
  Minus,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import "./SalesHistory.css";
import { createPortal } from "react-dom";

/* ----------------------------------------------------------------
   Constants
   ---------------------------------------------------------------- */
const HISTORY_API_URL = "http://localhost:8000/api/history";
const ANALYZE_HISTORY_API_URL = "http://localhost:8000/api/analyze-history";

const PERIOD_FILTERS = [
  { key: "daily", label: "Hari Ini", icon: Clock },
  { key: "monthly", label: "Bulan Ini", icon: Calendar },
  { key: "yearly", label: "Tahun Ini", icon: Filter },
];

/* ----------------------------------------------------------------
   Helpers
   ---------------------------------------------------------------- */
function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isSameMonth(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth()
  );
}

function isSameYear(d1, d2) {
  return d1.getFullYear() === d2.getFullYear();
}

function filterByPeriod(records, period) {
  const now = new Date();
  return records.filter((r) => {
    const d = new Date(r.date);
    if (period === "daily") return isSameDay(d, now);
    if (period === "monthly") return isSameMonth(d, now);
    return isSameYear(d, now);
  });
}

function aggregateItems(records) {
  const map = new Map();
  for (const record of records) {
    for (const item of record.salesData) {
      const key = `${item.item}__${item.unit}`;
      if (map.has(key)) {
        const existing = map.get(key);
        existing.quantity += item.quantity;
        existing.entries += 1;
        existing.price = (existing.price || 0) + (item.price || 0);
      } else {
        map.set(key, {
          item: item.item,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price || 0,
          entries: 1,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.item.localeCompare(b.item, "id")
  );
}

function buildCSVRows(records) {
  const rows = [["No", "Tanggal", "Nama Barang", "Jumlah", "Satuan"]];
  let idx = 1;
  for (const record of records) {
    const dateStr = new Date(record.date).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    for (const item of record.salesData) {
      rows.push([idx++, dateStr, item.item, item.quantity, item.unit]);
    }
  }
  return rows;
}

function downloadCSV(rows, filename) {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell);
          return str.includes(",") || str.includes('"')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    )
    .join("\n");

  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getFilename(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");

  if (period === "daily") return `laporan-penjualan-harian-${y}-${m}-${d}.csv`;
  if (period === "monthly") return `laporan-penjualan-bulanan-${y}-${m}.csv`;
  return `laporan-penjualan-tahunan-${y}.csv`;
}

function getPeriodLabel(period) {
  const now = new Date();
  if (period === "daily")
    return now.toLocaleDateString("id-ID", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  if (period === "monthly")
    return now.toLocaleDateString("id-ID", {
      year: "numeric",
      month: "long",
    });
  return String(now.getFullYear());
}

function formatRupiah(number){
  return new Intl.NumberFormat("id-ID",{
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0
  }).format(number || 0);
}

/* ----------------------------------------------------------------
   Edit Modal Component
   ---------------------------------------------------------------- */
function EditModal({ record, onClose, onSave, guestId, token }) {
  const [items, setItems] = useState(
    record.salesData.map((item) => ({ ...item }))
  );
  const [saving, setSaving] = useState(false);

  function updateItem(index, field, value) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, [field]: field === "quantity" ? parseFloat(value) || 0 : value }
          : item
      )
    );
  }

  function addItem() {
    setItems((prev) => [...prev, { item: "", quantity: 0, unit: "pcs" }]);
  }

  function removeItem(index) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const validItems = items.filter((i) => i.item.trim() !== "");
    if (validItems.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch(`${HISTORY_API_URL}/${record.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : { "X-Session-ID": guestId })
        },
        body: JSON.stringify({ items: validItems }),
      });
      if (res.ok) {
        onSave();
        onClose();
      }
    } catch (err) {
      console.error("Failed to update record:", err);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Catatan Penjualan</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-date">
          {new Date(record.date).toLocaleDateString("id-ID", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>

        <div className="modal-items">
          {items.map((item, i) => (
            <div key={i} className="modal-item-row">
              <span className="modal-item-num">{i + 1}</span>
              <input
                className="modal-input modal-input--name"
                type="text"
                placeholder="Nama barang"
                value={item.item}
                onChange={(e) => updateItem(i, "item", e.target.value)}
              />
              <input
                className="modal-input modal-input--qty"
                type="number"
                placeholder="Jumlah"
                value={item.quantity}
                onChange={(e) => updateItem(i, "quantity", e.target.value)}
                min="0"
                step="any"
              />
              <input
                className="modal-input modal-input--unit"
                type="text"
                placeholder="Satuan"
                value={item.unit}
                onChange={(e) => updateItem(i, "unit", e.target.value)}
              />
              <input 
              className="modal-input"
              type="text" 
              placeholder="Harga (Rp)"
              value={item.price || ""}
              onChange={(e) => updateItem(i, "price", parseFloat(e.target.value) || 0)}
              min="0"
              />
              <button
                className="modal-remove-btn"
                onClick={() => removeItem(i)}
                disabled={items.length <= 1}
                title="Hapus item"
              >
                <Minus size={14} />
              </button>
            </div>
          ))}
        </div>

        <button className="modal-add-btn" onClick={addItem}>
          <Plus size={14} />
          Tambah Barang
        </button>

        <div className="modal-actions">
          <button className="modal-cancel-btn" onClick={onClose}>
            Batal
          </button>
          <button
            className="modal-save-btn"
            onClick={handleSave}
            disabled={saving || items.every((i) => !i.item.trim())}
          >
            <Check size={16} />
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ----------------------------------------------------------------
   SalesHistory Component
   ---------------------------------------------------------------- */
export default function SalesHistory({ history, guestId, token, onClearHistory, onRefresh }) {
  const [activePeriod, setActivePeriod] = useState("daily");
  const [editingRecord, setEditingRecord] = useState(null);
  const [isAnalyzingHistory, setIsAnalyzingHistory] = useState(false);
  const [historyAdvice, setHistoryAdvice] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Clear advice when active period changes
  useEffect(() => {
    setHistoryAdvice(null);
  }, [activePeriod]);

  const filtered = useMemo(
    () => filterByPeriod(history, activePeriod),
    [history, activePeriod]
  );

  const aggregated = useMemo(() => aggregateItems(filtered), [filtered]);

  const totalQuantity = aggregated.reduce((s, i) => s + i.quantity, 0);

  function handleDownload() {
    if (filtered.length === 0) return;
    const rows = buildCSVRows(filtered);
    downloadCSV(rows, getFilename(activePeriod));
  }

  function handleClear() {
    setConfirmDialog({ type: "all" });
  }

  async function handleDeleteSingle(recordId) {
    setConfirmDialog({ type: "single", id: recordId });
  }

  async function executeDelete(){
    if(confirmDialog.type === "all"){
      onClearHistory();
    }else if (confirmDialog.type === "single"){
      try{
        const res = await fetch(`${HISTORY_API_URL}/${confirmDialog.id}`,{
          method: "DELETE",
          headers: token? {
            "Authorization" : `Bearer ${token}`
          } : { "X-Session-ID" : guestId}
        });
        if(res.ok) onRefresh();
      } catch (err){
        console.error("Gagal menghapus: ", err);
      }
    }
    setConfirmDialog(null);
  }

  async function handleAnalyzeHistory() {
    if (aggregated.length === 0) return;
    setIsAnalyzingHistory(true);
    setHistoryAdvice(null);
    try {
      const res = await fetch(ANALYZE_HISTORY_API_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : { "X-Session-ID": guestId })
        },
        body: JSON.stringify({
          period_label: getPeriodLabel(activePeriod),
          items: aggregated,
        }),
      });
      if (!res.ok) throw new Error("Gagal mengambil saran AI");
      const data = await res.json();
      setHistoryAdvice(data.business_advice);
    } catch (err) {
      console.error(err);
      alert("Maaf, terjadi kesalahan saat menghubungi AI.");
    } finally {
      setIsAnalyzingHistory(false);
    }
  }

  if (history.length === 0) return null;

  return (
    <section className="history-section" id="history-section">
      {/* Edit Modal */}
      {editingRecord && (
        <EditModal
          record={editingRecord}
          guestId={guestId}
          token={token}
          onClose={() => setEditingRecord(null)}
          onSave={onRefresh}
        />
      )}

      <div className="history-header">
        <div className="history-title-row">
          <FileSpreadsheet size={24} />
          <h2>Riwayat Penjualan</h2>
        </div>
        <p className="history-subtitle">
          Data tersimpan di database dengan total{" "}
          <strong>{history.length} catatan</strong>
        </p>
      </div>

      {/* --- Period Filter Tabs --- */}
      <div className="period-tabs">
        {PERIOD_FILTERS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`period-tab${activePeriod === key ? " period-tab--active" : ""}`}
            onClick={() => setActivePeriod(key)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* --- Period Info --- */}
      <div className="period-info">
        <span className="period-label">{getPeriodLabel(activePeriod)}</span>
        <span className="period-count">
          {filtered.length} catatan · {aggregated.length} jenis barang
        </span>
      </div>


      {/* --- Aggregated Table --- */}
      {aggregated.length > 0 ? (
        <div className="history-table-card">
          <table className="history-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Barang</th>
                <th>Total Jumlah</th>
                <th>Satuan</th>
                <th>Harga</th>
              </tr>
            </thead>
            <tbody>
              {aggregated.map((row, i) => (
                <tr key={`${row.item}-${row.unit}`}>
                  <td className="row-number">{i + 1}</td>
                  <td className="item-name">{row.item}</td>
                  <td className="item-quantity">{row.quantity}</td>
                  <td className="item-unit">{row.unit}</td>
                  <td className="item-price">{formatRupiah(row.price) || 0 }</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="total-label">
                  Total Kuantitas
                </td>
                <td className="total-value">{totalQuantity}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="history-empty">
          <p>Belum ada data penjualan untuk periode ini.</p>
        </div>
      )}

      {/* --- AI History Advice --- */}
      {isAnalyzingHistory && (
        <div className="history-ai-card history-ai-card--loading">
          <div className="loading-orb" style={{ width: 24, height: 24 }} />
          <p><strong>Groq AI</strong> sedang menganalisis pola penjualan {getPeriodLabel(activePeriod)}...</p>
        </div>
      )}
      {historyAdvice && !isAnalyzingHistory && (
        <div className="history-ai-card">
          <div className="history-ai-header">
            <Lightbulb size={20} className="history-ai-icon" />
            <h3>Insight & Saran Bisnis (Periode Ini)</h3>
          </div>
          <div className="history-ai-content">{historyAdvice}</div>
        </div>
      )}
      {/* --- Individual Records --- */}
      {filtered.length > 0 && (
        <div className="records-list">
          <h3 className="records-title">Detail Per Catatan</h3>
          {filtered.map((record) => (
            <div key={record.id} className="record-card">
              <div className="record-header">
                <span className="record-date">
                  {new Date(record.date).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <div className="record-actions">
                  <button
                    className="record-edit-btn"
                    onClick={() => setEditingRecord(record)}
                    title="Edit catatan"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="record-delete-btn"
                    onClick={() => handleDeleteSingle(record.id)}
                    title="Hapus catatan"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="record-items">
                {record.salesData.map((item, i) => (
                  <span key={i} className="record-item-tag">
                    {item.item}  {item.quantity} {item.unit}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- Action Buttons --- */}
      <div className="history-actions">
        <button
          className="ai-analyze-btn"
          onClick={handleAnalyzeHistory}
          disabled={filtered.length === 0 || isAnalyzingHistory}
        >
          <Sparkles size={16} />
          Analisis dengan AI
        </button>
        <button
          className="download-btn"
          onClick={handleDownload}
          disabled={filtered.length === 0}
        >
          <Download size={16} />
          Download CSV
        </button>
        <button className="clear-btn" onClick={handleClear}>
          <Trash2 size={16} />
          Hapus Semua Riwayat
        </button>
      </div>

      {/* Konfirmasi Hapus melayang */}
      {confirmDialog && createPortal(
        <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: "400px", textAlign: "center"}}>
            <h3 style={{marginBottom: "1rem"}}>Konfirmasi Hapus</h3>
            <p style={{color: "var(--color-text-secondary", marginBottom: "2rem"}}>
              {confirmDialog.type === "all"
              ? "Apakah anda yakin ingin menghapus SELURUH riwayat penjualan ini? Data yang dihapus tidak bisa dikembalikan"
              : "Apakah anda yakin ingin menghapus catatan penjualan ini?"}
            </p>
            <div style={{display: "flex", gap: "1rem", justifyContent: "center"}}>
              <button 
                className="modal-cancel-btn"
                onClick={()=>setConfirmDialog(null)}>
                  Batal
              </button>
              <button
                className="modal-save-btn"
                onClick={executeDelete}>
                Ya, Hapus Data
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
