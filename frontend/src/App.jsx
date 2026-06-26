import { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Sparkles,
  Send,
  BarChart3,
  ClipboardList,
  Lightbulb,
  AlertTriangle,
  ShoppingBag,
  PenLine,
  Mic,
  MicOff,
  Sun,
  Moon,
  UserCircle,
  LogOut,
  Store
} from "lucide-react";
import SalesHistory from "./SalesHistory";
import AuthModal from "./AuthModal";
import "./App.css";

/* ----------------------------------------------------------------
   Constants
   ---------------------------------------------------------------- */
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const API_URL = `${BASE_URL}/api/analyze`;
const HISTORY_API_URL = `${BASE_URL}/api/history`;
const CHART_COLORS = [
  "#f97316",
  "#ea580c",
  "#fb923c",
  "#22c55e",
  "#fbbf24",
  "#f43f5e",
  "#14b8a6",
  "#a855f7",
];

const PLACEHOLDER_TEXT =
  'Contoh: "Hari ini warung rame banget, laku beras 5 kilo, kopi saset 10 bungkus, sama telur ayam 2 kilo, minyak goreng 3 liter, dan gula pasir 4 kilo"';

/* ----------------------------------------------------------------
   Custom Tooltip for Recharts
   ---------------------------------------------------------------- */
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { item, quantity, unit } = payload[0].payload;
  return (
    <div
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "0.75rem",
        padding: "0.75rem 1rem",
        boxShadow: "var(--shadow-lg)",
        backdropFilter: "blur(8px)",
      }}
    >
      <p style={{ fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 2 }}>
        {item}
      </p>
      <p style={{ color: "var(--color-accent-primary-light)", fontSize: "0.88rem" }}>
        {quantity} {unit}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------
   Guest ID Generator
   ---------------------------------------------------------------- */
function getGuestId() {
  let guestId = localStorage.getItem("guest_id");
  if (!guestId) {
    guestId = "guest-" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem("guest_id", guestId);
  }
  return guestId;
}


/* ----------------------------------------------------------------
   Main App Component
   ---------------------------------------------------------------- */
export default function App() {
  const [guestId] = useState(() => getGuestId());
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* --- Auth effect --- */
  useEffect(() => {
    const token = localStorage.getItem("umkm_token");
    if (token) {
      fetch("http://localhost:8000/api/auth/me", {
        headers: { "Authorization": `Bearer ${token}` }
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Invalid token");
      })
      .then(data => setUser(data))
      .catch(() => {
        localStorage.removeItem("umkm_token");
        setUser(null);
      });
    }
  }, []);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("umkm_token");
    if (token) {
      return { "Authorization": `Bearer ${token}` };
    }
    return { "X-Session-ID": guestId };
  }, [guestId]);

  /* --- Theme state --- */
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("umkm_theme");
      if (saved) return saved;
      // Default to light for new users
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
      }
      return "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    localStorage.setItem("umkm_theme", theme);
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  /* --- History state --- */
  const [salesHistory, setSalesHistory] = useState([]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(HISTORY_API_URL, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setSalesHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  /* --- Voice-to-Text state --- */
    /* --- Voice-to-Text state --- */
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const recognitionRef = useRef(null);
  const inputTextRef = useRef("");

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  /* --- Toggle voice listening --- */
  const toggleListening = useCallback(() => {
    // 1. Jika sedang menyala, matikan.
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    // 2. Jika baru mau menyala, BUAT MESIN BARU AGAR INGATAN HP TERHAPUS!
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "id-ID";
    recognition.interimResults = true;
    
    // Cek apakah user pakai HP (Android/iOS)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // Di HP, mode continuous sering ngawur, jadi kita matikan. 
    // Di Laptop tetap continuous agar enak.
    recognition.continuous = !isMobile; 
    recognition.maxAlternatives = 1;

    let baseText = inputTextRef.current;

    recognition.onresult = (event) => {
      let currentFinal = "";
      let currentInterim = "";

      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          currentFinal += event.results[i][0].transcript + " ";
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }

      let combined = baseText;
      if (combined && !combined.endsWith(" ")) combined += " ";
      
      combined += currentFinal;
      if (currentInterim) {
        combined += " *" + currentInterim.trim() + "*";
      }
      
      setInputText(combined.trim());
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "aborted") {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Mesin mati (entah karena user menekan tombol, atau HP mematikan otomatis karena user diam)
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  /* --- API call --- */
  async function handleSubmit() {
    if (!inputText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ text: inputText }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          errBody.detail || `Server error (${res.status})`
        );
      }

      const data = await res.json();
      setResult(data);
      setInputText("");

      // Re-fetch history to get the newly saved record from the database
      await fetchHistory();

    } catch (err) {
      setError(err.message || "Terjadi kesalahan saat menghubungi server.");
    } finally {
      setLoading(false);
    }
  }

  /* --- Keyboard shortcut: Ctrl+Enter --- */
  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  function formatRupiah(number){
  return new Intl.NumberFormat("id-ID",{
    style: "currency",
    currency: "IDR",
    minimumFractionDigits : 0
  }).format(number || 0);
}

  /* --- Derived data --- */
  const salesData = result?.sales_data || [];
  const totalItems = salesData.reduce((sum, d) => sum + d.quantity, 0);
  const uniqueItems = salesData.length;

  return (
    <div className="app-container">
      {/* ======= HEADER ======= */}
      <header className="app-header">
        <div className="header-actions" style={{ display: "flex", justifyContent: "center", gap: "1rem", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
          <div className="header-badge" style={{ marginBottom: 0 }}>
            <span className="badge-dot" />
            Powered by Groq AI
          </div>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="header-badge" style={{ marginBottom: 0, background: 'rgba(20, 184, 166, 0.1)', color: '#14b8a6', border: '1px solid rgba(20, 184, 166, 0.2)' }}>
                <UserCircle size={14} style={{ marginRight: 6 }} />
                {user.store_name}
              </div>
              <button 
                className="theme-toggle" 
                onClick={() => {
                  localStorage.removeItem("umkm_token");
                  setUser(null);
                  fetchHistory();
                }}
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button 
              className="theme-toggle" 
              style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', width: 'auto', background: 'var(--color-bg-secondary)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)' }}
              onClick={() => setShowAuthModal(true)}
            >
              Login / Daftar
            </button>
          )}

          <button 
            className="theme-toggle" 
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
        <h1 className="app-title">UMKM Smart Sales</h1>
        <p className="app-subtitle">
          Ketik catatan penjualan harian kamu setelah itu AI akan merapikan datanya dan
          memberikan saran bisnis.
        </p>
      </header>

      {/* ======= INPUT CARD ======= */}
      <section className="input-card" id="input-section">
        <label className="input-label" htmlFor="sales-input">
          <PenLine size={16} />
          Catatan Penjualan
        </label>

        <div className="textarea-wrapper">
          <textarea
            id="sales-input"
            className="sales-textarea"
            placeholder={PLACEHOLDER_TEXT}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />

          {speechSupported && (
            <button
              id="mic-btn"
              type="button"
              className={`mic-btn${isListening ? " mic-btn--active" : ""}`}
              onClick={toggleListening}
              disabled={loading}
              title={isListening ? "Berhenti mendengarkan" : "Bicara untuk menulis"}
              aria-label={isListening ? "Stop voice input" : "Start voice input"}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
        </div>

        {isListening && (
          <div className="listening-indicator">
            <span className="listening-dot" />
            <span className="listening-dot" />
            <span className="listening-dot" />
            <span className="listening-text">Mendengarkan… bicara sekarang</span>
          </div>
        )}

        <div className="input-footer">
          <span className="char-count">{inputText.length} karakter</span>
          <button
            id="submit-btn"
            className="submit-btn"
            onClick={handleSubmit}
            disabled={loading || !inputText.trim()}
          >
            {loading ? (
              <>
                <span className="btn-spinner" />
                Memproses…
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Proses Data
                <Send size={14} />
              </>
            )}
          </button>
        </div>
      </section>

      {/* ======= LOADING STATE ======= */}
      {loading && (
        <div className="loading-overlay" id="loading-state">
          <div className="loading-orb" />
          <p className="loading-text">
            <strong>Groq AI</strong> sedang menganalisis data penjualan kamu…
          </p>
          <div className="loading-shimmer" />
        </div>
      )}

      {/* ======= ERROR STATE ======= */}
      {error && (
        <div className="error-card" id="error-state">
          <div className="error-icon">
            <AlertTriangle size={20} />
          </div>
          <div className="error-content">
            <h3>Oops, ada masalah!</h3>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* ======= RESULTS ======= */}
      {result && !loading && (
        <div className="results-section" id="results-section">
          <div className="results-header">
            <ShoppingBag size={24} />
            <h2>Hasil Analisis</h2>
          </div>

          {/* --- Bar Chart --- */}
          {salesData.length > 0 && (
            <div className="chart-card" id="chart-card">
              <div className="chart-title">
                <BarChart3 size={20} />
                Grafik Penjualan
              </div>

              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={salesData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                    barSize={40}
                  >
                    <CartesianGrid
                      strokeDasharray="3 6"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="item"
                      tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }}
                      axisLine={{ stroke: "var(--color-border)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(var(--color-accent-primary-rgb),0.08)" }} />
                    <Bar dataKey="quantity" radius={[8, 8, 0, 0]}>
                      {salesData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Stats row */}
              <div className="stats-row">
                <div className="stat-item">
                  <div className="stat-value">{uniqueItems}</div>
                  <div className="stat-label">Jenis Barang</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{totalItems}</div>
                  <div className="stat-label">Total Kuantitas</div>
                </div>
              </div>
            </div>
          )}

          {/* --- Sales Table --- */}
          {salesData.length > 0 && (
            <div className="table-card" id="table-card">
              <div className="table-title">
                <ClipboardList size={20} />
                Detail Penjualan
              </div>
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Nama Barang</th>
                    <th>Jumlah</th>
                    <th>Satuan</th>
                    <th>Harga</th>
                  </tr>
                </thead>
                <tbody>
                  {salesData.map((item, i) => (
                    <tr key={i}>
                      <td className="row-number">{i + 1}</td>
                      <td className="item-name">{item.item}</td>
                      <td className="item-quantity">{item.quantity}</td>
                      <td className="item-unit">{item.unit}</td>
                      <td className="item-unit">{formatRupiah(item.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* --- Business Advice --- */}
          {result.business_advice && (
            <div className="advice-card" id="advice-card">
              <div className="advice-header">
                <div className="advice-icon">
                  <Lightbulb size={20} />
                </div>
                <span className="advice-label">Saran Bisnis dari AI</span>
              </div>
              <p className="advice-text">{result.business_advice}</p>
            </div>
          )}
        </div>
      )}

      {/* ======= EMPTY STATE ======= */}
      {!result && !loading && !error && (
        <div className="empty-state" id="empty-state">
          <div className="empty-icon">
            <Store size={75}/>
          </div>
          <h3>Mulai Catat Penjualan Kamu</h3>
          <p>
            Tulis atau <strong>gunakan suara</strong> untuk mencatat penjualan
            hari ini, lalu tekan <strong>Proses Data</strong>. AI akan
            menganalisis dan memberi saran bisnis untukmu.
          </p>
        </div>
      )}

      {/* ======= SALES HISTORY ======= */}
      <SalesHistory 
        history={salesHistory} 
        guestId={guestId}
        token={localStorage.getItem("umkm_token")}
        onClearHistory={async () => {
          try {
            await fetch(HISTORY_API_URL, { 
              method: "DELETE",
              headers: getAuthHeaders()
            });
            setSalesHistory([]);
          } catch (err) {
            console.error("Failed to clear history:", err);
          }
        }}
        onRefresh={fetchHistory}
      />

      {/* ======= AUTH MODAL ======= */}
      {showAuthModal && (
        <AuthModal 
          guestId={guestId}
          onClose={() => setShowAuthModal(false)} 
          onLoginSuccess={(userData) => {
            setUser(userData);
            fetchHistory();
          }} 
        />
      )}

      {/* ======= FOOTER ======= */}
      <footer className="app-footer">
        <p className="footer-text">
          © 2026 <span>UMKM Smart Sales</span> — Ditenagai oleh Groq AI
        </p>
      </footer>
    </div>
  );
}
