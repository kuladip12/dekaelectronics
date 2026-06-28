import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, supabaseConfigured } from "./supabaseClient";

const CATEGORIES = ["AC", "Fridge / Deep Freezer", "Washing Machine", "Fan", "Other"];
const CAT_ICON = { "AC": "❄️", "Fridge / Deep Freezer": "🧊", "Washing Machine": "🧺", "Fan": "💨", "Other": "🔌" };
const PAYMENT_MODES = ["Cash", "Card", "UPI", "Other"];
const COMMON_BRANDS = ["LG", "Samsung", "Voltas", "Whirlpool", "Godrej", "Haier", "Blue Star", "Daikin", "Hitachi", "Carrier", "Lloyd", "Panasonic", "IFB", "Bosch", "Crompton", "Bajaj", "Orient Electric", "Usha", "Havells", "V-Guard", "Symphony", "Onida", "Videocon"];
const CURRENT_YEAR = new Date().getFullYear();
const MFG_YEARS = Array.from({ length: CURRENT_YEAR - 2014 }, (_, i) => CURRENT_YEAR - i);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const money = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const monthKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const todayStr = () => dateKey(new Date().toISOString());
const thisMonth = () => monthKey(new Date().toISOString());
const fmtDateTime = (iso) => { const d = new Date(iso); return d.toLocaleDateString("en-IN") + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); };
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-IN");
const stockStatus = (p) => { if (p.quantity <= 0) return "out"; if (p.quantity <= (p.minStock || 0)) return "low"; return "in"; };
const profitOf = (sale) => sale.items.reduce((s, it) => s + (it.price - (it.purchasePrice || 0)) * it.qty, 0);

async function fetchAllData() {
  const [{ data: products, error: e1 }, { data: sales, error: e2 }, { data: stockLog, error: e3 }] = await Promise.all([
    supabase.from("products").select("*"),
    supabase.from("sales").select("*"),
    supabase.from("stock_log").select("*"),
  ]);
  if (e1 || e2 || e3) { console.error("Supabase fetch error", e1 || e2 || e3); return null; }
  return {
    products: products || [],
    sales: (sales || []).map(s => ({ ...s, items: s.items || [] })),
    stockLog: stockLog || [],
  };
}

async function getNextInvoiceNo() {
  const { data, error } = await supabase.rpc("next_invoice_seq");
  if (error) throw error;
  return "INV-" + String(data).padStart(4, "0");
}

async function syncDiff(prevState, nextState) {
  const prevProducts = new Map(prevState.products.map(p => [p.id, p]));
  const nextProducts = new Map(nextState.products.map(p => [p.id, p]));
  const toUpsert = [];
  for (const [id, p] of nextProducts) {
    const old = prevProducts.get(id);
    if (!old || JSON.stringify(old) !== JSON.stringify(p)) toUpsert.push(p);
  }
  const toDeleteIds = [...prevProducts.keys()].filter(id => !nextProducts.has(id));

  const prevSaleIds = new Set(prevState.sales.map(s => s.id));
  const newSales = nextState.sales.filter(s => !prevSaleIds.has(s.id));

  const prevLogIds = new Set((prevState.stockLog || []).map(l => l.id));
  const newLogs = (nextState.stockLog || []).filter(l => !prevLogIds.has(l.id));

  const ops = [];
  if (toUpsert.length) ops.push(supabase.from("products").upsert(toUpsert));
  if (toDeleteIds.length) ops.push(supabase.from("products").delete().in("id", toDeleteIds));
  if (newSales.length) ops.push(supabase.from("sales").insert(newSales));
  if (newLogs.length) ops.push(supabase.from("stock_log").insert(newLogs));

  if (!ops.length) return true;
  const results = await Promise.all(ops);
  const failed = results.find(r => r && r.error);
  return !failed;
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Merriweather:wght@400;700&family=JetBrains+Mono:wght@400;600&display=swap');
  
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  
  :root {
    --primary: #1F2937; --primary-light: #374151; --primary-dark: #111827;
    --accent: #3B82F6; --accent-light: #60A5FA; --accent-dark: #1E40AF;
    --success: #10B981; --warning: #F59E0B; --danger: #EF4444;
    --neutral-50: #F9FAFB; --neutral-100: #F3F4F6; --neutral-200: #E5E7EB;
    --neutral-300: #D1D5DB; --neutral-400: #9CA3AF; --neutral-500: #6B7280;
    --neutral-600: #4B5563; --neutral-700: #374151; --neutral-800: #1F2937;
    --neutral-900: #111827;
    --glass-opacity: 0.08; --gradient-angle: 135deg;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
    --shadow-md: 0 4px 6px rgba(0,0,0,0.07);
    --shadow-lg: 0 10px 25px rgba(0,0,0,0.1);
    --shadow-xl: 0 20px 40px rgba(0,0,0,0.15);
    --radius-sm: 6px; --radius: 10px; --radius-lg: 14px; --radius-xl: 18px;
    --tap: 44px; --safe-b: env(safe-area-inset-bottom, 0px);
  }
  
  html { -webkit-text-size-adjust: 100%; }
  body { font-family: 'Inter', -apple-system, sans-serif; background: var(--neutral-50); color: var(--neutral-900); -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent; overflow-x: hidden; }
  #root { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
  button, input, select { -webkit-tap-highlight-color: transparent; }
  
  /* ── HEADER ── */
  .header { background: var(--primary); color: #fff; padding: 16px 20px; box-shadow: var(--shadow-md); }
  .header-inner { max-width: 1400px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
  .logo-sub { font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.05em; }
  .header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .btn-header { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 8px 14px; border-radius: var(--radius-sm); font-size: 12px; cursor: pointer; transition: all .2s; }
  .btn-header:hover { background: rgba(255,255,255,0.15); }
  
  /* ── NAVIGATION TABS ── */
  .tabs { position: sticky; top: 0; z-index: 60; background: #fff; border-bottom: 1px solid var(--neutral-200); display: flex; gap: 0; overflow-x: auto; box-shadow: var(--shadow-sm); -webkit-overflow-scrolling: touch; }
  .tabs::-webkit-scrollbar { height: 3px; }
  .tabs::-webkit-scrollbar-thumb { background: var(--accent); }
  .tab-btn { background: none; border: none; padding: 14px 20px; min-height: var(--tap); font-size: 13.5px; font-weight: 600; cursor: pointer; color: var(--neutral-600); white-space: nowrap; border-bottom: 3px solid transparent; transition: all .2s; font-family: 'Inter', sans-serif; }
  .tab-btn:hover { color: var(--primary); }
  .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
  
  /* ── MAIN ── */
  .main { max-width: 1400px; margin: 0 auto; padding: 28px 20px calc(40px + var(--safe-b)); flex: 1; width: 100%; }
  
  /* ── GRID & LAYOUT ── */
  .grid { display: grid; gap: 20px; margin-bottom: 20px; }
  .cols-2 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .cols-3 { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .cols-4 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  
  /* ── CARDS ── */
  .card { background: #fff; border: 1px solid var(--neutral-200); border-radius: var(--radius-lg); padding: 24px; box-shadow: var(--shadow-sm); transition: all .3s; }
  .card:hover { border-color: var(--neutral-300); box-shadow: var(--shadow-md); }
  .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .card-title { font-size: 16px; font-weight: 700; color: var(--primary); margin: 0; }
  .card-sub { font-size: 12px; color: var(--neutral-500); font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
  
  /* ── KPI HERO PANEL ── */
  .hero { background: linear-gradient(var(--gradient-angle), var(--primary), var(--primary-dark)); color: #fff; border: none; padding: 32px; }
  .hero-row { display: flex; gap: 40px; flex-wrap: wrap; }
  .hero-figure { flex: 1 1 160px; min-width: 140px; }
  .hero-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.7); font-weight: 700; }
  .hero-amount { font-family: 'JetBrains Mono', monospace; font-size: 38px; font-weight: 700; color: #fff; margin: 8px 0; line-height: 1; }
  .hero-sub { font-size: 13px; color: rgba(255,255,255,0.8); margin-top: 6px; }
  .hero-sub strong { color: var(--accent-light); }
  .hero-delta { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; margin-left: 8px; }
  .hero-delta.up { background: rgba(16,185,129,0.2); color: #10B981; }
  .hero-delta.down { background: rgba(239,68,68,0.2); color: #EF4444; }
  
  /* ── STAT TILES ── */
  .stat-tile { background: linear-gradient(135deg, #fff 0%, #F9FAFB 100%); border: 1px solid var(--neutral-200); border-radius: var(--radius); padding: 18px; }
  .stat-label { font-size: 11px; color: var(--neutral-500); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
  .stat-value { font-family: 'JetBrains Mono', monospace; font-size: 24px; font-weight: 700; color: var(--primary); margin: 6px 0; }
  .stat-icon { font-size: 24px; margin-bottom: 8px; }
  
  /* ── ALERTS & BADGES ── */
  .alert { padding: 14px 16px; border-radius: var(--radius); border: 1px solid var(--danger); background: rgba(239,68,68,0.05); color: var(--danger); font-size: 13px; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 16px; font-size: 11px; font-weight: 700; }
  .badge-danger { background: rgba(239,68,68,0.1); color: var(--danger); }
  .badge-warning { background: rgba(245,158,11,0.1); color: var(--warning); }
  .badge-success { background: rgba(16,185,129,0.1); color: var(--success); }
  .badge-info { background: rgba(59,130,246,0.1); color: var(--accent); }
  
  /* ── TABLES ── */
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: var(--radius); border: 1px solid var(--neutral-200); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 14px; background: linear-gradient(135deg, #F9FAFB, #F3F4F6); color: var(--neutral-700); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; border-bottom: 1px solid var(--neutral-200); }
  td { padding: 12px 14px; border-bottom: 1px solid var(--neutral-100); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover { background: var(--neutral-50); }
  
  /* ── FORMS ── */
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field label { font-size: 12px; color: var(--neutral-700); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  .field input, .field select { width: 100%; min-height: var(--tap); padding: 11px 13px; border: 1px solid var(--neutral-300); border-radius: var(--radius-sm); font-size: 14px; background: #fff; color: var(--neutral-900); font-family: 'Inter', sans-serif; transition: all .2s; }
  .field input:focus, .field select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
  .field input::placeholder { color: var(--neutral-400); }
  
  /* ── BUTTONS ── */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: none; border-radius: var(--radius-sm); padding: 10px 18px; min-height: var(--tap); font-size: 13px; font-weight: 700; cursor: pointer; font-family: 'Inter', sans-serif; transition: all .2s; white-space: nowrap; }
  .btn:active { transform: scale(0.97); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--accent); color: #fff; } .btn-primary:hover:not(:disabled) { background: var(--accent-dark); box-shadow: var(--shadow-md); }
  .btn-secondary { background: var(--neutral-100); color: var(--neutral-900); border: 1px solid var(--neutral-300); } .btn-secondary:hover:not(:disabled) { background: var(--neutral-200); }
  .btn-ghost { background: none; border: none; color: var(--accent); padding: 8px; min-height: 36px; min-width: 36px; border-radius: var(--radius-sm); }
  .btn-sm { padding: 7px 12px; min-height: 36px; font-size: 12px; }
  .btn-xs { padding: 5px 10px; min-height: 32px; font-size: 11px; }
  
  /* ── EMPTY STATE ── */
  .empty { padding: 48px 24px; text-align: center; color: var(--neutral-500); }
  .empty strong { display: block; color: var(--neutral-700); font-size: 15px; margin-bottom: 6px; }
  
  /* ── MODALS ── */
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px calc(24px + var(--safe-b)); z-index: 500; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .modal-box { background: #fff; border-radius: var(--radius-lg); max-width: 520px; width: 100%; padding: 28px; max-height: calc(100dvh - 48px); overflow-y: auto; box-shadow: var(--shadow-xl); }
  .modal-header { font-size: 18px; font-weight: 700; margin-bottom: 20px; color: var(--primary); }
  .modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; flex-wrap: wrap; }
  
  /* ── TOAST ── */
  .toast { position: fixed; left: 16px; right: 16px; bottom: calc(16px + var(--safe-b)); margin: 0 auto; background: var(--primary); color: #fff; padding: 14px 18px; border-radius: var(--radius); font-size: 13.5px; font-weight: 600; box-shadow: var(--shadow-lg); z-index: 700; animation: toastIn .25s ease; max-width: 400px; text-align: center; }
  .toast.err { background: var(--danger); }
  @keyframes toastIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  
  /* ── CHART ── */
  .chart-container { position: relative; width: 100%; height: 280px; margin: 20px 0; }
  
  /* ── RESPONSIVE ── */
  @media (max-width: 768px) {
    .main { padding: 16px 12px calc(36px + var(--safe-b)); }
    .card { padding: 16px; }
    .hero { padding: 20px; }
    .hero-row { gap: 20px; }
    .hero-amount { font-size: 28px; }
    .cols-3, .cols-4 { grid-template-columns: repeat(2, 1fr); }
    .grid { gap: 12px; }
    .modal-box { padding: 20px; }
  }
  @media (max-width: 480px) {
    .cols-2, .cols-3, .cols-4 { grid-template-columns: 1fr; }
    .hero-row { flex-direction: column; gap: 12px; }
    .btn-row { flex-direction: column; }
    .btn-row .btn { width: 100%; }
  }
`;

function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2700); return () => clearTimeout(t); }, [msg]);
  if (!msg) return null;
  return <div className={`toast${type === "error" ? " err" : ""}`}>{msg}</div>;
}

function App() {
  const [session, setSession] = useState(null);
  const [state, setState] = useState({ products: [], sales: [], stockLog: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [toast, setToast] = useState({ msg: "", type: "success" });

  const showToast = (msg, type = "success") => { setToast({ msg, type }); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSession(session);
      else window.location.reload();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session) setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const data = await fetchAllData();
      if (data) setState(data);
      setLoading(false);
    })();
  }, [session]);

  if (!supabaseConfigured) return <div style={{ padding: "20px", textAlign: "center" }}>⚠️ Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</div>;
  if (!session) return null;
  if (loading) return <div style={{ padding: "20px", textAlign: "center" }}>Loading...</div>;

  return (
    <>
      <style>{css}</style>
      <header className="header">
        <div className="header-inner">
          <div>
            <div className="logo">🏢 Deka Electronics</div>
            <div className="logo-sub">Advanced Store Manager</div>
          </div>
          <div className="header-actions">
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>{session.user?.email}</span>
            <button className="btn-header" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </header>

      <nav className="tabs">
        {["dashboard", "products", "billing", "analytics"].map(tab => (
          <button key={tab} className={`tab-btn${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab === "dashboard" ? "📊 Dashboard" : tab === "products" ? "📦 Products" : tab === "billing" ? "💳 Billing" : "📈 Analytics"}
          </button>
        ))}
      </nav>

      <main className="main">
        {activeTab === "dashboard" && <Dashboard state={state} />}
        {activeTab === "products" && <Products state={state} onSave={(next) => setState(next)} showToast={showToast} />}
        {activeTab === "billing" && <Billing state={state} onSave={(next) => setState(next)} showToast={showToast} />}
        {activeTab === "analytics" && <Analytics state={state} />}
      </main>

      <Toast msg={toast.msg} type={toast.type} onDone={() => setToast({ msg: "", type: "success" })} />
    </>
  );
}

function Dashboard({ state }) {
  const today = todayStr();
  const month = thisMonth();
  const todaySales = state.sales.filter(s => dateKey(s.date) === today).reduce((a, x) => a + x.total, 0);
  const monthSales = state.sales.filter(s => monthKey(s.date) === month).reduce((a, x) => a + x.total, 0);
  const profit = state.sales.filter(s => monthKey(s.date) === month).reduce((a, x) => a + profitOf(x), 0);
  const margin = monthSales > 0 ? Math.round((profit / monthSales) * 100) : 0;
  const totalProducts = state.products.length;
  const totalStock = state.products.reduce((a, p) => a + (p.quantity || 0), 0);
  const lowStock = state.products.filter(p => stockStatus(p) !== "in").length;

  return (
    <div>
      <div className="card hero" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ color: "#fff", marginBottom: 0 }}>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>Sales Overview</h1>
        </div>
        <div className="hero-row">
          <div className="hero-figure">
            <div className="hero-label">Today's Revenue</div>
            <div className="hero-amount">{money(todaySales)}</div>
            <div className="hero-sub">Month to date: <strong>{money(monthSales)}</strong></div>
          </div>
          <div className="hero-figure">
            <div className="hero-label">This Month Profit</div>
            <div className="hero-amount">{money(profit)}</div>
            <div className="hero-sub">Margin: <strong>{margin}%</strong></div>
          </div>
        </div>
      </div>

      <div className="grid cols-4">
        <div className="card stat-tile">
          <div className="stat-icon">📦</div>
          <div className="stat-label">Total Products</div>
          <div className="stat-value">{totalProducts}</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-icon">🧮</div>
          <div className="stat-label">Units in Stock</div>
          <div className="stat-value">{totalStock}</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-icon">⚠️</div>
          <div className="stat-label">Low Stock</div>
          <div className="stat-value" style={{ color: lowStock > 0 ? "var(--danger)" : "var(--success)" }}>{lowStock}</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-icon">🎯</div>
          <div className="stat-label">Daily Avg</div>
          <div className="stat-value">{money(todaySales)}</div>
        </div>
      </div>

      {lowStock > 0 && (
        <div className="alert" style={{ marginTop: 20 }}>
          ⚠️ {lowStock} product{lowStock === 1 ? " is" : "s are"} low or out of stock. Reorder soon!
        </div>
      )}
    </div>
  );
}

function Products({ state, onSave, showToast }) {
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Product Inventory</h2>
        <button className="btn btn-primary" onClick={() => { setSelected(null); setShowModal(true); }}>+ Add Product</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Brand</th><th>Category</th><th className="right">Qty</th><th>Price</th><th>Status</th></tr>
            </thead>
            <tbody>
              {state.products.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: "center", padding: "30px" }}>No products yet</td></tr>
              ) : (
                state.products.map(p => {
                  const st = stockStatus(p);
                  return (
                    <tr key={p.id} style={{ opacity: st === "out" ? 0.6 : 1 }}>
                      <td><strong>{p.name}</strong></td>
                      <td>{p.brand || "—"}</td>
                      <td>{CAT_ICON[p.category] || "🔌"} {p.category}</td>
                      <td className="right">{p.quantity}</td>
                      <td>{money(p.sellingPrice || 0)}</td>
                      <td>
                        <span className={`badge badge-${st === "out" ? "danger" : st === "low" ? "warning" : "success"}`}>
                          {st === "out" ? "Out" : st === "low" ? "Low" : "In Stock"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Billing({ state, onSave, showToast }) {
  return (
    <div>
      <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: 20 }}>Recent Invoices</h2>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Invoice</th><th>Date</th><th>Customer</th><th className="right">Amount</th></tr>
            </thead>
            <tbody>
              {state.sales.slice(0, 10).map(s => (
                <tr key={s.id}>
                  <td className="mono" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{s.invoiceNo}</td>
                  <td>{fmtDate(s.date)}</td>
                  <td>{s.customerName || "Walk-in"}</td>
                  <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{money(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Analytics({ state }) {
  const monthSales = state.sales.filter(s => monthKey(s.date) === thisMonth()).reduce((a, x) => a + x.total, 0);
  const profit = state.sales.filter(s => monthKey(s.date) === thisMonth()).reduce((a, x) => a + profitOf(x), 0);
  
  return (
    <div>
      <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: 20 }}>Sales Analytics</h2>
      <div className="grid cols-2">
        <div className="card">
          <div className="card-title">Monthly Performance</div>
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <div style={{ fontSize: "32px", fontWeight: 700, color: "var(--accent)", fontFamily: "'JetBrains Mono', monospace" }}>
              {money(monthSales)}
            </div>
            <div style={{ fontSize: "12px", color: "var(--neutral-500)", marginTop: "8px" }}>Total sales this month</div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Profitability</div>
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <div style={{ fontSize: "32px", fontWeight: 700, color: "var(--success)", fontFamily: "'JetBrains Mono', monospace" }}>
              {money(profit)}
            </div>
            <div style={{ fontSize: "12px", color: "var(--neutral-500)", marginTop: "8px" }}>Gross profit</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
