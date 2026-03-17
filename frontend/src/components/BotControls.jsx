import { useState, useRef, useCallback } from 'react';
import { useExchange } from '../hooks/useExchange';
import { toast } from './Toast';

// ── Simulation messages covering all 4 scenarios ──────────────────────────────
const BOT_MSGS = [
  // ── Monitoring ────────────────────────────────────────────────────────────
  ['info', 'Monitoring ETH/USDC pool · Range $3,100–$3,500 · Price $3,248'],
  ['info', 'RSI(14)=52.4 · EMA(9)=$3,241 · EMA(21)=$3,218 → bullish structure'],
  // ── Lower breakdown → SHORT ───────────────────────────────────────────────
  ['warn', 'Price approaching lower bound $3,100 — arming SHORT breakdown watch'],
  ['ok',   'SHORT ETH-PERP opened @ $3,098 · configured amount · trailing stop armed'],
  ['warn', 'Fakeout detected — price reversed within 2 candles. SHORT cancelled. No loss.'],
  ['ok',   'SHORT trailing stop updated: $3,198 → $3,207 (+0.4%)'],
  // ── Hedge LONG on fakeout ─────────────────────────────────────────────────
  ['ok',   '⚡ Hedge LONG opened · ETH-PERP @ $3,105 · configured amount · Lev: 2×'],
  ['ok',   'SHORT break-even: stop → entry $3,098. Hedge LONG trailing at $3,112'],
  ['ok',   'SHORT TP @ $3,050 · PnL: +$24.00 · Hedge LONG closed · Net: +$22.75'],
  // ── Upper breakout → LONG ─────────────────────────────────────────────────
  ['warn', 'Price approaching upper bound $3,500 — arming LONG breakout watch'],
  ['ok',   'LONG ETH-PERP opened @ $3,506 · configured amount · trailing stop armed'],
  ['warn', 'Upper fakeout — price dropped back into range in 2 candles. LONG cancelled.'],
  ['ok',   'LONG trailing stop updated: $3,412 → $3,449 (+1.1%)'],
  // ── Hedge SHORT on upper fakeout reversal ─────────────────────────────────
  ['ok',   '⚡ Hedge SHORT opened · ETH-PERP @ $3,492 · configured amount · IL protection'],
  ['info', 'Hedge SHORT monitoring — IL offset: ~$18.40 · Pool value recovering'],
  ['ok',   'LP price re-entered range ($3,498) — Hedge SHORT closed · PnL: +$31.20'],
  // ── Pool IL coverage ──────────────────────────────────────────────────────
  ['warn', '⚡ Pool IL hedge triggered — ETH below lower bound by 2.3%'],
  ['ok',   '⚡ Pool SHORT opened · ETH-PERP @ $3,064 · configured amount · Lev: 1×'],
  ['ok',   'LP re-entered range ($3,102) — Pool SHORT closed · PnL: +$31.20 · IL coverage: 87%'],
  // ── Stats ─────────────────────────────────────────────────────────────────
  ['info', 'Circuit breaker: drawdown 2.1% — within 5% limit'],
  ['ok',   'Session PnL: +$143.60 · Trades: 7 · Win rate: 71% · Hedges active: 2'],
];

export default function BotControls() {
  const { hlOk } = useExchange();
  const [running,  setRunning]  = useState(false);
  const [stats,    setStats]    = useState({ pnl:0, trades:0, hedges:0, fakeouts:0 });
  const [logs,     setLogs]     = useState([]);

  // ── Main position parameters ───────────────────────────────────────────────
  const [mktType,  setMktType]  = useState('futures');      // futures | spot
  const [posUSD,   setPosUSD]   = useState('');             // USD amount per trade
  const [posMode,  setPosMode]  = useState('usd');          // usd | pct
  const [posLev,   setPosLev]   = useState(3);
  const [trail,    setTrail]    = useState(1.5);
  const [be,       setBe]       = useState(1.0);
  const [cfm,      setCfm]      = useState('2');

  // ── Hedge LONG (lower fakeout reversal cover) ──────────────────────────────
  const [hlEn,     setHlEn]     = useState(true);
  const [hlUSD,    setHlUSD]    = useState('');
  const [hlMode,   setHlMode]   = useState('usd');
  const [hlLev,    setHlLev]    = useState(2);
  const [hlTrail,  setHlTrail]  = useState(1.0);

  // ── Hedge SHORT (upper fakeout reversal cover) ─────────────────────────────
  const [hsEn,     setHsEn]     = useState(true);
  const [hsUSD,    setHsUSD]    = useState('');
  const [hsMode,   setHsMode]   = useState('usd');
  const [hsLev,    setHsLev]    = useState(1);
  const [hsTrail,  setHsTrail]  = useState(1.5);
  const [hsTrig,   setHsTrig]   = useState(2.0);

  const timerRef = useRef(null);
  const idxRef   = useRef(0);

  const addLog = useCallback((type, msg) => {
    const icons  = { ok:'✓', info:'ℹ', warn:'⚠', err:'✕' };
    const colors = { ok:'var(--green)', info:'var(--blue)', warn:'var(--org)', err:'var(--red)' };
    setLogs(prev => [{
      id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(),
      type, msg, icon: icons[type]||'ℹ', color: colors[type]||colors.info,
    }, ...prev].slice(0, 300));
  }, []);

  function start() {
    setRunning(true);
    const mLabel = mktType === 'futures' ? 'Perpetual Futures' : 'Spot';
    addLog('ok',   `Bot v5 started · Market type: ${mLabel}`);
    if (!hlOk) addLog('warn', 'Hyperliquid not connected — simulation mode');
    if (posUSD) addLog('info', `Position size: $${posUSD} ${posMode === 'usd' ? 'USD' : '% of balance'}${mktType === 'futures' ? ` · Lev: ${posLev}×` : ''}`);
    else        addLog('info', `Position size: auto (${5}% of balance)${mktType === 'futures' ? ` · Lev: ${posLev}×` : ''}`);
    addLog('info', `Trailing stop: ${trail}% · Break-even: ${be}% · Confirm: ${cfm} candles`);
    if (hlEn) addLog('info', `⚡ Hedge LONG: ${hlUSD||'auto'} ${hlMode==='usd'?'USD':'%'} · ${mktType==='futures'?`${hlLev}× ·`:''} Trail ${hlTrail}%`);
    if (hsEn) addLog('info', `⚡ Hedge SHORT: ${hsUSD||'auto'} ${hsMode==='usd'?'USD':'%'} · ${mktType==='futures'?`${hsLev}× ·`:''} Trig ${hsTrig}% · Trail ${hsTrail}%`);
    timerRef.current = setInterval(() => {
      if (!timerRef.current) return;
      const [type, msg] = BOT_MSGS[idxRef.current % BOT_MSGS.length];
      addLog(type, msg);
      if (type === 'ok') {
        setStats(s => {
          const pnl = s.pnl + (Math.random() - 0.28) * 90;
          const isHedge = msg.includes('Hedge') || msg.includes('hedge');
          return { pnl, trades: s.trades + (isHedge ? 0 : 1), fakeouts: s.fakeouts, hedges: s.hedges + (isHedge ? 1 : 0) };
        });
      }
      if (type === 'warn' && (msg.includes('Fakeout') || msg.includes('fakeout')))
        setStats(s => ({ ...s, fakeouts: s.fakeouts + 1 }));
      idxRef.current++;
    }, 3200);
  }

  function stop() {
    setRunning(false);
    clearInterval(timerRef.current);
    timerRef.current = null;
    addLog('warn', 'Bot stopped by user.');
  }

  function applyPreset(name) {
    const p = {
      conservative: { pos:'200',  lev:1, trail:1,   be:.5, hlUSD:'100',  hlLev:1, hlTrail:.5,  hsUSD:'150', hsLev:1, hsTrig:3 },
      balanced:     { pos:'500',  lev:3, trail:1.5, be:1,  hlUSD:'250',  hlLev:2, hlTrail:1,   hsUSD:'400', hsLev:1, hsTrig:2 },
      aggressive:   { pos:'1000', lev:5, trail:2.5, be:2,  hlUSD:'500',  hlLev:3, hlTrail:2,   hsUSD:'800', hsLev:2, hsTrig:1.5 },
    }[name];
    if (!p) return;
    setPosUSD(p.pos); setPosLev(p.lev); setTrail(p.trail); setBe(p.be);
    setHlUSD(p.hlUSD); setHlLev(p.hlLev); setHlTrail(p.hlTrail);
    setHsUSD(p.hsUSD); setHsLev(p.hsLev); setHsTrig(p.hsTrig);
    toast(`Applied ${name} preset · Base: $${p.pos} · HL: $${p.hlUSD} · HS: $${p.hsUSD}`, 'ok');
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'350px 1fr', gap:16 }}>
      {/* ─────────────── LEFT PANEL ─────────────── */}
      <div className="col" style={{ gap:14 }}>

        {/* Status card */}
        <div className="card" style={{ padding:16 }}>
          <div className="row" style={{ justifyContent:'space-between', marginBottom:14 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:15 }}>Trading Bot v5</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                Range Protection · LONG + SHORT · Dual Hedge
              </div>
            </div>
            <button className={`btn bsm ${running ? 'btn-d' : 'btn-s'}`} onClick={running ? stop : start}>
              {running ? '⏹ Stop' : '▶ Start'}
            </button>
          </div>
          {[
            'Range Protection Monitor',
            'Anti-Fakeout Filter (LONG + SHORT)',
            'Trailing Stop Engine',
            'Break-Even Logic',
          ].map((label, i) => (
            <div key={i} className="row" style={{ padding:'7px 11px', background:'var(--elev)', borderRadius:'var(--r)', border:'1px solid var(--bdr)', gap:8, marginBottom:6 }}>
              <span className={`dot${running ? '' : ' off'}`}/>
              <span style={{ fontSize:11, color: running ? 'var(--txt)' : 'var(--muted)' }}>{label}</span>
            </div>
          ))}
          {running && <div style={{ marginTop:10, padding:'9px 11px', background:'rgba(32,208,160,.07)', border:'1px solid rgba(32,208,160,.18)', borderRadius:'var(--r)', fontSize:11, color:'var(--green)' }}>● Bot running · Next tick ~3s</div>}
        </div>

        {/* Parameters */}
        <div className="card" style={{ padding:16 }}>
          <div className="ctitle">Main Position Parameters</div>

          {/* Market type */}
          <div className="fg">
            <div className="lbl">Market Type</div>
            <div className="mtype-row">
              <button className={`mtype-btn${mktType === 'futures' ? ' on' : ''}`} onClick={() => setMktType('futures')}>📈 Perpetual Futures</button>
              <button className={`mtype-btn${mktType === 'spot' ? ' on' : ''}`} onClick={() => setMktType('spot')}>🪙 Spot</button>
            </div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>
              {mktType === 'futures' ? 'Leveraged perps — full hedge support' : 'Spot market — no leverage, no liquidation'}
            </div>
          </div>

          {/* Position size */}
          <div className="fg">
            <div className="lbl">Position Size to Open</div>
            <div className="amt-row">
              <input
                className="inp" type="number" placeholder={`e.g. 500 (empty = ${5}% of bal)`}
                min={1} value={posUSD} onChange={e => setPosUSD(e.target.value)}
                style={{ fontSize:12 }}
              />
              <select value={posMode} onChange={e => setPosMode(e.target.value)}
                style={{ fontSize:11, padding:'9px 6px 9px 8px' }}>
                <option value="usd">USD $</option>
                <option value="pct">% bal</option>
              </select>
            </div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>
              Amount per individual LONG or SHORT position opened by the bot
            </div>
          </div>

          {/* Leverage — only for futures */}
          {mktType === 'futures' && (
            <div className="fg">
              <div className="lbl">Leverage: <strong style={{ color:'var(--cyan)' }}>{posLev}×</strong></div>
              <input type="range" min={1} max={20} value={posLev} onChange={e => setPosLev(Number(e.target.value))}/>
              <div className="row" style={{ gap:5, marginTop:5 }}>
                {[1,2,3,5,10].map(v => <button key={v} className="btn btn-g bxs" onClick={() => setPosLev(v)}>{v}×</button>)}
              </div>
            </div>
          )}

          <div className="fg"><div className="lbl">Trailing stop: <strong style={{ color:'var(--cyan)' }}>{trail.toFixed(1)}%</strong></div><input type="range" min={0.5} max={5} step={0.5} value={trail} onChange={e => setTrail(Number(e.target.value))}/></div>
          <div className="fg"><div className="lbl">Break-even trigger: <strong style={{ color:'var(--cyan)' }}>{be.toFixed(1)}%</strong></div><input type="range" min={0.1} max={5} step={0.1} value={be} onChange={e => setBe(Number(e.target.value))}/></div>
          <div className="fg">
            <label>Anti-fakeout confirmation candles</label>
            <select value={cfm} onChange={e => setCfm(e.target.value)}>
              <option value="0">None</option>
              <option value="1">1 candle</option>
              <option value="2">2 candles (recommended)</option>
              <option value="3">3 candles (safest)</option>
            </select>
          </div>

          {/* ── Hedge LONG (lower bound fakeout) ── */}
          <div className="hbox-l">
            <div className="row" style={{ justifyContent:'space-between', marginBottom:8 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:12, color:'var(--purple)' }}>⚡ Hedge LONG — Lower Fakeout Cover</div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Opens when SHORT reverses (lower fakeout)</div>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                <input type="checkbox" checked={hlEn} onChange={e => setHlEn(e.target.checked)} style={{ accentColor:'var(--purple)' }}/>
                <span style={{ fontSize:11, color:'var(--sub)' }}>{hlEn ? 'On' : 'Off'}</span>
              </label>
            </div>
            {hlEn && <>
              <div className="fg">
                <div className="lbl" style={{ color:'var(--purple)' }}>Amount to Risk</div>
                <div className="amt-row">
                  <input className="inp" type="number" placeholder="e.g. 250" min={1} value={hlUSD} onChange={e => setHlUSD(e.target.value)} style={{ fontSize:12 }}/>
                  <select value={hlMode} onChange={e => setHlMode(e.target.value)} style={{ fontSize:11, padding:'9px 6px 9px 8px' }}>
                    <option value="usd">USD $</option>
                    <option value="pct">% pos</option>
                  </select>
                </div>
              </div>
              {mktType === 'futures' && <div className="fg"><div className="lbl" style={{ color:'var(--purple)' }}>Leverage: <strong>{hlLev}×</strong></div><input type="range" min={1} max={10} value={hlLev} onChange={e => setHlLev(Number(e.target.value))} style={{ accentColor:'var(--purple)' }}/></div>}
              <div className="fg"><div className="lbl" style={{ color:'var(--purple)' }}>Trailing: <strong>{hlTrail.toFixed(1)}%</strong></div><input type="range" min={0.5} max={3} step={0.5} value={hlTrail} onChange={e => setHlTrail(Number(e.target.value))} style={{ accentColor:'var(--purple)' }}/></div>
              <div style={{ padding:'8px 10px', background:'rgba(167,139,250,.06)', border:'1px solid rgba(167,139,250,.2)', borderRadius:'var(--r)', fontSize:10, color:'var(--purple)', lineHeight:1.6 }}>
                Trigger: price closes above SHORT entry on {cfm} candle{cfm !== '1' ? 's' : ''}. Closes at trailing stop or TP.
              </div>
            </>}
          </div>

          {/* ── Hedge SHORT (upper bound fakeout) ── */}
          <div className="hbox-s" style={{ marginTop:10 }}>
            <div className="row" style={{ justifyContent:'space-between', marginBottom:8 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:12, color:'var(--red)' }}>⚡ Hedge SHORT — Upper Fakeout + Pool IL</div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Opens when LONG reverses or pool drops below range</div>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                <input type="checkbox" checked={hsEn} onChange={e => setHsEn(e.target.checked)} style={{ accentColor:'var(--red)' }}/>
                <span style={{ fontSize:11, color:'var(--sub)' }}>{hsEn ? 'On' : 'Off'}</span>
              </label>
            </div>
            {hsEn && <>
              <div className="fg">
                <div className="lbl" style={{ color:'var(--red)' }}>Amount to Risk</div>
                <div className="amt-row">
                  <input className="inp" type="number" placeholder="e.g. 400" min={1} value={hsUSD} onChange={e => setHsUSD(e.target.value)} style={{ fontSize:12 }}/>
                  <select value={hsMode} onChange={e => setHsMode(e.target.value)} style={{ fontSize:11, padding:'9px 6px 9px 8px' }}>
                    <option value="usd">USD $</option>
                    <option value="pct">% pool</option>
                  </select>
                </div>
              </div>
              {mktType === 'futures' && <div className="fg"><div className="lbl" style={{ color:'var(--red)' }}>Leverage: <strong>{hsLev}×</strong></div><input type="range" min={1} max={10} value={hsLev} onChange={e => setHsLev(Number(e.target.value))} style={{ accentColor:'var(--red)' }}/></div>}
              <div className="fg"><div className="lbl" style={{ color:'var(--red)' }}>Trailing: <strong>{hsTrail.toFixed(1)}%</strong></div><input type="range" min={0.5} max={5} step={0.5} value={hsTrail} onChange={e => setHsTrail(Number(e.target.value))} style={{ accentColor:'var(--red)' }}/></div>
              <div className="fg"><div className="lbl" style={{ color:'var(--red)' }}>Pool IL trigger: deviation ≥ <strong>{hsTrig.toFixed(1)}%</strong></div><input type="range" min={0.5} max={10} step={0.5} value={hsTrig} onChange={e => setHsTrig(Number(e.target.value))} style={{ accentColor:'var(--red)' }}/></div>
              <div style={{ padding:'8px 10px', background:'rgba(240,80,106,.06)', border:'1px solid rgba(240,80,106,.2)', borderRadius:'var(--r)', fontSize:10, color:'var(--red)', lineHeight:1.6 }}>
                Upper fakeout: price drops back below upper bound on {cfm} candle{cfm !== '1' ? 's' : ''}. Pool IL: price falls below lower bound by {hsTrig}%.
              </div>
            </>}
          </div>

          {/* Presets */}
          <div className="row" style={{ gap:7, marginTop:14 }}>
            {['conservative','balanced','aggressive'].map(n => (
              <button key={n} className={`btn btn-g bsm`} style={{ flex:1, justifyContent:'center' }}
                onClick={() => applyPreset(n)}>{n.charAt(0).toUpperCase()+n.slice(1)}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ─────────────── RIGHT PANEL ─────────────── */}
      <div className="col" style={{ gap:14 }}>
        {/* Stats */}
        <div className="g4">
          <div className="stat"><div className="slbl">Session PnL</div><div className="sval" style={{ fontSize:20, marginTop:4, color: stats.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{stats.pnl >= 0 ? '+' : ''}${Math.abs(stats.pnl).toFixed(2)}</div></div>
          <div className="stat"><div className="slbl">Trades</div><div className="sval" style={{ fontSize:20, marginTop:4 }}>{stats.trades}</div></div>
          <div className="stat"><div className="slbl">Hedges (L+S)</div><div className="sval" style={{ fontSize:20, marginTop:4, color:'var(--purple)' }}>{stats.hedges}</div></div>
          <div className="stat"><div className="slbl">Fakeouts Blocked</div><div className="sval" style={{ fontSize:20, marginTop:4, color:'var(--org)' }}>{stats.fakeouts}</div></div>
        </div>

        {/* Log */}
        <div className="card" style={{ flex:1, padding:0, display:'flex', flexDirection:'column' }}>
          <div className="row" style={{ justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid var(--bdr)' }}>
            <div className="row" style={{ gap:8 }}>
              <span className="ctitle" style={{ marginBottom:0 }}>Activity Log</span>
              <span className={`dot${running ? '' : ' off'}`}/>
            </div>
            <button className="btn btn-g bsm" onClick={() => setLogs([])}>Clear</button>
          </div>
          <div style={{ flex:1, overflowY:'auto', minHeight:260, maxHeight:380 }}>
            {logs.length === 0
              ? <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:12 }}>Start the bot to see activity.</div>
              : logs.map(l => (
                <div key={l.id} className="blog">
                  <span className="btime">{l.time}</span>
                  <span style={{ color:l.color, flexShrink:0, fontSize:12 }}>{l.icon}</span>
                  <span className="bmsg">{l.msg}</span>
                </div>
              ))
            }
          </div>
        </div>

        {/* Strategy explanation — 2 columns */}
        <div className="card" style={{ padding:16 }}>
          <div className="ctitle" style={{ color:'var(--purple)' }}>◈ Full Strategy — LONG + SHORT · Both Bounds</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, fontSize:11, color:'var(--sub)', lineHeight:1.8 }}>
            <div>
              <div style={{ fontWeight:700, fontSize:12, color:'var(--green)', marginBottom:6, paddingBottom:4, borderBottom:'1px solid var(--bdr)' }}>
                Lower Bound — SHORT + Hedge LONG
              </div>
              <p><strong style={{ color:'var(--txt)' }}>1.</strong> Price closes below lower bound ({cfm} candles)</p>
              <p><strong style={{ color:'var(--txt)' }}>2.</strong> SHORT opens: ${posUSD || 'auto'} {mktType === 'futures' ? `· ${posLev}×` : '(spot)'} · trail {trail}%</p>
              <p><strong style={{ color:'var(--red)' }}>3.</strong> Fakeout → SHORT cancelled, no loss</p>
              <p><strong style={{ color:'var(--purple)' }}>4.</strong> Price reverses → Hedge LONG: ${hlUSD || 'auto'}{mktType === 'futures' ? ` · ${hlLev}×` : ''}</p>
              <p><strong style={{ color:'var(--purple)' }}>5.</strong> SHORT stop → break-even at {be}%</p>
              <p><strong style={{ color:'var(--green)' }}>6.</strong> Exit at TP or trailing stop</p>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:12, color:'var(--cyan)', marginBottom:6, paddingBottom:4, borderBottom:'1px solid var(--bdr)' }}>
                Upper Bound — LONG + Hedge SHORT
              </div>
              <p><strong style={{ color:'var(--txt)' }}>1.</strong> Price closes above upper bound ({cfm} candles)</p>
              <p><strong style={{ color:'var(--txt)' }}>2.</strong> LONG opens: ${posUSD || 'auto'} {mktType === 'futures' ? `· ${posLev}×` : '(spot)'} · trail {trail}%</p>
              <p><strong style={{ color:'var(--red)' }}>3.</strong> Fakeout → LONG cancelled, no loss</p>
              <p><strong style={{ color:'var(--red)' }}>4.</strong> Price reverses → Hedge SHORT: ${hsUSD || 'auto'}{mktType === 'futures' ? ` · ${hsLev}×` : ''}</p>
              <p><strong style={{ color:'var(--red)' }}>5.</strong> Pool IL protection: trigger ≥ {hsTrig}% deviation</p>
              <p><strong style={{ color:'var(--green)' }}>6.</strong> Closes when price re-enters range</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
