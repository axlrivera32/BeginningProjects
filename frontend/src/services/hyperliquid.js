import { ethers } from "ethers";
const BASE="https://api.hyperliquid.xyz";
async function post(ep,payload){const r=await fetch(`${BASE}${ep}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`HL ${r.status}: ${await r.text().catch(()=>r.statusText)}`);return r.json();}
async function signedExchange(action,privateKey){if(!privateKey)throw new Error('Private key required.');const wallet=new ethers.Wallet(privateKey),nonce=Date.now();const msgHash=ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({action,nonce})));const sig=await wallet.signMessage(ethers.getBytes(msgHash));const{r,s,v}=ethers.Signature.from(sig);const res=await fetch(`${BASE}/exchange`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,nonce,signature:{r,s,v}}),signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error(`HL Exchange ${res.status}`);return res.json();}
export const getAllMids=()=>post('/info',{type:'allMids'});
export const getMeta=()=>post('/info',{type:'meta'});
export const getAccountState=(user)=>post('/info',{type:'clearinghouseState',user});
export const getOpenOrders=(user)=>post('/info',{type:'openOrders',user});
export const getTradeHistory=(user)=>post('/info',{type:'userFills',user});
export async function testConnection(address){const[state,mids]=await Promise.all([getAccountState(address),getAllMids()]);const positions=(state.assetPositions||[]).filter(p=>parseFloat(p.position.szi)!==0);return{connected:true,accountValue:parseFloat(state.marginSummary?.accountValue||0),positions,ethPrice:parseFloat(mids['ETH']||0)};}
export async function placeOrder({coin,isBuy,sz,limitPx,tpPx,slPx,reduceOnly=false,privateKey}){const orders=[{a:coin,b:isBuy,p:limitPx?String(limitPx):'0',s:String(sz),r:reduceOnly,t:limitPx?{limit:{tif:'Gtc'}}:{market:{}}}];if(tpPx)orders.push({a:coin,b:!isBuy,p:String(tpPx),s:String(sz),r:true,t:{trigger:{isMarket:true,triggerPx:String(tpPx),tpsl:'tp'}}});if(slPx)orders.push({a:coin,b:!isBuy,p:String(slPx),s:String(sz),r:true,t:{trigger:{isMarket:true,triggerPx:String(slPx),tpsl:'sl'}}});return signedExchange({type:'order',orders,grouping:'na'},privateKey);}
export async function setLeverage({coin,leverage,isCross=false,privateKey}){return signedExchange({type:'updateLeverage',asset:coin,isCross,leverage},privateKey);}
export async function closePosition({coin,sz,privateKey}){return signedExchange({type:'order',orders:[{a:coin,b:false,p:'0',s:String(sz),r:true,t:{market:{}}}],grouping:'na'},privateKey);}
