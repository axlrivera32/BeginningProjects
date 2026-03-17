# ◈ NexDeFi v5 — Advanced DeFi Trading System

## Quick Start

### Frontend
```bat
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

### Backend (optional — for server-side email)
```bat
python -m venv venv
venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```
⚠ Run uvicorn from the nexdefi-v5/ root folder.

---

## What's New in v5

| Feature | Detail |
|---------|--------|
| **Hedge SHORT** | Opens SHORT when LP drops out of range to offset impermanent loss. Closes when price re-enters range. |
| **Hedge LONG** | Opens LONG when SHORT reverses (fakeout), using configured USD amount |
| **USD Amount fields** | Every hedge strategy has its own "Amount to Risk" input in USD or % |
| **Futures / Spot toggle** | All trading panels support switching between perpetual futures and spot market |
| **Candlestick chart** | Full OHLCV candlestick rendering with color-coded bull/bear candles |
| **Timeframe selector** | 12 intervals: 1m·3m·5m·15m·30m·1H·2H·4H·1D·2D·1W·1M |
| **Presets update amounts** | Conservative/Balanced/Aggressive presets now configure hedge USD amounts |
| **Auto-size from USD** | Trading panel auto-calculates base asset size from USD amount + leverage |

---

## Architecture

```
nexdefi-v5/
├── frontend/src/
│   ├── components/       AuthScreen, AppShell, Dashboard, Trading,
│   │                     LiquidityPools, BotControls, PaperTrading,
│   │                     Settings, Toast, Chart (shared)
│   ├── hooks/            useAuth, useWallet, useExchange, usePrices
│   ├── services/         auth, metamask, hyperliquid, bingx, keystore, prices
│   └── styles/           global.css (245 lines, dark/light)
├── backend/
│   ├── routers/          auth, trading, bot, paper, prices
│   ├── services/         db, email
│   ├── middleware/        auth (JWT)
│   └── models/           user
└── README.md
```

## Security
- Keys stored **AES-256-GCM encrypted** in localStorage only — never transmitted
- MetaMask uses **EIP-1193** — real extension popup, `eth_requestAccounts`
- Use a dedicated wallet with limited funds
