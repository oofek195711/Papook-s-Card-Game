window.CardData = (() => {
  const cards = [
    { name: "אור לוין", type: "character", hp: 22, atk: 5, image: "../images/or.png" },
    { name: "אופק טלקר", type: "character", hp: 24, atk: 4, image: "../images/ofek.png" },
    {
      name: "דור טלקר", type: "character", hp: 20, atk: 5, image: "../images/dor.png",
      weaknesses: [{ item: "חתול", effect: "damage", value: 4 }]
    },
    {
      name: "עומר שמואלי", type: "character", hp: 23, atk: 6, image: "../images/omer.png",
      weaknesses: [{ item: "קטשופ", effect: "damage", value: 4 }]
    },
    {
      name: "תמר גולן", type: "character", hp: 21, atk: 5, image: "../images/tamar.png",
      weaknesses: [{ item: "דגדוגים", effect: "damage", value: 4 }]
    },

    // New characters
    { name: "שחר לוי", type: "character", hp: 22, atk: 5, image: "../images/shahar.png" },
    { name: "עמית גרינברג", type: "character", hp: 23, atk: 5, image: "../images/amit.png" },
    { name: "רותם שמי", type: "character", hp: 21, atk: 6, image: "../images/rotem.png" },
    { name: "תמיר ביטון", type: "character", hp: 24, atk: 4, image: "../images/tamir.png" },
    { name: "יובל מזור", type: "character", hp: 22, atk: 5, image: "../images/yuval.png" },
    { name: "מור יוסף", type: "character", hp: 21, atk: 5, image: "../images/mor.png" },
    { name: "נועה גראור", type: "character", hp: 23, atk: 5, image: "../images/noa.png" },

    { name: "כדור", type: "item", atkBonus: 2, hpBonus: 0, image: "../images/ball.png" },
    { name: "מערכת דיגיי", type: "item", atkBonus: 1, hpBonus: 3, image: "../images/dj.png" },
    { name: "הגדלה", type: "item", atkBonus: 0, hpBonus: 4, image: "../images/bigger.webp" },
    { name: "מדי אומנות לחימה", type: "item", atkBonus: 2, hpBonus: 2, image: "../images/GI.png" },
    { name: "ציפס אמריקאי", type: "item", atkBonus: 1, hpBonus: 3, image: "../images/chips.jpg" },
    { name: "רכב", type: "item", atkBonus: 1, hpBonus: 4, image: "../images/car.png" },
    { name: "בית", type: "item", atkBonus: 0, hpBonus: 8, image: "../images/house.jpg" },
    { name: "חתול", type: "item", atkBonus: 0, hpBonus: 0, image: "../images/cat.png" },
    { name: "קטשופ", type: "item", atkBonus: 0, hpBonus: 0, image: "../images/ketshup.png" },
    { name: "דגדוגים", type: "item", atkBonus: 0, hpBonus: 0, image: "../images/digdugim.png" },
    { name: "מיקרופון", type: "item", atkBonus: 0, hpBonus: 0, image: "../images/microphone.webp" },
    { name: "רכבת", type: "item", atkBonus: 2, hpBonus: 3, image: "../images/train.jpg" },
    { name: "מכחול", type: "item", atkBonus: 1, hpBonus: 2, image: "../images/mikhol.jpg" },
    { name: "מחשב", type: "item", atkBonus: 2, hpBonus: 2, image: "../images/computer.jpg" },

    // New items
    { name: "צמח", type: "item", atkBonus: 0, hpBonus: 3, image: "../images/plant.png" },
    { name: "ציוד רופא", type: "item", atkBonus: 1, hpBonus: 2, image: "../images/doctor_kit.png" },
    { name: "חוף ים", type: "item", atkBonus: 2, hpBonus: 3, image: "../images/beach.png" }
  ];

  /*
    Skills use this structure:
    { type: "punch", value: 3, trigger: "beforeAttack", icon: "👊" }

    Built-in skill types in skills.js:
    punch    - random damage to an enemy card
    heal     - heals a damaged friendly card
    motivate - temporary attack buff to adjacent cards
    shield   - absorbs incoming damage
    stun     - the enemy card in the same lane skips its next attack
    revive   - brings a card back from this owner's graveyard onto an
               empty slot (player picks via a popup, AI picks automatically)

    Triggers currently resolved by the engine (script.js):
    beforeAttack - right after a card is placed/fused, before the attack phase
    onFusion     - right after THIS card was just created by a Fusion
                   (scoped only to the slot that was just fused, so other
                   onFusion cards already on the board don't re-trigger)

    Weaknesses use this structure (array, a character can have several):
    weaknesses: [{ item: "קטשופ", effect: "damage", value: 4 }]

    UNLIKE skills, a weakness is triggered by the OPPONENT: if they place
    (or fuse) a card carrying that item name directly in the lane facing
    this character, the effect fires immediately — before the skills
    phase even starts. See weaknesses.js for the effect resolvers
    ("damage", "stun", ...) and script.js's resolveWeaknessTrigger() for
    where it's called in the turn flow.
  */

  // Fusion combos all live in combos.js (organized in blocks, one per
  // character, within that single file), which merges its entries into
  // window.CardCombos. This used to be split into one file per character
  // under a combos/ folder — flattened to a single file because nested
  // folders don't reliably survive a drag-and-drop GitHub upload.
  //
  // IMPORTANT: combos.js must be loaded via <script> BEFORE this file
  // (cards.js) in index.html, since we read window.CardCombos here at
  // load time.
  const combos = window.CardCombos || {};

  return { cards, combos };
})();
