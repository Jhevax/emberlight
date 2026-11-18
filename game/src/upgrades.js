// The upgrade draft offered between waves: each upgrade has a name, a short
// description, a max level, and an apply() that changes the world's player stats.
// The world owns the stats; this file only describes the choices.

export const UPGRADES = [
  {
    id: 'damage', name: 'Ember Rounds', max: 4,
    blurb: '+25% bolt damage',
    apply(stats) { stats.damageMul *= 1.25; },
  },
  {
    id: 'rapid', name: 'Rapid Ignite', max: 4,
    blurb: 'Fire 15% faster',
    apply(stats) { stats.fireIntervalMul *= 0.85; },
  },
  {
    id: 'twin', name: 'Twin Flame', max: 2,
    blurb: '+1 bolt per shot',
    apply(stats) { stats.extraBolts += 1; },
  },
  {
    id: 'pierce', name: 'Piercing Ember', max: 2,
    blurb: 'Bolts pass through +1 foe',
    apply(stats) { stats.pierce += 1; },
  },
  {
    id: 'swift', name: 'Swift Boots', max: 3,
    blurb: '+12% move speed',
    apply(stats) { stats.speedMul *= 1.12; },
  },
  {
    id: 'heart', name: 'Lantern Heart', max: 3,
    blurb: '+25 max health, heal 25',
    apply(stats) { stats.maxHpBonus += 25; stats.healNow += 25; },
  },
  {
    id: 'dash', name: 'Quick Dash', max: 3,
    blurb: 'Dash recharges 25% faster',
    apply(stats) { stats.dashCooldownMul *= 0.75; },
  },
  {
    id: 'magnet', name: 'Ember Magnet', max: 3,
    blurb: '+60% pickup reach',
    apply(stats) { stats.pickupMul *= 1.6; },
  },
  {
    id: 'lantern', name: 'Wide Lantern', max: 3,
    blurb: '+25% light, +8% damage',
    apply(stats) { stats.lightMul *= 1.25; stats.damageMul *= 1.08; },
  },
];

/** A fresh stats object: multipliers and bonuses the upgrades stack onto. */
export function createStats() {
  return {
    damageMul: 1, fireIntervalMul: 1, extraBolts: 0, pierce: 0,
    speedMul: 1, maxHpBonus: 0, healNow: 0, dashCooldownMul: 1,
    pickupMul: 1, lightMul: 1,
  };
}

/** Roll three distinct upgrades that still have levels left, using the world's random. */
export function rollDraft(random, levels) {
  const available = UPGRADES.filter((u) => (levels[u.id] ?? 0) < u.max);
  const draft = [];
  while (draft.length < 3 && available.length > 0) {
    const index = Math.floor(random() * available.length);
    draft.push(available.splice(index, 1)[0]);
  }
  return draft;
}

export function upgradeById(id) {
  return UPGRADES.find((u) => u.id === id) ?? null;
}
