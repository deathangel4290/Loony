import type { MusicDef, WorldDef } from './types';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN_DOM = [0, 1, 4, 5, 7, 8, 10];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

export const MENU_MUSIC: MusicDef = {
  bpm: 104, root: 60, scale: MAJOR, progression: [0, 5, 3, 4], lead: 'triangle', bass: 'triangle', swing: 0.08, drums: 'soft',
};

export const WORLDS: WorldDef[] = [
  {
    id: 'hills',
    name: 'Green Hills',
    tagline: 'Rolling meadows & sunny skies',
    price: 0,
    requiredLevel: 1,
    palette: {
      skyTop: '#4fb8ff', skyBottom: '#c8f1ff', sun: '#fff5c4', far: '#a3d9cf', mid: '#74c27a', near: '#55a95f',
      surface: '#6fd64f', surfaceEdge: '#3e9a37', topsoil: '#8a5a35', dirt: '#a8703f', dirtDark: '#7a4e2b', speck: '#c58c58',
      accent: '#ffd34d', fog: '#dff5ff',
    },
    terrain: {
      surface: 'grass', baseDifficulty: 0, groundFriction: 1.0, iceChance: 0, fuelSpacingMul: 1.0,
      pieceWeights: { rolling: 1.4, hill: 1.3, valley: 1.0, climb: 0.8, descent: 0.8, kicker: 1.0, gap: 0.5, bridge: 0.5, bumps: 0.6, plateau: 0.6, doubleHill: 0.8 },
    },
    decor: ['tree', 'bush', 'rock', 'flower', 'fence'],
    props: ['crate', 'hay', 'tire'],
    particle: 'pollen',
    sky: 'clouds',
    time: 'day',
    coinMultiplier: 1,
    music: { bpm: 118, root: 60, scale: MAJOR, progression: [0, 4, 5, 3], lead: 'square', bass: 'triangle', swing: 0.1, drums: 'four' },
  },
  {
    id: 'desert',
    name: 'Sunset Dunes',
    tagline: 'Sand, cacti & a burning sky',
    price: 3000,
    requiredLevel: 3,
    palette: {
      skyTop: '#f06a5a', skyBottom: '#ffd28a', sun: '#fff1b8', far: '#e39a72', mid: '#cf7d52', near: '#b9673f',
      surface: '#f4c47c', surfaceEdge: '#d69a52', topsoil: '#d08a4c', dirt: '#c37944', dirtDark: '#985729', speck: '#e6a86b',
      accent: '#ff5e3a', fog: '#ffdcae',
    },
    terrain: {
      surface: 'sand', baseDifficulty: 0.12, groundFriction: 0.85, iceChance: 0, fuelSpacingMul: 1.08,
      pieceWeights: { rolling: 1.6, hill: 1.2, valley: 0.9, climb: 0.7, descent: 0.9, kicker: 1.3, gap: 0.8, bridge: 0.3, bumps: 0.9, plateau: 0.6, doubleHill: 1.2 },
    },
    decor: ['cactus', 'mesa', 'rock', 'skull', 'tumble'],
    props: ['barrel', 'tire', 'crate'],
    particle: 'dust',
    sky: 'sunset',
    time: 'sunset',
    coinMultiplier: 1.25,
    music: { bpm: 100, root: 57, scale: PHRYGIAN_DOM, progression: [0, 1, 0, 6], lead: 'sawtooth', bass: 'triangle', swing: 0.14, drums: 'half' },
  },
  {
    id: 'snow',
    name: 'Frostbite Peaks',
    tagline: 'Powder, pines & treacherous ice',
    price: 10000,
    requiredLevel: 6,
    palette: {
      skyTop: '#6ea6e6', skyBottom: '#e8f3ff', sun: '#ffffff', far: '#bfd2ea', mid: '#a2bbdb', near: '#86a3c9',
      surface: '#f4f9ff', surfaceEdge: '#bcd3ec', topsoil: '#8aa4c2', dirt: '#6f88a8', dirtDark: '#556d8c', speck: '#a5bcd6',
      accent: '#ff4d6d', fog: '#f0f7ff',
    },
    terrain: {
      surface: 'snow', baseDifficulty: 0.22, groundFriction: 0.9, iceChance: 0.35, fuelSpacingMul: 1.12,
      pieceWeights: { rolling: 1.0, hill: 1.2, valley: 1.1, climb: 1.2, descent: 1.3, kicker: 1.1, gap: 0.7, bridge: 0.8, bumps: 0.6, plateau: 0.7, doubleHill: 1.0 },
    },
    decor: ['pine', 'snowrock', 'snowman', 'pine'],
    props: ['snowman', 'crate', 'barrel'],
    particle: 'snow',
    sky: 'aurora',
    time: 'day',
    coinMultiplier: 1.5,
    music: { bpm: 92, root: 62, scale: LYDIAN, progression: [0, 4, 5, 3], lead: 'triangle', bass: 'sine', swing: 0.05, drums: 'soft' },
  },
  {
    id: 'city',
    name: 'Neon City',
    tagline: 'Rooftops, ramps & midnight lights',
    price: 25000,
    requiredLevel: 9,
    palette: {
      skyTop: '#11163a', skyBottom: '#4a3a7e', sun: '#fdf2c6', far: '#262c5a', mid: '#323a70', near: '#1f2346',
      surface: '#4c5167', surfaceEdge: '#2b2e3d', topsoil: '#3a3d4d', dirt: '#5d6274', dirtDark: '#43475a', speck: '#7e8398',
      accent: '#ff3df2', fog: '#5b4a90',
    },
    terrain: {
      surface: 'road', baseDifficulty: 0.32, groundFriction: 1.05, iceChance: 0, fuelSpacingMul: 1.15,
      pieceWeights: { rolling: 0.6, hill: 0.8, valley: 0.6, climb: 0.9, descent: 0.9, kicker: 1.6, gap: 1.2, bridge: 1.0, bumps: 0.4, plateau: 1.0, rooftops: 1.6, doubleHill: 0.6 },
    },
    decor: ['lamp', 'sign', 'hydrant', 'bin', 'lamp'],
    props: ['cone', 'barrel', 'tire', 'crate'],
    particle: 'paper',
    sky: 'skyline',
    time: 'night',
    coinMultiplier: 1.8,
    music: { bpm: 124, root: 55, scale: DORIAN, progression: [0, 3, 0, 4], lead: 'square', bass: 'sawtooth', swing: 0.18, drums: 'break' },
  },
  {
    id: 'volcano',
    name: 'Magma Rift',
    tagline: 'Black rock, rivers of lava',
    price: 50000,
    requiredLevel: 13,
    palette: {
      skyTop: '#260c10', skyBottom: '#8c2f1e', sun: '#ffb347', far: '#4d1d1a', mid: '#3a1716', near: '#2a1112',
      surface: '#4a4248', surfaceEdge: '#28232a', topsoil: '#4b2c26', dirt: '#2f2629', dirtDark: '#1d1719', speck: '#ff7a2f',
      accent: '#ff7a1a', fog: '#5b1f1a',
    },
    terrain: {
      surface: 'rock', baseDifficulty: 0.42, groundFriction: 1.0, iceChance: 0, fuelSpacingMul: 1.2,
      pieceWeights: { rolling: 0.9, hill: 1.1, valley: 0.8, climb: 1.1, descent: 1.0, kicker: 1.3, gap: 0.6, bridge: 0.9, bumps: 1.0, plateau: 0.7, lava: 1.4, doubleHill: 1.0 },
    },
    decor: ['deadtree', 'vent', 'crystal', 'rock'],
    props: ['boulder', 'barrel'],
    particle: 'embers',
    sky: 'smoke',
    time: 'sunset',
    coinMultiplier: 2.2,
    music: { bpm: 136, root: 52, scale: HARMONIC_MINOR, progression: [0, 5, 6, 4], lead: 'sawtooth', bass: 'square', swing: 0.0, drums: 'four' },
  },
];

export const WORLD_BY_ID: Record<string, WorldDef> = Object.fromEntries(WORLDS.map((w) => [w.id, w]));
export const getWorld = (id: string): WorldDef => WORLD_BY_ID[id] ?? WORLDS[0];

export { MINOR };
