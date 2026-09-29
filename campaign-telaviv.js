// World 2: העיר הגדולה - תל אביב — 4 locations, one boss each: שחר,
// עמית, רותם, תמיר. Locked until "השכונה" (World 1) is fully completed
// — see unlockRequiresWorldCompleted below, checked by
// Progression.isWorldUnlocked (already existed before this world did;
// this is the first thing to actually USE it).
//
// NOTE: single-stage locations for now (no 3-normal-stages-then-boss
// build-up like World 1 has) — a simpler structure to get the
// world-selection mechanic itself working end to end. Easy to expand
// each location into multiple stages later, same as World 1's pattern,
// once there's a clearer sense of how this world should feel. רותם and
// תמיר's boss fights are also currently their only combo (a plain
// stat-upgrade, no skill) — matches the broader "some characters still
// need more combos" gap flagged earlier; these two bosses will feel
// noticeably weaker than שחר/עמית until that's addressed.
//
// World background/icon are placeholders (reusing the Neighborhood
// background) until real Tel-Aviv art exists.
window.CampaignData = window.CampaignData || {};
window.CampaignData.worlds = window.CampaignData.worlds || [];

window.CampaignData.worlds.push({
  id: "telaviv",
  name: "העיר הגדולה - תל אביב",
  icon: "../images/campaign/world_telaviv.png",
  unlockRequiresWorldCompleted: "neighborhood",
  background: "neighborhood-background.jpg", // placeholder — swap once real art exists

  completionBonus: {
    id: "telaviv_bonus",
    name: "בונוס השלמת תל אביב",
    rewards: [
      { type: "coins", amount: 400 }
    ]
  },

  locations: [
    {
      id: "shahar_place",
      name: "המקום של שחר",
      icon: "🏢",
      mapPosition: { x: 20, y: 30 },
      unlockRequiresStage: null,
      bossCharacter: "שחר לוי",

      stages: [
        {
          id: "shahar_boss",
          name: "שחר בעיר הגדולה",
          type: "boss",
          enemyLevel: 3,
          enemyCards: ["שחר לוי", "המבורגר", "ספה", "צמח"],
          enemyStartingBoard: [{ cardName: "שחר המבקרת", slot: 2 }],
          rewards: [
            { type: "coins", amount: 120 },
            { type: "characterCopy", character: "שחר לוי" }
          ]
        }
      ]
    },

    {
      id: "amit_place",
      name: "המקום של עמית",
      icon: "🏢",
      mapPosition: { x: 45, y: 55 },
      unlockRequiresStage: null,
      bossCharacter: "עמית גרינברג",
      // Playful, non-spoiling hint about the boss's MECHANIC (not an
      // item Weakness — Amit doesn't have one) — shown on the location
      // map, same spot as the item-Weakness riddles. Never names the
      // actual counter (Poison / Dor), matching the same "explain the
      // problem, let the player find the solution" philosophy.
      mechanicHint: "עמית תמיד מוגן... נראה שצריך משהו שעוקף הגנות, לא רק מכה חזק יותר.",

      stages: [
        {
          id: "amit_boss",
          name: "עמית בעיר הגדולה",
          type: "boss",
          enemyLevel: 3,
          // Deliberately JUST him + his shield combo's own item — no
          // other item in the pool, so every game this boss draws
          // exactly the same identity: always Shield. A real "counter
          // the mechanic" encounter, not "one card among several that
          // happens to have Shield."
          enemyCards: ["עמית גרינברג", "חוף ים"],
          enemyStartingBoard: [{ cardName: "עמית חייל ים", slot: 2 }],
          rewards: [
            { type: "coins", amount: 120 },
            { type: "characterCopy", character: "עמית גרינברג" }
          ]
        }
      ]
    },

    {
      id: "rotem_place",
      name: "המקום של רותם",
      icon: "🏢",
      mapPosition: { x: 70, y: 30 },
      unlockRequiresStage: null,
      bossCharacter: "רותם שמי",

      stages: [
        {
          id: "rotem_boss",
          name: "רותם בעיר הגדולה",
          type: "boss",
          enemyLevel: 3,
          enemyCards: ["רותם שמי", "צמח"],
          enemyStartingBoard: [{ cardName: "רותם הצמחונית", slot: 2 }],
          rewards: [
            { type: "coins", amount: 120 },
            { type: "characterCopy", character: "רותם שמי" }
          ]
        }
      ]
    },

    {
      id: "tamir_place",
      name: "המקום של תמיר",
      icon: "🏢",
      mapPosition: { x: 82, y: 60 },
      unlockRequiresStage: null,
      bossCharacter: "תמיר ביטון",

      stages: [
        {
          id: "tamir_boss",
          name: "תמיר בעיר הגדולה",
          type: "boss",
          enemyLevel: 3,
          enemyCards: ["תמיר ביטון", "צמח"],
          enemyStartingBoard: [{ cardName: "תמיר הצמחוני", slot: 2 }],
          rewards: [
            { type: "coins", amount: 120 },
            { type: "characterCopy", character: "תמיר ביטון" }
          ]
        }
      ]
    }
  ]
});
