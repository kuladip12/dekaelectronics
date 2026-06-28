import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, supabaseConfigured } from "./supabaseClient";

/* ─── CONSTANTS ─── */
const CATEGORIES = ["AC", "Fridge / Deep Freezer", "Washing Machine", "Fan", "Other"];
const CAT_ICON = { "AC": "❄️", "Fridge / Deep Freezer": "🧊", "Washing Machine": "🧺", "Fan": "💨", "Other": "🔌" };
const PAYMENT_MODES = ["Cash", "Card", "UPI", "Other"];
const COMMON_BRANDS = ["LG", "Samsung", "Voltas", "Whirlpool", "Godrej", "Haier", "Blue Star", "Daikin", "Hitachi", "Carrier", "Lloyd", "Panasonic", "IFB", "Bosch", "Crompton", "Bajaj", "Orient Electric", "Usha", "Havells", "V-Guard", "Symphony", "Onida", "Videocon"];
const CURRENT_YEAR = new Date().getFullYear();
const MFG_YEARS = Array.from({ length: CURRENT_YEAR - 2014 }, (_, i) => CURRENT_YEAR - i);

/* ─── UTILS ─── */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const money = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const monthKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const todayStr = () => dateKey(new Date().toISOString());
const thisMonth = () => monthKey(new Date().toISOString());
const fmtDateTime = (iso) => { const d = new Date(iso); return d.toLocaleDateString("en-IN") + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); };
const stockStatus = (p) => { if (p.quantity <= 0) return "out"; if (p.quantity <= (p.minStock || 0)) return "low"; return "in"; };
const profitOf = (sale) => sale.items.reduce((s, it) => s + (it.price - (it.purchasePrice || 0)) * it.qty, 0);

/* ─── SUPABASE DATA LAYER ───
   Tables (see supabase_schema.sql): products, sales, stock_log
   Reads/writes go straight to Postgres via RLS-protected, staff-only access.
   `syncDiff` compares the previous and next in-memory state and only sends
   the rows that actually changed — inserts/updates for products, plus
   deletes for any product removed locally; sales and stock_log are
   append-only logs so we only ever insert new rows for those. */

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
  const nextLogIds = new Set((nextState.stockLog || []).map(l => l.id));
  const newLogs = (nextState.stockLog || []).filter(l => !prevLogIds.has(l.id));
  const toDeleteLogIds = [...prevLogIds].filter(id => !nextLogIds.has(id));

  const ops = [];
  if (toUpsert.length) ops.push(supabase.from("products").upsert(toUpsert));
  if (toDeleteIds.length) ops.push(supabase.from("products").delete().in("id", toDeleteIds));
  if (newSales.length) ops.push(supabase.from("sales").insert(newSales));
  if (newLogs.length) ops.push(supabase.from("stock_log").insert(newLogs));
  if (toDeleteLogIds.length) ops.push(supabase.from("stock_log").delete().in("id", toDeleteLogIds));

  if (!ops.length) return true;
  const results = await Promise.all(ops);
  const failed = results.find(r => r && r.error);
  if (failed) console.error("Supabase sync error", failed.error);
  return !failed;
}

/* ─── CSS ─── */
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --navy: #16263F; --navy-l: #22395A; --navy-ll: #2D4A6E;
    --amber: #E8A33D; --amber-d: #C97F1E;
    --bg: #F5F3EE; --card: #FFFFFF;
    --text: #1C1C1C; --muted: #6B7280;
    --border: #E3DFD3; --border-l: #EDE9E0;
    --green: #1E7A4C; --green-bg: #E9F5EE;
    --red: #B3261E; --red-bg: #FBEAE9;
    --blue: #1A56A0; --blue-bg: #E8F0FB;
    --mono: 'JetBrains Mono', ui-monospace, monospace;
    --sans: 'Inter', -apple-system, sans-serif;
    --radius: 10px; --radius-sm: 6px; --radius-md: 8px;
    --shadow: 0 2px 8px rgba(0,0,0,.07);
    --shadow-lg: 0 8px 24px rgba(0,0,0,.12);
    --tap: 44px; /* minimum comfortable touch target */
    --safe-b: env(safe-area-inset-bottom, 0px);
  }
  html { -webkit-text-size-adjust: 100%; }
  body { font-family: var(--sans); background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent; overflow-x: hidden; }
  #root { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
  button, input, select { -webkit-tap-highlight-color: transparent; }
  a, button, .tab-btn, [role="button"] { -webkit-tap-highlight-color: transparent; }
  :focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; scroll-behavior: auto !important; }
  }

  /* ── Topbar ── */
  .topbar { background: var(--navy); color: #fff; padding: 14px 20px; }
  .topbar-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
  .brand { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .brand h1 { font-size: 21px; font-weight: 800; letter-spacing: .05em; }
  .brand .tag { color: var(--amber); font-size: 11.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .topbar-cats { font-size: 11.5px; color: #9BAFC5; }
  .topbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

  /* ── Tabs ── */
  .tabs { position: sticky; top: 0; z-index: 60; background: var(--navy-l); display: flex; gap: 2px; overflow-x: auto; padding: 0 10px; border-bottom: 1px solid rgba(255,255,255,.08); box-shadow: 0 2px 6px rgba(0,0,0,.12); scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch; }
  .tabs::-webkit-scrollbar { height: 3px; } .tabs::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); }
  .tab-btn { background: none; border: none; color: #94A8C0; padding: 14px 16px; min-height: var(--tap); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; border-bottom: 3px solid transparent; font-family: var(--sans); transition: color .15s, background-color .15s; scroll-snap-align: start; }
  .tab-btn:hover { color: #fff; }
  .tab-btn:active { background: rgba(255,255,255,.07); }
  .tab-btn.active { color: #fff; border-bottom-color: var(--amber); }

  /* ── Layout ── */
  .main { max-width: 1200px; margin: 0 auto; padding: 20px 16px calc(40px + var(--safe-b)); flex: 1; width: 100%; }
  .grid { display: grid; gap: 12px; }
  .cols-2 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .cols-3 { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .cols-4 { grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); }
  .cols-5 { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }

  /* ── Cards ── */
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; margin-bottom: 16px; }
  .card-title { font-size: 15px; font-weight: 700; color: var(--navy); display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .card-title .count { font-size: 12px; color: var(--muted); font-weight: 500; }

  /* ── Stat cards ── */
  .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; }
  .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }
  .stat-value { font-family: var(--mono); font-size: 22px; font-weight: 700; color: var(--navy); margin-top: 5px; word-break: break-word; }
  .stat-card.alert .stat-value { color: var(--red); }

  /* ── Form fields ── */
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field label { font-size: 11.5px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .field input, .field select { width: 100%; min-height: var(--tap); padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-md); font-size: 15px; background: #fff; color: var(--text); font-family: var(--sans); transition: border-color .15s, box-shadow .15s; }
  .field input:focus, .field select:focus { outline: none; border-color: var(--amber); box-shadow: 0 0 0 3px rgba(232,163,61,.15); }
  .field input.has-value { border-color: var(--green); background: var(--green-bg); }
  .field input::placeholder { color: #B4AFA3; }

  /* ── Buttons ── */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: none; border-radius: var(--radius-md); padding: 11px 18px; min-height: var(--tap); font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: var(--sans); transition: background-color .15s, color .15s, border-color .15s, transform .08s; white-space: nowrap; }
  .btn:active { transform: scale(.97); }
  .btn:disabled { opacity: .4; cursor: not-allowed; transform: none; }
  .btn-primary { background: var(--navy); color: #fff; } .btn-primary:hover:not(:disabled) { background: var(--navy-l); }
  .btn-amber { background: var(--amber); color: var(--navy); } .btn-amber:hover:not(:disabled) { background: var(--amber-d); color: #fff; }
  .btn-outline { background: #fff; border: 1px solid var(--border); color: var(--text); } .btn-outline:hover:not(:disabled) { border-color: var(--navy); }
  .btn-danger { background: #fff; border: 1px solid var(--red); color: var(--red); } .btn-danger:hover:not(:disabled) { background: var(--red); color: #fff; }
  .btn-ghost { background: none; border: none; color: var(--muted); padding: 8px; min-height: 36px; min-width: 36px; border-radius: 7px; } .btn-ghost:hover { color: var(--red); background: var(--red-bg); }
  .btn-sm { padding: 7px 12px; min-height: 36px; font-size: 12.5px; border-radius: var(--radius-sm); }
  .btn-xs { padding: 5px 9px; min-height: 30px; font-size: 11px; border-radius: 5px; }
  .btn-row { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }

  /* ── Tables ── */
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: var(--radius-sm); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px; background: #F0EDE5; color: var(--navy); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; font-weight: 700; border-bottom: 2px solid var(--border); white-space: nowrap; }
  td { padding: 11px 10px; border-bottom: 1px solid var(--border-l); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr.low-stock { background: #FFF8EC; }
  tr.out-stock td { color: var(--red); }
  .right { text-align: right; } .center { text-align: center; }
  .mono { font-family: var(--mono); }
  .muted { color: var(--muted); }
  /* Sticky first column so long tables stay readable while scrolling sideways on a phone */
  .table-wrap table th:first-child, .table-wrap table td:first-child { position: sticky; left: 0; box-shadow: 1px 0 0 var(--border-l); }
  .table-wrap table th:first-child { background: #F0EDE5; z-index: 3; }
  .table-wrap table td:first-child { background: #fff; z-index: 1; }
  .table-wrap table tr.low-stock td:first-child { background: #FFF8EC; }

  /* ── Badges ── */
  .badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .badge-red { background: var(--red-bg); color: var(--red); }
  .badge-green { background: var(--green-bg); color: var(--green); }
  .badge-amber { background: #FBEFD9; color: var(--amber-d); }
  .badge-blue { background: var(--blue-bg); color: var(--blue); }

  /* ── Empty states ── */
  .empty { padding: 36px 16px; text-align: center; color: var(--muted); }
  .empty strong { display: block; color: var(--text); font-size: 14px; margin-bottom: 5px; }

  /* ── Product picker dropdown ── */
  .picker-wrap { position: relative; }
  .picker-dropdown { position: absolute; left: 0; right: 0; top: calc(100% + 5px); background: #fff; border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); z-index: 300; max-height: 280px; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .picker-row { padding: 12px 14px; cursor: pointer; border-bottom: 1px solid var(--border-l); display: flex; justify-content: space-between; align-items: center; gap: 10px; transition: background .1s; }
  .picker-row:last-child { border-bottom: none; }
  .picker-row:hover, .picker-row:active { background: #F6F3EC; }
  .picker-row.disabled { opacity: .5; pointer-events: none; }
  .picker-row .pr-name { font-size: 13.5px; font-weight: 600; }
  .picker-row .pr-sub { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
  .picker-row .pr-right { text-align: right; flex-shrink: 0; }
  .picker-row .pr-price { font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--navy); }
  .pr-stock { font-size: 11px; font-weight: 700; margin-top: 2px; }
  .pr-stock.ok { color: var(--green); } .pr-stock.low { color: var(--amber-d); } .pr-stock.out { color: var(--red); }
  .picker-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--muted); font-size: 18px; line-height: 1; padding: 8px; min-height: 36px; min-width: 36px; border-radius: 6px; }
  .picker-clear:hover { color: var(--red); background: var(--red-bg); }

  /* ── Product info preview card ── */
  .product-preview { background: #F0EDE5; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px 15px; margin-top: 10px; }
  .preview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
  .preview-item .pi-label { font-size: 10.5px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .preview-item .pi-val { font-family: var(--mono); font-size: 13.5px; font-weight: 700; color: var(--navy); margin-top: 3px; word-break: break-word; }
  .preview-item .pi-val.ok { color: var(--green); } .preview-item .pi-val.low { color: var(--amber-d); } .preview-item .pi-val.out { color: var(--red); }

  /* ── Pills ── */
  .pill-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .pill { background: #EDEAE3; border: none; padding: 9px 16px; min-height: 38px; border-radius: 20px; font-size: 12.5px; font-weight: 700; color: var(--muted); cursor: pointer; font-family: var(--sans); }
  .pill.active { background: var(--navy); color: #fff; }

  /* ── Bar charts ── */
  .bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 12.5px; }
  .bar-label { width: 84px; flex-shrink: 0; color: var(--muted); font-family: var(--mono); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; min-width: 0; background: #EFEBE2; border-radius: 4px; height: 16px; overflow: hidden; }
  .bar-fill { background: linear-gradient(90deg, var(--amber), var(--amber-d)); height: 100%; border-radius: 4px; transition: width .3s ease; }
  .bar-val { width: 92px; flex-shrink: 0; text-align: right; font-family: var(--mono); font-size: 11.5px; color: var(--navy); }

  /* ── Dashboard: hero KPI panel ── */
  .hero-card { background: linear-gradient(135deg, var(--navy), var(--navy-l)); border: none; color: #fff; }
  .hero-row { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .hero-figure { flex: 1 1 180px; min-width: 160px; }
  .hero-label { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #9BAFC5; font-weight: 700; }
  .hero-amount { font-family: var(--mono); font-size: 34px; font-weight: 800; color: #fff; margin-top: 6px; line-height: 1.1; word-break: break-word; }
  .hero-sub { font-size: 12.5px; color: #B9C7D9; margin-top: 8px; }
  .hero-sub strong { color: var(--amber); font-family: var(--mono); }
  .hero-chart-wrap { flex: 1 1 220px; min-width: 200px; }
  .hero-chart { width: 100%; height: 64px; display: block; }
  .hero-chart-label { font-size: 10.5px; color: #7E93AC; text-transform: uppercase; letter-spacing: .05em; margin-top: 4px; text-align: right; }

  /* ── Dashboard: low-stock alert list (cards, not a table — much friendlier on a phone) ── */
  .alert-list { display: flex; flex-direction: column; gap: 8px; }
  .alert-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-l); flex-wrap: wrap; }
  .alert-row.is-low { background: #FFF8EC; border-color: #F3DDAA; }
  .alert-row.is-out { background: var(--red-bg); border-color: #F0C6C3; }
  .alert-main { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .alert-icon { font-size: 20px; flex-shrink: 0; }
  .alert-name { font-weight: 700; font-size: 13.5px; }
  .alert-sub { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
  .alert-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .alert-qty { font-size: 12.5px; font-weight: 700; color: var(--navy); }
  .alert-row.is-out .alert-qty { color: var(--red); }

  /* ── Dashboard: recent sales list ── */
  .sale-list { display: flex; flex-direction: column; }
  .sale-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 2px; border-bottom: 1px solid var(--border-l); }
  .sale-row:last-child { border-bottom: none; }
  .sale-main { min-width: 0; }
  .sale-inv { font-weight: 700; font-size: 13px; color: var(--navy); }
  .sale-sub { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
  .sale-amt { font-weight: 700; font-size: 14px; color: var(--navy); flex-shrink: 0; }

  /* ── Bill receipt ── */
  .bill-head { text-align: center; border-bottom: 2px dashed var(--border); padding-bottom: 12px; margin-bottom: 12px; }
  .bill-head h3 { font-size: 18px; font-weight: 800; color: var(--navy); letter-spacing: .04em; }
  .bill-head .sub { font-size: 11.5px; color: var(--muted); margin-top: 3px; }
  .bill-meta { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--muted); margin-bottom: 10px; gap: 8px; flex-wrap: wrap; }
  .bill-totals { border-top: 2px dashed var(--border); margin-top: 8px; padding-top: 8px; }
  .bill-row { display: flex; justify-content: space-between; font-size: 13.5px; padding: 3px 0; gap: 10px; }
  .bill-row.grand { font-weight: 800; color: var(--navy); font-size: 16px; border-top: 1px solid var(--border); margin-top: 5px; padding-top: 7px; }
  .bill-foot { text-align: center; margin-top: 14px; font-size: 11.5px; color: var(--muted); border-top: 2px dashed var(--border); padding-top: 10px; }
  table.bill-tbl th { background: none; border-bottom: 1px solid var(--border); padding: 5px 4px; font-size: 10.5px; position: static; }
  table.bill-tbl td { padding: 6px 4px; border-bottom: none; font-size: 12.5px; position: static; background: none; box-shadow: none; }

  /* ── Modals ── */
  .modal-bg { position: fixed; inset: 0; background: rgba(22,38,63,.55); display: flex; align-items: flex-start; justify-content: center; padding: 24px 14px calc(24px + var(--safe-b)); z-index: 500; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .modal-box { background: #fff; border-radius: var(--radius); max-width: 480px; width: 100%; padding: 22px; max-height: calc(100dvh - 48px); overflow-y: auto; box-shadow: var(--shadow-lg); }
  .modal-actions { display: flex; gap: 10px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }

  /* ── Toast ── */
  .toast { position: fixed; left: 16px; right: 16px; bottom: calc(16px + var(--safe-b)); margin: 0 auto; background: var(--navy); color: #fff; padding: 13px 18px; border-radius: 10px; font-size: 13.5px; font-weight: 600; box-shadow: var(--shadow-lg); z-index: 700; animation: toastIn .25s ease; max-width: 380px; text-align: center; }
  .toast.err { background: var(--red); }
  @keyframes toastIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  /* ── Banner ── */
  .banner { background: #FBEFD9; color: #7A4A0E; padding: 10px 18px; font-size: 12.5px; display: flex; align-items: center; gap: 12px; justify-content: center; flex-wrap: wrap; border-bottom: 1px solid #E8C988; text-align: center; }

  /* ── Section divider ── */
  .divider { border: none; border-top: 1px dashed var(--border); margin: 18px 0; }
  .step-label { font-size: 11.5px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 12px; }

  /* ── Purchase history filters ── */
  .ph-filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 14px; }
  .ph-filters .field { flex: 1; min-width: 140px; }

  /* ── Cart ── */
  .qty-inp { width: 60px; min-height: 38px; padding: 6px; text-align: center; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; font-family: var(--mono); }
  .price-inp { width: 86px; min-height: 38px; padding: 6px 7px; text-align: right; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; font-family: var(--mono); }
  .qty-inp:focus, .price-inp:focus { outline: none; border-color: var(--amber); box-shadow: 0 0 0 2px rgba(232,163,61,.15); }

  /* ── Stars ── */
  .stars { color: var(--amber); font-size: 12px; letter-spacing: 1px; }

  /* ── Margin colour ── */
  .pos { color: var(--green); } .neg { color: var(--red); }

  @media print {
    body * { visibility: hidden; }
    #bill-print-portal, #bill-print-portal * { visibility: visible; }
    #bill-print-portal { position: absolute; top: 0; left: 0; width: 100%; background: #fff; padding: 0; }
    #bill-print-portal .modal-box { box-shadow: none; max-width: 100%; margin: 0 auto; }
    .no-print { visibility: hidden !important; }
  }

  /* ── Phone-width refinements ── */
  @media (max-width: 640px) {
    .brand h1 { font-size: 16.5px; } .topbar-cats { display: none; }
    .topbar { padding: 12px 14px; }
    .bill-meta { flex-direction: column; gap: 2px; }
    .main { padding: 16px 12px calc(36px + var(--safe-b)); }
    .card { padding: 16px; }
    .card-title { font-size: 14px; }
    /* Predictable 2-up grids beat fragile auto-fit math on narrow phones */
    .cols-3, .cols-4, .cols-5 { grid-template-columns: repeat(2, 1fr); }
    .stat-value { font-size: 19px; }
    /* Primary action rows become full-width, thumb-friendly stacks */
    .btn-row { flex-direction: column; }
    .btn-row .btn { width: 100%; }
    .modal-box { padding: 18px; border-radius: var(--radius-md); }
    .modal-actions { flex-direction: column-reverse; }
    .modal-actions .btn { width: 100%; }
    th, td { font-size: 12.5px; }
    /* Hero KPI panel: stack amount above the trend chart cleanly */
    .hero-figure, .hero-chart-wrap { flex-basis: 100%; min-width: 100%; }
    .hero-amount { font-size: 28px; }
    /* Alert rows: let the button take the full width for an easy tap */
    .alert-right { width: 100%; justify-content: space-between; }
    .alert-right .btn { flex: 1 1 auto; }
  }

  @media (max-width: 420px) {
    .cols-5 { grid-template-columns: 1fr 1fr; }
  }
`;

/* ─── REUSABLE COMPONENTS ─── */

function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2700); return () => clearTimeout(t); }, [msg]);
  return <div className={`toast${type === "error" ? " err" : ""}`}>{msg}</div>;
}

function ConfigMissing() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--navy)", padding: 20 }}>
      <div className="card" style={{ maxWidth: 460 }}>
        <div className="card-title">⚙️ Supabase not configured</div>
        <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
          This app needs <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> set as environment
          variables (in your <code>.env</code> file locally, or in your Vercel project's Environment Variables
          settings). See the README for setup steps.
        </p>
      </div>
    </div>
  );
}

function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(error.message);
    else onLoggedIn && onLoggedIn();
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--navy)", padding: 20 }}>
      <div className="card" style={{ width: "100%", maxWidth: 360, marginBottom: 0 }}>
        <div className="card-title">🔐 Staff Login</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>Deka Electronics — Store Manager</div>
        <form onSubmit={submit}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Email</label>
            <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: 4 }}>
            <label>Password</label>
            <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {err && <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 16 }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 14, textAlign: "center" }}>
          Don't have an account? Ask the store owner to add you in the Supabase Auth dashboard.
        </p>
      </div>
    </div>
  );
}

function ConfirmModal({ message, onYes, onNo }) {
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onNo()}>
      <div className="modal-box">
        <p style={{ fontSize: 14.5, marginBottom: 16 }}>{message}</p>
        <div className="modal-actions">
          <button className="btn btn-danger" onClick={onYes}>Yes, continue</button>
          <button className="btn btn-outline" onClick={onNo}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ProductPicker({ products, onSelect, placeholder = "Type product name, brand, category…" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const matches = query.trim()
    ? products.filter(p => [p.name, p.brand, p.model, p.category].some(f => (f || "").toLowerCase().includes(query.toLowerCase()))).slice(0, 10)
    : [];

  const pick = (p) => {
    setSelected(p); setQuery(p.name); setOpen(false); onSelect(p);
  };
  const clear = () => {
    setSelected(null); setQuery(""); setOpen(false); onSelect(null);
  };

  return (
    <div className="picker-wrap" ref={wrapRef}>
      <div className="field" style={{ position: "relative" }}>
        <input
          className={selected ? "has-value" : ""}
          value={query}
          placeholder={placeholder}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) clear(); }}
          onFocus={() => query && setOpen(true)}
          style={{ paddingRight: selected ? 36 : 11 }}
        />
        {selected && <button className="picker-clear" onClick={clear}>✕</button>}
      </div>
      {open && matches.length > 0 && (
        <div className="picker-dropdown">
          {matches.map(p => {
            const st = stockStatus(p);
            return (
              <div key={p.id} className={`picker-row${st === "out" ? " disabled" : ""}`} onClick={() => st !== "out" && pick(p)}>
                <div>
                  <div className="pr-name">{CAT_ICON[p.category] || "🔌"} {p.brand ? <strong>{p.brand}</strong> : null}{p.brand ? " — " : ""}{p.name}</div>
                  <div className="pr-sub">{[p.category, p.model].filter(Boolean).join(" · ")}{p.stars ? ` · ${"⭐".repeat(+p.stars)}` : ""}{p.mfgYear ? ` · ${p.mfgYear}` : ""}</div>
                </div>
                <div className="pr-right">
                  <div className="pr-price">{money(p.sellingPrice)}</div>
                  <div className={`pr-stock ${st}`}>{st === "out" ? "Out of stock" : p.quantity + " in stock"}</div>
                </div>
              </div>
            );
          })}
          {matches.length === 0 && query && <div className="picker-row disabled"><span className="pr-name">No matches</span></div>}
        </div>
      )}
      {open && query && matches.length === 0 && (
        <div className="picker-dropdown"><div className="picker-row disabled"><span className="pr-name">No matching products</span></div></div>
      )}
    </div>
  );
}

function ProductPreview({ product }) {
  if (!product) return null;
  const st = stockStatus(product);
  const margin = product.sellingPrice - product.purchasePrice;
  const pct = product.purchasePrice > 0 ? ((margin / product.purchasePrice) * 100).toFixed(1) + "%" : "—";
  const items = [
    { label: "Brand", val: product.brand || "—", mono: false },
    { label: "Category", val: `${CAT_ICON[product.category] || "🔌"} ${product.category}`, mono: false },
    { label: "Model", val: product.model || "—", mono: false },
    { label: "Rating", val: product.stars ? "⭐".repeat(+product.stars) : "—", mono: false },
    { label: "Mfg. Year", val: product.mfgYear || "—", mono: false },
    { label: "Current Stock", val: `${product.quantity} ${product.unit || "pcs"}`, cls: st },
    { label: "Purchase ₹", val: money(product.purchasePrice) },
    { label: "Selling ₹", val: money(product.sellingPrice) },
    { label: "Margin", val: `${money(margin)} (${pct})`, cls: margin >= 0 ? "ok" : "out" },
    { label: "Low Alert at", val: `${product.minStock || 0} ${product.unit || "pcs"}`, mono: false },
  ];
  return (
    <div className="product-preview">
      <div className="preview-grid">
        {items.map(it => (
          <div className="preview-item" key={it.label}>
            <div className="pi-label">{it.label}</div>
            <div className={`pi-val${it.cls ? ` ${it.cls}` : ""}${it.mono === false ? "" : ""}`} style={it.mono === false ? { fontFamily: "var(--sans)", fontSize: 13 } : {}}>
              {it.val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── VIEWS ─── */

function Dashboard({ state, onGoToPurchase }) {
  const today = todayStr(), month = thisMonth();
  const low = state.products.filter(p => stockStatus(p) !== "in");
  const todaySales = state.sales.filter(s => dateKey(s.date) === today).reduce((a, x) => a + x.total, 0);
  const monthSales = state.sales.filter(s => monthKey(s.date) === month).reduce((a, x) => a + x.total, 0);
  const totalUnits = state.products.reduce((a, p) => a + (p.quantity || 0), 0);
  const stockValue = state.products.reduce((a, p) => a + (p.quantity || 0) * (p.purchasePrice || 0), 0);
  const recent = [...state.sales].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

  const brandAgg = {};
  state.products.forEach(p => {
    const b = p.brand || "Unspecified";
    if (!brandAgg[b]) brandAgg[b] = { qty: 0, value: 0, models: 0 };
    brandAgg[b].qty += p.quantity || 0;
    brandAgg[b].value += (p.quantity || 0) * (p.sellingPrice || 0);
    brandAgg[b].models += 1;
  });
  const brandRows = Object.entries(brandAgg).sort((a, b) => b[1].value - a[1].value);
  const maxBrandVal = Math.max(...brandRows.map(([, v]) => v.value), 1);
  const totalBrandValue = brandRows.reduce((a, [, v]) => a + v.value, 0);

  // ── 14-day sales trend, drawn as a small inline SVG (no chart library needed) ──
  const trendDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    const key = dateKey(d.toISOString());
    return state.sales.filter(s => dateKey(s.date) === key).reduce((a, x) => a + x.total, 0);
  });
  const trendMax = Math.max(...trendDays, 1);
  const TW = 280, TH = 64, TPAD = 6;
  const stepX = (TW - TPAD * 2) / (trendDays.length - 1);
  const pts = trendDays.map((v, i) => [TPAD + i * stepX, TH - TPAD - (v / trendMax) * (TH - TPAD * 2)]);
  const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const areaPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(1)},${TH - TPAD} L ${pts[0][0].toFixed(1)},${TH - TPAD} Z`;
  const lastPt = pts[pts.length - 1];

  return (
    <>
      <div className="card hero-card">
        <div className="hero-row">
          <div className="hero-figure">
            <div className="hero-label">Today's Sales</div>
            <div className="hero-amount">{money(todaySales)}</div>
            <div className="hero-sub">This month: <strong>{money(monthSales)}</strong></div>
          </div>
          <div className="hero-chart-wrap">
            <svg viewBox={`0 0 ${TW} ${TH}`} className="hero-chart" preserveAspectRatio="none">
              <defs>
                <linearGradient id="dashTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E8A33D" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#E8A33D" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#dashTrendFill)" stroke="none" />
              <path d={linePath} fill="none" stroke="#E8A33D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={lastPt[0]} cy={lastPt[1]} r="3.2" fill="#E8A33D" />
            </svg>
            <div className="hero-chart-label">Last 14 days</div>
          </div>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        {[
          { label: "Total Products", val: state.products.length, icon: "📦" },
          { label: "Total Stock Units", val: totalUnits, icon: "🧮" },
          { label: "Inventory Value (cost)", val: money(stockValue), icon: "💰" },
          { label: "Low / Out of Stock", val: low.length, alert: low.length > 0, icon: "⚠️" },
        ].map(s => (
          <div className={`stat-card${s.alert ? " alert" : ""}`} key={s.label}>
            <div className="stat-label">{s.icon} {s.label}</div>
            <div className="stat-value">{s.val}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">🏷️ Stock value by brand <span className="count">({brandRows.length} brand{brandRows.length === 1 ? "" : "s"} · {money(totalBrandValue)} at selling price)</span></div>
        {!brandRows.length ? (
          <div className="empty"><strong>No products yet</strong>Add products in the Stock tab to see brand-wise stock value.</div>
        ) : (
          brandRows.map(([brand, v]) => (
            <div className="bar-row" key={brand}>
              <span className="bar-label">{brand}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: Math.max(3, (v.value / maxBrandVal) * 100) + "%" }} /></span>
              <span className="bar-val">{money(v.value)} · {v.qty} pcs</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="card-title">⚠️ Low stock &amp; out-of-stock <span className="count">({low.length})</span></div>
        {!low.length ? (
          <div className="empty"><strong>All stocked up</strong>No products are currently low or out of stock.</div>
        ) : (
          <div className="alert-list">
            {low.map(p => {
              const st = stockStatus(p);
              return (
                <div className={`alert-row ${st === "out" ? "is-out" : "is-low"}`} key={p.id}>
                  <div className="alert-main">
                    <span className="alert-icon">{CAT_ICON[p.category] || "🔌"}</span>
                    <div>
                      <div className="alert-name">{p.name}{p.stars ? <span className="stars" style={{ marginLeft: 6 }}>{"⭐".repeat(+p.stars)}</span> : null}</div>
                      <div className="alert-sub">{p.brand || "—"} · {p.category}</div>
                    </div>
                  </div>
                  <div className="alert-right">
                    <span className="alert-qty mono">{p.quantity} left</span>
                    {st === "out" ? <span className="badge badge-red">Out of stock</span> : <span className="badge badge-amber">Low stock</span>}
                    <button className="btn btn-amber btn-sm" onClick={() => onGoToPurchase(p.id)}>+ Add stock</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">🕓 Recent sales</div>
        {!recent.length ? (
          <div className="empty"><strong>No sales yet</strong>Generate your first bill from the Billing tab.</div>
        ) : (
          <div className="sale-list">
            {recent.map(s => (
              <div className="sale-row" key={s.id}>
                <div className="sale-main">
                  <div className="sale-inv mono">{s.invoiceNo}</div>
                  <div className="sale-sub">{s.customerName || "Walk-in"} · {fmtDateTime(s.date)}</div>
                </div>
                <div className="sale-amt mono">{money(s.total)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function BrandGroupedStock({ list, onEdit, onDelete }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (b) => setCollapsed(c => ({ ...c, [b]: !c[b] }));

  const grouped = {};
  list.forEach(p => {
    const b = p.brand || "Unspecified";
    if (!grouped[b]) grouped[b] = {};
    const c = p.category || "Other";
    if (!grouped[b][c]) grouped[b][c] = [];
    grouped[b][c].push(p);
  });
  const brands = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  return (
    <>
      {brands.map(brand => {
        const cats = grouped[brand];
        const catNames = Object.keys(cats).sort();
        const allModels = catNames.flatMap(c => cats[c]);
        const totalQty = allModels.reduce((s, p) => s + (p.quantity || 0), 0);
        const totalValue = allModels.reduce((s, p) => s + (p.quantity || 0) * (p.sellingPrice || 0), 0);
        const isCollapsed = !!collapsed[brand];
        return (
          <div key={brand} style={{ marginBottom: 16, border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            <div onClick={() => toggle(brand)} style={{ background: "var(--navy)", color: "#fff", padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: ".03em" }}>{isCollapsed ? "▸" : "▾"} {brand}</span>
                <span style={{ fontSize: 11.5, color: "#9BAFC5" }}>{catNames.length} categor{catNames.length === 1 ? "y" : "ies"} · {allModels.length} model{allModels.length === 1 ? "" : "s"}</span>
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 12, fontFamily: "var(--mono)" }}>
                <span>{totalQty} units</span>
                <span style={{ color: "var(--amber)" }}>{money(totalValue)}</span>
              </div>
            </div>
            {!isCollapsed && catNames.map(cat => (
              <div key={cat} style={{ padding: "12px 16px", borderTop: "1px solid var(--border-l)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", marginBottom: 8 }}>
                  {CAT_ICON[cat] || "🔌"} {cat} <span className="muted" style={{ fontWeight: 500 }}>({cats[cat].length})</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Model / Name</th><th>Rating</th><th>Mfg Yr</th>
                        <th className="right">Purchase ₹</th><th className="right">Selling ₹</th>
                        <th className="right">Margin</th><th className="right">Qty</th><th>Status</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cats[cat].map(p => {
                        const st = stockStatus(p);
                        const margin = p.sellingPrice - p.purchasePrice;
                        const pct = p.purchasePrice > 0 ? ((margin / p.purchasePrice) * 100).toFixed(1) : "—";
                        return (
                          <tr key={p.id} className={st === "out" ? "out-stock" : st === "low" ? "low-stock" : ""}>
                            <td>
                              <strong>{p.name}</strong>
                              {p.model ? <span className="muted" style={{ display: "block", fontSize: 11 }}>{p.model}</span> : null}
                            </td>
                            <td>{p.stars ? <span className="stars">{"⭐".repeat(+p.stars)}</span> : <span className="muted">—</span>}</td>
                            <td className="muted">{p.mfgYear || "—"}</td>
                            <td className="right mono">{money(p.purchasePrice)}</td>
                            <td className="right mono">{money(p.sellingPrice)}</td>
                            <td className={`right mono ${margin >= 0 ? "pos" : "neg"}`}>{money(margin)} <span style={{ fontSize: 10, opacity: .7 }}>({pct}%)</span></td>
                            <td className="right mono">{p.quantity} {p.unit || "pcs"}</td>
                            <td>
                              {st === "out" ? <span className="badge badge-red">Out</span>
                                : st === "low" ? <span className="badge badge-amber">Low</span>
                                : <span className="badge badge-green">In stock</span>}
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <button className="btn btn-outline btn-sm" onClick={() => onEdit(p)}>Edit</button>{" "}
                              <button className="btn btn-danger btn-sm" onClick={() => onDelete(p)}>Delete</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function StockView({ state, onSave, toast }) {
  const empty = { brand: "", category: "", model: "", stars: "", mfgYear: "", name: "", purchasePrice: "", sellingPrice: "", quantity: "", unit: "pcs", minStock: "2" };
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [filterText, setFilterText] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [confirm, setConfirm] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const brandOptions = Array.from(new Set([...COMMON_BRANDS, ...state.products.map(p => p.brand).filter(Boolean)])).sort((a, b) => a.localeCompare(b));
  const brandsInStock = Array.from(new Set(state.products.map(p => p.brand).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const categoryOptions = Array.from(new Set([...CATEGORIES.filter(c => c !== "Other"), ...state.products.map(p => p.category).filter(Boolean)])).sort((a, b) => a.localeCompare(b)).concat("Other");
  const categoriesInStock = Array.from(new Set(state.products.map(p => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const submit = async () => {
    if (!form.brand.trim()) return toast("Please enter a brand.", "error");
    if (!form.category.trim()) return toast("Please enter a category.", "error");
    if (!form.name.trim()) return toast("Please enter a product name.", "error");
    if (form.purchasePrice === "" || isNaN(+form.purchasePrice)) return toast("Enter a valid purchase price.", "error");
    if (form.sellingPrice === "" || isNaN(+form.sellingPrice)) return toast("Enter a valid selling price.", "error");
    if (form.quantity === "" || isNaN(+form.quantity)) return toast("Enter opening quantity.", "error");

    const data = { ...form, purchasePrice: +form.purchasePrice, sellingPrice: +form.sellingPrice, quantity: +form.quantity, minStock: +form.minStock || 0 };
    const next = { ...state };
    if (editId) {
      next.products = next.products.map(p => p.id === editId ? { ...p, ...data } : p);
      toast("Product updated.");
    } else {
      next.products = [...next.products, { id: uid(), ...data, dateAdded: new Date().toISOString() }];
      toast("Product added.");
    }
    await onSave(next);
    setForm(empty); setEditId(null);
  };

  const startEdit = (p) => {
    setForm({ brand: p.brand || "", category: p.category, model: p.model || "", stars: p.stars || "", mfgYear: p.mfgYear || "", name: p.name, purchasePrice: p.purchasePrice, sellingPrice: p.sellingPrice, quantity: p.quantity, unit: p.unit || "pcs", minStock: p.minStock || 0 });
    setEditId(p.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const delProduct = (p) => setConfirm({ msg: `Delete "${p.name}"? This cannot be undone.`, onYes: async () => { await onSave({ ...state, products: state.products.filter(x => x.id !== p.id) }); toast("Product deleted."); } });

  const list = state.products.filter(p => {
    const t = filterText.toLowerCase();
    return (!t || [p.name, p.brand, p.model, p.category].some(f => (f || "").toLowerCase().includes(t)))
      && (!filterBrand || p.brand === filterBrand)
      && (!filterCat || p.category === filterCat);
  }).sort((a, b) => (a.brand || "").localeCompare(b.brand || "") || (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));

  return (
    <>
      {confirm && <ConfirmModal message={confirm.msg} onYes={() => { confirm.onYes(); setConfirm(null); }} onNo={() => setConfirm(null)} />}
      <div className="card">
        <div className="card-title">{editId ? "✏️ Edit product" : "➕ Add new product"}</div>

        <div className="step-label">Step 1 — Brand &amp; category *</div>
        <div className="grid cols-2">
          <div className="field">
            <label>Brand *</label>
            <input list="brand-suggestions" value={form.brand} placeholder="e.g. Voltas, LG, Samsung…" onChange={e => set("brand", e.target.value)} />
            <datalist id="brand-suggestions">{brandOptions.map(b => <option key={b} value={b} />)}</datalist>
          </div>
          <div className="field">
            <label>Category *</label>
            <input list="category-suggestions" value={form.category} placeholder="e.g. AC, Microwave, Geyser…" onChange={e => set("category", e.target.value)} />
            <datalist id="category-suggestions">{categoryOptions.map(c => <option key={c} value={c} />)}</datalist>
          </div>
        </div>

        <hr className="divider" />

        <div className="step-label">Step 2 — Model, rating &amp; manufacturing year{form.brand ? ` (under "${form.brand}")` : ""}</div>
        <div className="grid cols-3">
          <div className="field"><label>Model / SKU</label><input value={form.model} placeholder="e.g. VLS18-TS3" onChange={e => set("model", e.target.value)} /></div>
          <div className="field">
            <label>Star Rating</label>
            <select value={form.stars} onChange={e => set("stars", e.target.value)}>
              <option value="">No rating</option>
              {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{"⭐".repeat(n)} ({n} Star)</option>)}
            </select>
          </div>
          <div className="field">
            <label>Mfg. Year</label>
            <select value={form.mfgYear} onChange={e => set("mfgYear", e.target.value)}>
              <option value="">Select year</option>
              {MFG_YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="grid cols-2" style={{ marginTop: 14 }}>
          <div className="field"><label>Product name / Display title *</label><input value={form.name} placeholder="e.g. 1.5 Ton Split AC" onChange={e => set("name", e.target.value)} /></div>
        </div>

        <hr className="divider" />

        <div className="step-label">Step 3 — Pricing &amp; stock</div>
        <div className="grid cols-3">
          <div className="field"><label>Purchase price (₹) *</label><input type="number" min="0" value={form.purchasePrice} onChange={e => set("purchasePrice", e.target.value)} /></div>
          <div className="field"><label>Selling price (₹) *</label><input type="number" min="0" value={form.sellingPrice} onChange={e => set("sellingPrice", e.target.value)} /></div>
          <div className="field"><label>Opening quantity *</label><input type="number" min="0" value={form.quantity} onChange={e => set("quantity", e.target.value)} /></div>
        </div>
        <div className="grid cols-2" style={{ marginTop: 14 }}>
          <div className="field"><label>Unit</label><input value={form.unit} placeholder="pcs" onChange={e => set("unit", e.target.value)} /></div>
          <div className="field"><label>Low-stock alert at</label><input type="number" min="0" value={form.minStock} placeholder="2" onChange={e => set("minStock", e.target.value)} /></div>
        </div>

        <div className="btn-row">
          <button className="btn btn-primary" onClick={submit}>{editId ? "Update product" : "Add product"}</button>
          {editId && <button className="btn btn-outline" onClick={() => { setForm(empty); setEditId(null); }}>Cancel edit</button>}
        </div>
      </div>

      <div className="card">
        <div className="card-title">📦 Current stock — by brand <span className="count">({list.length} of {state.products.length})</span></div>
        <div className="grid cols-3" style={{ marginBottom: 12 }}>
          <div className="field"><input placeholder="Filter by name, brand, model…" value={filterText} onChange={e => setFilterText(e.target.value)} /></div>
          <div className="field">
            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
              <option value="">All brands</option>
              {brandsInStock.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="field">
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">All categories</option>
              {categoriesInStock.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {!state.products.length ? (
          <div className="empty"><strong>No products yet</strong>Add your first item using the form above.</div>
        ) : !list.length ? (
          <div className="empty"><strong>No matches</strong>Try different filters.</div>
        ) : (
          <BrandGroupedStock list={list} onEdit={startEdit} onDelete={delProduct} />
        )}
      </div>
    </>
  );
}

function PurchaseView({ state, onSave, toast, jumpToProductId, clearJump }) {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [qty, setQty] = useState("");
  const [newPurchasePrice, setNewPurchasePrice] = useState("");
  const [newSellingPrice, setNewSellingPrice] = useState("");
  const [supplier, setSupplier] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [phKw, setPhKw] = useState("");
  const [phFrom, setPhFrom] = useState("");
  const [phTo, setPhTo] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const pickerKey = useRef(0);

  useEffect(() => {
    if (jumpToProductId) {
      const p = state.products.find(x => x.id === jumpToProductId);
      if (p) {
        setSelectedProduct(p);
        setNewPurchasePrice(p.purchasePrice || "");
        pickerKey.current += 1;
      }
      clearJump();
    }
  }, [jumpToProductId]);

  const selectProduct = (p) => {
    setSelectedProduct(p);
    setNewPurchasePrice(p ? p.purchasePrice || "" : "");
    setNewSellingPrice("");
  };

  const clearForm = () => {
    setSelectedProduct(null); setQty(""); setNewPurchasePrice(""); setNewSellingPrice("");
    setSupplier(""); setSupplierPhone(""); setInvoiceNo(""); setPurchaseDate(todayStr()); setNote("");
    pickerKey.current += 1;
  };

  const submit = async () => {
    if (!selectedProduct) return toast("Please select a product first.", "error");
    const q = parseInt(qty, 10);
    if (!q || q <= 0) return toast("Enter a valid quantity received.", "error");

    const original = state.products.find(x => x.id === selectedProduct.id);
    if (!original) return toast("Product not found.", "error");

    const prevQty = original.quantity;
    const prevPurchase = original.purchasePrice;
    const prevSelling = original.sellingPrice;
    const nextQty = prevQty + q;
    const nextPurchase = (newPurchasePrice !== "" && !isNaN(+newPurchasePrice) && +newPurchasePrice > 0) ? +newPurchasePrice : prevPurchase;
    const nextSelling = (newSellingPrice !== "" && !isNaN(+newSellingPrice) && +newSellingPrice > 0) ? +newSellingPrice : prevSelling;

    // Build a brand-new product object (not a mutation of `original`) so the
    // sync layer can tell old vs new apart and actually push the update.
    const updated = { ...original, quantity: nextQty, purchasePrice: nextPurchase, sellingPrice: nextSelling };

    const next = {
      ...state,
      products: state.products.map(x => x.id === updated.id ? updated : x),
      stockLog: [...(state.stockLog || []), {
        id: uid(),
        date: purchaseDate ? new Date(purchaseDate).toISOString() : new Date().toISOString(),
        productId: updated.id, productName: updated.name, category: updated.category,
        qtyAdded: q, qtyBefore: prevQty, qtyAfter: updated.quantity,
        purchasePriceBefore: prevPurchase, purchasePriceAfter: updated.purchasePrice,
        sellingPriceBefore: prevSelling, sellingPriceAfter: updated.sellingPrice,
        supplierName: supplier.trim(), supplierPhone: supplierPhone.trim(),
        invoiceNo: invoiceNo.trim(), note: note.trim(),
      }],
    };
    await onSave(next);
    toast(`Added ${q} ${updated.unit || "pcs"} to "${updated.name}". New stock: ${updated.quantity}.`);
    setQty(""); setInvoiceNo(""); setNote("");
    setSelectedProduct(updated);
  };

  const deleteEntry = async (l) => {
    const product = state.products.find(x => x.id === l.productId);
    let nextProducts = state.products;
    if (product) {
      // Only roll the price back if nothing has changed it since this entry —
      // otherwise we'd clobber a legitimate, more recent price update.
      const revertPurchase = product.purchasePrice === l.purchasePriceAfter ? l.purchasePriceBefore : product.purchasePrice;
      const revertSelling = product.sellingPrice === l.sellingPriceAfter ? l.sellingPriceBefore : product.sellingPrice;
      const updated = { ...product, quantity: Math.max(0, (product.quantity || 0) - (l.qtyAdded || 0)), purchasePrice: revertPurchase, sellingPrice: revertSelling };
      nextProducts = state.products.map(x => x.id === product.id ? updated : x);
    }
    const next = { ...state, products: nextProducts, stockLog: (state.stockLog || []).filter(x => x.id !== l.id) };
    await onSave(next);
    toast(`Deleted purchase entry for "${l.productName}". Stock adjusted back.`);
    setDeleteTarget(null);
  };

  const log = [...(state.stockLog || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).filter(l => {
    const k = (phKw || "").toLowerCase();
    return (!k || [l.productName, l.supplierName, l.invoiceNo, l.note].some(f => (f || "").toLowerCase().includes(k)))
      && (!phFrom || dateKey(l.date) >= phFrom)
      && (!phTo || dateKey(l.date) <= phTo);
  });

  return (
    <>
      <div className="card">
        <div className="card-title">📥 Purchase entry — Add stock</div>

        <div className="step-label">Step 1 — Search &amp; select product *</div>
        <ProductPicker key={pickerKey.current} products={state.products} onSelect={selectProduct} />
        {selectedProduct && <ProductPreview product={selectedProduct} />}

        <hr className="divider" />

        <div className="step-label">Step 2 — Quantity &amp; price</div>
        <div className="grid cols-3">
          <div className="field"><label>Quantity received *</label><input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. 5" /></div>
          <div className="field"><label>New purchase price (₹)</label><input type="number" min="0" value={newPurchasePrice} onChange={e => setNewPurchasePrice(e.target.value)} placeholder="Blank = keep current" /></div>
          <div className="field"><label>Update selling price (₹)</label><input type="number" min="0" value={newSellingPrice} onChange={e => setNewSellingPrice(e.target.value)} placeholder="Blank = keep current" /></div>
        </div>

        <hr className="divider" />

        <div className="step-label">Step 3 — Supplier &amp; invoice details (optional)</div>
        <div className="grid cols-2">
          <div className="field"><label>Supplier name</label><input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Sharma Electronics Wholesale" /></div>
          <div className="field"><label>Supplier phone</label><input value={supplierPhone} onChange={e => setSupplierPhone(e.target.value)} placeholder="e.g. 9876543210" /></div>
          <div className="field"><label>Supplier invoice no.</label><input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="e.g. SUP-2210" /></div>
          <div className="field"><label>Purchase date</label><input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Note</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="Any additional note…" /></div>
        </div>

        <div className="btn-row">
          <button className="btn btn-amber" onClick={submit}>✅ Save purchase entry</button>
          <button className="btn btn-outline" onClick={clearForm}>Clear form</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">📋 Purchase history <span className="count">({log.length} of {(state.stockLog || []).length})</span></div>
        <div className="ph-filters">
          <div className="field"><label>Search</label><input value={phKw} onChange={e => setPhKw(e.target.value)} placeholder="Product, supplier, invoice…" /></div>
          <div className="field"><label>From date</label><input type="date" value={phFrom} onChange={e => setPhFrom(e.target.value)} /></div>
          <div className="field"><label>To date</label><input type="date" value={phTo} onChange={e => setPhTo(e.target.value)} /></div>
          <div style={{ alignSelf: "flex-end" }}><button className="btn btn-outline btn-sm" onClick={() => { setPhKw(""); setPhFrom(""); setPhTo(""); }}>Clear</button></div>
        </div>
        {!(state.stockLog || []).length ? (
          <div className="empty"><strong>No purchase entries yet</strong>Add stock using the form above.</div>
        ) : !log.length ? (
          <div className="empty"><strong>No matches</strong>Try different filters.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Product</th><th>Category</th>
                  <th className="right">Qty added</th><th className="right">Stock after</th>
                  <th className="right">Purchase ₹</th><th>Supplier</th><th>Invoice</th><th>Note</th><th></th>
                </tr>
              </thead>
              <tbody>
                {log.map(l => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(l.date)}</td>
                    <td><strong>{l.productName}</strong></td>
                    <td>{CAT_ICON[l.category] || "🔌"} {l.category || ""}</td>
                    <td className="right mono" style={{ color: "var(--green)" }}>+{l.qtyAdded}</td>
                    <td className="right mono">{l.qtyAfter}</td>
                    <td className="right mono">{money(l.purchasePriceAfter)}</td>
                    <td>{l.supplierName || "—"}{l.supplierPhone ? <span className="muted" style={{ fontSize: 11, display: "block" }}>{l.supplierPhone}</span> : null}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{l.invoiceNo || "—"}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{l.note || "—"}</td>
                    <td><button className="btn-ghost" title="Delete this entry" onClick={() => setDeleteTarget(l)}>🗑️</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          message={`Delete this purchase entry? "${deleteTarget.productName}" stock will go back down by ${deleteTarget.qtyAdded}${deleteTarget.qtyAfter != null ? ` (from ${deleteTarget.qtyAfter} to ${Math.max(0, deleteTarget.qtyAfter - deleteTarget.qtyAdded)})` : ""}. This can't be undone.`}
          onYes={() => deleteEntry(deleteTarget)}
          onNo={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

function BillingView({ state, onSave, toast, getNextInvoiceNo }) {
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [payMode, setPayMode] = useState("Cash");
  const [billSearch, setBillSearch] = useState("");
  const [billResults, setBillResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [billModal, setBillModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleBillSearch = (q) => {
    setBillSearch(q);
    if (!q.trim()) { setShowResults(false); return; }
    setBillResults(state.products.filter(p => [p.name, p.brand, p.model, p.category].some(f => (f || "").toLowerCase().includes(q.toLowerCase()))).slice(0, 8));
    setShowResults(true);
  };

  const addToCart = (p) => {
    if (!p || p.quantity <= 0) return;
    setCart(prev => {
      const ex = prev.find(c => c.productId === p.id);
      if (ex) {
        if (ex.qty >= p.quantity) { toast("No more stock.", "error"); return prev; }
        return prev.map(c => c.productId === p.id ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { productId: p.id, name: p.name, brand: p.brand || "", category: p.category, qty: 1, price: p.sellingPrice, purchasePrice: p.purchasePrice, stockAvail: p.quantity }];
    });
    setBillSearch(""); setShowResults(false);
  };

  const updateQty = (id, v) => {
    const p = state.products.find(x => x.id === id);
    let q = parseInt(v, 10);
    if (isNaN(q) || q < 1) q = 1;
    if (q > (p ? p.quantity : 9999)) { toast(`Only ${p.quantity} in stock.`, "error"); q = p.quantity; }
    setCart(prev => prev.map(c => c.productId === id ? { ...c, qty: q } : c));
  };

  const updatePrice = (id, v) => {
    const pr = parseFloat(v); if (isNaN(pr) || pr < 0) return;
    setCart(prev => prev.map(c => c.productId === id ? { ...c, price: pr } : c));
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(c => c.productId !== id));

  const subtotal = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const total = Math.max(0, subtotal - (discount || 0));

  const generateBill = async () => {
    if (!cart.length) return toast("Add at least one product.", "error");
    for (const c of cart) {
      const p = state.products.find(x => x.id === c.productId);
      if (!p || c.qty > p.quantity) return toast(`Not enough stock for "${c.name}".`, "error");
    }
    const disc = Math.min(discount || 0, subtotal);
    let invoiceNo;
    try { invoiceNo = await getNextInvoiceNo(); }
    catch { return toast("Could not generate invoice number — check your connection.", "error"); }
    const sale = {
      id: uid(), invoiceNo, date: new Date().toISOString(),
      customerName: customer.trim(), customerPhone: phone.trim(),
      items: cart.map(c => ({ ...c, total: c.qty * c.price })),
      subtotal, discount: disc, total: Math.max(0, subtotal - disc),
      paymentMode: payMode,
    };
    const next = {
      ...state,
      products: state.products.map(p => {
        const c = cart.find(c => c.productId === p.id);
        return c ? { ...p, quantity: Math.max(0, p.quantity - c.qty) } : p;
      }),
      sales: [...state.sales, sale],
    };
    await onSave(next);
    setCart([]); setCustomer(""); setPhone(""); setDiscount(0);
    setBillModal(sale);
    toast(`Bill ${invoiceNo} generated.`);
  };

  const recent = [...state.sales].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12);

  return (
    <>
      {confirm && <ConfirmModal message={confirm.msg} onYes={() => { confirm.onYes(); setConfirm(null); }} onNo={() => setConfirm(null)} />}
      {billModal && <BillModal sale={billModal} onClose={() => setBillModal(null)} />}

      <div className="card">
        <div className="card-title">🧾 New sale</div>
        <div className="grid cols-2" style={{ marginBottom: 12 }}>
          <div className="field"><label>Customer name (optional)</label><input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Walk-in customer" /></div>
          <div className="field"><label>Phone (optional)</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="10-digit mobile" /></div>
        </div>

        <div className="field" style={{ marginBottom: 16, position: "relative" }} ref={searchRef}>
          <label>Search product to add</label>
          <input value={billSearch} onChange={e => handleBillSearch(e.target.value)} placeholder="Type product name, brand, model or category…" autoComplete="off" />
          {showResults && billResults.length > 0 && (
            <div className="picker-dropdown">
              {billResults.map(p => {
                const out = p.quantity <= 0;
                return (
                  <div key={p.id} className={`picker-row${out ? " disabled" : ""}`} onClick={() => !out && addToCart(p)}>
                    <div>
                      <div className="pr-name">{CAT_ICON[p.category] || "🔌"} {p.brand ? <strong>{p.brand}</strong> : null}{p.brand ? " — " : ""}{p.name}</div>
                    </div>
                    <div className="pr-right">
                      <div className="pr-price">{money(p.sellingPrice)}</div>
                      <div className={`pr-stock ${out ? "out" : "ok"}`}>{out ? "Out of stock" : p.quantity + " left"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th className="center">Qty</th><th className="right">Price (₹)</th><th className="right">Total (₹)</th><th></th></tr></thead>
            <tbody>
              {!cart.length ? (
                <tr><td colSpan={5} className="empty" style={{ padding: "20px 10px" }}>Search and select products to add them to this bill.</td></tr>
              ) : cart.map(c => (
                <tr key={c.productId}>
                  <td>{CAT_ICON[c.category] || "🔌"} {c.brand ? <strong>{c.brand}</strong> : null}{c.brand ? " — " : ""}{c.name}</td>
                  <td className="center"><input type="number" className="qty-inp" min={1} max={c.stockAvail} value={c.qty} onChange={e => updateQty(c.productId, e.target.value)} /></td>
                  <td className="right"><input type="number" className="price-inp" min={0} step={0.01} value={c.price} onChange={e => updatePrice(c.productId, e.target.value)} /></td>
                  <td className="right mono">{money(c.qty * c.price)}</td>
                  <td className="center"><button className="btn-ghost" onClick={() => removeFromCart(c.productId)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid cols-2" style={{ marginTop: 14 }}>
          <div className="field"><label>Discount (₹)</label><input type="number" min={0} step={0.01} value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} /></div>
          <div className="field"><label>Payment mode</label>
            <select value={payMode} onChange={e => setPayMode(e.target.value)}>
              {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="bill-totals" style={{ marginTop: 14 }}>
          <div className="bill-row"><span>Subtotal</span><span className="mono">{money(subtotal)}</span></div>
          <div className="bill-row grand"><span>Grand total</span><span className="mono">{money(total)}</span></div>
        </div>

        <div className="btn-row">
          <button className="btn btn-primary" onClick={generateBill}>Generate bill</button>
          <button className="btn btn-outline" onClick={() => { if (cart.length) setConfirm({ msg: "Clear all items from this bill?", onYes: () => setCart([]) }); }}>Clear cart</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🧾 Recent invoices <span className="count">({state.sales.length} total)</span></div>
        {!recent.length ? (
          <div className="empty"><strong>No invoices yet</strong>Generate your first bill above.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Payment</th><th className="right">Total</th><th></th></tr></thead>
              <tbody>
                {recent.map(s => (
                  <tr key={s.id}>
                    <td className="mono">{s.invoiceNo}</td>
                    <td>{fmtDateTime(s.date)}</td>
                    <td>{s.customerName || "Walk-in"}</td>
                    <td><span className="badge badge-blue">{s.paymentMode}</span></td>
                    <td className="right mono">{money(s.total)}</td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => setBillModal(s)}>View / Print</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function BillModal({ sale, onClose }) {
  return (
    <div id="bill-print-portal" className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="bill-head">
          <h3>DEKA ELECTRONICS</h3>
          <div className="sub">AC · Fridge / Deep Freezer · Washing Machine · Fan · Other</div>
        </div>
        <div className="bill-meta">
          <div>Invoice: <strong className="mono">{sale.invoiceNo}</strong></div>
          <div>{fmtDateTime(sale.date)}</div>
        </div>
        {(sale.customerName || sale.customerPhone) && (
          <div className="bill-meta">
            <div>Customer: {sale.customerName || "—"}</div>
            <div>{sale.customerPhone || ""}</div>
          </div>
        )}
        <table className="bill-tbl">
          <thead><tr><th>Item</th><th className="center">Qty</th><th className="right">Price</th><th className="right">Total</th></tr></thead>
          <tbody>
            {sale.items.map((it, i) => (
              <tr key={i}>
                <td>{it.name}</td><td className="center">{it.qty}</td>
                <td className="right mono">{money(it.price)}</td><td className="right mono">{money(it.qty * it.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="bill-totals">
          <div className="bill-row"><span>Subtotal</span><span className="mono">{money(sale.subtotal)}</span></div>
          <div className="bill-row"><span>Discount</span><span className="mono">−{money(sale.discount)}</span></div>
          <div className="bill-row grand"><span>Grand total</span><span className="mono">{money(sale.total)}</span></div>
          <div className="bill-row muted"><span>Payment mode</span><span>{sale.paymentMode}</span></div>
        </div>
        <div className="bill-foot">Thank you for shopping at Deka Electronics!</div>
        <div className="modal-actions no-print">
          <button className="btn btn-amber" onClick={() => window.print()}>🖨️ Print bill</button>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ReportsView({ state }) {
  const [tab, setTab] = useState("daily");
  const [date, setDate] = useState(todayStr());
  const [month, setMonth] = useState(thisMonth());

  const daySales = state.sales.filter(s => dateKey(s.date) === date);
  const monthSales = state.sales.filter(s => monthKey(s.date) === month);

  const dailyRevenue = daySales.reduce((a, x) => a + x.total, 0);
  const dailyProfit = daySales.reduce((a, x) => a + profitOf(x), 0);
  const dailyItems = daySales.reduce((a, x) => a + x.items.reduce((b, it) => b + it.qty, 0), 0);

  const monthRevenue = monthSales.reduce((a, x) => a + x.total, 0);
  const monthProfit = monthSales.reduce((a, x) => a + profitOf(x), 0);
  const monthItems = monthSales.reduce((a, x) => a + x.items.reduce((b, it) => b + it.qty, 0), 0);

  const topAgg = {};
  monthSales.forEach(s => s.items.forEach(it => {
    if (!topAgg[it.name]) topAgg[it.name] = { name: it.name, qty: 0, revenue: 0 };
    topAgg[it.name].qty += it.qty; topAgg[it.name].revenue += it.total;
  }));
  const top = Object.values(topAgg).sort((a, b) => b.qty - a.qty).slice(0, 10);

  const brandAgg = {};
  monthSales.forEach(s => s.items.forEach(it => {
    const b = it.brand || "Unspecified";
    if (!brandAgg[b]) brandAgg[b] = { brand: b, qty: 0, revenue: 0 };
    brandAgg[b].qty += it.qty; brandAgg[b].revenue += it.total;
  }));
  const topBrands = Object.values(brandAgg).sort((a, b) => b.revenue - a.revenue);

  const byDay = {};
  monthSales.forEach(s => { const k = dateKey(s.date); byDay[k] = (byDay[k] || 0) + s.total; });
  const days = Object.keys(byDay).sort();
  const maxVal = Math.max(...days.map(d => byDay[d]), 1);

  return (
    <div className="card">
      <div className="pill-tabs">
        {["daily", "monthly"].map(t => (
          <button key={t} className={`pill${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "daily" ? "Daily report" : "Monthly report"}
          </button>
        ))}
      </div>

      {tab === "daily" ? (
        <>
          <div className="field" style={{ maxWidth: 220, marginBottom: 16 }}>
            <label>Pick a date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            {[["Invoices", daySales.length], ["Items sold", dailyItems], ["Revenue", money(dailyRevenue)], ["Est. profit", money(dailyProfit)]].map(([l, v]) => (
              <div className="stat-card" key={l}><div className="stat-label">{l}</div><div className="stat-value">{v}</div></div>
            ))}
          </div>
          {!daySales.length ? <div className="empty"><strong>No sales on this date</strong>Try picking another day.</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Invoice</th><th>Time</th><th>Customer</th><th>Items</th><th className="right">Total</th></tr></thead>
                <tbody>
                  {daySales.sort((a, b) => new Date(b.date) - new Date(a.date)).map(s => (
                    <tr key={s.id}>
                      <td className="mono">{s.invoiceNo}</td>
                      <td>{new Date(s.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td>{s.customerName || "Walk-in"}</td>
                      <td className="muted">{s.items.map(it => it.name + " ×" + it.qty).join(", ")}</td>
                      <td className="right mono">{money(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="field" style={{ maxWidth: 220, marginBottom: 16 }}>
            <label>Pick a month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            {[["Invoices", monthSales.length], ["Items sold", monthItems], ["Revenue", money(monthRevenue)], ["Est. profit", money(monthProfit)]].map(([l, v]) => (
              <div className="stat-card" key={l}><div className="stat-label">{l}</div><div className="stat-value">{v}</div></div>
            ))}
          </div>
          <div className="card-title" style={{ marginTop: 4 }}>🏆 Top-selling products</div>
          {!top.length ? <div className="empty"><strong>No sales this month</strong>Try another month.</div> : (
            <div className="table-wrap" style={{ marginBottom: 18 }}>
              <table>
                <thead><tr><th>Product</th><th className="right">Units sold</th><th className="right">Revenue</th></tr></thead>
                <tbody>
                  {top.map(t => (
                    <tr key={t.name}><td>{t.name}</td><td className="right mono">{t.qty}</td><td className="right mono">{money(t.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card-title">🏷️ Sales by brand</div>
          {!topBrands.length ? <div className="empty"><strong>No sales this month</strong>Try another month.</div> : (
            <div className="table-wrap" style={{ marginBottom: 18 }}>
              <table>
                <thead><tr><th>Brand</th><th className="right">Units sold</th><th className="right">Revenue</th></tr></thead>
                <tbody>
                  {topBrands.map(b => (
                    <tr key={b.brand}><td>{b.brand}</td><td className="right mono">{b.qty}</td><td className="right mono">{money(b.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card-title">📅 Day-by-day sales</div>
          {!days.length ? <div className="empty">No daily data for this month yet.</div> : days.map(d => (
            <div className="bar-row" key={d}>
              <span className="bar-label">{d.slice(5)}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: Math.max(3, (byDay[d] / maxVal) * 100) + "%" }} /></span>
              <span className="bar-val">{money(byDay[d])}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SearchView({ state, onEditProduct }) {
  const [tab, setTab] = useState("products");
  const [spKw, setSpKw] = useState(""); const [spBrand, setSpBrand] = useState(""); const [spCat, setSpCat] = useState(""); const [spStatus, setSpStatus] = useState(""); const [spMin, setSpMin] = useState(""); const [spMax, setSpMax] = useState("");
  const [ssKw, setSsKw] = useState(""); const [ssFrom, setSsFrom] = useState(""); const [ssTo, setSsTo] = useState("");
  const [billModal, setBillModal] = useState(null);

  const brandOptions = Array.from(new Set(state.products.map(p => p.brand).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const categoryOptions = Array.from(new Set(state.products.map(p => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const products = state.products.filter(p => {
    const k = spKw.toLowerCase();
    return (!k || [p.name, p.brand, p.model, p.category].some(f => (f || "").toLowerCase().includes(k)))
      && (!spBrand || p.brand === spBrand)
      && (!spCat || p.category === spCat)
      && (!spStatus || stockStatus(p) === spStatus)
      && (!spMin || p.sellingPrice >= +spMin)
      && (!spMax || p.sellingPrice <= +spMax);
  }).sort((a, b) => (a.brand || "").localeCompare(b.brand || "") || a.name.localeCompare(b.name));

  const sales = state.sales.filter(s => {
    const k = ssKw.toLowerCase();
    return (!k || [s.invoiceNo, s.customerName, s.customerPhone].some(f => (f || "").toLowerCase().includes(k)))
      && (!ssFrom || dateKey(s.date) >= ssFrom)
      && (!ssTo || dateKey(s.date) <= ssTo);
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <>
      {billModal && <BillModal sale={billModal} onClose={() => setBillModal(null)} />}
      <div className="card">
        <div className="pill-tabs">
          {["products", "sales"].map(t => (
            <button key={t} className={`pill${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
              {t === "products" ? "Search products" : "Search sales / invoices"}
            </button>
          ))}
        </div>

        {tab === "products" ? (
          <>
            <div className="grid cols-4" style={{ marginBottom: 14 }}>
              <div className="field"><label>Keyword</label><input value={spKw} onChange={e => setSpKw(e.target.value)} placeholder="Name, brand, model…" /></div>
              <div className="field"><label>Brand</label>
                <select value={spBrand} onChange={e => setSpBrand(e.target.value)}>
                  <option value="">All</option>{brandOptions.map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div className="field"><label>Category</label>
                <select value={spCat} onChange={e => setSpCat(e.target.value)}>
                  <option value="">All</option>{categoryOptions.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="field"><label>Stock status</label>
                <select value={spStatus} onChange={e => setSpStatus(e.target.value)}>
                  <option value="">All</option>
                  <option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
                </select>
              </div>
              <div className="field"><label>Price range (₹)</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="number" value={spMin} onChange={e => setSpMin(e.target.value)} placeholder="Min" />
                  <input type="number" value={spMax} onChange={e => setSpMax(e.target.value)} placeholder="Max" />
                </div>
              </div>
            </div>
            {!products.length ? <div className="empty"><strong>No matches</strong>Try widening your filters.</div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Product</th><th>Brand</th><th>Category</th><th className="right">Selling ₹</th><th className="right">Qty</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {products.map(p => {
                      const st = stockStatus(p);
                      return (
                        <tr key={p.id}>
                          <td><strong>{p.name}</strong>{p.stars ? <span className="stars" style={{ marginLeft: 5 }}>{"⭐".repeat(+p.stars)}</span> : null}{p.model ? <span className="muted" style={{ display: "block", fontSize: 11 }}>{p.model}</span> : null}</td>
                          <td>{p.brand || "—"}</td>
                          <td>{CAT_ICON[p.category] || "🔌"} {p.category}</td>
                          <td className="right mono">{money(p.sellingPrice)}</td>
                          <td className="right mono">{p.quantity}</td>
                          <td>{st === "out" ? <span className="badge badge-red">Out</span> : st === "low" ? <span className="badge badge-amber">Low</span> : <span className="badge badge-green">In stock</span>}</td>
                          <td><button className="btn btn-outline btn-sm" onClick={() => onEditProduct(p.id)}>Edit</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid cols-4" style={{ marginBottom: 14 }}>
              <div className="field"><label>Keyword</label><input value={ssKw} onChange={e => setSsKw(e.target.value)} placeholder="Invoice no, customer, phone…" /></div>
              <div className="field"><label>From date</label><input type="date" value={ssFrom} onChange={e => setSsFrom(e.target.value)} /></div>
              <div className="field"><label>To date</label><input type="date" value={ssTo} onChange={e => setSsTo(e.target.value)} /></div>
              <div style={{ alignSelf: "flex-end" }}>
                <button className="btn btn-outline" style={{ width: "100%" }} onClick={() => { setSsKw(""); setSsFrom(""); setSsTo(""); }}>Clear filters</button>
              </div>
            </div>
            {!sales.length ? <div className="empty"><strong>No matches</strong>Try a different keyword or date range.</div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Phone</th><th className="right">Total</th><th></th></tr></thead>
                  <tbody>
                    {sales.map(s => (
                      <tr key={s.id}>
                        <td className="mono">{s.invoiceNo}</td>
                        <td>{fmtDateTime(s.date)}</td>
                        <td>{s.customerName || "Walk-in"}</td>
                        <td>{s.customerPhone || "—"}</td>
                        <td className="right mono">{money(s.total)}</td>
                        <td><button className="btn btn-outline btn-sm" onClick={() => setBillModal(s)}>View / Print</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ─── ROOT APP ─── */
const TABS = [
  { id: "dashboard", label: "📊 Dashboard" },
  { id: "stock", label: "📦 Stock" },
  { id: "purchase", label: "📥 Purchase Entry" },
  { id: "billing", label: "🧾 Billing" },
  { id: "reports", label: "📈 Reports" },
  { id: "search", label: "🔍 Advance Search" },
];

export default function App() {
  const [state, setState] = useState({ products: [], sales: [], stockLog: [] });
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [jumpProductId, setJumpProductId] = useState(null);
  const [editProductTarget, setEditProductTarget] = useState(null);

  const showToast = useCallback((msg, type = "ok") => {
    setToast({ msg, type, key: Date.now() });
  }, []);

  // ── Auth: pick up existing session, and react to sign-in/sign-out ──
  useEffect(() => {
    if (!supabaseConfigured) { setAuthChecked(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthChecked(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => listener.subscription.unsubscribe();
  }, []);

  const refreshData = useCallback(async () => {
    const data = await fetchAllData();
    if (data) setState(data);
    return data;
  }, []);

  // ── Initial data load once logged in ──
  useEffect(() => {
    if (!session) return;
    setLoading(true);
    refreshData().finally(() => setLoading(false));
  }, [session, refreshData]);

  // ── Live updates from other staff devices (requires Realtime enabled on these tables in Supabase) ──
  useEffect(() => {
    if (!session) return;
    let debounce;
    const onChange = () => { clearTimeout(debounce); debounce = setTimeout(refreshData, 400); };
    const channel = supabase
      .channel("store-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_log" }, onChange)
      .subscribe();
    return () => { clearTimeout(debounce); supabase.removeChannel(channel); };
  }, [session, refreshData]);

  const save = async (next) => {
    const prev = state;
    setState(next); // optimistic UI update
    const ok = await syncDiff(prev, next);
    if (!ok) showToast("Sync failed — check your internet connection.", "error");
    return ok;
  };

  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `deka-backup-${todayStr()}.json` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast("Backup downloaded.");
  };

  const restoreBackup = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const next = { products: parsed.products || [], sales: parsed.sales || [], stockLog: parsed.stockLog || [] };
        save(next); showToast("Backup restored to the cloud database.");
      } catch { showToast("Invalid backup file.", "error"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const goToPurchase = (productId) => {
    setJumpProductId(productId);
    setTab("purchase");
  };

  const goToEditProduct = (productId) => {
    setEditProductTarget(productId);
    setTab("stock");
  };

  if (!supabaseConfigured) return <ConfigMissing />;
  if (!authChecked) return (
    <div style={{ position: "fixed", inset: 0, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, letterSpacing: ".03em" }}>
      <style>{css}</style>
      Checking session…
    </div>
  );
  if (!session) return (<><style>{css}</style><LoginScreen onLoggedIn={() => {}} /></>);
  if (loading) return (
    <div style={{ position: "fixed", inset: 0, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, letterSpacing: ".03em" }}>
      <style>{css}</style>
      Loading your store data…
    </div>
  );

  return (
    <>
      <style>{css}</style>
      {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <h1>DEKA ELECTRONICS</h1>
            <span className="tag">Store Manager</span>
          </div>
          <div className="topbar-actions">
            <span className="topbar-cats">{session.user?.email}</span>
            <button className="btn btn-sm btn-outline" style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontSize: 12 }} onClick={downloadBackup}>⬇️ Backup</button>
            <button className="btn btn-sm btn-outline" style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontSize: 12 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      <div className="main">
        {tab === "dashboard" && <Dashboard state={state} onGoToPurchase={goToPurchase} />}
        {tab === "stock" && <StockView state={state} onSave={save} toast={showToast} editTarget={editProductTarget} clearEditTarget={() => setEditProductTarget(null)} />}
        {tab === "purchase" && <PurchaseView state={state} onSave={save} toast={showToast} jumpToProductId={jumpProductId} clearJump={() => setJumpProductId(null)} />}
        {tab === "billing" && <BillingView state={state} onSave={save} toast={showToast} getNextInvoiceNo={getNextInvoiceNo} />}
        {tab === "reports" && <ReportsView state={state} />}
        {tab === "search" && <SearchView state={state} onEditProduct={goToEditProduct} />}
      </div>

      <footer style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px calc(30px + env(safe-area-inset-bottom, 0px))", color: "var(--muted)", fontSize: 11.5, textAlign: "center" }}>
        Data is stored securely in your store's cloud database.{" "}
        <button style={{ background: "none", border: "none", color: "var(--navy)", fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontSize: 11.5 }} onClick={downloadBackup}>Download a backup</button>
        {" "}·{" "}
        <label style={{ color: "var(--navy)", fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontSize: 11.5 }}>
          Restore a backup
          <input type="file" accept="application/json" style={{ display: "none" }} onChange={restoreBackup} />
        </label>
      </footer>
    </>
  );
}
