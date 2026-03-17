import { create } from "zustand";
import * as HL from "../services/hyperliquid";
import * as BX from "../services/bingx";
import * as KS from "../services/keystore";

export const useExchange = create((set, get) => ({
  hlKeys: null, bxKeys: null,
  hlOk: false,  bxOk:  false,
  hlAccount: null, bxAccount: null,
  hlPositions: [], bxPositions: [],

  loadHL: async (token) => {
    if (!KS.hasHL()) return;
    try { const keys = await KS.loadHL(token); if (keys) { set({ hlKeys: keys }); await get().testHL(); } }
    catch (e) { console.warn("HL restore:", e.message); }
  },
  saveHL: async (addr, pk, token) => {
    await KS.saveHL(addr, pk, token);
    set({ hlKeys: { address: addr, privateKey: pk } });
    return get().testHL();
  },
  clearHL: () => { KS.clearHL(); set({ hlKeys: null, hlOk: false, hlAccount: null, hlPositions: [] }); },
  testHL: async () => {
    const { hlKeys } = get(); if (!hlKeys) return null;
    try { const acc = await HL.testConnection(hlKeys.address); set({ hlOk: true, hlAccount: acc, hlPositions: acc.positions }); return acc; }
    catch (e) { set({ hlOk: false }); throw e; }
  },
  fetchHL: async () => {
    const { hlKeys } = get(); if (!hlKeys) return;
    try { const state = await HL.getAccountState(hlKeys.address); const positions = (state.assetPositions || []).filter(p => parseFloat(p.position.szi) !== 0); set({ hlPositions: positions }); return positions; }
    catch (e) { console.warn("HL fetch:", e.message); }
  },
  placeHL: async (params) => {
    const { hlKeys } = get(); if (!hlKeys) throw new Error("Hyperliquid not connected.");
    if (params.leverage) await HL.setLeverage({ coin: params.coin, leverage: params.leverage, privateKey: hlKeys.privateKey });
    const result = await HL.placeOrder({ ...params, privateKey: hlKeys.privateKey });
    await get().fetchHL(); return result;
  },
  closeHL: async (coin, sz) => {
    const { hlKeys } = get(); if (!hlKeys) throw new Error("Hyperliquid not connected.");
    const result = await HL.closePosition({ coin, sz, privateKey: hlKeys.privateKey });
    await get().fetchHL(); return result;
  },

  loadBX: async (token) => {
    if (!KS.hasBX()) return;
    try { const keys = await KS.loadBX(token); if (keys) { set({ bxKeys: keys }); await get().testBX(); } }
    catch (e) { console.warn("BX restore:", e.message); }
  },
  saveBX: async (apiKey, apiSecret, token) => {
    await KS.saveBX(apiKey, apiSecret, token);
    set({ bxKeys: { apiKey, apiSecret } });
    return get().testBX();
  },
  clearBX: () => { KS.clearBX(); set({ bxKeys: null, bxOk: false, bxAccount: null, bxPositions: [] }); },
  testBX: async () => {
    const { bxKeys } = get(); if (!bxKeys) return null;
    try { const acc = await BX.testConnection(bxKeys.apiKey, bxKeys.apiSecret); set({ bxOk: true, bxAccount: acc }); return acc; }
    catch (e) { set({ bxOk: false }); throw e; }
  },
  placeBX: async (params) => {
    const { bxKeys } = get(); if (!bxKeys) throw new Error("BingX not connected.");
    return BX.placeOrder({ ...params, apiKey: bxKeys.apiKey, apiSecret: bxKeys.apiSecret });
  },
}));
