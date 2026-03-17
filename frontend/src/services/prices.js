const COINS="ethereum,bitcoin,solana,arbitrum";
const SYM={ethereum:"ETH",bitcoin:"BTC",solana:"SOL",arbitrum:"ARB"};
export const BASE_PRICES={ETH:3248,BTC:67890,SOL:178,ARB:1.84};
export const BASE_VOL={ETH:80,BTC:1200,SOL:8,ARB:.05};
export async function fetchPrices(){try{const res=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${COINS}&vs_currencies=usd&include_24hr_change=true`,{signal:AbortSignal.timeout(8000)});if(!res.ok)throw new Error('status '+res.status);const raw=await res.json();const out={};for(const[id,sym]of Object.entries(SYM)){if(raw[id]?.usd)out[sym]={price:raw[id].usd,change24h:raw[id].usd_24h_change??0};}return out;}catch{return null;}}
export function simPrice(p){return Math.max(.001,p*(1+(Math.random()-.5)*.004));}
export function seedHistory(base,vol,n=80){return Array.from({length:n},(_,i)=>Math.max(.001,base+Math.sin(i*.4)*vol*1.5+(Math.random()-.5)*vol));}
// Candle generation with timeframe-aware volatility
export function generateCandles(sym,tf,basePrice){
  const TF_MINS={1:1,3:3,5:5,15:15,30:30,'1h':60,'2h':120,'4h':240,'1d':1440,'2d':2880,'1w':10080,'1mo':43200};
  const TF_N={1:120,3:100,5:100,15:90,30:80,'1h':72,'2h':60,'4h':48,'1d':60,'2d':45,'1w':52,'1mo':24};
  const vol={ETH:.018,BTC:.016,SOL:.028,ARB:.032}[sym]||.02;
  const mins=TF_MINS[tf]||60, n=TF_N[tf]||72;
  const tfVol=vol*Math.sqrt(mins/60);
  let price=basePrice*(1-(Math.random()*.12+.04));
  const candles=[],now=Date.now();
  for(let i=0;i<n;i++){
    const o=price,move=(Math.random()-.47)*price*tfVol,c=Math.max(o*.5,o+move);
    const wick=Math.random()*price*tfVol*.5,h=Math.max(o,c)+wick,l=Math.min(o,c)-wick;
    candles.push({o,h,l,c,t:now-(n-i)*mins*60000,v:Math.random()*1e6});
    price=c;
  }
  if(candles.length){const last=candles[candles.length-1];last.c=basePrice;last.h=Math.max(last.h,basePrice);last.l=Math.min(last.l,basePrice);}
  return candles;
}
