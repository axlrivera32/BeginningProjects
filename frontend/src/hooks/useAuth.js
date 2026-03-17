import { create } from "zustand";
import * as Auth from "../services/auth";

export const useAuth = create((set, get) => ({
  session: null,
  loading: false,
  error:   null,

  init: () => {
    const s = Auth.loadSession();
    set({ session: s });
    return s;
  },

  login: async (creds) => {
    set({ loading: true, error: null });
    try {
      const s = await Auth.login(creds);
      set({ session: s, loading: false });
      return s;
    } catch (e) {
      set({ loading: false, error: e.message });
      throw e;
    }
  },

  register: async (data) => {
    set({ loading: true, error: null });
    try {
      const s = await Auth.register(data);
      set({ session: s, loading: false });
      return s;
    } catch (e) {
      set({ loading: false, error: e.message });
      throw e;
    }
  },

  loginWithWallet: async (address, name) => {
    set({ loading: true, error: null });
    try {
      const s = await Auth.loginWithWallet(address, name);
      set({ session: s, loading: false });
      return s;
    } catch (e) {
      set({ loading: false, error: e.message });
      throw e;
    }
  },

  logout: () => {
    Auth.clearSession();
    set({ session: null });
  },

  updateProfile: async (data) => {
    const updated = await Auth.updateProfile(get().session, data);
    set({ session: updated });
    return updated;
  },

  changePassword: async (oldPw, newPw) => {
    await Auth.changePassword(get().session, oldPw, newPw);
  },
}));
