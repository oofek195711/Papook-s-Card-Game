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
  "אור לוין|כדור": {
    name: "אור המאמן",
    image: "../images/or_coach.png",
    atk: 10,
    hp: 30,
    skills: [
      { type: "motivate", value: 2, trigger: "beforeAttack", icon: "📣" }
    ]
  }
});
// Fusion combos for אופק טלקר.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "אופק טלקר|הגדלה": {
    name: "אופק הגדלה",
    image: "../images/metzah.png",
    atk: 12,
    hp: 35
  },

  "אופק טלקר|רכבת": {
    name: "אופק הקטר",
    image: "../images/ofek_train.png",
    atk: 10,
    hp: 30,
    skills: [
      { type: "stun", trigger: "beforeAttack", icon: "🚂" }
    ]
  },

  "אופק טלקר|מחשב": {
    name: "אופק האקדמאי",
    image: "../images/ofek_academic.png",
    atk: 9,
    hp: 28
  }
});
// Fusion combos for דור טלקר.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "דור טלקר|מערכת דיגיי": {
    name: "The fancy dude",
    image: "../images/fancy_dude.jpeg",
    atk: 9,
    hp: 28,
    skills: [
      { type: "heal", value: 3, trigger: "beforeAttack", icon: "❤️" }
    ]
  }
});
// Fusion combos for עומר שמואלי.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "עומר שמואלי|מדי אומנות לחימה": {
    name: "עומר מוריד לקרקע",
    image: "../images/omer_ground.png",
    atk: 11,
    hp: 32,
    skills: [
      { type: "shield", value: 4, trigger: "beforeAttack", icon: "🛡️" }
    ]
  },

  "עומר שמואלי|מחשב": {
    name: "BiGBOY",
    image: "../images/bigboy.png",
    atk: 11,
    hp: 33
  }
});
// Fusion combos for תמר גולן.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "תמר גולן|ציפס אמריקאי": {
    name: "תמר משחקת באוכל",
    image: "../images/tamar_food.png",
    atk: 8,
    hp: 27,
    skills: [
      { type: "punch", value: 3, trigger: "beforeAttack", icon: "👊" }
    ]
  },

  "תמר גולן|מכחול": {
    name: "תמר הציירת",
    image: "../images/tamar_artist.png",
    atk: 7,
    hp: 25
  },

  "תמר גולן|מחשב": {
    name: "תמר מעצבת אתרים",
    image: "../images/tamar_web.png",
    atk: 8,
    hp: 27
  },

  "תמר גולן|חוף ים": {
    name: "תמר חיילת ים",
    image: "../images/tamar_navy.png",
    atk: 10,
    hp: 29,
    skills: [
      { type: "shield", value: 5, trigger: "beforeAttack", icon: "🛡️" }
    ]
  }
});
// Fusion combos for שחר לוי.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "שחר לוי|צמח": {
    name: "שחר הצמחוני",
    image: "../images/shahar_vegan.png",
    atk: 8,
    hp: 25
  }
});
// Fusion combos for עמית גרינברג.
// Key format: "<character name>|<item name>"
window.CardCombos = window.CardCombos || {};

Object.assign(window.CardCombos, {
  "עמית גרינברג|צמח": {
    name: "עמית הטבעוני",
    image: "../images/amit_vegan.png",
    atk: 8,
    hp: 26
  },

  "עמית גרינברג|חוף ים": {
    name: "עמית חייל ים",
    image: "../images/amit_navy.png",
    atk: 10,
    hp: 30,
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
    atk: 7,
    hp: 27
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
    hp: 29,
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
    hp: 28,
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
    atk: 7,
    hp: 26
  }
});
