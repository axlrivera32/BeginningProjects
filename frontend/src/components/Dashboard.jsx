import { useEffect, useRef } from 'react';
import { usePrices } from '../hooks/usePrices';
import { useWallet } from '../hooks/useWallet';
import { useExchange } from '../hooks/useExchange';
import { drawLine } from './Chart';
import { toast } from './Toast';

export default function Dashboard() {
  const { prices, changes } = usePrices();
  const { wallet, openModal } = useWallet();
  const { hlPositions, fetchHL, hlOk, closeHL } = useExchange();
  const pnlRef   = useRef(null);
  const ethRef   = useRef(null);
  const btcRef   = useRef(null);
  const { history } = usePrices();

  useEffect(() => {
    drawLine(pnlRef.current, [0,420,310,890,750,1200,980,1450,1320,1890,2100,2450,2200,2800], '#20d0a0');
  }, []);

  useEffect(() => {
    if (history.ETH?.length) drawLine(ethRef.current, history.ETH.slice(-40), '#3dd6f5');
    if (history.BTC?.length) drawLine(btcRef.current, history.BTC.slice(-40), '#f7931a');
  }, [history]);

  useEffect(() => { if (hlOk) fetchHL().catch(() => {}); }, [hlOk]);

  const chain = wallet?.chainInfo;
  const pval  = wallet ? (wallet.balance * prices.ETH) : null;

  const tickers = [
    { sym:'ETH', ref: ethRef },
    { sym:'BTC', ref: btcRef },
  ];

  return (
    <div>
      <div className="row" style={{ justifyContent:'space-between', marginBottom:18 }}>
        <div>
          <h1 style={{ fontSize:21, fontWeight:800, letterSpacing:'-.5px' }}>Portfolio Overview</h1>
          <p style={{ color:'var(--sub)', fontSize:12, marginTop:3 }}>
            <span className="dot" style={{ marginRight:6 }}/>Live · updates every 15s
            <span style={{ color:'var(--muted)', marginLeft:12 }}>
              · Chart moved to <strong>Trading</strong> tab (TradingView realtime)
            </span>
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="g4" style={{ marginBottom:18 }}>
        <div className="stat">
          <div className="slbl">Portfolio Value</div>
          <div className="sval" style={{ color:'var(--cyan)', fontSize:20, marginTop:4 }}>
            {pval !== null ? `$${pval.toLocaleString('en-US',{maximumFractionDigits:2})}` : (
              <button className="btn btn-p bsm" onClick={openModal} style={{ fontSize:11 }}>Connect Wallet</button>
            )}
          </div>
          <div className={`schg ${(changes.ETH||0)>=0?'up':'dn'}`}>{(changes.ETH||0)>=0?'▲+':'▼'}{Math.abs(changes.ETH||0).toFixed(2)}%</div>
        </div>
        <div className="stat">
          <div className="slbl">ETH Balance</div>
          <div className="sval" style={{ fontSize:20, marginTop:4 }}>{wallet?wallet.balance.toFixed(4)+' ETH':'—'}</div>
          <div className="schg neu">{chain?.name||'No wallet'}</div>
        </div>
        <div className="stat">
          <div className="slbl">HL Positions</div>
          <div className="sval" style={{ fontSize:20, marginTop:4 }}>{hlOk?hlPositions.length:'—'}</div>
          <div className="schg" style={{ background:'rgba(61,214,245,.1)',color:'var(--cyan)' }}>Hyperliquid</div>
        </div>
        <div className="stat">
          <div className="slbl">Current Block</div>
          <div className="sval" style={{ fontSize:17, marginTop:4 }}>{wallet?.blockNumber?.toLocaleString()||'—'}</div>
          <div className="schg neu">{wallet?.walletId||'—'}</div>
        </div>
      </div>

      {/* Price mini-charts + PnL */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1.6fr', gap:16, marginBottom:18 }}>
        {[{sym:'ETH',ref:ethRef},{sym:'BTC',ref:btcRef}].map(({sym,ref}) => (
          <div key={sym} className="card" style={{ padding:14 }}>
            <div className="row" style={{ justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontWeight:700 }}>{sym}/USD</span>
              <div className="row" style={{ gap:6 }}>
                <span style={{ fontFamily:"'Space Mono',monospace", fontSize:14, fontWeight:700 }}>
                  ${(prices[sym]||0)>=1000?Math.round(prices[sym]).toLocaleString():(prices[sym]||0).toFixed(4)}
                </span>
                <span className={`schg ${(changes[sym]||0)>=0?'up':'dn'}`} style={{ fontSize:9 }}>
                  {(changes[sym]||0)>=0?'▲+':'▼'}{Math.abs(changes[sym]||0).toFixed(2)}%
                </span>
              </div>
            </div>
            <canvas ref={ref} height={60} style={{ width:'100%', display:'block' }}/>
          </div>
        ))}

        <div className="card" style={{ padding:14 }}>
          <div className="ctitle">Cumulative PnL</div>
          <canvas ref={pnlRef} height={100} style={{ width:'100%', display:'block' }}/>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginTop:10 }}>
            {[['Win Rate','68.4%','var(--green)'],['Sharpe','1.84','var(--blue)'],['Max DD','8.2%','var(--red)'],['PF','2.1','var(--cyan)']].map(([l,v,c])=>(
              <div key={l} style={{ padding:'7px 8px', background:'var(--elev)', borderRadius:'var(--r)', border:'1px solid var(--bdr)' }}>
                <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.6 }}>{l}</div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, marginTop:3, color:c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ticker row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
        {['ETH','BTC','SOL','ARB'].map(sym => (
          <div key={sym} className="card" style={{ padding:'12px 14px' }}>
            <div className="row" style={{ justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontWeight:700, fontSize:13 }}>{sym}</span>
              <span className={`schg ${(changes[sym]||0)>=0?'up':'dn'}`} style={{ fontSize:9 }}>
                {(changes[sym]||0)>=0?'▲+':'▼'}{Math.abs(changes[sym]||0).toFixed(2)}%
              </span>
            </div>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:16, fontWeight:700 }}>
              ${(prices[sym]||0)>=1000?Math.round(prices[sym]).toLocaleString():(prices[sym]||0).toFixed(4)}
            </div>
          </div>
        ))}
      </div>

      {/* HL Positions table */}
      <div className="card">
        <div className="row" style={{ justifyContent:'space-between', marginBottom:12 }}>
          <div className="ctitle" style={{ marginBottom:0 }}>Hyperliquid Open Positions</div>
          <button className="btn btn-g bsm" onClick={() => fetchHL().catch(e => toast('Refresh: '+e.message,'err'))}>↻ Refresh</button>
        </div>
        {!hlOk
          ? <div style={{ padding:28, textAlign:'center', color:'var(--muted)', fontSize:12 }}>Configure Hyperliquid API in <strong>Settings</strong> to view live positions.</div>
          : hlPositions.length===0
          ? <div style={{ padding:28, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No open positions</div>
          : <div className="tbl"><table>
              <thead><tr><th>Market</th><th>Side</th><th>Size</th><th>Entry</th><th>Liq.</th><th>uPnL</th><th>Action</th></tr></thead>
              <tbody>{hlPositions.map((p,i) => {
                const pos=p.position, sz=parseFloat(pos.szi), isL=sz>0, pnl=parseFloat(pos.unrealizedPnl||0);
                return (
                  <tr key={i}>
                    <td style={{ fontWeight:700 }}>{pos.coin}-PERP</td>
                    <td><span className={`badge ${isL?'bl':'bs'}`}>{isL?'▲ LONG':'▼ SHORT'}</span></td>
                    <td>{Math.abs(sz).toFixed(4)}</td>
                    <td>${parseFloat(pos.entryPx||0).toFixed(2)}</td>
                    <td style={{ color:'var(--muted)' }}>${parseFloat(pos.liquidationPx||0).toFixed(2)}</td>
                    <td className={pnl>=0?'tpos':'tneg'}>{pnl>=0?'+':''}${pnl.toFixed(2)}</td>
                    <td><button className="btn btn-g bxs"
                      onClick={()=>closeHL(pos.coin,Math.abs(sz)).then(()=>toast('Closed '+pos.coin,'ok')).catch(e=>toast('Failed: '+e.message,'err'))}>
                      Close
                    </button></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
        }
      </div>
    </div>
  );
}
