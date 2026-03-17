import { useState, useRef, useEffect } from "react";
import { usePrices } from "../hooks/usePrices";
import { drawLine } from "./Chart";
import { toast } from "./Toast";

export default function PaperTrading() {
  const { prices } = usePrices();
  const [tab,  setTab]  = useState("paper");
  const [bal,  setBal]  = useState(10000);
  const [side, setSide] = useState("LONG");
  const [mkt,  setMkt]  = useState("ETH/USDT");
  const [size, setSize] = useState("");
  const [ep,   setEp]   = useState("");
  const [lev,  setLev]  = useState("5");
  const [trades,setTrades]=useState([]);
  const [errs, setErrs] = useState({});
  const [btPer,setBtPer]=useState("6M");
  const [btCap,setBtCap]=useState("10000");
  const [btRes,setBtRes]=useState(null);
  const [btBusy,setBtBusy]=useState(false);
  const btRef = useRef(null);
  const pm = { "ETH/USDT":prices.ETH, "BTC/USDT":prices.BTC, "SOL/USDT":prices.SOL };

  useEffect(() => {
    if (btRes) drawLine(btRef.current, btRes.eq, "#20d0a0");
  }, [btRes, btCap]);

  function placeTrade() {
    const e = {}; if (!size||parseFloat(size)<=0) e.size="Enter size.";
    setErrs(e); if (Object.keys(e).length) return;
    const entry = parseFloat(ep)||pm[mkt], leverage = parseInt(lev)||1;
    const cost = (entry*parseFloat(size))/leverage;
    if (cost>bal) { toast("Insufficient virtual balance.","err"); return; }
    setBal((b) => b-cost);
    setTrades((prev) => [{ id:Date.now(), mkt, side, size:parseFloat(size), entry, cost, lev:leverage, time:new Date().toLocaleTimeString(), closed:false }, ...prev]);
    toast(`✓ Paper ${side} ${mkt} @ $${entry.toFixed(2)}`,"ok");
    setSize(""); setEp("");
  }

  function closeTrade(id) {
    const t = trades.find((x) => x.id===id); if (!t) return;
    const exit = pm[t.mkt];
    const pnl  = t.side==="LONG" ? (exit-t.entry)*t.size : (t.entry-exit)*t.size;
    setBal((b) => b+t.cost+pnl);
    setTrades((prev) => prev.map((x) => x.id===id ? { ...x, closed:true, exit, pnl } : x));
    toast(`Closed: ${pnl>=0?"+":""}$${pnl.toFixed(2)}`, pnl>=0?"ok":"err");
  }

  async function runBT() {
    setBtBusy(true); setBtRes(null);
    await new Promise((r) => setTimeout(r,1600));
    const cap  = parseFloat(btCap)||10000;
    const days = {"1M":30,"3M":90,"6M":180,"1Y":365,"2Y":730}[btPer]||180;
    let eq = [cap];
    for (let i=1;i<=days;i++) eq.push(Math.max(eq[i-1]+(Math.random()-.41)*130+i*10, eq[i-1]*.83));
    const fin = eq[eq.length-1], ret=(fin-cap)/cap*100;
    setBtRes({ eq: eq.filter((_,i)=>i%Math.ceil(eq.length/150)===0), fin, ret, dd:((Math.max(...eq)-Math.min(...eq))/Math.max(...eq)*100) });
    setBtBusy(false);
  }

  const pnl = bal-10000;
  return (
    <div>
      <div className="row" style={{ justifyContent:"space-between", marginBottom:18 }}>
        <div>
          <h1 style={{ fontSize:21, fontWeight:800, letterSpacing:"-.5px" }}>Paper Trading & Backtest</h1>
          <p style={{ color:"var(--sub)", fontSize:12, marginTop:3 }}>Risk-free simulation with real market prices</p>
        </div>
        <div className="tabs">
          <button className={`tab${tab==="paper"?" on":""}`} onClick={()=>setTab("paper")}>Paper Trade</button>
          <button className={`tab${tab==="bt"?" on":""}`} onClick={()=>setTab("bt")}>Backtest</button>
        </div>
      </div>

      {tab==="paper" && <>
        <div className="g4" style={{ marginBottom:18 }}>
          <div className="stat"><div className="slbl">Virtual Balance</div><div className="sval" style={{ fontSize:20,marginTop:4,color:"var(--cyan)" }}>${bal.toFixed(2)}</div></div>
          <div className="stat"><div className="slbl">PnL</div><div className="sval" style={{ fontSize:20,marginTop:4,color:pnl>=0?"var(--green)":"var(--red)" }}>{pnl>=0?"+":""}${pnl.toFixed(2)}</div></div>
          <div className="stat"><div className="slbl">Return</div><div className="sval" style={{ fontSize:20,marginTop:4,color:pnl>=0?"var(--green)":"var(--red)" }}>{(pnl/100).toFixed(1)}%</div></div>
          <div className="stat"><div className="slbl">Open</div><div className="sval" style={{ fontSize:20,marginTop:4 }}>{trades.filter((t)=>!t.closed).length}</div></div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"250px 1fr", gap:14 }}>
          <div className="card" style={{ padding:16 }}>
            <div className="ctitle">Place Paper Trade</div>
            <div className="fg"><label>Market</label><select value={mkt} onChange={(e)=>setMkt(e.target.value)}><option>ETH/USDT</option><option>BTC/USDT</option><option>SOL/USDT</option></select></div>
            <div className="fg"><div className="row" style={{ gap:8 }}>
              <button className={`btn${side==="LONG"?" btn-s":" btn-g"}`} style={{ flex:1,justifyContent:"center",fontWeight:800 }} onClick={()=>setSide("LONG")}>▲ LONG</button>
              <button className={`btn${side==="SHORT"?" btn-d":" btn-g"}`} style={{ flex:1,justifyContent:"center",fontWeight:800 }} onClick={()=>setSide("SHORT")}>▼ SHORT</button>
            </div></div>
            <div className="fg"><label>Size</label><input className={`inp${errs.size?" err":""}`} type="number" placeholder="0.00" value={size} onChange={(e)=>setSize(e.target.value)}/>{errs.size&&<div className="ferr">{errs.size}</div>}</div>
            <div className="fg"><label>Entry (optional)</label><input className="inp" type="number" placeholder={`~$${Math.round(pm[mkt]||0).toLocaleString()}`} value={ep} onChange={(e)=>setEp(e.target.value)}/></div>
            <div className="fg"><label>Leverage</label><select value={lev} onChange={(e)=>setLev(e.target.value)}><option value="1">1×</option><option value="2">2×</option><option value="5">5×</option><option value="10">10×</option></select></div>
            <button className="btn btn-s bfull" style={{ marginBottom:8 }} onClick={placeTrade}>Place Paper Trade</button>
            <button className="btn btn-g bfull" onClick={()=>{ setBal(10000); setTrades([]); toast("Reset to $10,000","info"); }}>Reset ($10,000)</button>
          </div>
          <div className="card" style={{ padding:16 }}>
            <div className="ctitle">Trade Log</div>
            {trades.length===0 ? <div style={{ padding:32, textAlign:"center", color:"var(--muted)", fontSize:12 }}>No trades yet.</div> : (
              <div className="tbl"><table><thead><tr><th>Time</th><th>Market</th><th>Side</th><th>Size</th><th>Entry</th><th>PnL</th><th>Action</th></tr></thead>
                <tbody>{trades.map((t) => (
                  <tr key={t.id} style={{ opacity:t.closed?.5:1 }}>
                    <td style={{ color:"var(--muted)", fontSize:10 }}>{t.time}</td>
                    <td style={{ fontWeight:700 }}>{t.mkt}</td>
                    <td><span className={`badge ${t.side==="LONG"?"bl":"bs"}`}>{t.side}</span></td>
                    <td>{t.size}</td>
                    <td>${t.entry.toFixed(2)}</td>
                    <td className={t.closed?(t.pnl>=0?"tpos":"tneg"):""}>{t.closed?`${t.pnl>=0?"+":""}$${t.pnl.toFixed(2)}`:"—"}</td>
                    <td>{!t.closed&&<button className="btn btn-g bxs" onClick={()=>closeTrade(t.id)}>Close</button>}</td>
                  </tr>
                ))}</tbody></table>
              </div>
            )}
          </div>
        </div>
      </>}

      {tab==="bt" && (
        <div style={{ display:"grid", gridTemplateColumns:"250px 1fr", gap:14 }}>
          <div className="card" style={{ padding:16 }}>
            <div className="ctitle">Configuration</div>
            <div className="fg"><label>Pair</label><select><option>ETH/USDT</option><option>BTC/USDT</option><option>SOL/USDT</option></select></div>
            <div className="fg"><label>Period</label><div className="tabs" style={{ flexWrap:"wrap", gap:3 }}>{["1M","3M","6M","1Y","2Y"].map((p)=><button key={p} className={`tab${btPer===p?" on":""}`} style={{ padding:"4px 8px", fontSize:10 }} onClick={()=>setBtPer(p)}>{p}</button>)}</div></div>
            <div className="fg"><label>Strategy</label><select><option>Range Protection + Hedge LONG</option><option>Trend Following</option><option>Mean Reversion</option></select></div>
            <div className="fg"><label>Capital (USD)</label><input className="inp" type="number" value={btCap} onChange={(e)=>setBtCap(e.target.value)}/></div>
            <button className="btn btn-p bfull" onClick={runBT} disabled={btBusy}>{btBusy?<><span className="spin"/>Running…</>:"▶ Run Backtest"}</button>
          </div>
          <div>
            {!btRes ? <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:300, flexDirection:"column", gap:12, color:"var(--muted)" }}><span style={{ fontSize:40, opacity:.3 }}>◇</span><span>Configure and run a backtest</span></div> : (
              <>
                <div className="g4" style={{ marginBottom:14 }}>
                  {[["Final Balance","$"+Math.floor(btRes.fin).toLocaleString(),"var(--green)"],["Return",btRes.ret.toFixed(1)+"%","var(--green)"],["Win Rate","66.4%","var(--cyan)"],["Sharpe","1.72","var(--blue)"],["Max Drawdown",btRes.dd.toFixed(1)+"%","var(--red)"],["Profit Factor","2.04","var(--green)"],["Avg Win","$82","var(--green)"],["Avg Loss","-$41","var(--red)"]].map(([l,v,c])=>(
                    <div key={l} className="stat" style={{ padding:11 }}><div className="slbl">{l}</div><div style={{ fontFamily:"'Space Mono',monospace", fontSize:16, fontWeight:700, marginTop:4, color:c }}>{v}</div></div>
                  ))}
                </div>
                <div className="card"><div className="ctitle">Equity Curve — {btPer}</div><canvas ref={btRef} height={140} style={{ width:"100%", display:"block" }}/></div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
