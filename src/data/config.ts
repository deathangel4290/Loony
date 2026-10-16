/**
 * Global gameplay tuning. Everything that defines "feel" lives here or in the
 * per-vehicle / per-world data so it can be tweaked without touching systems.
 */
export const CONFIG = {
  physics: {
    step: 1 / 120,
    maxStepsPerFrame: 8,
    gravity: 11.5,
    velocityIterations: 8,
    positionIterations: 3,
    bumpStopStiffness: 900,
    bumpStopDamping: 18,
    droopLimit: 0.22,
  },
  vehicle: {
    coastTorqueFactor: 0.06,
    airMotorTorqueFactor: 0.04,
    groundedGraceTime: 0.12,
    fuelIdleFactor: 0.28,
    outOfFuelStopTime: 1.6,
    outOfFuelMaxTime: 7,
    flippedTime: 1.4,
  },
  tricks: {
    minAirTime: 0.45,
    flipTolerance: 0.55,
    flipPoints: [100, 250, 450, 700, 1000],
    bigAirTime: 1.6,
    hugeAirTime: 3.0,
    longJumpDistance: 22,
    perfectAngle: 0.21,
    perfectWheelWindow: 0.14,
    closeCallAngle: 0.95,
    wheelieMinTime: 1.0,
    wheeliePointsPerSec: 120,
    comboWindow: 3.2,
    maxCombo: 5,
    coinsPerPoint: 1 / 20,
    xpPerPoint: 1 / 25,
  },
  scoring: {
    pointsPerMeter: 5,
    pointsPerCoin: 2,
    distanceCoinsPer100m: 6,
    xpPer100m: 10,
  },
  fuel: {
    firstCan: 150,
    baseSpacing: 200,
    spacingGrowth: 0.14,
    maxSpacing: 600,
  },
  camera: {
    baseViewHeight: 11.5,
    maxViewHeight: 17.5,
    lookAhead: 0.42,
    followRate: 7,
    zoomRate: 1.6,
  },
  terrain: {
    chunkLength: 64,
    step: 0.5,
    activeBehind: 70,
    activeAhead: 130,
    startFlat: 26,
  },
  crash: {
    slowMoScale: 0.28,
    slowMoTime: 1.0,
    resultsDelay: 1.7,
  },
} as const;
