// ALL fusion combos in ONE file, organized by character (one block per
// character, same content as before — just consolidated).
//
// This used to be split into combos/<character>.js, one file per
// character, in its own folder. That's a nicer structure to work in, but
// nested folders (especially a folder inside a folder, like
// combos/x.js) sometimes don't survive a drag-and-drop upload to GitHub
// — which is exactly what happened and broke the deployed game. This
// single flat file has no folder-upload risk at all.
//
// Adding a combo for an EXISTING character: find their block below (each
// one still has its own comment header) and add to it.
// Adding a combo for a BRAND NEW character: add a new block at the
// bottom, in the same "window.CardCombos = window.CardCombos || {};
// Object.assign(window.CardCombos, {...})" shape as the others.

// Fusion combos for אור לוין.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  // NOTE: this used to be "אור המאמן" (motivate skill). Replaced with
  // "אור החלוץ" per the new כדור soccer-position set — same key
  // ("אור לוין|כדור") can only point to one result, so the old combo is
  // gone now. Flagging this clearly since it's a real content change,
  // not just an addition.
  "אור לוין|כדור": {
    name: "אור החלוץ",
    image: "../images/Or_Ball.png",
    atk: 13,
    hp: 18
  },

  "אור לוין|המבורגר": {
    name: "אור המלצר",
    image: "../images/Or_Hamburger.png",
    atk: 11,
    hp: 19
  }
});
// Fusion combos for אופק טלקר.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "אופק טלקר|הגדלה": {
    name: "אופק הגדלה",
    image: "../images/metzah.png",
    atk: 10,
    hp: 24
  },

  "אופק טלקר|רכבת": {
    name: "אופק הקטר",
    image: "../images/ofek_train.png",
    atk: 11,
    hp: 21,
    skills: [
      { type: "stun", trigger: "beforeAttack", icon: "🚂" }
    ]
  },

  "אופק טלקר|מחשב": {
    name: "אופק האקדמאי",
    image: "../images/ofek_academic.png",
    atk: 10,
    hp: 20
  },

  "אופק טלקר|כדור": {
    name: "אופק הבלם",
    image: "../images/Ofek_Ball.png",
    atk: 10,
    hp: 22,
    skills: [
      { type: "shield", value: 4, trigger: "beforeAttack", icon: "🛡️" }
    ]
  },

  "אופק טלקר|המבורגר": {
    name: "אופק המלצר",
    image: "../images/Ofek_Hamburger.png",
    atk: 10,
    hp: 20
  }
});
// Fusion combos for דור טלקר.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "דור טלקר|מערכת דיגיי": {
    name: "The fancy dude",
    image: "../images/fancy_dude.jpeg",
    atk: 11,
    hp: 19,
    skills: [
      { type: "heal", value: 3, trigger: "beforeAttack", icon: "❤️" }
    ]
  },

  "דור טלקר|המבורגר": {
    name: "דור הברמן",
    image: "../images/Dor_Hamburger.png",
    atk: 10,
    hp: 18
  }
});
// Fusion combos for עומר שמואלי.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "עומר שמואלי|מדי אומנות לחימה": {
    name: "עומר מוריד לקרקע",
    image: "../images/omer_ground.png",
    atk: 12,
    hp: 20,
    skills: [
      { type: "shield", value: 4, trigger: "beforeAttack", icon: "🛡️" }
    ]
  },

  "עומר שמואלי|מחשב": {
    name: "BiGBOY",
    image: "../images/bigboy.png",
    atk: 12,
    hp: 21
  },

  "עומר שמואלי|כדור": {
    name: "עומר המגן",
    image: "../images/Omer_Ball.png",
    atk: 12,
    hp: 19,
    skills: [
      { type: "motivate", value: 2, trigger: "beforeAttack", icon: "📣" }
    ]
  },

  "עומר שמואלי|המבורגר": {
    name: "עומר הברמן",
    image: "../images/Omer_Hamburger.png",
    atk: 11,
    hp: 19
  }
});
// Fusion combos for תמר גולן.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "תמר גולן|ציפס אמריקאי": {
    name: "תמר משחקת באוכל",
    image: "../images/tamar_food.png",
    atk: 11,
    hp: 18,
    skills: [
      { type: "punch", value: 3, trigger: "beforeAttack", icon: "👊" }
    ]
  },

  "תמר גולן|מכחול": {
    name: "תמר הציירת",
    image: "../images/Tamar_Mikhol.png",
    atk: 10,
    hp: 17
  },

  "תמר גולן|מחשב": {
    name: "תמר מעצבת אתרים",
    image: "../images/Tamar_PC.png",
    atk: 10,
    hp: 17
  },

  "תמר גולן|חוף ים": {
    name: "תמר חיילת ים",
    image: "../images/tamar_navy.png",
    atk: 12,
    hp: 19,
    skills: [
      { type: "shield", value: 5, trigger: "beforeAttack", icon: "🛡️" }
    ]
  },

  "תמר גולן|המבורגר": {
    name: "תמר המארחת",
    image: "../images/Tamar_Hamburger.png",
    atk: 10,
    hp: 17
  }
});
// Fusion combos for שחר לוי.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "שחר לוי|צמח": {
    name: "שחר הצמחוני",
    image: "../images/shahar_vegan.png",
    atk: 9,
    hp: 18
  },

  "שחר לוי|המבורגר": {
    name: "שחר המבקרת",
    image: "../images/shahar_critic.png",
    atk: 11,
    hp: 19,
    skills: [
      { type: "punch", value: 3, trigger: "beforeAttack", icon: "👊" }
    ]
  },

  "שחר לוי|ספה": {
    name: "שחר הפסיכולוגית",
    image: "../images/shahar_psychologist.png",
    atk: 9,
    hp: 20,
    skills: [
      { type: "heal", value: 4, trigger: "beforeAttack", icon: "❤️" }
    ]
  }
});
// Fusion combos for עמית גרינברג.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "עמית גרינברג|צמח": {
    name: "עמית הטבעוני",
    image: "../images/amit_vegan.png",
    atk: 9,
    hp: 19
  },

  "עמית גרינברג|חוף ים": {
    name: "עמית חייל ים",
    image: "../images/amit_navy.png",
    atk: 12,
    hp: 20,
    skills: [
      { type: "shield", value: 5, trigger: "beforeAttack", icon: "🛡️" }
    ]
  }
});
// Fusion combos for רותם שמי.
// Key format: "<character name>|<item name>"
// No combos defined yet — add them here when you have one.
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
});
// Fusion combos for תמיר ביטון.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "תמיר ביטון|צמח": {
    name: "תמיר הטבעוני",
    image: "../images/tamir_vegan.png",
    atk: 8,
    hp: 20
  }
});
// Fusion combos for יובל מזור.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "יובל מזור|ציוד רופא": {
    name: "יובל הרופא",
    image: "../images/yuval_doctor.png",
    atk: 9,
    hp: 19,
    skills: [
      { type: "heal", value: 4, trigger: "beforeAttack", icon: "❤️" }
    ]
  }
});
// Fusion combos for מור יוסף.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "מור יוסף|ציוד רופא": {
    name: "מור האחות",
    image: "../images/mor_nurse.png",
    atk: 9,
    hp: 18,
    skills: [
      { type: "revive", trigger: "onFusion", icon: "✨" }
    ]
  }
});
// Fusion combos for נועה גראור.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "נועה גראור|צמח": {
    name: "נועה הצמחונית",
    image: "../images/noa_vegan.png",
    atk: 9,
    hp: 19
  }
});
