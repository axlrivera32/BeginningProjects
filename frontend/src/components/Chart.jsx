
// Shared candlestick + line chart renderer
export function drawCandles(canvas, candles, tf) {
  if (!canvas || !candles || candles.length < 2) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.clientWidth || 400, H = canvas.clientHeight || 180, DPR = devicePixelRatio || 1;
  canvas.width = W * DPR; canvas.height = H * DPR; ctx.scale(DPR, DPR);
  ctx.clearRect(0, 0, W, H);
  const pad = { top: 14, right: 12, bottom: 28, left: 62 };
  const PW = W - pad.left - pad.right, PH = H - pad.top - pad.bottom;
  const highs = candles.map(c => c.h), lows = candles.map(c => c.l);
  const mx = Math.max(...highs), mn = Math.min(...lows), rng = mx - mn || 1;

  // Grid + Y labels
  ctx.strokeStyle = 'rgba(99,179,237,.06)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (PH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const v = mx - (rng / 4) * i;
    ctx.fillStyle = 'rgba(107,127,160,.7)';
    ctx.font = "10px 'JetBrains Mono'"; ctx.textAlign = 'right';
    ctx.fillText(v >= 1000 ? '$' + Math.round(v).toLocaleString() : '$' + v.toFixed(v >= 1 ? 2 : 4), pad.left - 4, y + 4);
  }

  // X-axis time labels
  const TF_MINS = { '1m':1,'3m':3,'5m':5,'15m':15,'30m':30,'1h':60,'2h':120,'4h':240,'1d':1440,'2d':2880,'1w':10080,'1mo':43200 };
  const mins = TF_MINS[tf] || 60;
  ctx.fillStyle = 'rgba(107,127,160,.6)'; ctx.font = "9px 'JetBrains Mono'"; ctx.textAlign = 'center';
  const step = Math.ceil(candles.length / 7);
  candles.forEach((c, i) => {
    if (i % step === 0) {
      const x = pad.left + (i / (candles.length - 1)) * PW;
      const d = new Date(c.t);
      const lbl = mins < 1440
        ? d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0')
        : mins < 10080 ? (d.getMonth()+1) + '/' + d.getDate()
        : (d.getMonth()+1) + '/' + d.getFullYear().toString().slice(-2);
      ctx.fillText(lbl, x, H - 8);
    }
  });

  // Candles
  const cw = Math.max(1.5, (PW / candles.length) * 0.75);
  candles.forEach((c, i) => {
    const x = pad.left + (i / (candles.length - 1)) * PW;
    const bull = c.c >= c.o;
    const col  = bull ? '#20d0a0' : '#f0506a';
    const yH = pad.top + ((mx - c.h) / rng) * PH;
    const yL = pad.top + ((mx - c.l) / rng) * PH;
    const yO = pad.top + ((mx - c.o) / rng) * PH;
    const yC = pad.top + ((mx - c.c) / rng) * PH;
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();
    const bodyTop = Math.min(yO, yC), bodyH = Math.max(1, Math.abs(yC - yO));
    ctx.fillStyle = col;
    ctx.fillRect(x - cw / 2, bodyTop, cw, bodyH);
  });
}

export function drawLine(canvas, data, color) {
  if (!canvas || !data || data.length < 2) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.clientWidth || 400, H = canvas.clientHeight || 180, DPR = devicePixelRatio || 1;
  canvas.width = W * DPR; canvas.height = H * DPR; ctx.scale(DPR, DPR);
  ctx.clearRect(0, 0, W, H);
  const pad = { top: 14, right: 12, bottom: 22, left: 62 };
  const PW = W - pad.left - pad.right, PH = H - pad.top - pad.bottom;
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
  ctx.strokeStyle = 'rgba(99,179,237,.06)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (PH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const v = mx - (rng / 4) * i;
    ctx.fillStyle = 'rgba(107,127,160,.7)';
    ctx.font = "10px 'JetBrains Mono'"; ctx.textAlign = 'right';
    ctx.fillText(v >= 1000 ? '$' + Math.round(v).toLocaleString() : '$' + v.toFixed(v >= 1 ? 2 : 4), pad.left - 4, y + 4);
  }
  const pts = data.map((v, i) => ({ x: pad.left + (i / (data.length - 1)) * PW, y: pad.top + ((mx - v) / rng) * PH }));
  const g = ctx.createLinearGradient(0, pad.top, 0, H);
  g.addColorStop(0, color + '44'); g.addColorStop(1, color + '00');
  ctx.beginPath(); ctx.moveTo(pts[0].x, H - pad.bottom); pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.lineTo(pts[pts.length-1].x, H - pad.bottom); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  const last = pts[pts.length - 1];
  ctx.beginPath(); ctx.arc(last.x, last.y, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.beginPath(); ctx.arc(last.x, last.y, 7, 0, Math.PI * 2); ctx.strokeStyle = color + '55'; ctx.lineWidth = 3; ctx.stroke();
}

// TF Selector component
import { TF_LIST, TF_LABEL } from '../hooks/usePrices';

export function TFSelector({ active, onChange }) {
  return (
    <div className="tf-bar">
      {TF_LIST.map(tf => (
        <button key={tf} className={`tf-btn${active === tf ? ' on' : ''}`} onClick={() => onChange(tf)}>
          {TF_LABEL[tf]}
        </button>
      ))}
    </div>
  );
}

// Market type toggle
export function MarketTypeToggle({ value, onChange, note }) {
  return (
    <div className="fg">
      <div className="lbl">Market Type</div>
      <div className="mtype-row">
        <button className={`mtype-btn${value === 'futures' ? ' on' : ''}`} onClick={() => onChange('futures')}>📈 Perpetual Futures</button>
        <button className={`mtype-btn${value === 'spot' ? ' on' : ''}`} onClick={() => onChange('spot')}>🪙 Spot</button>
      </div>
      {note && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>{note}</div>}
    </div>
  );
}

// Amount risk input
export function AmountInput({ label, id, placeholder, hint, accentColor }) {
  return (
    <div className="fg">
      <div className="lbl" style={accentColor ? { color: accentColor } : {}}>{label}</div>
      <div className="amt-row">
        <input className="inp" type="number" id={id} placeholder={placeholder || 'e.g. 500'} min="1" step="1" style={{ fontSize: 12 }} />
        <select style={{ fontSize: 11, padding: '9px 6px 9px 8px' }} id={id + '_mode'}>
          <option value="usd">USD $</option>
          <option value="pct">% bal</option>
        </select>
      </div>
      {hint && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
