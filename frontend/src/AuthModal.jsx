import { useState } from "react";
import { X, Mail, Lock, Store, ArrowRight, Loader2 } from "lucide-react";
import "./AuthModal.css";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function AuthModal({ onClose, onLoginSuccess, guestId }) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    store_name: "",
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";
    const payload = isLogin
      ? { email: formData.email, password: formData.password }
      : {
          store_name: formData.store_name,
          email: formData.email,
          password: formData.password,
          guest_id: guestId, // Transfer guest data
        };

    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Terjadi kesalahan.");
      }

      // Success
      localStorage.setItem("umkm_token", data.access_token);
      onLoginSuccess({ store_name: data.store_name, email: formData.email });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <button className="auth-close-btn" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="auth-header">
          <h2>{isLogin ? "Selamat Datang Kembali" : "Buat Akun UMKM"}</h2>
          <p>
            {isLogin
              ? "Masuk untuk melihat data penjualanmu."
              : "Daftar sekarang untuk menyimpan data secara permanen."}
          </p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="input-group">
              <label>Nama Toko</label>
              <div className="input-wrapper">
                <Store size={18} className="input-icon" />
                <input
                  type="text"
                  name="store_name"
                  required
                  placeholder="Misal: Toko Berkah"
                  value={formData.store_name}
                  onChange={handleChange}
                />
              </div>
            </div>
          )}

          <div className="input-group">
            <label>Email</label>
            <div className="input-wrapper">
              <Mail size={18} className="input-icon" />
              <input
                type="email"
                name="email"
                required
                placeholder="nama@email.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="input-group">
            <label>Password</label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                type="password"
                name="password"
                required
                placeholder="Minimal 6 karakter"
                value={formData.password}
                onChange={handleChange}
                minLength={6}
              />
            </div>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? (
              <Loader2 className="spinner" size={20} />
            ) : (
              <>
                {isLogin ? "Masuk" : "Daftar & Simpan Data"}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {isLogin ? "Belum punya akun?" : "Sudah punya akun?"}{" "}
            <button
              className="auth-switch-btn"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
              }}
            >
              {isLogin ? "Daftar sekarang" : "Masuk di sini"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
