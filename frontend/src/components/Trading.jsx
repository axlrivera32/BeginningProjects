import { useState, useRef, useEffect, useCallback } from 'react';
import { usePrices, TF_LIST, TF_LABEL } from '../hooks/usePrices';
import { useExchange } from '../hooks/useExchange';
import { toast } from './Toast';

// ── TradingView widget (moved here from Dashboard) ────────────────────────────
const TV_SYMBOLS = {
  'ETH-PERP': 'BINANCE:ETHUSD', 'BTC-PERP': 'BINANCE:BTCUSD',
  'SOL-PERP': 'BINANCE:SOLUSD', 'ARB-PERP': 'BINANCE:ARBUSD',
  'ETH/USDT': 'BINANCE:ETHUSDT','BTC/USDT': 'BINANCE:BTCUSDT',
  'SOL/USDT': 'BINANCE:SOLUSDT','ARB/USDT': 'BINANCE:ARBUSDT',
};
const TV_INTERVAL = {
  '1m':'1','3m':'3','5m':'5','15m':'15','30m':'30',
  '1h':'60','2h':'120','4h':'240',
  '1d':'D','2d':'3D','1w':'W','1mo':'M',
};

let _tvLoaded = false;
function loadTV() {
  if (_tvLoaded || document.querySelector('script[data-tv]')) return;
  const s = document.createElement('script');
  s.src = 'https://s3.tradingview.com/tv.js';
  s.async = true;
  s.setAttribute('data-tv', '1');
  s.onload = () => { _tvLoaded = true; };
  document.head.appendChild(s);
}

function TradingViewChart({ mkt, tf, theme, orders }) {
  const containerRef = useRef(null);
  const widgetRef    = useRef(null);
  const ordersRef    = useRef(orders);
  ordersRef.current  = orders;

  // Ensure TV script is loaded once
  useEffect(() => { loadTV(); }, []);

  const initWidget = useCallback(() => {
    const container = containerRef.current;
    if (!container || !window.TradingView) return;
    if (widgetRef.current) { container.innerHTML = ''; widgetRef.current = null; }

    const symbol = TV_SYMBOLS[mkt] || 'BINANCE:ETHUSD';
    const interval = TV_INTERVAL[tf] || '60';
    const isDark   = theme === 'dark';

    widgetRef.current = new window.TradingView.widget({
      autosize:            true,
      symbol,
      interval,
      timezone:            'Etc/UTC',
      theme:               isDark ? 'dark' : 'light',
      style:               '1',       // 1 = Candles
      locale:              'en',
      toolbar_bg:          isDark ? '#0f1319' : '#ffffff',
      enable_publishing:   false,
      hide_side_toolbar:   false,
      allow_symbol_change: false,
      withdateranges:      true,
      container_id:        container.id,
      // Studies — RSI + Volume
      studies: ['RSI@tv-basicstudies', 'Volume@tv-basicstudies'],
      overrides: {
        'paneProperties.background':              isDark ? '#0f1319' : '#ffffff',
        'paneProperties.backgroundType':          'solid',
        'paneProperties.vertGridProperties.color': isDark ? '#151b26' : '#f3f5fc',
        'paneProperties.horzGridProperties.color': isDark ? '#151b26' : '#f3f5fc',
        'scalesProperties.textColor':             isDark ? '#6b7fa0' : '#4a5880',
        'scalesProperties.fontSize':              11,
        'symbolWatermarkProperties.transparency': 90,
      },
      // Called when chart is ready — we can add order lines via JS API
      saved_data: null,
    });
  }, [mkt, tf, theme]);

  useEffect(() => {
    if (window.TradingView) {
      initWidget();
    } else {
      // Wait for script to load
      const t = setInterval(() => {
        if (window.TradingView) { clearInterval(t); initWidget(); }
      }, 200);
      return () => clearInterval(t);
    }
    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
      widgetRef.current = null;
    };
  }, [initWidget]);

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div
        ref={containerRef}
        id={`tv-trading-${mkt.replace(/[^a-z0-9]/gi, '')}`}
        style={{ width: '100%', height: '100%', minHeight: 340 }}
      />
      {/* Order markers overlay — shown as colored pills on the right edge */}
      <div style={{ position: 'absolute', right: 0, top: 8, bottom: 28, pointerEvents: 'none', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 3, paddingRight: 4 }}>
        {orders.slice(-8).map((o, i) => (
          <div
            key={i}
            className={`chart-order-marker ${o.side === 'LONG' ? 'com-long' : 'com-short'}`}
          >
            {o.side === 'LONG' ? '▲' : '▼'} {o.side} ${o.price.toLocaleString()} · {o.size} {o.coin}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Trading component ────────────────────────────────────────────────────
export default function Trading() {
  const { prices } = usePrices();
  const { hlOk, bxOk, hlPositions, bxPositions, placeHL, placeBX, closeHL, fetchHL } = useExchange();

  const [mkt,    setMkt]    = useState('ETH-PERP');
  const [exch,   setExch]   = useState('hl');
  const [mktType,setMktType]= useState('futures');
  const [side,   setSide]   = useState('LONG');
  const [otype,  setOtype]  = useState('limit');
  const [lev,    setLev]    = useState(5);
  const [amtUSD, setAmtUSD] = useState('');
  const [size,   setSize]   = useState('');
  const [lp,     setLp]     = useState('');
  const [tp,     setTp]     = useState('');
  const [sl,     setSl]     = useState('');
  const [trail,  setTrail]  = useState(1.5);
  const [cfm,    setCfm]    = useState('2');
  const [activeTF, setActiveTF] = useState('1h');
  const [busy,   setBusy]   = useState(false);
  const [errs,   setErrs]   = useState({});
  // Executed orders shown on chart
  const [orders, setOrders] = useState([]);
  const [theme,  setTheme]  = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');

  // Track theme changes
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-theme') || 'dark');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const coin  = mkt.replace('-PERP', '').replace('/USDT', '');
  const price = prices[coin] || 0;

  // Auto-calc size from USD
  useEffect(() => {
    if (!amtUSD || !price) return;
    const effLev = mktType === 'spot' ? 1 : lev;
    setSize(((parseFloat(amtUSD) * effLev) / price).toFixed(5));
  }, [amtUSD, price, lev, mktType]);

  function validate() {
    const e = {};
    const hasSz  = size   && parseFloat(size)   > 0;
    const hasAmt = amtUSD && parseFloat(amtUSD)  > 0;
    if (!hasSz && !hasAmt) e.size = 'Enter USD amount or base asset size.';
    if (otype !== 'market' && (!lp || parseFloat(lp) <= 0)) e.lp = 'Enter a limit price.';
    setErrs(e); return !Object.keys(e).length;
  }

  async function doPlace() {
    if (!validate()) return;
    if (mktType === 'futures' && lev > 20 && !window.confirm(`⚠ High leverage (${lev}×) — continue?`)) return;
    const isBuy     = side === 'LONG';
    const execPrice = lp ? parseFloat(lp) : price;
    setBusy(true);
    try {
      if (exch === 'hl') {
        if (!hlOk) { toast('Configure Hyperliquid in Settings first.', 'err'); return; }
        const r = await placeHL({
          coin, isBuy, sz: parseFloat(size),
          limitPx: lp ? parseFloat(lp) : null,
          tpPx:    tp ? parseFloat(tp) : null,
          slPx:    sl ? parseFloat(sl) : null,
          leverage: mktType === 'spot' ? 1 : lev,
        });
        if (r?.status === 'ok') {
          toast(`✓ ${side} ${mkt} placed on Hyperliquid`, 'ok');
          setOrders(prev => [...prev, { side, coin, price: execPrice, size: parseFloat(size), time: Date.now() }]);
        } else {
          toast('Order: ' + JSON.stringify(r?.response), 'warn');
        }
      } else {
        if (!bxOk) { toast('Configure BingX in Settings first.', 'err'); return; }
        await placeBX({
          symbol: coin + '-USDT', side: isBuy ? 'BUY' : 'SELL',
          quantity: parseFloat(size),
          price:    lp ? parseFloat(lp) : null,
          stopLoss: sl ? parseFloat(sl) : null,
          takeProfit: tp ? parseFloat(tp) : null,
        });
        toast(`✓ ${side} ${coin}-USDT placed on BingX`, 'ok');
        setOrders(prev => [...prev, { side, coin, price: execPrice, size: parseFloat(size), time: Date.now() }]);
      }
    } catch (e) {
      toast('Order failed: ' + e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  const positions = exch === 'hl' ? hlPositions : bxPositions;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: 16, height: 'calc(100vh - 90px)', overflow: 'hidden' }}>

      {/* ── LEFT — Order Form ── */}
      <div className="col" style={{ gap: 14, overflowY: 'auto', paddingRight: 2 }}>
        <div className="card" style={{ padding: 16, flexShrink: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="ctitle" style={{ marginBottom: 0 }}>New Order</div>
            <select value={mkt} onChange={e => setMkt(e.target.value)} style={{ width: 'auto', fontSize: 11 }}>
              <optgroup label="Perpetuals">
                <option>ETH-PERP</option><option>BTC-PERP</option>
                <option>SOL-PERP</option><option>ARB-PERP</option>
              </optgroup>
              <optgroup label="Spot">
                <option>ETH/USDT</option><option>BTC/USDT</option>
                <option>SOL/USDT</option><option>ARB/USDT</option>
              </optgroup>
            </select>
          </div>

          {/* Order type */}
          <div className="tabs" style={{ marginBottom: 12 }}>
            {['limit', 'market', 'stop'].map(t => (
              <button key={t} className={`tab${otype === t ? ' on' : ''}`} onClick={() => setOtype(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Exchange */}
          <div className="fg">
            <div className="lbl">Exchange</div>
            <div className="row" style={{ gap: 8 }}>
              <button className={`btn bsm${exch === 'hl' ? ' btn-p' : ' btn-g'}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setExch('hl')}>
                Hyperliquid {hlOk ? '✓' : ''}
              </button>
              <button className={`btn bsm${exch === 'bx' ? ' btn-p' : ' btn-g'}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setExch('bx')}>
                BingX {bxOk ? '✓' : ''}
              </button>
            </div>
          </div>

          {/* Market type */}
          <div className="fg">
            <div className="lbl">Market Type</div>
            <div className="mtype-row">
              <button className={`mtype-btn${mktType === 'futures' ? ' on' : ''}`} onClick={() => setMktType('futures')}>📈 Futures</button>
              <button className={`mtype-btn${mktType === 'spot' ? ' on' : ''}`} onClick={() => setMktType('spot')}>🪙 Spot</button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
              {mktType === 'futures' ? 'Leveraged · liquidation risk' : 'Direct purchase · no liquidation'}
            </div>
          </div>

          {/* Side */}
          <div className="fg">
            <div className="row" style={{ gap: 8 }}>
              <button className={`btn${side === 'LONG' ? ' btn-s' : ' btn-g'}`} style={{ flex: 1, justifyContent: 'center', fontSize: 14, fontWeight: 800 }} onClick={() => setSide('LONG')}>▲ LONG</button>
              <button className={`btn${side === 'SHORT' ? ' btn-d' : ' btn-g'}`} style={{ flex: 1, justifyContent: 'center', fontSize: 14, fontWeight: 800 }} onClick={() => setSide('SHORT')}>▼ SHORT</button>
            </div>
          </div>

          {/* Leverage */}
          {mktType === 'futures' && (
            <div className="fg">
              <div className="lbl">Leverage: <strong style={{ color: 'var(--cyan)' }}>{lev}×</strong></div>
              <input type="range" min={1} max={50} value={lev} onChange={e => setLev(Number(e.target.value))} />
              <div className="row" style={{ gap: 5, marginTop: 4 }}>
                {[1, 5, 10, 20, 50].map(v => <button key={v} className="btn btn-g bxs" onClick={() => setLev(v)}>{v}×</button>)}
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="fg">
            <label>Amount to Risk (USD)</label>
            <div className="amt-row">
              <input className="inp" type="number" placeholder={`$${price ? Math.round(price * 0.001) : '500'}`} min={0} value={amtUSD} onChange={e => setAmtUSD(e.target.value)} style={{ fontSize: 12 }} />
              <select style={{ fontSize: 11, padding: '9px 6px 9px 8px' }}>
                <option>USD $</option><option>% bal</option>
              </select>
            </div>
          </div>

          {/* Size */}
          <div className="fg">
            <label>
              Size (base asset)
              {size && amtUSD && <span style={{ color: 'var(--cyan)', fontSize: 10, marginLeft: 6 }}>{size} {coin}</span>}
            </label>
            <input className={`inp${errs.size ? ' err' : ''}`} type="number" placeholder="0.00" value={size} onChange={e => setSize(e.target.value)} min={0} step={0.001} />
            {errs.size && <div className="ferr">{errs.size}</div>}
          </div>

          {otype !== 'market' && (
            <div className="fg">
              <label>Limit Price</label>
              <input className={`inp${errs.lp ? ' err' : ''}`} type="number" placeholder={`Market $${price >= 1000 ? Math.round(price).toLocaleString() : price.toFixed(4)}`} value={lp} onChange={e => setLp(e.target.value)} />
              {errs.lp && <div className="ferr">{errs.lp}</div>}
            </div>
          )}

          <div className="g2" style={{ gap: 8, marginBottom: 14 }}>
            <div><label>Take Profit</label><input className="inp" type="number" placeholder="—" value={tp} onChange={e => setTp(e.target.value)} /></div>
            <div><label>Stop Loss</label><input className="inp" type="number" placeholder="—" value={sl} onChange={e => setSl(e.target.value)} /></div>
          </div>

          <div className="fg">
            <div className="lbl">Trailing Stop: <strong style={{ color: 'var(--cyan)' }}>{trail.toFixed(1)}%</strong></div>
            <input type="range" min={0.5} max={5} step={0.5} value={trail} onChange={e => setTrail(Number(e.target.value))} />
          </div>

          <div className="fg">
            <label>Anti-fakeout candles</label>
            <select value={cfm} onChange={e => setCfm(e.target.value)}>
              <option value="0">None</option>
              <option value="1">1 candle</option>
              <option value="2">2 candles (recommended)</option>
              <option value="3">3 candles (safest)</option>
            </select>
          </div>

          {!hlOk && !bxOk && <div className="wbox" style={{ marginBottom: 12 }}>⚠ Configure API keys in Settings.</div>}

          <button
            className={`btn bfull ${side === 'LONG' ? 'btn-s' : 'btn-d'}`}
            style={{ fontSize: 14, fontWeight: 800 }}
            onClick={doPlace}
            disabled={busy}
          >
            {busy
              ? <><span className="spin" />Placing…</>
              : `${side === 'LONG' ? '▲' : '▼'} Place ${side} [${mktType === 'spot' ? 'Spot' : 'Perp'}]`
            }
          </button>
        </div>

        {/* Recent executions */}
        {orders.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            <div className="row" style={{ justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--bdr)' }}>
              <span className="ctitle" style={{ marginBottom: 0 }}>Executions</span>
              <button className="btn btn-g bxs" onClick={() => setOrders([])}>Clear</button>
            </div>
            {orders.slice(-6).reverse().map((o, i) => (
              <div key={i} className="row" style={{ padding: '8px 14px', borderBottom: '1px solid var(--bdr)', gap: 8, fontSize: 11 }}>
                <span className={`badge ${o.side === 'LONG' ? 'bl' : 'bs'}`}>{o.side}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", flex: 1 }}>
                  {o.coin} @ ${o.price.toLocaleString()}
                </span>
                <span style={{ color: 'var(--muted)' }}>{o.size}</span>
                <span style={{ color: 'var(--muted)', fontSize: 10 }}>
                  {new Date(o.time).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── RIGHT — TradingView Chart + Positions ── */}
      <div className="col" style={{ gap: 14, minWidth: 0, overflow: 'hidden' }}>
        {/* Chart card */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: '1 1 400px' }}>
          {/* Header row */}
          <div className="row" style={{ justifyContent: 'space-between', padding: '12px 16px 0 16px', flexShrink: 0 }}>
            <div className="row" style={{ gap: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{mkt}</span>
              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 18, fontWeight: 700 }}>
                ${price >= 1000 ? Math.round(price).toLocaleString() : price.toFixed(4)}
              </span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="dot" />
              <span style={{ fontSize: 11, color: 'var(--sub)' }}>Live · TradingView</span>
            </div>
          </div>

          {/* Timeframe bar */}
          <div className="tf-bar" style={{ padding: '6px 16px 4px', flexShrink: 0 }}>
            {TF_LIST.map(tf => (
              <button
                key={tf}
                className={`tf-btn${activeTF === tf ? ' on' : ''}`}
                onClick={() => setActiveTF(tf)}
              >
                {TF_LABEL[tf]}
              </button>
            ))}
          </div>

          {/* TradingView embed — fills remaining space */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 340, position: 'relative' }}>
            <TradingViewChart
              mkt={mkt}
              tf={activeTF}
              theme={theme}
              orders={orders}
            />
          </div>
        </div>

        {/* Open Positions */}
        <div className="card" style={{ padding: 0, flexShrink: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--bdr)' }}>
            <div className="ctitle" style={{ marginBottom: 0 }}>Open Positions — {exch === 'hl' ? 'Hyperliquid' : 'BingX'}</div>
            <button className="btn btn-g bsm" onClick={() => fetchHL().catch(() => {})}>↻</button>
          </div>
          {positions.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No open positions</div>
          ) : (
            <div className="tbl">
              <table>
                <thead>
                  <tr><th>Market</th><th>Side</th><th>Size</th><th>Entry</th><th>uPnL</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => {
                    const pos = p.position || p;
                    const sz  = parseFloat(pos.szi || pos.positionAmt || 0);
                    const isL = sz > 0;
                    const pnl = parseFloat(pos.unrealizedPnl || pos.unrealizedProfit || 0);
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{(pos.coin || pos.symbol) + '-PERP'}</td>
                        <td><span className={`badge ${isL ? 'bl' : 'bs'}`}>{isL ? '▲ LONG' : '▼ SHORT'}</span></td>
                        <td>{Math.abs(sz).toFixed(4)}</td>
                        <td>${parseFloat(pos.entryPx || pos.entryPrice || 0).toFixed(2)}</td>
                        <td className={pnl >= 0 ? 'tpos' : 'tneg'}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</td>
                        <td>
                          {exch === 'hl' && (
                            <button
                              className="btn btn-g bxs"
                              onClick={() => closeHL(pos.coin, Math.abs(sz))
                                .then(() => toast('Closed ' + pos.coin, 'ok'))
                                .catch(e => toast('Failed: ' + e.message, 'err'))}
                            >
                              Close
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
