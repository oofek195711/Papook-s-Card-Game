// DUNGEON — a separate, repeatable strategic-boss mode, NOT gated
// behind Campaign progress at all (see ui.js's Home button wiring).
// Deliberately a flat list, not worlds/locations like Campaign — every
// entry here is a complete, standalone encounter.
//
// Each boss can be fought as many times as the player wants — rewards
// are granted on every win (see script.js's checkGameOver isDungeon
// branch), same spirit as Quick Battle, not a one-time Campaign stage.
// The whole point is repeated attempts while the player refines their
// deck/strategy against a specific mechanic.
//
// This first entry reuses the exact same mechanic and hint as Campaign
// Tel Aviv's amit_boss stage (see campaign-telaviv.js) — same
// character, same shield archetype — but as a fully separate stage id,
// so playing it here never touches that stage's own Campaign
// completion tracking, and vice versa.
window.DungeonData = window.DungeonData || {};
window.DungeonData.bosses = window.DungeonData.bosses || [];

window.DungeonData.bosses.push({
  id: "dungeon_amit_shield",
  name: "עמית - מבצר המגן",
  icon: "🛡️",
  bossCharacter: "עמית גרינברג",
  enemyLevel: 3,
  // Same reasoning as the Campaign version: ONLY him + his shield
  // item, so this encounter's identity is always exactly "Shield",
  // every single time.
  enemyCards: ["עמית גרינברג", "חוף ים"],
  enemyStartingBoard: [{ cardName: "עמית חייל ים", slot: 2 }],
  mechanicHint: "עמית תמיד מוגן... נראה שצריך משהו שעוקף הגנות, לא רק מכה חזק יותר.",
  rewards: [
    { type: "coins", amount: 80 },
    { type: "researchPoints", amount: 20 }
  ]
});
