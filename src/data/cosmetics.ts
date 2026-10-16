import type { CosmeticDef, CosmeticSlot } from './types';

export const COSMETIC_SLOTS: { id: CosmeticSlot; name: string }[] = [
  { id: 'paint', name: 'Paint' },
  { id: 'wheels', name: 'Wheels' },
  { id: 'decal', name: 'Decals' },
  { id: 'trail', name: 'Trails' },
  { id: 'exhaust', name: 'Boost FX' },
  { id: 'accessory', name: 'Extras' },
];

/** "default" items are always owned. Paint "default" uses the vehicle's factory color. */
export const COSMETICS: CosmeticDef[] = [
  { id: 'paint_default', slot: 'paint', name: 'Factory', value: 'default', price: 0, currency: 'coins' },
  { id: 'paint_cherry', slot: 'paint', name: 'Cherry', value: '#e8344e', price: 300, currency: 'coins' },
  { id: 'paint_tangerine', slot: 'paint', name: 'Tangerine', value: '#ff8a1f', price: 300, currency: 'coins' },
  { id: 'paint_lemon', slot: 'paint', name: 'Lemon', value: '#ffd93b', price: 300, currency: 'coins' },
  { id: 'paint_lime', slot: 'paint', name: 'Lime', value: '#7ee04a', price: 300, currency: 'coins' },
  { id: 'paint_teal', slot: 'paint', name: 'Lagoon', value: '#16c2b0', price: 400, currency: 'coins' },
  { id: 'paint_sky', slot: 'paint', name: 'Sky', value: '#3aa6ff', price: 400, currency: 'coins' },
  { id: 'paint_grape', slot: 'paint', name: 'Grape', value: '#8a4dff', price: 400, currency: 'coins' },
  { id: 'paint_bubblegum', slot: 'paint', name: 'Bubblegum', value: '#ff6fc1', price: 500, currency: 'coins' },
  { id: 'paint_snow', slot: 'paint', name: 'Pearl', value: '#f2f4f8', price: 600, currency: 'coins' },
  { id: 'paint_shadow', slot: 'paint', name: 'Shadow', value: '#2b2f3a', price: 800, currency: 'coins' },
  { id: 'paint_gold', slot: 'paint', name: 'Gold Rush', value: '#e8b931', price: 25, currency: 'gems' },
  { id: 'paint_chrome', slot: 'paint', name: 'Chrome', value: '#c9d3df', price: 30, currency: 'gems' },

  { id: 'wheels_default', slot: 'wheels', name: 'Classic', value: 'classic', price: 0, currency: 'coins' },
  { id: 'wheels_star', slot: 'wheels', name: 'Star', value: 'star', price: 600, currency: 'coins' },
  { id: 'wheels_spoke', slot: 'wheels', name: 'Wire Spoke', value: 'spoke', price: 900, currency: 'coins' },
  { id: 'wheels_turbine', slot: 'wheels', name: 'Turbine', value: 'turbine', price: 1500, currency: 'coins' },
  { id: 'wheels_neon', slot: 'wheels', name: 'Neon Ring', value: 'neon', price: 20, currency: 'gems' },
  { id: 'wheels_gold', slot: 'wheels', name: 'Solid Gold', value: 'gold', price: 0, currency: 'gems', rewardOnly: true },

  { id: 'decal_none', slot: 'decal', name: 'None', value: 'none', price: 0, currency: 'coins' },
  { id: 'decal_stripes', slot: 'decal', name: 'Racing Stripes', value: 'stripes', price: 500, currency: 'coins' },
  { id: 'decal_number', slot: 'decal', name: 'Lucky 77', value: 'number', price: 700, currency: 'coins' },
  { id: 'decal_flames', slot: 'decal', name: 'Hot Flames', value: 'flames', price: 1200, currency: 'coins' },
  { id: 'decal_bolt', slot: 'decal', name: 'Lightning', value: 'bolt', price: 1000, currency: 'coins' },
  { id: 'decal_checker', slot: 'decal', name: 'Checkered', value: 'checker', price: 15, currency: 'gems' },
  { id: 'decal_loony', slot: 'decal', name: 'Loony Eyes', value: 'eyes', price: 0, currency: 'coins', rewardOnly: true },

  { id: 'trail_none', slot: 'trail', name: 'None', value: 'none', price: 0, currency: 'coins' },
  { id: 'trail_sparkle', slot: 'trail', name: 'Sparkle', value: 'sparkle', price: 1500, currency: 'coins' },
  { id: 'trail_smoke', slot: 'trail', name: 'Burnout', value: 'smoke', price: 1000, currency: 'coins' },
  { id: 'trail_rainbow', slot: 'trail', name: 'Rainbow', value: 'rainbow', price: 30, currency: 'gems' },
  { id: 'trail_hearts', slot: 'trail', name: 'Hearts', value: 'hearts', price: 0, currency: 'coins', rewardOnly: true },

  { id: 'exhaust_default', slot: 'exhaust', name: 'Puffs', value: 'puff', price: 0, currency: 'coins' },
  { id: 'exhaust_flame', slot: 'exhaust', name: 'Afterburner', value: 'flame', price: 1800, currency: 'coins' },
  { id: 'exhaust_blue', slot: 'exhaust', name: 'Blue Flame', value: 'blue', price: 20, currency: 'gems' },
  { id: 'exhaust_bubbles', slot: 'exhaust', name: 'Bubbles', value: 'bubbles', price: 1200, currency: 'coins' },

  { id: 'acc_none', slot: 'accessory', name: 'None', value: 'none', price: 0, currency: 'coins' },
  { id: 'acc_spoiler', slot: 'accessory', name: 'Spoiler', value: 'spoiler', price: 800, currency: 'coins' },
  { id: 'acc_flag', slot: 'accessory', name: 'Antenna Flag', value: 'flag', price: 600, currency: 'coins' },
  { id: 'acc_lights', slot: 'accessory', name: 'Light Bar', value: 'lights', price: 1100, currency: 'coins' },
  { id: 'acc_duck', slot: 'accessory', name: 'Rubber Duck', value: 'duck', price: 10, currency: 'gems' },
  { id: 'acc_crown', slot: 'accessory', name: 'Crown', value: 'crown', price: 0, currency: 'gems', rewardOnly: true },
];

export const COSMETIC_BY_ID: Record<string, CosmeticDef> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

export const DEFAULT_LOADOUT: Record<CosmeticSlot, string> = {
  paint: 'paint_default',
  wheels: 'wheels_default',
  decal: 'decal_none',
  trail: 'trail_none',
  exhaust: 'exhaust_default',
  accessory: 'acc_none',
};

export const isDefaultCosmetic = (id: string): boolean => Object.values(DEFAULT_LOADOUT).includes(id);
