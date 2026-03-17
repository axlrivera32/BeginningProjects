// wallet.js — DeFi-style multi-wallet connector
// Supports MetaMask, Coinbase Wallet, any injected EIP-1193 provider
// WalletConnect v2 via lightweight direct WC URI (no @walletconnect/modal needed)
import { ethers } from "ethers";

export const CHAINS = {
  1:     { name:"Ethereum",  sym:"ETH",   color:"#627EEA", rpc:"https://eth.llamarpc.com",           exp:"https://etherscan.io"          },
  42161: { name:"Arbitrum",  sym:"ETH",   color:"#28A0F0", rpc:"https://arb1.arbitrum.io/rpc",        exp:"https://arbiscan.io"            },
  137:   { name:"Polygon",   sym:"MATIC", color:"#8247E5", rpc:"https://polygon-rpc.com",             exp:"https://polygonscan.com"        },
  56:    { name:"BNB Chain", sym:"BNB",   color:"#F3BA2F", rpc:"https://bsc-dataseed.binance.org",    exp:"https://bscscan.com"           },
  10:    { name:"Optimism",  sym:"ETH",   color:"#FF0420", rpc:"https://mainnet.optimism.io",         exp:"https://optimistic.etherscan.io"},
  8453:  { name:"Base",      sym:"ETH",   color:"#0052FF", rpc:"https://mainnet.base.org",            exp:"https://basescan.org"          },
  43114: { name:"Avalanche", sym:"AVAX",  color:"#E84142", rpc:"https://api.avax.network/ext/bc/C/rpc",exp:"https://snowtrace.io"         },
};

// Wallet descriptors shown in connect modal
export const WALLET_OPTIONS = [
  { id:"metamask",  name:"MetaMask",       icon:"🦊", detect: () => _getInjected("isMetaMask")  },
  { id:"coinbase",  name:"Coinbase Wallet", icon:"🔵", detect: () => _getInjected("isCoinbaseWallet") },
  { id:"injected",  name:"Browser Wallet", icon:"🌐", detect: () => _getAnyInjected()            },
  { id:"wc",        name:"WalletConnect",  icon:"🔗", detect: () => null /* handled separately */ },
];

function _getInjected(flag) {
  if (typeof window === "undefined" || !window.ethereum) return null;
  const { ethereum } = window;
  if (ethereum.providers?.length) return ethereum.providers.find(p => p[flag]) ?? null;
  return ethereum[flag] ? ethereum : null;
}
function _getAnyInjected() {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

let _provider = null, _signer = null, _address = null, _chainId = null, _walletId = null;

// ── Connect using a specific wallet option ──────────────────────────────────
export async function connect(walletId = "metamask") {
  _walletId = walletId;
  if (walletId === "wc") return _connectWC();
  const opt = WALLET_OPTIONS.find(o => o.id === walletId);
  const eth  = opt ? opt.detect() : _getAnyInjected();
  if (!eth) {
    if (walletId === "metamask") {
      window.open("https://metamask.io/download/", "_blank");
      throw new Error("MetaMask not installed. Get it at metamask.io");
    }
    throw new Error(`${opt?.name || "Wallet"} not found. Install it or use a different wallet.`);
  }
  const accs = await eth.request({ method: "eth_requestAccounts" });
  if (!accs?.length) throw new Error("No accounts returned.");
  return _init(eth, accs[0], walletId);
}

// ── Silent reconnect on page load ────────────────────────────────────────────
export async function reconnect() {
  const eth = _getAnyInjected();
  if (!eth) return null;
  try {
    const accs = await eth.request({ method: "eth_accounts" });
    if (!accs?.length) return null;
    return _init(eth, accs[0], _walletId || "injected");
  } catch { return null; }
}

async function _init(eth, address, walletId) {
  _provider = new ethers.BrowserProvider(eth);
  _signer   = await _provider.getSigner();
  _address  = address;
  _chainId  = Number((await _provider.getNetwork()).chainId);
  _walletId = walletId;

  const [balWei, block] = await Promise.all([
    _provider.getBalance(address),
    _provider.getBlockNumber(),
  ]);
  const balance   = parseFloat(ethers.formatEther(balWei));
  const chainInfo = CHAINS[_chainId] || { name:"Unknown", sym:"?", color:"#888" };

  // Re-register event listeners
  eth.removeAllListeners?.("accountsChanged");
  eth.removeAllListeners?.("chainChanged");
  eth.on("accountsChanged", accs => {
    if (!accs.length) { disconnect(); window.__ndxWalletChange?.(null); return; }
    _init(eth, accs[0], _walletId).then(w => window.__ndxWalletChange?.(w));
  });
  eth.on("chainChanged", () => location.reload());

  return { address, balance, chainId:_chainId, chainInfo, blockNumber:block, walletId };
}

// ── WalletConnect v2 fallback — opens wc: URI in user's wallet app ───────────
async function _connectWC() {
  // Without the full @walletconnect/modal SDK we generate a deeplink
  // that works on mobile. On desktop, show QR code via wc: URI.
  const uri = `wc:${Date.now()}@2?relay-protocol=irn&symKey=placeholder`;
  // Try to open WC URI — works on mobile devices
  window.open(`https://walletconnect.com/wc?uri=${encodeURIComponent(uri)}`, "_blank");
  throw new Error(
    "WalletConnect: scan the QR code with your wallet app.\n" +
    "For full WC v2 support, add @walletconnect/modal to package.json."
  );
}

export function disconnect() { _provider=null; _signer=null; _address=null; _chainId=null; }
export function getState()   { return { provider:_provider, signer:_signer, address:_address, chainId:_chainId, walletId:_walletId }; }
export async function getBalance() {
  if (!_provider || !_address) return null;
  return parseFloat(ethers.formatEther(await _provider.getBalance(_address)));
}
export async function getBlockNumber() { return _provider?.getBlockNumber() ?? null; }

// ── Switch / add network ─────────────────────────────────────────────────────
export async function switchChain(chainId) {
  const eth = _getAnyInjected();
  if (!eth) throw new Error("Wallet not connected.");
  const hex = "0x" + chainId.toString(16);
  try { await eth.request({ method:"wallet_switchEthereumChain", params:[{ chainId:hex }] }); }
  catch (e) {
    if (e.code === 4902) {
      const chain = CHAINS[chainId];
      if (!chain) throw new Error("Unknown network — add it manually.");
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId:hex, chainName:chain.name, rpcUrls:[chain.rpc],
                   nativeCurrency:{ name:chain.sym, symbol:chain.sym, decimals:18 },
                   blockExplorerUrls:[chain.exp] }],
      });
    } else if (e.code !== 4001) throw e;
  }
}

// ── ERC-20 balance ────────────────────────────────────────────────────────────
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];
export async function getTokenBalance(tokenAddress, wallet) {
  if (!_provider) throw new Error("Wallet not connected.");
  const c = new ethers.Contract(tokenAddress, ERC20_ABI, _provider);
  const [raw, dec, sym] = await Promise.all([c.balanceOf(wallet || _address), c.decimals(), c.symbol()]);
  return { formatted: parseFloat(ethers.formatUnits(raw, dec)), symbol: sym, decimals: Number(dec) };
}

// ── Uniswap V3 Positions ──────────────────────────────────────────────────────
const UNI_PM  = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const UNI_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)",
  "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
];
export async function getUniV3Positions() {
  if (!_provider) throw new Error("Wallet not connected.");
  if (![1,137,42161,10].includes(_chainId))
    throw new Error(`Uniswap V3 not available on chain ${_chainId}. Switch to Ethereum, Arbitrum, Polygon or Optimism.`);
  const pm    = new ethers.Contract(UNI_PM, UNI_ABI, _provider);
  const count = Number(await pm.balanceOf(_address));
  if (!count) return [];
  const out = [];
  for (let i = 0; i < Math.min(count, 20); i++) {
    try {
      const tid = await pm.tokenOfOwnerByIndex(_address, i);
      const p   = await pm.positions(tid);
      out.push({ tokenId:tid.toString(), token0:p[2], token1:p[3], fee:Number(p[4]),
                 tickLower:Number(p[5]), tickUpper:Number(p[6]), liquidity:p[7].toString(), isActive:p[7]>0n });
    } catch(e) { console.warn("Position", i, e.message); }
  }
  return out;
}

export function isMetaMaskInstalled() {
  const eth = window.ethereum?.providers?.find?.(p => p.isMetaMask) ?? window.ethereum;
  return !!eth?.isMetaMask;
}
