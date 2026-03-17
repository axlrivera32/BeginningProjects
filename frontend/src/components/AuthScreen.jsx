import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  sendRecovery, resetPassword,
  generateRecoveryCode, verifyRecoveryCode, findUser,
} from "../services/auth";
import { isMetaMaskInstalled } from "../services/wallet";
import { toast } from "./Toast";

function MMIcon() {
  return (
    <svg width="20" height="18" viewBox="0 0 318.6 318.6" fill="none" aria-hidden>
      <path d="M274.1 35.5 174.2 109l18.5-43.7z" fill="#e2761b"/>
      <path d="M44.4 35.5 143.3 110l-18.6-44z"   fill="#e4761b"/>
      <path d="M238.3 206.8l-27.2 41.7 58.2 16 16.7-56.9z" fill="#e4761b"/>
      <path d="M32.8 207.6 49.3 264l58.2-16-27.2-41.7z"    fill="#e4761b"/>
      <path d="M103.6 138.2l-16.2 24.5 57.8 2.6-1.9-62.3z" fill="#e4761b"/>
      <path d="M214.9 138.2l-39.8-35.9-1.9 62.3 57.8-2.6z" fill="#e4761b"/>
      <path d="M107.5 248.5l34.8-16.9-30-23.4z"            fill="#e4761b"/>
      <path d="M176.3 231.6l34.8 16.9-4.8-40.4z"           fill="#e4761b"/>
    </svg>
  );
}

function calcStr(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
const SC = ["#f05c6e","#f05c6e","#fb923c","#f5c518","#22d3a6","#22d3a6"];
const SL = ["Too short","Weak","Fair","Good","Strong","Very strong"];
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

export default function AuthScreen() {
  const nav = useNavigate();
  const { login, register, loginWithWallet, loading } = useAuth();
  const [panel, setPanel] = useState("login");
  const [rvStep, setRvStep] = useState(1);
  const [rvEmail, setRvEmail] = useState("");

  // Login
  const [liEmail, setLiEmail] = useState("");
  const [liPass,  setLiPass]  = useState("");
  const [liShowP, setLiShowP] = useState(false);
  const [liErr,   setLiErr]   = useState({});

  // Register
  const [rgFn,  setRgFn]  = useState("");
  const [rgLn,  setRgLn]  = useState("");
  const [rgEm,  setRgEm]  = useState("");
  const [rgPw,  setRgPw]  = useState("");
  const [rgPw2, setRgPw2] = useState("");
  const [rgSP,  setRgSP]  = useState(false);
  const [rgSP2, setRgSP2] = useState(false);
  const [rgTos, setRgTos] = useState(false);
  const [rgRsk, setRgRsk] = useState(false);
  const [rgErr, setRgErr] = useState({});
  const [str,   setStr]   = useState(0);

  // Recovery
  const [rvEIn,  setRvEIn]  = useState("");
  const [rvCode, setRvCode] = useState("");
  const [rvNew,  setRvNew]  = useState("");
  const [rvNew2, setRvNew2] = useState("");
  const [rvSN,   setRvSN]   = useState(false);
  const [rvErr,  setRvErr]  = useState({});
  const [genOk,  setGenOk]  = useState("");

  function sw(p) { setPanel(p); setLiErr({}); setRgErr({}); setRvErr({}); setGenOk(""); }

  async function doLogin(e) {
    e?.preventDefault(); setLiErr({});
    const err = {};
    if (!isEmail(liEmail)) err.email = "Enter a valid email.";
    if (!liPass)            err.pass  = "Password is required.";
    if (Object.keys(err).length) { setLiErr(err); return; }
    try { await login({ email: liEmail, password: liPass }); nav("/"); }
    catch (ex) { setLiErr({ email: ex.message }); }
  }

  async function doRegister(e) {
    e?.preventDefault(); setRgErr({});
    const err = {};
    if (!rgFn.trim())        err.fn   = "First name required.";
    if (!rgLn.trim())        err.ln   = "Last name required.";
    if (!isEmail(rgEm))      err.em   = "Enter a valid email.";
    if (rgPw.length < 8)     err.pw   = "Min 8 characters.";
    if (rgPw !== rgPw2)      err.pw2  = "Passwords don't match.";
    if (!rgTos || !rgRsk)    err.tos  = "Accept all checkboxes.";
    if (Object.keys(err).length) { setRgErr(err); return; }
    try { await register({ firstName: rgFn, lastName: rgLn, email: rgEm, password: rgPw }); nav("/"); }
    catch (ex) { setRgErr({ em: ex.message }); }
  }

  async function doMetaMask() {
    if (!isMetaMaskInstalled()) {
      toast("MetaMask not found. Install the browser extension from metamask.io", "err");
      window.open("https://metamask.io/download/", "_blank");
      return;
    }
    try {
      const eth = window.ethereum.providers?.find?.((p) => p.isMetaMask) ?? window.ethereum;
      const accs = await eth.request({ method: "eth_requestAccounts" });
      if (!accs?.length) return;
      await loginWithWallet(accs[0]);
      nav("/");
    } catch (e) {
      if (e.code !== 4001) toast("MetaMask error: " + e.message, "err");
    }
  }

  async function doSendCode(e) {
    e?.preventDefault(); setRvErr({}); setGenOk("");
    if (!isEmail(rvEIn)) { setRvErr({ em: "Enter a valid email." }); return; }
    try {
      await sendRecovery(rvEIn);
      setRvEmail(rvEIn);
      setRvStep(2);
      setGenOk(`Code sent to ${rvEIn}. Check your inbox (or terminal console in dev mode).`);
    } catch (ex) {
      // If backend is offline, fall back to local dev code
      generateRecoveryCode(rvEIn);
      setRvEmail(rvEIn);
      setRvStep(2);
      setGenOk(`[Dev fallback] Code for ${rvEIn} printed in browser console (F12).`);
    }
  }

  function doVerify(e) {
    e?.preventDefault(); setRvErr({});
    if (!rvCode || rvCode.trim().length !== 6) { setRvErr({ code: "Enter the 6-digit code." }); return; }
    if (!verifyRecoveryCode(rvEmail, rvCode)) { setRvErr({ code: "Invalid or expired code." }); return; }
    setRvStep(3); setGenOk("");
  }

  async function doReset(e) {
    e?.preventDefault(); setRvErr({});
    if (rvNew.length < 8) { setRvErr({ pw: "Min 8 characters." }); return; }
    if (rvNew !== rvNew2) { setRvErr({ pw: "Passwords don't match." }); return; }
    try {
      // Try API first (verifies code server-side)
      if (rvCode) {
        await resetPassword(rvEmail, rvCode, rvNew);
      } else {
        // local fallback
        if (!verifyRecoveryCode(rvEmail, rvCode)) throw new Error("Invalid or expired code.");
        await resetPassword(rvEmail, rvCode, rvNew);
      }
      toast("Password reset! Please sign in.", "ok");
      setRvStep(1); sw("login");
    } catch (ex) { setRvErr({ pw: ex.message }); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-bg" />
      <div className="auth-box">
        <div className="auth-head">
          <div className="auth-icon">◈</div>
          <div>
            <div className="auth-brand">NexDeFi</div>
            <div className="auth-sub">Advanced DeFi Trading System</div>
          </div>
        </div>

        <div className="auth-tabs">
          {[["login","Sign In"],["register","Create Account"],["recover","Recover"]].map(([p,l]) => (
            <button key={p} className={`auth-tab${panel===p?" on":""}`} onClick={() => sw(p)}>{l}</button>
          ))}
        </div>

        {genOk && <div className="aok">{genOk}</div>}

        {/* ── LOGIN ── */}
        {panel === "login" && (
          <form onSubmit={doLogin} noValidate>
            <div className="atitle">Welcome back</div>
            <div className="adesc">Sign in to access your trading dashboard.</div>
            <div className="fg">
              <label>Email address</label>
              <input className={`inp${liErr.email?" err":""}`} type="email" placeholder="you@example.com"
                value={liEmail} onChange={(e) => setLiEmail(e.target.value)} autoComplete="email" />
              {liErr.email && <div className="ferr">{liErr.email}</div>}
            </div>
            <div className="fg">
              <label>Password</label>
              <div style={{ position:"relative" }}>
                <input className={`inp${liErr.pass?" err":""}`} type={liShowP?"text":"password"}
                  placeholder="••••••••" value={liPass} onChange={(e) => setLiPass(e.target.value)} autoComplete="current-password" />
                <button type="button" className="eye-btn" onClick={() => setLiShowP((s) => !s)}>{liShowP?"🙈":"👁"}</button>
              </div>
              {liErr.pass && <div className="ferr">{liErr.pass}</div>}
            </div>
            <div style={{ textAlign:"right", marginBottom:18 }}>
              <button type="button" className="lnk" onClick={() => sw("recover")}>Forgot password?</button>
            </div>
            <button type="submit" className="btn btn-p bfull" disabled={loading}>
              {loading ? <><span className="spin"/>Signing in…</> : "Sign In"}
            </button>
            <div className="divider">or continue with</div>
            <button type="button" className="btn-mm" onClick={doMetaMask}><MMIcon/>MetaMask</button>
            <p className="afooter">No account? <button type="button" className="lnk" onClick={() => sw("register")}>Create one →</button></p>
          </form>
        )}

        {/* ── REGISTER ── */}
        {panel === "register" && (
          <form onSubmit={doRegister} noValidate>
            <div className="atitle">Create account</div>
            <div className="adesc">Trade Hyperliquid perps, monitor Uniswap V3 pools, and automate strategies.</div>
            <div className="g2" style={{ gap:12, marginBottom:14 }}>
              <div>
                <label>First name</label>
                <input className={`inp${rgErr.fn?" err":""}`} type="text" placeholder="Alex" value={rgFn} onChange={(e) => setRgFn(e.target.value)} autoComplete="given-name"/>
                {rgErr.fn && <div className="ferr">{rgErr.fn}</div>}
              </div>
              <div>
                <label>Last name</label>
                <input className={`inp${rgErr.ln?" err":""}`} type="text" placeholder="Smith" value={rgLn} onChange={(e) => setRgLn(e.target.value)} autoComplete="family-name"/>
                {rgErr.ln && <div className="ferr">{rgErr.ln}</div>}
              </div>
            </div>
            <div className="fg">
              <label>Email</label>
              <input className={`inp${rgErr.em?" err":""}`} type="email" placeholder="you@example.com" value={rgEm} onChange={(e) => setRgEm(e.target.value)} autoComplete="email"/>
              {rgErr.em && <div className="ferr">{rgErr.em}</div>}
            </div>
            <div className="fg">
              <label>Password</label>
              <div style={{ position:"relative" }}>
                <input className={`inp${rgErr.pw?" err":""}`} type={rgSP?"text":"password"} placeholder="Min. 8 characters"
                  value={rgPw} onChange={(e) => { setRgPw(e.target.value); setStr(calcStr(e.target.value)); }} autoComplete="new-password"/>
                <button type="button" className="eye-btn" onClick={() => setRgSP((s) => !s)}>{rgSP?"🙈":"👁"}</button>
              </div>
              <div className="str-bar"><div className="str-fill" style={{ width:`${str*20}%`, background:SC[str] }}/></div>
              <div className="str-lbl">{SL[str]}</div>
              {rgErr.pw && <div className="ferr">{rgErr.pw}</div>}
            </div>
            <div className="fg">
              <label>Confirm password</label>
              <div style={{ position:"relative" }}>
                <input className={`inp${rgErr.pw2?" err":""}`} type={rgSP2?"text":"password"} placeholder="Repeat" value={rgPw2} onChange={(e) => setRgPw2(e.target.value)} autoComplete="new-password"/>
                <button type="button" className="eye-btn" onClick={() => setRgSP2((s) => !s)}>{rgSP2?"🙈":"👁"}</button>
              </div>
              {rgErr.pw2 && <div className="ferr">{rgErr.pw2}</div>}
            </div>
            <div className="chk"><input type="checkbox" checked={rgTos} onChange={(e) => setRgTos(e.target.checked)}/><label>I accept the <button type="button" className="lnk" style={{ fontSize:"inherit" }}>Terms of Service</button> and <button type="button" className="lnk" style={{ fontSize:"inherit" }}>Privacy Policy</button></label></div>
            <div className="chk"><input type="checkbox" checked={rgRsk} onChange={(e) => setRgRsk(e.target.checked)}/><label>⚠ I understand DeFi trading involves substantial risk of financial loss.</label></div>
            {rgErr.tos && <div className="ferr" style={{ marginBottom:10 }}>{rgErr.tos}</div>}
            <button type="submit" className="btn btn-p bfull" disabled={loading}>
              {loading ? <><span className="spin"/>Creating…</> : "Create Account"}
            </button>
            <div className="divider">or</div>
            <button type="button" className="btn-mm" onClick={doMetaMask}><MMIcon/>Register with MetaMask</button>
            <p className="afooter">Have an account? <button type="button" className="lnk" onClick={() => sw("login")}>Sign in →</button></p>
          </form>
        )}

        {/* ── RECOVER ── */}
        {panel === "recover" && (
          <div>
            {rvStep === 1 && (
              <form onSubmit={doSendCode} noValidate>
                <div className="atitle">Reset password</div>
                <div className="adesc">Enter your email to receive a 6-digit verification code.</div>
                <div className="fg">
                  <label>Email address</label>
                  <input className={`inp${rvErr.em?" err":""}`} type="email" placeholder="you@example.com" value={rvEIn} onChange={(e) => setRvEIn(e.target.value)}/>
                  {rvErr.em && <div className="ferr">{rvErr.em}</div>}
                </div>
                <button type="submit" className="btn btn-p bfull">Send Reset Code</button>
              </form>
            )}
            {rvStep === 2 && (
              <form onSubmit={doVerify} noValidate>
                <div className="atitle">Enter code</div>
                <div className="adesc">6-digit code sent to <strong>{rvEmail}</strong>. Check browser console (F12) in dev mode.</div>
                <div className="fg">
                  <label>Verification code</label>
                  <input className={`inp${rvErr.code?" err":""}`} type="text" placeholder="000000" maxLength={6}
                    value={rvCode} onChange={(e) => setRvCode(e.target.value)}
                    style={{ textAlign:"center", letterSpacing:8, fontSize:24, fontFamily:"'Space Mono',monospace" }}/>
                  {rvErr.code && <div className="ferr">{rvErr.code}</div>}
                </div>
                <button type="submit" className="btn btn-p bfull" style={{ marginBottom:8 }}>Verify Code</button>
                <button type="button" className="btn btn-g bfull" onClick={doSendCode}>Resend code</button>
              </form>
            )}
            {rvStep === 3 && (
              <form onSubmit={doReset} noValidate>
                <div className="atitle">New password</div>
                <div className="adesc">Choose a strong password.</div>
                <div className="fg">
                  <label>New password</label>
                  <div style={{ position:"relative" }}>
                    <input className={`inp${rvErr.pw?" err":""}`} type={rvSN?"text":"password"} placeholder="Min. 8 characters" value={rvNew} onChange={(e) => setRvNew(e.target.value)}/>
                    <button type="button" className="eye-btn" onClick={() => setRvSN((s) => !s)}>{rvSN?"🙈":"👁"}</button>
                  </div>
                </div>
                <div className="fg">
                  <label>Confirm</label>
                  <input className="inp" type="password" placeholder="Repeat" value={rvNew2} onChange={(e) => setRvNew2(e.target.value)}/>
                  {rvErr.pw && <div className="ferr">{rvErr.pw}</div>}
                </div>
                <button type="submit" className="btn btn-p bfull">Set New Password</button>
              </form>
            )}
            <p className="afooter" style={{ marginTop:14 }}>
              <button type="button" className="lnk" onClick={() => { sw("login"); setRvStep(1); }}>← Back to sign in</button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
