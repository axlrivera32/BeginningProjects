
import { useState, useEffect, useCallback } from 'react';

let _push = null;
export const toast = (msg, type = 'ok', ms = 4800) =>
  _push?.({ msg, type, ms, id: Date.now() + Math.random() });

export default function Toast() {
  const [list, setList] = useState([]);
  const push = useCallback((t) => {
    setList(p => [...p, t]);
    setTimeout(() => setList(p => p.filter(x => x.id !== t.id)), t.ms);
  }, []);
  useEffect(() => {
    _push = push;
    window.__toast = (msg, type) => push({ msg, type, ms: 4800, id: Date.now() + Math.random() });
    return () => { _push = null; };
  }, [push]);
  const icons = { ok: '✓', err: '✕', warn: '⚠', info: 'ℹ' };
  return (
    <div id="toast-wrap">
      {list.map(t => (
        <div key={t.id} className={`toast t-${t.type} show`} role="alert">
          <span>{icons[t.type]||'ℹ'}</span>
          <span style={{ flex: 1, lineHeight: 1.4 }}>{t.msg}</span>
          <button style={{ background:'none',border:'none',color:'inherit',cursor:'pointer',fontSize:16,opacity:.6 }}
            onClick={() => setList(p => p.filter(x => x.id !== t.id))}>×</button>
        </div>
      ))}
    </div>
  );
}
