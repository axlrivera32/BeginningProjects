import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useWallet } from "../hooks/useWallet";
import { useExchange } from "../hooks/useExchange";
import { CHAINS } from "../services/wallet";
import { getHLAddr } from "../services/keystore";
import { toast } from "./Toast";

export default function Settings() {
  const { session, updateProfile, changePassword } = useAuth();
  const { wallet, openModal, disconnect, switchChain } = useWallet();
  const { hlOk, bxOk, hlAccount, bxAccount, saveHL, clearHL, saveBX, clearBX } = useExchange();

  const [hlAddr,  setHlAddr]  = useState(getHLAddr);
  const [hlPK,    setHlPK]    = useState("");
  const [hlSPK,   setHlSPK]   = useState(false);
  const [hlBusy,  setHlBusy]  = useState(false);
  const [hlRes,   setHlRes]   = useState(null);
  const [hlErr,   setHlErr]   = useState({});

  const [bxKey,   setBxKey]   = useState("");
  const [bxSec,   setBxSec]   = useState("");
  const [bxSSec,  setBxSSec]  = useState(false);
  const [bxBusy,  setBxBusy]  = useState(false);
  const [bxRes,   setBxRes]   = useState(null);

  const [name,    setName]    = useState(session?.name||"");
  const [oldPw,   setOldPw]   = useState("");
  const [newPw,   setNewPw]   = useState("");
  const [sOld,    setSOld]    = useState(false);
  const [sNew,    setSNew]    = useState(false);
  const [pwErr,   setPwErr]   = useState("");

  async function doSaveHL() {
    const e = {};
    if (!hlAddr||!hlAddr.startsWith("0x")||hlAddr.length!==42) e.addr="Invalid address (0x + 40 hex chars).";
    if (!hlPK||!hlPK.startsWith("0x")||hlPK.length!==66) e.pk="Invalid key (0x + 64 hex chars).";
    setHlErr(e); if (Object.keys(e).length) return;
    setHlBusy(true); setHlRes(null);
    try {
      const acc = await saveHL(hlAddr, hlPK, session.token);
      setHlRes({ ok:true, msg:`✓ Connected — Value: $${acc.accountValue.toFixed(2)} · Positions: ${acc.positions.length}` });
      setHlPK(""); toast("✓ Hyperliquid connected","ok");
    } catch(ex) {
      setHlRes({ ok:false, msg:"✕ "+ex.message }); toast("HL error: "+ex.message,"err");
    } finally { setHlBusy(false); }
  }

  async function doSaveBX() {
    if (!bxKey||!bxSec) { toast("Fill in both API Key and Secret.","err"); return; }
    setBxBusy(true); setBxRes(null);
    try {
      const acc = await saveBX(bxKey, bxSec, session.token);
      setBxRes({ ok:true, msg:`✓ Connected — Balance: $${parseFloat(acc.balance).toFixed(2)} · Available: $${parseFloat(acc.available).toFixed(2)}` });
      setBxSec(""); toast("✓ BingX connected","ok");
    } catch(ex) {
      setBxRes({ ok:false, msg:"✕ "+ex.message }); toast("BX error: "+ex.message,"err");
    } finally { setBxBusy(false); }
  }

  async function doSaveProfile() {
    if (!name.trim()) { toast("Name is required.","err"); return; }
    try { await updateProfile({ name:name.trim() }); toast("✓ Profile saved.","ok"); }
    catch(e) { toast("Error: "+e.message,"err"); }
  }

  async function doChangePw() {
    setPwErr("");
    if (!oldPw||!newPw) { setPwErr("Fill in both fields."); return; }
    if (newPw.length<8) { setPwErr("Min 8 characters."); return; }
    try { await changePassword(oldPw, newPw); setOldPw(""); setNewPw(""); toast("✓ Password updated.","ok"); }
    catch(e) { setPwErr(e.message); }
  }

  const chain = wallet ? (CHAINS[wallet.chainId]||{ name:"Unknown", sym:"?", color:"#888" }) : null;

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:21, fontWeight:800, letterSpacing:"-.5px" }}>Settings</h1>
        <p style={{ color:"var(--sub)", fontSize:12, marginTop:3 }}>API keys, wallet connections and account preferences</p>
      </div>

      <div className="sgrid">
        {/* ── Hyperliquid ── */}
        <div className="card">
          <div className="row" style={{ justifyContent:"space-between", marginBottom:8 }}>
            <div className="ctitle" style={{ marginBottom:0 }}>Hyperliquid API</div>
            <span className={`spill ${hlOk?"sok":"soff"}`}>{hlOk?"⬤ Connected":"○ Not configured"}</span>
          </div>
          <p style={{ fontSize:12, color:"var(--sub)", marginBottom:14, lineHeight:1.65 }}>Connect to place real Hyperliquid perpetual orders. Keys stored AES-256-GCM encrypted in browser only — never transmitted.</p>
          <div className="fg"><label>Wallet Address</label><input className={`inp${hlErr.addr?" err":""}`} placeholder="0x…" value={hlAddr} onChange={(e)=>setHlAddr(e.target.value)} style={{ fontSize:12 }}/>{hlErr.addr&&<div className="ferr">{hlErr.addr}</div>}</div>
          <div className="fg">
            <label>Private Key <span style={{ color:"var(--red)", fontSize:9, fontWeight:600 }}>⚠ NEVER SHARE</span></label>
            <div style={{ position:"relative" }}>
              <input className={`inp${hlErr.pk?" err":""}`} type={hlSPK?"text":"password"} placeholder="0x… (encrypted locally)" value={hlPK} onChange={(e)=>setHlPK(e.target.value)} style={{ fontSize:12 }} autoComplete="off"/>
              <button type="button" className="eye-btn" onClick={()=>setHlSPK((s)=>!s)}>{hlSPK?"🙈":"👁"}</button>
            </div>
            {hlErr.pk&&<div className="ferr">{hlErr.pk}</div>}
          </div>
          <div className="wbox">⚠ Use a dedicated wallet with limited funds. Keys are encrypted with AES-256-GCM using your session token and stored only in localStorage.</div>
          <div className="row" style={{ gap:8, marginBottom:12 }}>
            <button className="btn btn-p" style={{ flex:1, justifyContent:"center" }} onClick={doSaveHL} disabled={hlBusy}>{hlBusy?<><span className="spin"/>Testing…</>:"Save & Test"}</button>
            <button className="btn btn-g bsm" onClick={()=>{ clearHL(); setHlAddr(""); setHlPK(""); setHlRes(null); toast("HL keys cleared.","info"); }}>Clear</button>
          </div>
          {hlRes && <div className={hlRes.ok?"ibox":"wbox"} style={{ marginBottom:0 }}>{hlRes.msg}</div>}
        </div>

        {/* ── BingX ── */}
        <div className="card">
          <div className="row" style={{ justifyContent:"space-between", marginBottom:8 }}>
            <div className="ctitle" style={{ marginBottom:0 }}>BingX API</div>
            <span className={`spill ${bxOk?"sok":"soff"}`}>{bxOk?"⬤ Connected":"○ Not configured"}</span>
          </div>
          <p style={{ fontSize:12, color:"var(--sub)", marginBottom:14, lineHeight:1.65 }}>Connect BingX for perpetual contracts. Requests signed with HMAC-SHA256 in browser. Enable <strong>Futures Trading</strong> only — never withdrawals.</p>
          <div className="fg"><label>API Key</label><input className="inp" placeholder="xxxxxxxx-xxxx-xxxx-xxxx" value={bxKey} onChange={(e)=>setBxKey(e.target.value)} style={{ fontSize:12 }} autoComplete="off"/></div>
          <div className="fg">
            <label>API Secret <span style={{ color:"var(--red)", fontSize:9 }}>⚠ NEVER SHARE</span></label>
            <div style={{ position:"relative" }}>
              <input className="inp" type={bxSSec?"text":"password"} placeholder="Your BingX secret" value={bxSec} onChange={(e)=>setBxSec(e.target.value)} style={{ fontSize:12 }} autoComplete="off"/>
              <button type="button" className="eye-btn" onClick={()=>setBxSSec((s)=>!s)}>{bxSSec?"🙈":"👁"}</button>
            </div>
          </div>
          <div className="ibox">ℹ Keys are AES-256-GCM encrypted using your session token before being stored in localStorage.</div>
          <div className="row" style={{ gap:8, marginBottom:12 }}>
            <button className="btn btn-p" style={{ flex:1, justifyContent:"center" }} onClick={doSaveBX} disabled={bxBusy}>{bxBusy?<><span className="spin"/>Testing…</>:"Save & Test"}</button>
            <button className="btn btn-g bsm" onClick={()=>{ clearBX(); setBxKey(""); setBxSec(""); setBxRes(null); toast("BX keys cleared.","info"); }}>Clear</button>
          </div>
          {bxRes && <div className={bxRes.ok?"ibox":"wbox"} style={{ marginBottom:0 }}>{bxRes.msg}</div>}
        </div>

        {/* ── MetaMask ── */}
        <div className="card">
          <div className="row" style={{ justifyContent:"space-between", marginBottom:8 }}>
            <div className="ctitle" style={{ marginBottom:0 }}>Wallet Connection</div>
            <span className={`spill ${wallet?"sok":"soff"}`}>{wallet?"⬤ Connected":"○ Disconnected"}</span>
          </div>
          <p style={{ fontSize:12, color:"var(--sub)", marginBottom:14, lineHeight:1.65 }}>Connect MetaMask to read balances, view Uniswap V3 positions and interact with DeFi protocols.</p>
          <button className="btn-mm" style={{ marginBottom:12 }} onClick={openModal}>
            <svg width="19" height="17" viewBox="0 0 318.6 318.6" fill="none"><path d="M274.1 35.5 174.2 109l18.5-43.7z" fill="#e2761b"/><path d="M44.4 35.5 143.3 110l-18.6-44z" fill="#e4761b"/><path d="M238.3 206.8l-27.2 41.7 58.2 16 16.7-56.9z" fill="#e4761b"/><path d="M32.8 207.6 49.3 264l58.2-16-27.2-41.7z" fill="#e4761b"/><path d="M103.6 138.2l-16.2 24.5 57.8 2.6-1.9-62.3z" fill="#e4761b"/><path d="M214.9 138.2l-39.8-35.9-1.9 62.3 57.8-2.6z" fill="#e4761b"/><path d="M107.5 248.5l34.8-16.9-30-23.4z" fill="#e4761b"/><path d="M176.3 231.6l34.8 16.9-4.8-40.4z" fill="#e4761b"/></svg>
            {wallet?"Switch / Reconnect":"Connect MetaMask"}
          </button>
          {wallet && (
            <div style={{ padding:12, background:"var(--elev)", borderRadius:"var(--rm)", border:"1px solid var(--bdr)", marginBottom:12, fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>
              <div style={{ color:"var(--cyan)", marginBottom:3 }}>{wallet.address}</div>
              <div>{wallet.balance.toFixed(6)} {chain?.sym}</div>
              <div style={{ color:"var(--muted)", marginTop:3 }}>{chain?.name} (Chain {wallet.chainId})</div>
            </div>
          )}
          <div className="ctitle" style={{ marginBottom:8 }}>Switch Network</div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {Object.entries(CHAINS).map(([id,c]) => (
              <button key={id} className={`net-btn${wallet?.chainId===Number(id)?" active":""}`}
                onClick={async()=>{ try { await switchChain(Number(id)); } catch(e){ if(e.code!==4001) toast("Network error: "+e.message,"err"); }}}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:c.color, display:"inline-block", flexShrink:0 }}/>
                <span style={{ flex:1 }}>{c.name}</span>
                <span style={{ fontSize:10, color:"var(--muted)" }}>{c.sym}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Account ── */}
        <div className="card">
          <div className="ctitle">Account & Security</div>
          <div className="fg"><label>Display Name</label><input className="inp" value={name} onChange={(e)=>setName(e.target.value)}/></div>
          <div className="fg"><label>Email</label><input className="inp" type="email" value={session?.email||""} readOnly style={{ color:"var(--muted)" }}/></div>
          <div style={{ fontSize:11, color:"var(--muted)", marginBottom:12, fontFamily:"'JetBrains Mono',monospace" }}>Last login: {session?.loginAt?new Date(session.loginAt).toLocaleString():"—"}</div>
          <button className="btn btn-p bsm" style={{ marginBottom:16 }} onClick={doSaveProfile}>Save Profile</button>
          <div style={{ borderTop:"1px solid var(--bdr)", paddingTop:16 }}>
            <div className="ctitle" style={{ marginBottom:12 }}>Change Password</div>
            <div className="fg">
              <label>Current password</label>
              <div style={{ position:"relative" }}><input className="inp" type={sOld?"text":"password"} placeholder="••••••••" value={oldPw} onChange={(e)=>setOldPw(e.target.value)}/><button type="button" className="eye-btn" onClick={()=>setSOld((s)=>!s)}>{sOld?"🙈":"👁"}</button></div>
            </div>
            <div className="fg">
              <label>New password</label>
              <div style={{ position:"relative" }}><input className="inp" type={sNew?"text":"password"} placeholder="Min. 8 characters" value={newPw} onChange={(e)=>setNewPw(e.target.value)}/><button type="button" className="eye-btn" onClick={()=>setSNew((s)=>!s)}>{sNew?"🙈":"👁"}</button></div>
              {pwErr && <div className="ferr">{pwErr}</div>}
            </div>
            <button className="btn btn-g bsm" onClick={doChangePw}>Update Password</button>
          </div>
        </div>
      </div>
    </div>
  );
}
