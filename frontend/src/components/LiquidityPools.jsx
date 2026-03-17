import { useState, useEffect, useRef } from "react";
import { useWallet }   from "../hooks/useWallet";
import { usePrices }   from "../hooks/usePrices";
import { useExchange } from "../hooks/useExchange";
import { toast }       from "./Toast";
import { getPositionsForWallet, publicProvider } from "../services/pools";
import { getState as getWalletState, CHAINS }    from "../services/wallet";
import { drawLine }    from "./Chart";

// ─────────────────────────────────────────────────────────────────────────────
//  Bot registry (survives re-renders, one bot per pool tokenId)
// ─────────────────────────────────────────────────────────────────────────────
export const BOT_REGISTRY = {};
export const BOT_STATS = {}; // tokenId → { pair, pnl, trades, wins, breakevens, equity, logs, priceLower, priceUpper }

/**
 * Hedge-bot engine.
 * Rules:
 *  1. Monitor lower / upper boundaries independently.
 *  2. Break below lower  → open SHORT.  Break above upper → open LONG.
 *  3. Price re-enters range → close at BREAKEVEN (entry price). No capital loss.
 *  4. Trade is profitable and profit retraces by trailPct → close via trailing stop.
 *  5. Runs indefinitely until user calls .stop().
 */
function createHedgeBot({ poolId, pair, config, placeOrder, closeOrder, getCurrentPrice, onLog }) {
  let running   = false;
  let timer     = null;
  let lowerPos  = null;   // { side, entryPrice, peakPnl, size }
  let upperPos  = null;

  // Ensure stats entry exists
  if (!BOT_STATS[poolId]) {
    BOT_STATS[poolId] = { pair, pnl: 0, trades: 0, wins: 0, breakevens: 0, equity: [0], logs: [],
      priceLower: config.priceLower, priceUpper: config.priceUpper };
  }

  const log = (msg, type = "info") => {
    const entry = { time: Date.now(), msg, type };
    onLog?.(entry);
    if (BOT_STATS[poolId]) {
      BOT_STATS[poolId].logs = [...(BOT_STATS[poolId].logs || []).slice(-199), entry];
    }
  };

  function inRange(price) {
    return price >= config.priceLower && price <= config.priceUpper;
  }

  async function tick() {
    if (!running) return;
    const price = getCurrentPrice();
    if (!price) return;
    const inside = inRange(price);

    // ── LOWER ────────────────────────────────────────────────────────────────
    if (config.lowerEnabled) {
      if (!lowerPos && !inside && price < config.priceLower) {
        try {
          const sz = (config.lowerAmountUSD * config.lowerLeverage) / price;
          await placeOrder({ side: "SHORT", coin: config.coin, sz, leverage: config.lowerLeverage, marketType: config.marketType });
          lowerPos = { side: "SHORT", entryPrice: price, peakPnl: 0, size: sz };
          log(`⬇ Lower break @ ${price.toFixed(4)} — opened SHORT $${config.lowerAmountUSD} × ${config.lowerLeverage}`, "open");
        } catch (e) { log(`✕ Lower order: ${e.message}`, "err"); }
      }

      if (lowerPos) {
        const pnlPct = ((lowerPos.entryPrice - price) / lowerPos.entryPrice) * 100 * config.lowerLeverage;
        if (pnlPct > lowerPos.peakPnl) lowerPos = { ...lowerPos, peakPnl: pnlPct };

        if (inside) {
          // Price recovered → close at breakeven
          try {
            await closeOrder({ side: "SHORT", coin: config.coin, size: lowerPos.size });
            log(`↩ Re-entered range — SHORT closed at breakeven @ ${price.toFixed(4)}`, "be");
            if (BOT_STATS[poolId]) { BOT_STATS[poolId].breakevens++; BOT_STATS[poolId].equity.push(BOT_STATS[poolId].pnl); }
          } catch (e) { log(`✕ Close lower: ${e.message}`, "err"); }
          lowerPos = null;
        } else if (lowerPos.peakPnl > 0 && (lowerPos.peakPnl - pnlPct) >= config.lowerTrailPct) {
          // Trailing stop hit
          try {
            await closeOrder({ side: "SHORT", coin: config.coin, size: lowerPos.size });
            log(`🏁 Trail stop — SHORT closed @ ${price.toFixed(4)} (+${pnlPct.toFixed(2)}%)`, "tp");
            const profit = lowerPos.size * lowerPos.entryPrice * (pnlPct / 100 / config.lowerLeverage);
            if (BOT_STATS[poolId]) { BOT_STATS[poolId].pnl += profit; BOT_STATS[poolId].trades++; BOT_STATS[poolId].wins++; BOT_STATS[poolId].equity.push(BOT_STATS[poolId].pnl); }
          } catch (e) { log(`✕ Trail-close lower: ${e.message}`, "err"); }
          lowerPos = null;
        }
      }
    }

    // ── UPPER ────────────────────────────────────────────────────────────────
    if (config.upperEnabled) {
      if (!upperPos && !inside && price > config.priceUpper) {
        try {
          const sz = (config.upperAmountUSD * config.upperLeverage) / price;
          await placeOrder({ side: "LONG", coin: config.coin, sz, leverage: config.upperLeverage, marketType: config.marketType });
          upperPos = { side: "LONG", entryPrice: price, peakPnl: 0, size: sz };
          log(`⬆ Upper break @ ${price.toFixed(4)} — opened LONG $${config.upperAmountUSD} × ${config.upperLeverage}`, "open");
        } catch (e) { log(`✕ Upper order: ${e.message}`, "err"); }
      }

      if (upperPos) {
        const pnlPct = ((price - upperPos.entryPrice) / upperPos.entryPrice) * 100 * config.upperLeverage;
        if (pnlPct > upperPos.peakPnl) upperPos = { ...upperPos, peakPnl: pnlPct };

        if (inside) {
          try {
            await closeOrder({ side: "LONG", coin: config.coin, size: upperPos.size });
            log(`↩ Re-entered range — LONG closed at breakeven @ ${price.toFixed(4)}`, "be");
            if (BOT_STATS[poolId]) { BOT_STATS[poolId].breakevens++; BOT_STATS[poolId].equity.push(BOT_STATS[poolId].pnl); }
          } catch (e) { log(`✕ Close upper: ${e.message}`, "err"); }
          upperPos = null;
        } else if (upperPos.peakPnl > 0 && (upperPos.peakPnl - pnlPct) >= config.upperTrailPct) {
          try {
            await closeOrder({ side: "LONG", coin: config.coin, size: upperPos.size });
            log(`🏁 Trail stop — LONG closed @ ${price.toFixed(4)} (+${pnlPct.toFixed(2)}%)`, "tp");
            const profit = upperPos.size * upperPos.entryPrice * (pnlPct / 100 / config.upperLeverage);
            if (BOT_STATS[poolId]) { BOT_STATS[poolId].pnl += profit; BOT_STATS[poolId].trades++; BOT_STATS[poolId].wins++; BOT_STATS[poolId].equity.push(BOT_STATS[poolId].pnl); }
          } catch (e) { log(`✕ Trail-close upper: ${e.message}`, "err"); }
          upperPos = null;
        }
      }
    }
  }

  return {
    start(ms = 5000) {
      if (running) return;
      running = true;
      timer   = setInterval(tick, ms);
      log(`▶ Hedge bot started — ${pair}`, "start");
    },
    stop() {
      running = false;
      if (timer) clearInterval(timer);
      timer = null;
      log(`■ Bot stopped — ${pair}`, "stop");
    },
    isRunning:    () => running,
    getPositions: () => ({ lowerPos, upperPos }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  MiniChart sparkline
// ─────────────────────────────────────────────────────────────────────────────
function MiniChart({ history, color, onClick }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !history?.length) return;
    drawLine(ref.current, history, color);
  }, [history, color]);

  return (
    <div style={{ position: "relative", cursor: "pointer", marginTop: 10 }} onClick={onClick}
      title="Click to configure hedge bot">
      <div className="mini-chart-wrap">
        <canvas ref={ref} height={46} style={{ width: "100%", display: "block" }} />
      </div>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "center", background: "rgba(0,0,0,0)", transition: "background .2s",
        borderRadius: "var(--r)", fontSize: 10, fontWeight: 700, color: "transparent",
        letterSpacing: .5,
      }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,0,0,.45)"; e.currentTarget.style.color = "#fff"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0)";   e.currentTarget.style.color = "transparent"; }}
      >
        ⚙ Configure Hedge Bot
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Range bar
// ─────────────────────────────────────────────────────────────────────────────
function RangeBar({ pos }) {
  const { currentPrice, priceLower, priceUpper, priceProgress, inRange } = pos;
  if (currentPrice === null) return (
    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>Could not read on-chain price</div>
  );

  const pct       = (priceProgress ?? 0) * 100;
  const atLow     = priceProgress !== null && priceProgress <= 0.03;
  const atHigh    = priceProgress !== null && priceProgress >= 0.97;
  const cursorCls = atLow ? "range-cursor out-low" : atHigh ? "range-cursor out-high" : "range-cursor";
  const fillCls   = inRange ? "range-fill in-range" : "range-fill out-range";
  const fp        = v => v >= 1 ? v.toFixed(2) : v.toFixed(6);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: atLow ? "var(--red)" : "var(--muted)" }}>
          ▼ {fp(priceLower)}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: inRange ? "var(--cyan)" : "var(--org)" }}>
          {fp(currentPrice)}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: atHigh ? "var(--org)" : "var(--muted)" }}>
          ▲ {fp(priceUpper)}
        </div>
      </div>
      <div className="range-bar">
        <div className={fillCls} style={{ width: `${Math.min(pct, 100)}%` }} />
        <div className={cursorCls} style={{ left: `${Math.min(Math.max(pct, 1), 99)}%` }} />
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6, gap: 5, flexWrap: "wrap" }}>
        <span className={`badge ${inRange ? "ba" : "bs"}`}>
          {inRange ? "● In Range" : atLow ? "▼ Below Range" : "▲ Above Range"}
        </span>
        <span style={{ fontSize: 9, color: "var(--sub)", fontFamily: "'JetBrains Mono',monospace" }}>
          {pct.toFixed(1)}% of range
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Hedge bot config panel (inline per pool)
// ─────────────────────────────────────────────────────────────────────────────
const DEF_CFG = {
  lowerEnabled: false, lowerAmountUSD: 50, lowerLeverage: 10, lowerTrailPct: 1.5,
  upperEnabled: false, upperAmountUSD: 50, upperLeverage: 10, upperTrailPct: 1.5,
  marketType: "futures",
};

function BotPanel({ pos, exchange, onClose }) {
  const { placeHL, closeHL, hlOk, placeBX, bxOk } = useExchange();
  const { prices } = usePrices();
  const coin = pos.token0.symbol.toUpperCase();
  const fp   = v => v >= 1 ? v.toFixed(2) : v.toFixed(6);

  const storKey  = `ndx_hbot_${pos.tokenId}`;
  const [cfg, setCfg]     = useState(() => { try { return { ...DEF_CFG, ...JSON.parse(localStorage.getItem(storKey)) }; } catch { return { ...DEF_CFG }; } });
  const [running, setRunning] = useState(!!BOT_REGISTRY[pos.tokenId]?.isRunning());
  const [lPos,    setLPos]    = useState(null);
  const [uPos,    setUPos]    = useState(null);
  const [logs,    setLogs]    = useState([]);
  const logsRef = useRef(null);

  // Poll bot state
  useEffect(() => {
    const t = setInterval(() => {
      const b = BOT_REGISTRY[pos.tokenId];
      if (!b) return;
      setRunning(b.isRunning());
      const { lowerPos, upperPos } = b.getPositions();
      setLPos(lowerPos); setUPos(upperPos);
    }, 1000);
    return () => clearInterval(t);
  }, [pos.tokenId]);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  function save(updates) {
    const next = { ...cfg, ...updates };
    setCfg(next);
    localStorage.setItem(storKey, JSON.stringify(next));
  }

  function addLog(entry) { setLogs(p => [...p.slice(-99), entry]); }

  async function placeOrder({ side, coin, sz, leverage, marketType }) {
    const isBuy = side === "LONG";
    if (exchange === "hl") {
      if (!hlOk) throw new Error("Hyperliquid not connected (Settings).");
      return placeHL({ coin, isBuy, sz, leverage, limitPx: null });
    }
    if (!bxOk) throw new Error("BingX not connected (Settings).");
    return placeBX({ symbol: coin + "-USDT", side: isBuy ? "BUY" : "SELL", quantity: sz });
  }

  async function closeOrder({ side, coin, size }) {
    if (exchange === "hl") {
      if (!hlOk) throw new Error("Hyperliquid not connected.");
      return closeHL(coin, size);
    }
    const isBuy = side === "SHORT";
    return placeBX({ symbol: coin + "-USDT", side: isBuy ? "BUY" : "SELL", quantity: size });
  }

  function start() {
    if (!cfg.lowerEnabled && !cfg.upperEnabled) {
      toast("Enable at least one boundary before starting.", "warn"); return;
    }
    if (!hlOk && !bxOk) {
      toast("Add API keys in Settings first.", "err"); return;
    }
    const bot = createHedgeBot({
      poolId: pos.tokenId, pair: pos.pair,
      config: { ...cfg, coin, priceLower: pos.priceLower, priceUpper: pos.priceUpper },
      placeOrder, closeOrder,
      getCurrentPrice: () => prices[coin] || pos.currentPrice || null,
      onLog: addLog,
    });
    if (!BOT_STATS[pos.tokenId]) {
      BOT_STATS[pos.tokenId] = { pair: pos.pair, pnl: 0, trades: 0, wins: 0, breakevens: 0,
        equity: [0], logs: [], priceLower: pos.priceLower, priceUpper: pos.priceUpper };
    }
    BOT_REGISTRY[pos.tokenId] = bot;
    bot.start(5000);
    setRunning(true);
    toast(`▶ Hedge bot started for ${pos.pair}`, "ok");
  }

  function stop() {
    BOT_REGISTRY[pos.tokenId]?.stop();
    setRunning(false);
    toast(`■ Bot stopped for ${pos.pair}`, "info");
  }

  const BoxStyle = (enabled, accent) => ({
    padding: 14, borderRadius: "var(--rm)",
    background: "var(--surf)",
    border: `1px solid ${enabled ? accent : "var(--bdr)"}`,
    marginBottom: 12,
    transition: "border-color .2s",
  });

  return (
    <div style={{ marginTop: 14, padding: 16, borderRadius: "var(--rl)", background: "var(--elev)", border: "1px solid var(--glow)", animation: "fadeUp .2s ease" }}>
      {/* Title */}
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13 }}>⚡ IL Hedge Bot — {pos.pair}</div>
          <div style={{ fontSize: 10, color: "var(--sub)", marginTop: 2 }}>
            Range {fp(pos.priceLower)} — {fp(pos.priceUpper)} &nbsp;·&nbsp; Now {fp(pos.currentPrice || 0)}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className={`badge ${running ? "bl" : "bs"}`} style={running ? { animation: "pulseBadge 1.2s ease-in-out infinite" } : {}}>
            {running ? "● Running" : "○ Stopped"}
          </span>
          <button className="btn btn-g bsm" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="ibox" style={{ fontSize: 11, marginBottom: 14 }}>
        ℹ On break-out, the bot opens a hedge. If price recovers → closes at <strong>breakeven</strong> (no loss).
        If the trade profits → a <strong>trailing stop</strong> locks in gains.
        The bot <strong>never generates a net capital loss</strong> and runs indefinitely.
      </div>

      {/* Market type */}
      <div className="fg">
        <div className="lbl">Market type</div>
        <div className="mtype-row">
          <button className={`mtype-btn${cfg.marketType === "futures" ? " on" : ""}`} onClick={() => save({ marketType: "futures" })}>📈 Futures</button>
          <button className={`mtype-btn${cfg.marketType === "spot" ? " on" : ""}`} onClick={() => save({ marketType: "spot" })}>🪙 Spot</button>
        </div>
      </div>

      {/* ── LOWER ── */}
      <div style={BoxStyle(cfg.lowerEnabled, "rgba(240,80,106,.45)")}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: cfg.lowerEnabled ? "var(--red)" : "var(--sub)" }}>▼ Lower break — SHORT</span>
          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
            <input type="checkbox" checked={cfg.lowerEnabled} onChange={e => save({ lowerEnabled: e.target.checked })}
              style={{ accentColor: "var(--red)", cursor: "pointer" }} />
            Enable
          </label>
        </div>
        {cfg.lowerEnabled ? (
          <>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10 }}>
              Triggers when price drops below <strong style={{ color: "var(--red)" }}>{fp(pos.priceLower)}</strong>.
              Opens SHORT to offset impermanent loss.
            </div>
            <div className="g2" style={{ gap: 10 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: .8, textTransform: "uppercase", color: "var(--sub)", display: "block", marginBottom: 5 }}>Amount USD</label>
                <input className="inp" type="number" min={1} value={cfg.lowerAmountUSD}
                  onChange={e => save({ lowerAmountUSD: parseFloat(e.target.value) || 0 })} />
              </div>
              {cfg.marketType === "futures" && (
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: .8, textTransform: "uppercase", color: "var(--sub)", display: "block", marginBottom: 5 }}>Leverage</label>
                  <select value={cfg.lowerLeverage} onChange={e => save({ lowerLeverage: Number(e.target.value) })}>
                    {[1,2,3,5,10,20].map(v => <option key={v} value={v}>{v}×</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="lbl">Trailing stop: <strong style={{ color: "var(--cyan)" }}>{cfg.lowerTrailPct.toFixed(1)}%</strong></div>
              <input type="range" min={0.5} max={10} step={0.5} value={cfg.lowerTrailPct}
                onChange={e => save({ lowerTrailPct: Number(e.target.value) })} />
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                Closes only if profit retraces this % from its peak. Applies only when the trade is profitable.
              </div>
            </div>
            {lPos && (
              <div style={{ marginTop: 10, padding: "7px 10px", background: "rgba(240,80,106,.07)", borderRadius: "var(--r)", border: "1px solid rgba(240,80,106,.25)", fontSize: 11 }}>
                <strong>Active SHORT:</strong> entry {fp(lPos.entryPrice)} · sz {lPos.size?.toFixed(5)} · peak {lPos.peakPnl?.toFixed(2)}%
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 10, color: "var(--muted)" }}>Enable to hedge downside breakouts.</div>
        )}
      </div>

      {/* ── UPPER ── */}
      <div style={BoxStyle(cfg.upperEnabled, "rgba(251,146,60,.45)")}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: cfg.upperEnabled ? "var(--org)" : "var(--sub)" }}>▲ Upper break — LONG</span>
          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
            <input type="checkbox" checked={cfg.upperEnabled} onChange={e => save({ upperEnabled: e.target.checked })}
              style={{ accentColor: "var(--org)", cursor: "pointer" }} />
            Enable
          </label>
        </div>
        {cfg.upperEnabled ? (
          <>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10 }}>
              Triggers when price rises above <strong style={{ color: "var(--org)" }}>{fp(pos.priceUpper)}</strong>.
              Opens LONG to ride the upside breakout.
            </div>
            <div className="g2" style={{ gap: 10 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: .8, textTransform: "uppercase", color: "var(--sub)", display: "block", marginBottom: 5 }}>Amount USD</label>
                <input className="inp" type="number" min={1} value={cfg.upperAmountUSD}
                  onChange={e => save({ upperAmountUSD: parseFloat(e.target.value) || 0 })} />
              </div>
              {cfg.marketType === "futures" && (
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: .8, textTransform: "uppercase", color: "var(--sub)", display: "block", marginBottom: 5 }}>Leverage</label>
                  <select value={cfg.upperLeverage} onChange={e => save({ upperLeverage: Number(e.target.value) })}>
                    {[1,2,3,5,10,20].map(v => <option key={v} value={v}>{v}×</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="lbl">Trailing stop: <strong style={{ color: "var(--cyan)" }}>{cfg.upperTrailPct.toFixed(1)}%</strong></div>
              <input type="range" min={0.5} max={10} step={0.5} value={cfg.upperTrailPct}
                onChange={e => save({ upperTrailPct: Number(e.target.value) })} />
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                Closes only if profit retraces this % from its peak. Applies only when the trade is profitable.
              </div>
            </div>
            {uPos && (
              <div style={{ marginTop: 10, padding: "7px 10px", background: "rgba(251,146,60,.07)", borderRadius: "var(--r)", border: "1px solid rgba(251,146,60,.25)", fontSize: 11 }}>
                <strong>Active LONG:</strong> entry {fp(uPos.entryPrice)} · sz {uPos.size?.toFixed(5)} · peak {uPos.peakPnl?.toFixed(2)}%
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 10, color: "var(--muted)" }}>Enable to capture upside breakouts.</div>
        )}
      </div>

      {/* Start / Stop */}
      {!running
        ? <button className="btn btn-p bfull" onClick={start}>▶ Start Hedge Bot</button>
        : <button className="btn btn-d bfull" onClick={stop}>■ Stop Bot</button>
      }

      {/* Activity log */}
      {logs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="ctitle" style={{ marginBottom: 5 }}>Activity Log</div>
          <div ref={logsRef} style={{ maxHeight: 160, overflowY: "auto", background: "var(--void)", border: "1px solid var(--bdr)", borderRadius: "var(--r)", padding: "8px 10px" }}>
            {logs.slice().reverse().map((l, i) => (
              <div key={i} className="blog">
                <span className="btime">{new Date(l.time).toLocaleTimeString()}</span>
                <span className="bmsg" style={{
                  color: l.type === "err"   ? "var(--red)"
                       : l.type === "open"  ? "var(--cyan)"
                       : l.type === "tp"    ? "var(--green)"
                       : l.type === "be"    ? "var(--org)"
                       : l.type === "start" || l.type === "stop" ? "var(--blue)"
                       : "var(--sub)",
                }}>{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pool card
// ─────────────────────────────────────────────────────────────────────────────
function PoolCard({ pos, priceHistory, exchange }) {
  const [expanded, setExpanded] = useState(false);
  const [botOn,    setBotOn]    = useState(false);
  const { token0, token1, feeTier, liquidity, inRange, pair } = pos;
  const histColor = inRange ? "#20d0a0" : "#f0506a";

  // Refresh bot status indicator every second
  useEffect(() => {
    const t = setInterval(() => {
      setBotOn(!!BOT_REGISTRY[pos.tokenId]?.isRunning());
    }, 1000);
    return () => clearInterval(t);
  }, [pos.tokenId]);

  return (
    <div className="pool-card" style={botOn ? { borderColor: "rgba(61,214,245,.45)", boxShadow: "0 0 16px rgba(61,214,245,.08)" } : {}}>
      {/* Header */}
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{pair}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>
            Fee {feeTier} · #{pos.tokenId}
          </div>
        </div>
        <div className="col" style={{ alignItems: "flex-end", gap: 4 }}>
          <span className={`badge ${liquidity !== "0" ? "bl" : "bn"}`}>
            {liquidity !== "0" ? "● Active" : "○ Closed"}
          </span>
          {botOn && (
            <span className="badge" style={{ background: "rgba(61,214,245,.1)", color: "var(--cyan)", border: "1px solid rgba(61,214,245,.3)", animation: "pulseBadge 1.2s ease-in-out infinite" }}>
              ⚡ Bot On
            </span>
          )}
          {pos.poolAddress && (
            <a href={`https://app.uniswap.org/pool/${pos.tokenId}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 10, color: "var(--cyan)" }}>View ↗</a>
          )}
        </div>
      </div>

      <RangeBar pos={pos} />

      {/* Clickable mini chart */}
      {priceHistory?.length > 2 && (
        <MiniChart history={priceHistory} color={histColor} onClick={() => setExpanded(e => !e)} />
      )}

      {/* Token chips */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
        {[token0, token1].map((t) => (
          <div key={t.address} style={{ padding: "7px 10px", background: "var(--elev)", borderRadius: "var(--r)", border: "1px solid var(--bdr)" }}>
            <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .7 }}>{t.symbol}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--sub)", marginTop: 2 }}>
              {t.address.slice(0, 8)}…{t.address.slice(-6)}
            </div>
          </div>
        ))}
      </div>

      {/* Bot panel (inline, toggled) */}
      {expanded && <BotPanel pos={pos} exchange={exchange} onClose={() => setExpanded(false)} />}

      {/* Expand button */}
      {!expanded && (
        <button className="btn btn-g bsm" style={{ width: "100%", justifyContent: "center", marginTop: 12, fontSize: 11 }}
          onClick={() => setExpanded(true)}>
          {botOn ? "⚡ Bot Running — View Config" : "⚙ Configure Hedge Bot"}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main page
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "all",      label: (a, i) => `All (${a + i})`    },
  { id: "active",   label: (a)    => `Active (${a})`      },
  { id: "inactive", label: (_, i) => `Closed (${i})`      },
];

export default function LiquidityPools() {
  const { wallet }                  = useWallet();
  const { history, prices }         = usePrices();
  const { hlOk, bxOk }             = useExchange();

  const [positions,  setPositions]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [fetched,    setFetched]    = useState(false);
  const [err,        setErr]        = useState("");
  const [chainId,    setChainId]    = useState(1);
  const [ownerAddr,  setOwnerAddr]  = useState("");
  const [tab,        setTab]        = useState("all");
  const [exchange,   setExchange]   = useState("hl");
  const [botsCount,  setBotsCount]  = useState(0);

  useEffect(() => {
    if (wallet?.address && !ownerAddr) setOwnerAddr(wallet.address);
    if (wallet?.chainId)              setChainId(wallet.chainId);
  }, [wallet?.address, wallet?.chainId]);

  // Keep global bot count fresh
  useEffect(() => {
    const t = setInterval(() => {
      setBotsCount(Object.values(BOT_REGISTRY).filter(b => b.isRunning()).length);
    }, 1500);
    return () => clearInterval(t);
  }, []);

  async function load() {
    const addr = ownerAddr.trim();
    if (!addr || !addr.startsWith("0x") || addr.length !== 42) {
      toast("Enter a valid 0x wallet address.", "err"); return;
    }
    setLoading(true); setErr(""); setPositions([]);
    try {
      const { provider } = getWalletState();
      const prov   = provider || publicProvider(chainId);
      const pos    = await getPositionsForWallet(addr, prov, chainId);
      const enriched = pos.map(p => ({ ...p, poolValueUSD: (prices[p.token0.symbol.toUpperCase()] || prices.ETH || 0) * 0.5 }));
      setPositions(enriched);
      setFetched(true);
      if (!pos.length) toast("No Uniswap V3 positions found.", "info");
      else toast(`Loaded ${pos.length} position${pos.length > 1 ? "s" : ""}`, "ok");
    } catch (e) {
      setErr(e.message);
      toast("Failed: " + e.message, "err");
    } finally {
      setLoading(false);
    }
  }

  const activePools   = positions.filter(p => p.liquidity !== "0");
  const inactivePools = positions.filter(p => p.liquidity === "0");
  const inRangeCount  = activePools.filter(p => p.inRange).length;

  const displayed =
    tab === "active"   ? activePools :
    tab === "inactive" ? inactivePools :
    positions;

  const networks = Object.entries(CHAINS).filter(([id]) => [1, 42161, 137, 10].includes(Number(id)));

  return (
    <div>
      {/* Header */}
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.5px" }}>Liquidity Pools</h1>
          <p style={{ color: "var(--sub)", fontSize: 12, marginTop: 3 }}>
            <span className="dot" style={{ marginRight: 6 }} />
            Uniswap V3 · IL Hedge Bot · Click mini-chart to configure per-pool
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .8 }}>Bot via:</span>
          <button className={`btn bsm ${exchange === "hl" ? "btn-p" : "btn-g"}`} onClick={() => setExchange("hl")}>
            Hyperliquid {hlOk ? "✓" : ""}
          </button>
          <button className={`btn bsm ${exchange === "bx" ? "btn-p" : "btn-g"}`} onClick={() => setExchange("bx")}>
            BingX {bxOk ? "✓" : ""}
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="ctitle">Read Positions for Any Wallet</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 180px auto", gap: 10, alignItems: "end" }}>
          <div>
            <label>Wallet Address</label>
            <input className="inp" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}
              placeholder="0x... (any wallet address)"
              value={ownerAddr} onChange={e => setOwnerAddr(e.target.value)}
              onKeyDown={e => e.key === "Enter" && load()} />
          </div>
          <div>
            <label>Network</label>
            <select value={chainId} onChange={e => setChainId(Number(e.target.value))}>
              {networks.map(([id, c]) => <option key={id} value={id}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn btn-p" style={{ alignSelf: "flex-end" }} onClick={load} disabled={loading}>
            {loading ? <><span className="spin" />Loading…</> : "↻ Fetch"}
          </button>
        </div>
        {wallet && (
          <button className="lnk" style={{ marginTop: 8, fontSize: 11 }}
            onClick={() => { setOwnerAddr(wallet.address); setChainId(wallet.chainId); }}>
            Use my connected wallet ({wallet.address.slice(0, 8)}…)
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="g4" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="slbl">Total Positions</div>
          <div className="sval" style={{ fontSize: 20, marginTop: 4 }}>{fetched ? positions.length : "—"}</div>
        </div>
        <div className="stat">
          <div className="slbl">Active (liquidity)</div>
          <div className="sval" style={{ fontSize: 20, marginTop: 4, color: "var(--green)" }}>{fetched ? activePools.length : "—"}</div>
          <div className="schg up">{fetched ? `${inRangeCount} in range` : ""}</div>
        </div>
        <div className="stat">
          <div className="slbl">Closed / Empty</div>
          <div className="sval" style={{ fontSize: 20, marginTop: 4, color: "var(--sub)" }}>{fetched ? inactivePools.length : "—"}</div>
        </div>
        <div className="stat">
          <div className="slbl">Bots Running</div>
          <div className="sval" style={{ fontSize: 20, marginTop: 4, color: botsCount > 0 ? "var(--cyan)" : "var(--sub)" }}>
            {botsCount > 0 ? botsCount : "—"}
          </div>
          <div className="schg" style={{ background: botsCount > 0 ? "rgba(61,214,245,.1)" : "rgba(107,127,160,.1)", color: botsCount > 0 ? "var(--cyan)" : "var(--sub)" }}>
            {botsCount > 0 ? "⚡ active" : "idle"}
          </div>
        </div>
      </div>

      {/* Tabs */}
      {fetched && positions.length > 0 && (
        <div className="row" style={{ gap: 8, marginBottom: 16 }}>
          <div className="tabs">
            {TABS.map(({ id, label }) => (
              <button key={id} className={`tab${tab === id ? " on" : ""}`} onClick={() => setTab(id)}>
                {label(activePools.length, inactivePools.length)}
              </button>
            ))}
          </div>
        </div>
      )}

      {err && <div className="wbox" style={{ marginBottom: 14 }}>✕ {err}</div>}

      {fetched && positions.length > 0 && !hlOk && !bxOk && (
        <div className="wbox" style={{ marginBottom: 14 }}>
          ⚠ No exchange connected. Add API keys in <strong>Settings</strong> to activate the hedge bot.
        </div>
      )}

      {/* Pool grid */}
      {!fetched ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
          Enter any wallet address and click Fetch to see Uniswap V3 positions.<br />
          <span style={{ fontSize: 11, marginTop: 8, display: "block" }}>
            Click the mini price-chart on each pool card to configure its IL hedge bot.
          </span>
        </div>
      ) : displayed.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
          No {tab === "active" ? "active" : tab === "inactive" ? "closed" : ""} positions found.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
          {displayed.map(pos => (
            <PoolCard key={pos.tokenId} pos={pos}
              priceHistory={history[pos.token0.symbol] || history["ETH"]}
              exchange={exchange} />
          ))}
        </div>
      )}
    </div>
  );
}
