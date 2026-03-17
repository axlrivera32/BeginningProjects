import { create } from "zustand";
import { fetchPrices, simPrice, seedHistory, BASE_PRICES, BASE_VOL, generateCandles } from "../services/prices";

const TF_LIST = ["1m","3m","5m","15m","30m","1h","2h","4h","1d","2d","1w","1mo"];
const TF_LABEL = {"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1H","2h":"2H","4h":"4H","1d":"1D","2d":"2D","1w":"1W","1mo":"1M"};
const TF_MINS  = {"1m":1,"3m":3,"5m":5,"15m":15,"30m":30,"1h":60,"2h":120,"4h":240,"1d":1440,"2d":2880,"1w":10080,"1mo":43200};

export { TF_LIST, TF_LABEL, TF_MINS };

const initHistory = () =>
  Object.fromEntries(Object.entries(BASE_PRICES).map(([sym, base]) => [sym, seedHistory(base, BASE_VOL[sym])]));

export const usePrices = create((set, get) => ({
  prices:  { ...BASE_PRICES },
  changes: { ETH: 2.1, BTC: -0.8, SOL: 4.2, ARB: 1.3 },
  history: initHistory(),
  candles: {},        // { "ETH_1h": [{o,h,l,c,t}] }
  activeTF: "1h",
  _timer: null,

  start: () => {
    get().fetch();
    const t = setInterval(get().fetch, 15000);
    set({ _timer: t });
  },
  stop: () => { const { _timer } = get(); if (_timer) clearInterval(_timer); set({ _timer: null }); },

  setTF: (tf) => {
    set({ activeTF: tf });
    // Regenerate candles for all symbols with new TF
    const prices = get().prices;
    const candles = { ...get().candles };
    Object.keys(prices).forEach(sym => {
      candles[`${sym}_${tf}`] = generateCandles(sym, tf, prices[sym]);
    });
    set({ candles });
  },

  getCandles: (sym, tf) => {
    const key = `${sym}_${tf}`;
    const state = get();
    if (!state.candles[key]) {
      const price = state.prices[sym] || BASE_PRICES[sym] || 100;
      const newCandles = generateCandles(sym, tf, price);
      set(s => ({ candles: { ...s.candles, [key]: newCandles } }));
      return newCandles;
    }
    return state.candles[key];
  },

  fetch: async () => {
    const data = await fetchPrices();
    set(state => {
      const prices  = { ...state.prices };
      const changes = { ...state.changes };
      const history = { ...state.history };
      const candles = { ...state.candles };
      if (data) {
        for (const [sym, val] of Object.entries(data)) {
          prices[sym]  = val.price;
          changes[sym] = val.change24h;
        }
      } else {
        for (const sym of Object.keys(prices)) prices[sym] = simPrice(state.prices[sym]);
      }
      for (const sym of Object.keys(prices)) {
        history[sym] = [...(state.history[sym] || []), prices[sym]].slice(-120);
        // Update last candle close price for all loaded TFs
        Object.keys(candles).filter(k => k.startsWith(sym + '_')).forEach(key => {
          if (candles[key]?.length) {
            const last = { ...candles[key][candles[key].length - 1] };
            last.c = prices[sym];
            last.h = Math.max(last.h, prices[sym]);
            last.l = Math.min(last.l, prices[sym]);
            candles[key] = [...candles[key].slice(0, -1), last];
          }
        });
      }
      return { prices, changes, history, candles };
    });
  },
}));
