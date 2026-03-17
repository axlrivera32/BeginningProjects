import { create } from "zustand";
import * as WA from "../services/wallet";

export const useWallet = create((set, get) => ({
  wallet:     null,
  connecting: false,
  error:      null,
  showModal:  false,

  openModal:  () => set({ showModal: true }),
  closeModal: () => set({ showModal: false }),

  connect: async (walletId = "metamask") => {
    set({ connecting: true, error: null, showModal: false });
    try {
      const w = await WA.connect(walletId);
      set({ wallet: w, connecting: false });
      window.__ndxWalletChange = nw => set({ wallet: nw });
      return w;
    } catch (e) {
      set({ connecting: false, error: e.message });
      throw e;
    }
  },

  reconnect: async () => {
    const w = await WA.reconnect();
    if (w) { set({ wallet: w }); window.__ndxWalletChange = nw => set({ wallet: nw }); }
    return w;
  },

  disconnect: () => { WA.disconnect(); set({ wallet: null }); },
  switchChain: id => WA.switchChain(id),

  refreshBalance: async () => {
    const bal = await WA.getBalance();
    if (bal !== null) set(s => ({ wallet: s.wallet ? { ...s.wallet, balance: bal } : null }));
  },
  refreshBlock: async () => {
    const b = await WA.getBlockNumber();
    if (b) set(s => ({ wallet: s.wallet ? { ...s.wallet, blockNumber: b } : null }));
  },
  getUniPositions: () => WA.getUniV3Positions(),
}));
