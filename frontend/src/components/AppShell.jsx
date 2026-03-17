import { useEffect, useState, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useWallet } from "../hooks/useWallet";
import { useExchange } from "../hooks/useExchange";
import { usePrices } from "../hooks/usePrices";
import { CHAINS } from "../services/wallet";
import { toast } from "./Toast";
import WalletModal from "./WalletModal";

const VIEWS = [
  { path:"/",         icon:"⬡", label:"Dashboard"      },
  { path:"/trading",  icon:"◈", label:"Trading"         },
  { path:"/pools",    icon:"◎", label:"Liquidity Pools"  },
  { path:"/bot",      icon:"⟁", label:"Trading Bot"     },
  { path:"/botdash",  icon:"⊞", label:"Bot Dashboard"   },
  { path:"/paper",    icon:"◇", label:"Paper / Backtest" },
];

export default function AppShell() {
  const nav = useNavigate();
  const loc = useLocation();
  const { session, logout }  = useAuth();
  const { wallet, openModal, reconnect, refreshBlock } = useWallet();
  const { loadHL, loadBX }   = useExchange();
  const { start, stop, prices, changes } = usePrices();
  const [udOpen, setUdOpen]  = useState(false);
  const [theme,  setTheme]   = useState(localStorage.getItem("ndx_theme") || "dark");
  const udRef = useRef(null);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  useEffect(() => {
    if (!session) return;
    reconnect();
    loadHL(session.token);
    loadBX(session.token);
    start();
    const t = setInterval(refreshBlock, 12000);
    return () => { stop(); clearInterval(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  useEffect(() => {
    const fn = e => {
      if (["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName)) return;
      const map = {"1":"/","2":"/trading","3":"/pools","4":"/bot","5":"/paper","0":"/settings"};
      if (map[e.key]) nav(map[e.key]);
      if (e.key === "Escape") setUdOpen(false);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [nav]);

  useEffect(() => {
    const fn = e => { if (udRef.current && !udRef.current.contains(e.target)) setUdOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("ndx_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  const chain = wallet ? (CHAINS[wallet.chainId] || { name:"Unknown", sym:"?", color:"#888" }) : null;
  const ticker = Object.entries(prices).map(([sym, p]) => {
    const chg = changes[sym] || 0;
    return `<span style="margin-right:20px">${sym} <strong style="color:var(--cyan)">$${p >= 1000 ? Math.round(p).toLocaleString() : p.toFixed(4)}</strong> <span style="color:${chg >= 0 ? "var(--green)" : "var(--red)"};font-size:10px">${chg >= 0 ? "▲+" : "▼"}${chg.toFixed(2)}%</span></span>`;
  }).join("");

  return (
    <div className="shell">
      {/* ── SIDEBAR ── */}
      <nav className="sidebar">
        <div className="s-logo">◈</div>
        {VIEWS.map(v => (
          <button key={v.path} className={`nav${loc.pathname === v.path ? " on" : ""}`}
            onClick={() => nav(v.path)} aria-label={v.label}>
            <span>{v.icon}</span>
            <span className="ntip">{v.label}</span>
          </button>
        ))}
        <div style={{ flex:1 }}/>
        <button className="theme-btn" onClick={toggleTheme} title="Toggle theme">{theme === "dark" ? "○" : "●"}</button>
        <button className="nav" onClick={() => nav("/settings")}><span>⚙</span><span className="ntip">Settings</span></button>
        <div style={{ position:"relative" }}>
          <button className="uavatar" onClick={() => setUdOpen(o => !o)}>
            {session?.avatar || "?"}
            <span className="ntip">Account</span>
          </button>
        </div>
      </nav>

      {/* ── MAIN ── */}
      <main className="main">
        <header className="topbar">
          <div className="row" style={{ gap:12, flexShrink:0 }}>
            <div className="brand">◈ NexDeFi</div>
            {wallet && chain ? (
              <div className="net-badge" onClick={openModal}
                style={{ background:`${chain.color}1a`, color:chain.color, borderColor:`${chain.color}44` }}>
                ⬤ {chain.name}
              </div>
            ) : (
              <div className="net-badge" style={{ background:"rgba(107,127,160,.1)", color:"var(--muted)", borderColor:"var(--bdr)", cursor:"pointer" }} onClick={openModal}>
                ○ No Wallet
              </div>
            )}
          </div>

          <div className="ticker" dangerouslySetInnerHTML={{ __html: ticker }} />

          <div className="row" style={{ gap:10, flexShrink:0 }}>
            {wallet ? (
              <div className="wchip" onClick={openModal}>
                <span className="dot"/>
                <span style={{ fontWeight:700 }}>{wallet.address.slice(0,6)}…{wallet.address.slice(-4)}</span>
                <span style={{ color:"var(--muted)" }}>{wallet.balance.toFixed(4)} {chain?.sym}</span>
              </div>
            ) : (
              <button className="btn btn-p bsm" onClick={openModal}>Connect Wallet</button>
            )}

            <div style={{ position:"relative" }} ref={udRef}>
              <div className="uchip" onClick={() => setUdOpen(o => !o)}>
                <div className="uchip-av">{session?.avatar || "?"}</div>
                <span style={{ maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {session?.name?.split(" ")[0] || "—"}
                </span>
                <span style={{ color:"var(--muted)", fontSize:10 }}>▾</span>
              </div>
              {udOpen && (
                <div className="udrop">
                  <div className="ud-hdr">
                    <div className="ud-name">{session?.name}</div>
                    <div className="ud-email">{session?.email}</div>
                  </div>
                  <button className="ud-btn" onClick={() => { nav("/settings"); setUdOpen(false); }}>⚙ Settings</button>
                  <button className="ud-btn" onClick={() => { nav("/settings"); setUdOpen(false); }}>🔑 API Keys</button>
                  <div className="ud-sep"/>
                  <button className="ud-btn ud-out" onClick={() => { logout(); nav("/auth"); }}>⏏ Sign Out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="view"><Outlet /></div>
      </main>

      {/* ── WALLET MODAL (DeFi-style) ── */}
      <WalletModal />
    </div>
  );
}
