window.CardData = (() => {
  const cards = [
    {
      name: "אור לוין", type: "character", hp: 16, atk: 8, image: "../images/Or.png",
      // שעון's effect is "stun" (skip next attack), not "damage" — same
      // effect TYPE the stun skill already uses, resolved by the SAME
      // registered "stun" resolver in weaknesses.js, no new effect type
      // needed.
      weaknesses: [{ item: "שעון", effect: "stun" }],
      // Riddle-style hint shown before fighting this boss (see
      // campaign.js's renderLocationMap) — teases the weakness without
      // naming the item outright, so figuring it out (and packing the
      // right counter) is still a real bit of thinking, not a spoiler.
      weaknessHint: "אור אף פעם לא רוצה לדעת מה השעה..."
    },
    { name: "אופק טלקר", type: "character", hp: 20, atk: 6, image: "../images/Ofek.png" },
    {
      name: "דור טלקר", type: "character", hp: 13, atk: 9, image: "../images/Dor.png",
      weaknesses: [{ item: "חתול", effect: "damage", percentOfMaxHp: 30 }],
      weaknessHint: "דור לא יכול לראות את החיה הזאת..."
    },
    {
      name: "עומר שמואלי", type: "character", hp: 14, atk: 10, image: "../images/Omer.png",
      weaknesses: [{ item: "קטשופ", effect: "damage", percentOfMaxHp: 30 }],
      weaknessHint: "מה עומר שונא?"
    },
    {
      name: "תמר גולן", type: "character", hp: 15, atk: 8, image: "../images/Tamar.png",
      weaknesses: [{ item: "דגדוגים", effect: "damage", percentOfMaxHp: 30 }],
      weaknessHint: "נסו לחשוב - למה תמר רגישה ממש?"
    },

    // New characters
    { name: "שחר לוי", type: "character", hp: 17, atk: 7, image: "../images/Shahar.png" },
    { name: "עמית גרינברג", type: "character", hp: 18, atk: 7, image: "../images/Amit.png" },
    { name: "רותם שמי", type: "character", hp: 14, atk: 9, image: "../images/Rotem.png" },
    { name: "תמיר ביטון", type: "character", hp: 19, atk: 6, image: "../images/Tamir.png" },
    { name: "יובל מזור", type: "character", hp: 16, atk: 8, image: "../images/Yuval.png" },
    { name: "מור יוסף", type: "character", hp: 17, atk: 7, image: "../images/Mor.png" },
    { name: "נועה גראור", type: "character", hp: 16, atk: 8, image: "../images/Noa.png" },
    // Balanced stats for now (matches the roster's "average" profile,
    // like אור/יובל/נועה) — easy to shift once there's an actual combo
    // theme for her to lean into.
    { name: "שני", type: "character", hp: 16, atk: 8, image: "../images/Shani.png" },

    { name: "כדור", type: "item", atkBonus: 2, hpBonus: 0, image: "../images/Ball.png" },
    { name: "מערכת דיגיי", type: "item", atkBonus: 2, hpBonus: 2, image: "../images/Dj.png" },
    { name: "הגדלה", type: "item", atkBonus: 1, hpBonus: 3, image: "../images/Bigger.webp" },
    { name: "מדי אומנות לחימה", type: "item", atkBonus: 2, hpBonus: 2, image: "../images/GI.png" },
    { name: "ציפס אמריקאי", type: "item", atkBonus: 2, hpBonus: 2, image: "../images/Chips.jpg" },
    { name: "רכב", type: "item", atkBonus: 2, hpBonus: 3, image: "../images/Car.png" },
    { name: "בית", type: "item", atkBonus: 1, hpBonus: 5, image: "../images/House.jpg" },

    // חתול/קטשופ/דגדוגים are primarily WEAKNESS-trigger items (see the
    // weaknesses[] arrays above) — used to be 0/0 for regular Fusion,
    // meaning fusing them accomplished literally nothing. Now a small
    // +1/+1 so they're always worth using, even before their weakness
    // matters. מיקרופון has no combo yet either, same small bump ready
    // for whenever it does.
    { name: "חתול", type: "item", atkBonus: 1, hpBonus: 1, image: "../images/Cat.png" },
    { name: "קטשופ", type: "item", atkBonus: 1, hpBonus: 1, image: "../images/Ketshup.png" },
    { name: "דגדוגים", type: "item", atkBonus: 1, hpBonus: 1, image: "../images/Digdugim.png" },
    { name: "מיקרופון", type: "item", atkBonus: 1, hpBonus: 1, image: "../images/Microphone.png" },
    { name: "רכבת", type: "item", atkBonus: 3, hpBonus: 2, image: "../images/Train.jpg" },
    { name: "מכחול", type: "item", atkBonus: 2, hpBonus: 2, image: "../images/Mikhol.jpg" },
    { name: "מחשב", type: "item", atkBonus: 2, hpBonus: 2, image: "../images/Computer.jpg" },

    // New items
    { name: "צמח", type: "item", atkBonus: 1, hpBonus: 2, image: "../images/Plant.png" },
    { name: "חול", type: "item", atkBonus: 2, hpBonus: 1, image: "../images/Sand.jpg" },
    // Primarily a WEAKNESS-trigger item for אור לוין (see his
    // weaknesses[] above) — same small +1/+1 pattern already used for
    // the other weakness-only items (חתול/קטשופ/דגדוגים/מיקרופון), so
    // fusing it still does SOMETHING even outside that specific matchup.
    { name: "שעון", type: "item", atkBonus: 1, hpBonus: 1, image: "../images/Watch.png" },
    { name: "ציוד רופא", type: "item", atkBonus: 1, hpBonus: 2, image: "../images/Doctor_Kit.png" },
    { name: "חוף ים", type: "item", atkBonus: 3, hpBonus: 2, image: "../images/Beach.jpg" },

    // New items
    { name: "המבורגר", type: "item", atkBonus: 2, hpBonus: 2, image: "../images/Hamburger.png" },
    { name: "ספה", type: "item", atkBonus: 1, hpBonus: 3, image: "../images/Soffa.png" },
    { name: "יין", type: "item", atkBonus: 2, hpBonus: 2, image: "../images/Wine.png" },
    { name: "בעל הבית", type: "item", atkBonus: 2, hpBonus: 3, image: "../images/BaalHabait.png" }
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
    weaknesses: [{ item: "קטשופ", effect: "damage", percentOfMaxHp: 30 }]
    ("damage" scales with the TARGET's own max HP — percentOfMaxHp:30
    means 30% of it, rounded up, min 1 — so it stays meaningful whether
    the target is a fresh level-1 card or a heavily-boosted boss, not a
    flat number that mattered early on and became trivial later.
    "stun" ignores this field entirely — it has no magnitude, it's
    binary.)

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
