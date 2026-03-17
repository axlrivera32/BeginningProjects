/**
 * PoolBotDashboard.jsx — NexDeFi v7
 * Imports BOT_REGISTRY and BOT_STATS from LiquidityPools (same module scope).
 */
import { useState, useEffect, useRef } from "react";
import { drawLine } from "./Chart";
import { BOT_REGISTRY, BOT_STATS } from "./LiquidityPools";

const fp  = v => (v == null ? "—" : v >= 1 ? v.toFixed(2) : v.toFixed(5));
const fmt$ = v => (v == null ? "—" : (v >= 0 ? "+" : "") + "$" + Math.abs(v).toFixed(2));

function PnlMini({ data, color }) {
  const ref = useRef(null);
  useEffect(() => { if (!ref.current || !data?.length) return; drawLine(ref.current, data, color); }, [data, color]);
  return <canvas ref={ref} height={46} style={{ width:"100%", display:"block" }} />;
}

function PoolRow({ tokenId, stats, onSelect, selected }) {
  const bot = BOT_REGISTRY[tokenId];
  const running = bot?.isRunning() ?? false;
  const { lowerPos, upperPos } = bot?.getPositions() ?? {};
  const pnl = stats?.pnl ?? 0;
  const trades = stats?.trades ?? 0;
  const wins = stats?.wins ?? 0;
  const wr = trades ? ((wins / trades) * 100).toFixed(0) : "—";

  return (
    <tr onClick={() => onSelect(tokenId)}
      style={{ cursor:"pointer", background: selected === tokenId ? "rgba(61,214,245,.05)" : "", transition:"background .15s" }}>
      <td>
        <div className="row" style={{ gap:7 }}>
          <span className="dot" style={running ? {} : { background:"var(--muted)", boxShadow:"none", animation:"none" }}/>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>#{tokenId}</span>
        </div>
      </td>
      <td><span style={{ fontWeight:700, fontSize:12 }}>{stats?.pair || "—"}</span></td>
      <td>
        <span className={`badge ${running ? "bl" : "bn"}`} style={running ? { animation:"pulseBadge 1.2s ease-in-out infinite" } : {}}>
          {running ? "● Running" : "○ Stopped"}
        </span>
      </td>
      <td>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
          {lowerPos && <span className="badge bs" style={{ fontSize:9 }}>▼ SHORT {fp(lowerPos.entryPrice)}</span>}
          {upperPos && <span className="badge bl" style={{ fontSize:9 }}>▲ LONG {fp(upperPos.entryPrice)}</span>}
          {!lowerPos && !upperPos && <span style={{ fontSize:10, color:"var(--muted)" }}>—</span>}
        </div>
      </td>
      <td style={{ fontFamily:"'JetBrains Mono',monospace", color: pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight:700 }}>{fmt$(pnl)}</td>
      <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{trades}</td>
      <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{wr}{wr !== "—" ? "%" : ""}</td>
    </tr>
  );
}

export default function PoolBotDashboard() {
  const [tick,       setTick]       = useState(0);
  const [filter,     setFilter]     = useState("all");
  const [selected,   setSelected]   = useState(null);
  const [logFilter,  setLogFilter]  = useState("all");

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 2000);
    return () => clearInterval(t);
  }, []);

  const allIds = Object.keys(BOT_REGISTRY);

  let totalPnl = 0, totalTrades = 0, totalWins = 0, runningCount = 0;
  for (const id of allIds) {
    const s = BOT_STATS[id];
    if (!s) continue;
    totalPnl    += s.pnl    ?? 0;
    totalTrades += s.trades ?? 0;
    totalWins   += s.wins   ?? 0;
    if (BOT_REGISTRY[id]?.isRunning()) runningCount++;
  }
  const globalWR = totalTrades ? ((totalWins / totalTrades) * 100).toFixed(1) : "—";

  const allLogs = allIds
    .flatMap(id => (BOT_STATS[id]?.logs || []).map(l => ({ ...l, tokenId: id, pair: BOT_STATS[id]?.pair })))
    .sort((a, b) => b.time - a.time)
    .slice(0, 200);

  const filteredIds = allIds.filter(id => {
    if (filter === "running") return BOT_REGISTRY[id]?.isRunning();
    if (filter === "stopped") return !BOT_REGISTRY[id]?.isRunning();
    return true;
  });

  const filteredLogs = logFilter === "all" ? allLogs : allLogs.filter(l => l.type === logFilter);
  const detailStats = selected ? BOT_STATS[selected] : null;
  const detailBot   = selected ? BOT_REGISTRY[selected] : null;

  return (
    <div>
      <div className="row" style={{ justifyContent:"space-between", marginBottom:18 }}>
        <div>
          <h1 style={{ fontSize:21, fontWeight:800, letterSpacing:"-.5px" }}>Bot Dashboard</h1>
          <p style={{ color:"var(--sub)", fontSize:12, marginTop:3 }}>
            <span className="dot" style={{ marginRight:6 }}/>
            PnL por pool · Posiciones activas · Feed de actividad
          </p>
        </div>
      </div>

      {/* Global stats */}
      <div className="g4" style={{ marginBottom:18 }}>
        <div className="stat">
          <div className="slbl">PnL Total (todos los pools)</div>
          <div className="sval" style={{ fontSize:20, marginTop:4, color: totalPnl >= 0 ? "var(--green)" : "var(--red)" }}>{fmt$(totalPnl)}</div>
        </div>
        <div className="stat">
          <div className="slbl">Trades Ejecutados</div>
          <div className="sval" style={{ fontSize:20, marginTop:4 }}>{totalTrades || "—"}</div>
          <div className="schg neu">Win rate {globalWR}{globalWR !== "—" ? "%" : ""}</div>
        </div>
        <div className="stat">
          <div className="slbl">Bots Activos</div>
          <div className="sval" style={{ fontSize:20, marginTop:4, color: runningCount > 0 ? "var(--cyan)" : "var(--sub)" }}>{runningCount || "—"}</div>
          <div className="schg" style={{ background: runningCount > 0 ? "rgba(61,214,245,.1)" : "rgba(107,127,160,.1)", color: runningCount > 0 ? "var(--cyan)" : "var(--sub)" }}>
            {runningCount > 0 ? "⚡ activo" : "idle"}
          </div>
        </div>
        <div className="stat">
          <div className="slbl">Pools Monitoreados</div>
          <div className="sval" style={{ fontSize:20, marginTop:4 }}>{allIds.length || "—"}</div>
        </div>
      </div>

      {allIds.length === 0 ? (
        <div className="card" style={{ padding:40, textAlign:"center", color:"var(--muted)", fontSize:12 }}>
          Ningún pool configurado aún.<br/>
          <span style={{ fontSize:11, marginTop:8, display:"block" }}>
            Ve a <strong>Liquidity Pools</strong>, carga tus posiciones e inicia un Hedge Bot en cualquier tarjeta de pool.
          </span>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 380px", gap:16, alignItems:"start" }}>

          {/* Left */}
          <div className="col" style={{ gap:14 }}>
            <div className="row" style={{ gap:8 }}>
              <div className="tabs">
                {[["all",`Todos (${allIds.length})`],["running",`Activos (${runningCount})`],["stopped",`Detenidos (${allIds.length - runningCount})`]].map(([id,label]) => (
                  <button key={id} className={`tab${filter === id ? " on" : ""}`} onClick={() => setFilter(id)}>{label}</button>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding:0 }}>
              <div className="tbl">
                <table>
                  <thead>
                    <tr><th>Pool ID</th><th>Par</th><th>Estado</th><th>Posiciones Abiertas</th><th>PnL</th><th>Trades</th><th>Win %</th></tr>
                  </thead>
                  <tbody>
                    {filteredIds.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign:"center", color:"var(--muted)", padding:24 }}>Sin resultados.</td></tr>
                    ) : filteredIds.map(id => (
                      <PoolRow key={id} tokenId={id} stats={BOT_STATS[id]} onSelect={setSelected} selected={selected}/>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {selected && detailStats && (
              <div className="card" style={{ animation:"fadeUp .2s ease" }}>
                <div className="row" style={{ justifyContent:"space-between", marginBottom:14 }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:14 }}>Pool #{selected} — {detailStats.pair}</div>
                    <div style={{ fontSize:10, color:"var(--sub)", marginTop:2 }}>
                      Rango {fp(detailStats.priceLower)} — {fp(detailStats.priceUpper)}
                    </div>
                  </div>
                  <button className="btn btn-g bsm" onClick={() => setSelected(null)}>✕</button>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
                  {[["PnL", fmt$(detailStats.pnl), detailStats.pnl >= 0 ? "var(--green)" : "var(--red)"],
                    ["Trades", detailStats.trades ?? 0, "var(--txt)"],
                    ["Ganancias", detailStats.wins ?? 0, "var(--green)"],
                    ["Breakevenss", detailStats.breakevens ?? 0, "var(--org)"]].map(([l,v,c]) => (
                    <div key={l} style={{ padding:"10px 12px", background:"var(--elev)", borderRadius:"var(--rm)", border:"1px solid var(--bdr)" }}>
                      <div style={{ fontSize:9, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.7, marginBottom:4 }}>{l}</div>
                      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:15, fontWeight:700, color:c }}>{v}</div>
                    </div>
                  ))}
                </div>

                {detailStats.equity?.length > 1 && (
                  <div>
                    <div className="ctitle" style={{ marginBottom:6 }}>Curva de Equity</div>
                    <div className="mini-chart-wrap">
                      <PnlMini data={detailStats.equity} color={detailStats.pnl >= 0 ? "#20d0a0" : "#f0506a"}/>
                    </div>
                  </div>
                )}

                {(() => {
                  const pos = detailBot?.getPositions();
                  if (!pos?.lowerPos && !pos?.upperPos) return null;
                  return (
                    <div style={{ marginTop:14 }}>
                      <div className="ctitle" style={{ marginBottom:8 }}>Posiciones Abiertas</div>
                      {pos.lowerPos && <div style={{ padding:"10px 12px", background:"rgba(240,80,106,.07)", border:"1px solid rgba(240,80,106,.25)", borderRadius:"var(--r)", marginBottom:8, fontSize:11 }}>
                        <span className="badge bs" style={{ marginRight:8 }}>▼ SHORT</span>
                        Entrada {fp(pos.lowerPos.entryPrice)} · Tamaño {pos.lowerPos.size?.toFixed(5)} · Pico PnL {pos.lowerPos.peakPnl?.toFixed(2)}%
                      </div>}
                      {pos.upperPos && <div style={{ padding:"10px 12px", background:"rgba(32,208,160,.07)", border:"1px solid rgba(32,208,160,.25)", borderRadius:"var(--r)", fontSize:11 }}>
                        <span className="badge bl" style={{ marginRight:8 }}>▲ LONG</span>
                        Entrada {fp(pos.upperPos.entryPrice)} · Tamaño {pos.upperPos.size?.toFixed(5)} · Pico PnL {pos.upperPos.peakPnl?.toFixed(2)}%
                      </div>}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Right: activity feed */}
          <div className="card" style={{ padding:0 }}>
            <div className="row" style={{ justifyContent:"space-between", padding:"12px 16px", borderBottom:"1px solid var(--bdr)", flexWrap:"wrap", gap:6 }}>
              <span className="ctitle" style={{ marginBottom:0 }}>Feed de Actividad</span>
              <div className="tabs">
                {[["all","Todos"],["open","Apert."],["tp","TP"],["be","Breakevenss"],["err","Errores"]].map(([id,label]) => (
                  <button key={id} className={`tab${logFilter===id?" on":""}`} style={{ padding:"4px 8px", fontSize:10 }} onClick={() => setLogFilter(id)}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ maxHeight:520, overflowY:"auto" }}>
              {filteredLogs.length === 0 ? (
                <div style={{ padding:28, textAlign:"center", color:"var(--muted)", fontSize:12 }}>
                  {allLogs.length === 0 ? "Sin actividad. Inicia un bot en Liquidity Pools." : "Sin eventos en este filtro."}
                </div>
              ) : filteredLogs.map((l, i) => (
                <div key={i} className="blog">
                  <span className="btime">{new Date(l.time).toLocaleTimeString()}</span>
                  <span style={{ fontSize:9, color:"var(--muted)", fontFamily:"'JetBrains Mono',monospace", marginRight:5, flexShrink:0 }}>#{l.tokenId?.slice(-4)}</span>
                  <span className="bmsg" style={{ color:
                    l.type === "err"   ? "var(--red)"  :
                    l.type === "open"  ? "var(--cyan)" :
                    l.type === "tp"    ? "var(--green)":
                    l.type === "be"    ? "var(--org)"  :
                    l.type === "start" || l.type === "stop" ? "var(--blue)" : "var(--sub)"
                  }}>{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
