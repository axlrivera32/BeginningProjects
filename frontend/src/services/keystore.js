import { encryptData, decryptData } from "./auth";
const HL_A='ndx_hl_addr',HL_P='ndx_hl_pk',BX_K='ndx_bx_key',BX_S='ndx_bx_sec';
export async function saveHL(addr,pk,pass){localStorage.setItem(HL_A,addr);localStorage.setItem(HL_P,await encryptData(pk,pass));}
export async function loadHL(pass){const a=localStorage.getItem(HL_A),e=localStorage.getItem(HL_P);if(!a||!e)return null;return{address:a,privateKey:await decryptData(e,pass)};}
export function clearHL(){localStorage.removeItem(HL_A);localStorage.removeItem(HL_P);}
export const hasHL=()=>!!(localStorage.getItem(HL_A)&&localStorage.getItem(HL_P));
export const getHLAddr=()=>localStorage.getItem(HL_A)||'';
export async function saveBX(key,secret,pass){localStorage.setItem(BX_K,await encryptData(key,pass));localStorage.setItem(BX_S,await encryptData(secret,pass));}
export async function loadBX(pass){const ek=localStorage.getItem(BX_K),es=localStorage.getItem(BX_S);if(!ek||!es)return null;return{apiKey:await decryptData(ek,pass),apiSecret:await decryptData(es,pass)};}
export function clearBX(){localStorage.removeItem(BX_K);localStorage.removeItem(BX_S);}
export const hasBX=()=>!!(localStorage.getItem(BX_K)&&localStorage.getItem(BX_S));
