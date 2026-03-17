// pools.js — Uniswap V3 pool reader
// Reads positions for any wallet address (not just connected one).
// Converts ticks to real prices, fetches current pool sqrtPriceX96.

import { ethers } from "ethers";
import { CHAINS } from "./wallet";

// ── Contracts ─────────────────────────────────────────────────────────────────
const PM_ADDR = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"; // NonfungiblePositionManager

const PM_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
];

// Uniswap V3 Factory
const FACTORY_ADDR = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const FACTORY_ABI  = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
];

// V3 Pool — only need slot0 for current sqrtPriceX96 and current tick
const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
];

// ERC-20 decimals + symbol
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// ── Tick ↔ Price math ─────────────────────────────────────────────────────────
// price = 1.0001^tick  (the ratio token1/token0 in "raw" units)
// We then adjust by decimals to get the human-readable price.
export function tickToPrice(tick, decimals0, decimals1) {
  // raw = 1.0001^tick
  const raw = Math.pow(1.0001, tick);
  // adjust for decimal difference: price of token0 in terms of token1
  return raw * Math.pow(10, decimals0 - decimals1);
}

// sqrtPriceX96 → price token0/token1
export function sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1) {
  const Q96  = BigInt("0x1000000000000000000000000"); // 2^96
  const sq   = BigInt(sqrtPriceX96.toString());
  // price in raw = (sq / 2^96)^2
  const raw  = Number(sq * sq) / Number(Q96 * Q96);
  return raw * Math.pow(10, decimals0 - decimals1);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read all Uniswap V3 positions for a given wallet address.
 * Works with any wallet — not just the connected one.
 * Returns enriched position objects with real prices (not ticks).
 *
 * @param {string}  ownerAddress  - 0x wallet to read
 * @param {object}  provider      - ethers provider (connected wallet's provider or public RPC)
 * @param {number}  chainId       - chain to query
 */
export async function getPositionsForWallet(ownerAddress, provider, chainId = 1) {
  if (![1, 137, 42161, 10].includes(chainId)) {
    throw new Error(`Uniswap V3 not available on chain ${chainId}. Use Ethereum, Arbitrum, Polygon or Optimism.`);
  }

  const pm = new ethers.Contract(PM_ADDR, PM_ABI, provider);

  let count;
  try {
    count = Number(await pm.balanceOf(ownerAddress));
  } catch {
    throw new Error(`Cannot read positions for ${ownerAddress}. Check the address and network.`);
  }

  if (count === 0) return [];

  const factory = new ethers.Contract(FACTORY_ADDR, FACTORY_ABI, provider);
  const results  = [];

  for (let i = 0; i < Math.min(count, 50); i++) {
    try {
      const tokenId = await pm.tokenOfOwnerByIndex(ownerAddress, i);
      const pos     = await pm.positions(tokenId);

      const token0Addr = pos[2];
      const token1Addr = pos[3];
      const fee        = Number(pos[4]);
      const tickLower  = Number(pos[5]);
      const tickUpper  = Number(pos[6]);
      const liquidity  = pos[7].toString();
      const isActive   = pos[7] > 0n;

      // Read token decimals + symbols
      const t0c  = new ethers.Contract(token0Addr, ERC20_ABI, provider);
      const t1c  = new ethers.Contract(token1Addr, ERC20_ABI, provider);
      const [dec0, sym0, dec1, sym1] = await Promise.all([
        t0c.decimals().catch(() => 18n),
        t0c.symbol().catch(() => token0Addr.slice(0, 6)),
        t1c.decimals().catch(() => 18n),
        t1c.symbol().catch(() => token1Addr.slice(0, 6)),
      ]);
      const d0 = Number(dec0), d1 = Number(dec1);

      // Convert ticks → human prices
      const priceLower   = tickToPrice(tickLower,  d0, d1);
      const priceUpper   = tickToPrice(tickUpper,  d0, d1);

      // Fetch current pool price from on-chain slot0
      let currentPrice = null;
      let currentTick  = null;
      let poolAddress  = null;
      try {
        poolAddress  = await factory.getPool(token0Addr, token1Addr, fee);
        if (poolAddress && poolAddress !== ethers.ZeroAddress) {
          const pool   = new ethers.Contract(poolAddress, POOL_ABI, provider);
          const slot0  = await pool.slot0();
          currentPrice = sqrtPriceX96ToPrice(slot0[0], d0, d1);
          currentTick  = Number(slot0[1]);
        }
      } catch { /* pool read failed — non-critical */ }

      // Is the current price within the position range?
      const inRange = currentPrice !== null
        ? (currentPrice >= priceLower && currentPrice <= priceUpper)
        : isActive;

      // Price progress: 0 = at lower bound, 1 = at upper bound
      const priceProgress = (currentPrice !== null && priceUpper > priceLower)
        ? Math.max(0, Math.min(1, (currentPrice - priceLower) / (priceUpper - priceLower)))
        : null;

      results.push({
        tokenId:      tokenId.toString(),
        token0:       { address: token0Addr, symbol: sym0, decimals: d0 },
        token1:       { address: token1Addr, symbol: sym1, decimals: d1 },
        fee,
        feeTier:      `${(fee / 10000).toFixed(2)}%`,
        tickLower,
        tickUpper,
        priceLower,
        priceUpper,
        currentPrice,
        currentTick,
        priceProgress,
        liquidity,
        isActive,
        inRange,
        poolAddress,
        // Pair label
        pair: `${sym0}/${sym1}`,
        // Pool value estimate (rough: liquidity units vary, use progress as proxy)
        // Full calculation requires sqrt math — using simplified estimate
        poolValueUSD: null,  // populated separately if we have price data
      });
    } catch (e) {
      console.warn(`Position ${i} failed:`, e.message);
    }
  }

  return results;
}

/**
 * Build a public RPC provider for a chain (no wallet needed).
 * Used when reading a third-party wallet's positions.
 */
export function publicProvider(chainId) {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`No RPC for chain ${chainId}`);
  return new ethers.JsonRpcProvider(chain.rpc);
}
