// World 1: השכונה — the 5 original cast members, one location each.
// Every boss's "special rules" are just the fusion cards that already
// exist in combos.js — no new battle engine needed, only content.
//
// NOTE: this used to live at campaign/worlds/neighborhood.js. Moved to
// the root (flat, no folder) for the same reason as combos.js — nested
// folders don't reliably survive a drag-and-drop upload to GitHub.
window.CampaignData = window.CampaignData || {};
window.CampaignData.worlds = window.CampaignData.worlds || [];

window.CampaignData.worlds.push({
  id: "neighborhood",
  name: "השכונה",
  icon: "../images/campaign/world_neighborhood.png",
  unlockRequiresWorldCompleted: null, // first world — always open

  completionBonus: {
    id: "neighborhood_bonus",
    name: "בונוס השלמת השכונה",
    rewards: [
      { type: "coins", amount: 300 },
      { type: "unlockItem", item: "מחשב" } // shared by 3 different combos!
    ]
  },

  locations: [
    {
      id: "tamar_house",
      name: "הבית של תמר",
      icon: "🏠",
      mapPosition: { x: 16, y: 66 },
      unlockRequiresStage: null,
      bossCharacter: "תמר גולן",
      // background: "../images/tamar_background.png"  -- add once available

      stages: [
        {
          id: "tamar_1",
          name: "ארוחת בוקר אצל תמר",
          type: "normal",
          enemyLevel: 1,
          enemyCards: ["תמר גולן", "ציפס אמריקאי", "מכחול"],
          rewards: [{ type: "coins", amount: 50 },
            { type: "characterCopy", character: "תמר גולן" }
          ]
        },
        {
          id: "tamar_2",
          name: "קרב הצ'יפס במטבח",
          type: "normal",
          enemyLevel: 1,
          enemyCards: ["תמר גולן", "ציפס אמריקאי", "מחשב"],
          rewards: [
            { type: "coins", amount: 60 },
            { type: "unlockItem", item: "ציפס אמריקאי" }
          ]
        },
        {
          id: "tamar_3",
          name: "המרפסת של תמר",
          type: "normal",
          enemyLevel: 2,
          enemyCards: ["תמר גולן", "חוף ים", "מחשב"],
          rewards: [
            { type: "coins", amount: 75 },
            { type: "unlockItem", item: "חוף ים" }
          ]
        },
        {
          id: "tamar_boss",
          name: "תמר מארחת",
          type: "boss",
          enemyLevel: 2,
          enemyStartingBoard: [{ cardName: "תמר משחקת באוכל", slot: 2 }],
          rewards: [
            { type: "coins", amount: 150 },
            { type: "unlockItem", item: "מכחול" }
          ]
        }
      ]
    },

    {
      id: "or_house",
      name: "הבית של אור",
      icon: "🏠",
      mapPosition: { x: 34, y: 30 },
      unlockRequiresStage: null,
      bossCharacter: "אור לוין",
      background: "../images/or_background.png",

      stages: [
        {
          id: "or_1",
          name: "חימום עם אור",
          type: "normal",
          enemyLevel: 1,
          enemyCards: ["אור לוין", "כדור"],
          rewards: [{ type: "coins", amount: 50 },
            { type: "characterCopy", character: "אור לוין" }
          ]
        },
        {
          id: "or_2",
          name: "כדורגל בחצר",
          type: "normal",
          enemyLevel: 1,
          enemyCards: ["אור לוין", "כדור", "מדי אומנות לחימה"],
          rewards: [{ type: "coins", amount: 60 }]
        },
        {
          id: "or_3",
          name: "הסלון של אור",
          type: "normal",
          enemyLevel: 2,
          enemyCards: ["אור לוין", "מחשב"],
          rewards: [{ type: "coins", amount: 75 }]
        },
        {
          id: "or_boss",
          name: "אור החלוץ מול הכל",
          type: "boss",
          enemyLevel: 2,
          enemyStartingBoard: [{ cardName: "אור החלוץ", slot: 2 }],
          rewards: [
            { type: "coins", amount: 150 },
            { type: "unlockItem", item: "כדור" }
          ]
        }
      ]
    },

    {
      id: "omer_dojo",
      name: "הדוג'ו של עומר",
      icon: "🥋",
      mapPosition: { x: 52, y: 62 },
      unlockRequiresStage: null,
      bossCharacter: "עומר שמואלי",
      background: "../images/omer_background.png",

      stages: [
        {
          id: "omer_1",
          name: "חימום בדוג'ו",
          type: "normal",
          enemyLevel: 1,
          enemyCards: ["עומר שמואלי", "מדי אומנות לחימה"],
          rewards: [{ type: "coins", amount: 50 },
            { type: "characterCopy", character: "עומר שמואלי" }
          ]
        },
        {
          id: "omer_2",
          name: "תרגול הגנות",
          type: "normal",
          enemyLevel: 1,
          enemyCards: ["עומר שמואלי", "מדי אומנות לחימה", "קטשופ"],
          rewards: [{ type: "coins", amount: 60 }]
        },
        {
          id: "omer_3",
          name: "מבחן החגורה",
          type: "normal",
          enemyLevel: 2,
          enemyCards: ["עומר שמואלי", "מחשב"],
          rewards: [{ type: "coins", amount: 75 }]
        },
        {
          id: "omer_boss",
          name: "עומר מוריד לקרקע",
          type: "boss",
          enemyLevel: 2,
          enemyStartingBoard: [{ cardName: "עומר מוריד לקרקע", slot: 2 }],
          rewards: [
            { type: "coins", amount: 150 },
            { type: "unlockItem", item: "מדי אומנות לחימה" }
          ]
        }
      ]
    },

    {
      id: "dor_club",
      name: "מועדון ה-DJ של דור",
      icon: "🎧",
      mapPosition: { x: 70, y: 30 },
      unlockRequiresStage: null,
      bossCharacter: "דור טלקר",
      background: "../images/dor_background.png",

      stages: [
        {
          id: "dor_1",
          name: "סאונדצ'ק",
          type: "normal",
          enemyLevel: 1,
          enemyCards: ["דור טלקר", "מערכת דיגיי"],
          rewards: [{ type: "coins", amount: 50 },
            { type: "characterCopy", character: "דור טלקר" }
          ]
        },
        {
          id: "dor_2",
          name: "הבחורים בעמדה",
          type: "normal",
          enemyLevel: 1,
          enemyCards: ["דור טלקר", "מערכת דיגיי", "מיקרופון"],
          rewards: [{ type: "coins", amount: 60 }]
        },
        {
          id: "dor_3",
          name: "הלילה לפני המופע",
          type: "normal",
          enemyLevel: 2,
          enemyCards: ["דור טלקר", "חתול"],
          rewards: [{ type: "coins", amount: 75 }]
        },
        {
          id: "dor_boss",
          name: "The Fancy Dude על הבמה",
          type: "boss",
          enemyLevel: 2,
          enemyStartingBoard: [{ cardName: "The fancy dude", slot: 2 }],
          rewards: [
            { type: "coins", amount: 150 },
            { type: "unlockItem", item: "מערכת דיגיי" }
          ]
        }
      ]
    },

    {
      id: "train_station",
      name: "תחנת הרכבת",
      icon: "🚂",
      mapPosition: { x: 88, y: 66 },
      unlockRequiresStage: null,
      bossCharacter: "אופק טלקר",
      background: "../images/ofek_background.png",

      stages: [
        {
          id: "train_1",
          name: "הרציף הראשון",
          type: "normal",
          enemyLevel: 1,
          enemyCards: ["אופק טלקר", "רכבת"],
          rewards: [{ type: "coins", amount: 50 },
            { type: "characterCopy", character: "אופק טלקר" }
          ]
        },
        {
          id: "train_2",
          name: "בקרת כרטיסים",
          type: "normal",
          enemyLevel: 1,
          enemyCards: ["אופק טלקר", "הגדלה"],
          rewards: [
            { type: "coins", amount: 60 },
            { type: "unlockItem", item: "הגדלה" }
          ]
        },
        {
          id: "train_3",
          name: "מסילה חסומה",
          type: "normal",
          enemyLevel: 2,
          enemyCards: ["אופק טלקר", "מחשב"],
          rewards: [{ type: "coins", amount: 75 }]
        },
        {
          id: "train_boss",
          name: "אופק הקטר",
          type: "boss",
          enemyLevel: 2,
          enemyStartingBoard: [{ cardName: "אופק הקטר", slot: 2 }],
          rewards: [
            { type: "coins", amount: 200 },
            { type: "unlockItem", item: "רכבת" }
          ]
        }
      ]
    }
  ]
});
