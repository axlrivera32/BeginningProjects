import { useWallet } from "../hooks/useWallet";
import { useAuth } from "../hooks/useAuth";
import { CHAINS, WALLET_OPTIONS } from "../services/wallet";
import { toast } from "./Toast";

const WALLET_ICONS = {
  metamask:  require => "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 318.6 318.6'%3E%3Cpath d='M274.1 35.5l-99.9 74.5 18.5-43.7z' fill='%23e2761b'/%3E%3Cpath d='M44.4 35.5l99 74.9-17.5-44.4z' fill='%23e4761b'/%3E%3Cpath d='M238.3 206.8l-27.2 41.7 58.2 16 16.7-56.9z' fill='%23e4761b'/%3E%3Cpath d='M32.8 207.6l16.5 56.4 58.2-16-27.2-41.7z' fill='%23e4761b'/%3E%3C/svg%3E",
  coinbase:  null,
  injected:  null,
  wc:        null,
};

export default function WalletModal() {
  const { wallet, showModal, closeModal, connect, disconnect, switchChain, connecting } = useWallet();
  const { loginWithWallet } = useAuth();

  if (!showModal) return null;

  async function handleConnect(walletId) {
    try {
      const w = await connect(walletId);
      if (w?.address) {
        // Register / log in the wallet address with the backend
        try {
          await loginWithWallet(w.address, `${w.address.slice(0,6)}…${w.address.slice(-4)}`);
        } catch (e) {
          console.warn("Wallet backend login failed:", e.message);
        }
      }
      toast("Wallet connected ✓", "ok");
    } catch (e) {
      if (!e.message.includes("4001") && !e.message.includes("rejected"))
        toast(e.message, "err");
    }
  }

  const chain = wallet ? (CHAINS[wallet.chainId] || { name:"Unknown", sym:"?", color:"#888" }) : null;

  return (
    <>
      {/* Backdrop */}
      <div className="wm-backdrop" onClick={closeModal} />

      <div className="wm-modal" role="dialog" aria-modal="true" aria-label="Connect wallet">
        <div className="wm-header">
          <div className="wm-title">{wallet ? "Wallet Connected" : "Connect Wallet"}</div>
          <button className="wm-close" onClick={closeModal} aria-label="Close">✕</button>
        </div>

        {/* ── CONNECTED STATE ── */}
        {wallet ? (
          <div className="wm-body">
            <div className="wm-connected-badge">
              <div className="wm-conn-dot" style={{ background: chain?.color || "var(--green)" }} />
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700 }}>
                {wallet.address.slice(0,6)}…{wallet.address.slice(-4)}
              </span>
            </div>

            <div className="wm-balance-card">
              <div style={{ fontSize:10, color:"var(--muted)", textTransform:"uppercase", letterSpacing:.8, marginBottom:4 }}>Balance</div>
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:26, fontWeight:700 }}>
                {wallet.balance.toFixed(5)}
              </div>
              <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>{chain?.sym} on {chain?.name}</div>
            </div>

            <div className="wm-section-title">Switch Network</div>
            <div className="wm-networks">
              {Object.entries(CHAINS).map(([id, c]) => (
                <button
                  key={id}
                  className={`wm-net${wallet.chainId === Number(id) ? " active" : ""}`}
                  onClick={async () => {
                    try { await switchChain(Number(id)); toast("Network switched","ok"); }
                    catch (e) { if (!e.message.includes("4001")) toast(e.message, "err"); }
                  }}
                >
                  <span className="wm-net-dot" style={{ background: c.color }} />
                  <span className="wm-net-name">{c.name}</span>
                  <span className="wm-net-sym">{c.sym}</span>
                  {wallet.chainId === Number(id) && <span className="wm-net-check">✓</span>}
                </button>
              ))}
            </div>

            <div className="wm-actions">
              <a
                href={`${chain?.exp}/address/${wallet.address}`}
                target="_blank" rel="noopener noreferrer"
                className="btn btn-g bsm"
                style={{ flex:1, justifyContent:"center" }}
              >
                View on Explorer ↗
              </a>
              <button
                className="btn btn-g bsm"
                style={{ flex:1, justifyContent:"center", color:"var(--red)" }}
                onClick={() => { disconnect(); closeModal(); toast("Wallet disconnected","info"); }}
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          /* ── CONNECT STATE ── */
          <div className="wm-body">
            <p className="wm-desc">
              Connect your crypto wallet to access DeFi trading, monitor Uniswap V3 positions, and sign transactions.
            </p>

            <div className="wm-wallet-list">
              {WALLET_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  className="wm-wallet-btn"
                  onClick={() => handleConnect(opt.id)}
                  disabled={connecting}
                >
                  <span className="wm-wallet-icon">{opt.icon}</span>
                  <div className="wm-wallet-info">
                    <div className="wm-wallet-name">{opt.name}</div>
                    <div className="wm-wallet-hint">
                      {opt.id === "metamask"  && "Browser extension"}
                      {opt.id === "coinbase"  && "Coinbase Wallet extension or app"}
                      {opt.id === "injected"  && "Any EIP-1193 browser wallet"}
                      {opt.id === "wc"        && "Mobile wallet via QR code"}
                    </div>
                  </div>
                  <span className="wm-wallet-arrow">›</span>
                </button>
              ))}
            </div>

            <div className="wm-footer-note">
              By connecting, you agree to NexDeFi's Terms of Service. Your keys are never stored on our servers.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
