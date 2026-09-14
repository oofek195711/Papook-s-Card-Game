window.SkillEngine = (() => {
  const registry = new Map();

  function register(type, resolver) {
    registry.set(type, resolver);
  }

  // Skills scale with the CARD'S level (the same level everything else
  // already uses, from its Card Instance in Progression) — a Lv.1 Shield
  // and a Lv.5 Shield of the same combo now actually feel different, not
  // just the card's raw ATK/HP catching up. +1 to the skill's value per
  // level above 1. Never mutates the shared skill definition itself
  // (that stays identical for every card of that combo) — this only
  // computes an effective value at the moment a skill actually resolves,
  // or when the card renders its own tooltip preview.
  function getScaledSkillValue(skill, card) {
    const level = card?.level || 1;
    return skill.value + (level - 1);
  }

  // Plain-language name + description for the tap-to-explain tooltip
  // (see script.js's skill-slot click handling) — reuses the exact same
  // skill.value each resolver already acts on, just described in words
  // instead of only shown as an icon. Never invents new skill behavior.
  const SKILL_INFO = {
    punch: { name: "אגרוף", icon: "👊", description: value => `פוגע בקלף אקראי אצל היריב ב-${value} נזק.` },
    heal: { name: "ריפוי", icon: "❤️", description: value => `מרפא קלף פצוע אצלכם ב-${value} חיים.` },
    motivate: { name: "עידוד", icon: "📣", description: value => `מוסיף ${value} להתקפה של הקלפים הסמוכים, לתור הזה בלבד.` },
    shield: { name: "מגן", icon: "🛡️", description: value => `נותן לקלף מגן שסופג עד ${value} נזק לפני שהוא נפגע בעצמו.` },
    stun: { name: "סינוור", icon: "😵", description: () => `מסנוור את הקלף שממול — הוא ידלג על ההתקפה הבאה שלו.` },
    revive: { name: "החייאה", icon: "✨", description: () => `מחזיר קלף מה-Graveyard לזירה, בחיים מלאים.` },
    splash: { name: "התזה", icon: "💥", description: value => `כשהקלף תוקף קלף שממול, גם הקלפים משני צדדיו סופגים ${value} נזק.` },
    rage: { name: "זעם", icon: "😡", description: value => `כל פעם שהקלף תוקף, ההתקפה שלו עולה ב-${value} לצמיתות.` },
    poison: { name: "הרעלה", icon: "☠️", description: value => `מרעיל את הקלף שממול — הוא מאבד ${value} חיים בכל תור, עד שהוא מת.` }
  };

  async function resolveTrigger(context) {
    // BUGFIX: this used to take `trigger` as a *second* positional argument,
    // but every caller passed it as a field inside the single context object.
    // That mismatch meant `trigger` was always undefined here, so
    // `skill.trigger === trigger` was always false and NO skill ever fired.
    // Now `trigger` (and the optional `onlySlotIndex` scoping) are read
    // straight off the context object.
    const { owner, board, trigger, onlySlotIndex } = context;

    for (let slotIndex = 0; slotIndex < board.length; slotIndex++) {
      if (onlySlotIndex !== undefined && slotIndex !== onlySlotIndex) continue;

      const card = board[slotIndex];
      if (!card?.skills?.length) continue;

      const relevantSkills = card.skills.filter(skill => skill.trigger === trigger);

      for (const skill of relevantSkills) {
        const resolver = registry.get(skill.type);

        if (!resolver) {
          console.warn(`Unknown skill type: ${skill.type}`);
          continue;
        }

        // Generic "a skill just activated" sound cue — lives here once
        // instead of inside every individual skill resolver, so any new
        // skill type automatically gets it for free.
        window.GameSound?.playSkill();

        await resolver({
          ...context,
          card,
          slotIndex,
          skill,
          owner
        });

        if (context.isGameOver()) return;
      }
    }
  }

  function randomOccupiedIndex(board) {
    const indexes = board
      .map((card, index) => card ? index : -1)
      .filter(index => index !== -1);

    if (indexes.length === 0) return -1;
    return indexes[Math.floor(Math.random() * indexes.length)];
  }

  register("punch", async context => {
    const {
      enemyBoard,
      owner,
      slotIndex,
      skill,
      card,
      effects,
      damageCard,
      log
    } = context;

    const targetIndex = randomOccupiedIndex(enemyBoard);
    if (targetIndex === -1) {
      log(`${card.name}: אין קלף אויב לאגרוף.`);
      return;
    }

    const value = getScaledSkillValue(skill, card);
    effects.showSkillBadge(owner, slotIndex, skill.icon || "👊", "אגרוף");
    log(`${card.name} הפעיל אגרוף!`);
    await effects.wait(350);
    await damageCard(enemyBoard, targetIndex, value, card.name, true);
    await effects.wait(200);
  });

  register("heal", async context => {
    const {
      board,
      owner,
      slotIndex,
      skill,
      card,
      effects,
      render,
      log
    } = context;

    const damagedIndexes = board
      .map((c, index) => c && c.hp < c.maxHp ? index : -1)
      .filter(index => index !== -1);

    if (damagedIndexes.length === 0) {
      log(`${card.name}: אין קלף פצוע לריפוי.`);
      return;
    }

    const targetIndex = damagedIndexes[Math.floor(Math.random() * damagedIndexes.length)];
    const target = board[targetIndex];
    const value = getScaledSkillValue(skill, card);
    const healed = Math.min(value, target.maxHp - target.hp);

    if (healed <= 0) return;

    effects.showSkillBadge(owner, slotIndex, skill.icon || "❤️", "ריפוי");
    await effects.wait(250);

    target.hp += healed;
    render();

    const targetElement = document.querySelector(
      `.slot[data-owner="${owner}"][data-index="${targetIndex}"] .card`
    );

    if (targetElement) effects.showHealNumber(targetElement, healed);

    log(`${card.name} ריפא את ${target.name} ב-${healed}.`);
    await effects.wait(450);
  });

  register("motivate", async context => {
    const {
      board,
      owner,
      slotIndex,
      skill,
      card,
      effects,
      render,
      log
    } = context;

    const adjacentIndexes = [slotIndex - 1, slotIndex + 1]
      .filter(index => index >= 0 && index < board.length && board[index]);

    if (adjacentIndexes.length === 0) {
      log(`${card.name}: אין קלפים סמוכים לחיזוק.`);
      return;
    }

    const value = getScaledSkillValue(skill, card);
    effects.showSkillBadge(owner, slotIndex, skill.icon || "📣", "עידוד");

    for (const targetIndex of adjacentIndexes) {
      board[targetIndex].tempAttackBonus =
        (board[targetIndex].tempAttackBonus || 0) + value;
    }

    render();
    log(`${card.name} חיזק את הקלפים שלידו ב-${value} התקפה לתור הזה.`);
    await effects.wait(500);
  });

  register("shield", async context => {
    const {
      card,
      owner,
      slotIndex,
      skill,
      effects,
      render,
      log
    } = context;

    const value = getScaledSkillValue(skill, card);
    card.shield = Math.max(card.shield || 0, value);

    effects.showSkillBadge(owner, slotIndex, skill.icon || "🛡️", "מגן");
    render();
    log(`${card.name} קיבל מגן של ${value}.`);
    await effects.wait(450);
  });

  // Stun / Disable: makes the enemy card in the same lane skip its NEXT
  // attack. It only marks the card here (`target.stunned = true`) — the
  // actual "skip the attack" logic lives in script.js's autoAttack(), which
  // is where attacks actually happen and where the flag gets consumed.
  register("stun", async context => {
    const {
      enemyBoard,
      owner,
      slotIndex,
      skill,
      card,
      effects,
      render,
      log
    } = context;

    const target = enemyBoard[slotIndex];

    if (!target) {
      log(`${card.name}: אין קלף מול לסנוור.`);
      return;
    }

    target.stunned = true;

    effects.showSkillBadge(owner, slotIndex, skill.icon || "🚂", "סנוור");
    render();
    log(`${card.name} סינוור את ${target.name} — הוא ידלג על ההתקפה הבאה שלו.`);
    await effects.wait(450);
  });

  // Revive: pulls a card back from the owner's graveyard onto an empty
  // board slot. Needs a real player choice, so it awaits
  // `context.chooseFromGraveyard`, which script.js wires up to either a
  // UI modal (player) or an automatic pick (AI). This is a generic,
  // reusable "player must choose" pattern — any future skill that needs a
  // choice can reuse `chooseFromGraveyard`'s sibling helpers the same way.
  register("revive", async context => {
    const {
      board,
      owner,
      slotIndex,
      skill,
      card,
      effects,
      render,
      log,
      graveyard,
      chooseFromGraveyard,
      createBoardCard
    } = context;

    if (!graveyard || graveyard.length === 0) {
      log(`${card.name}: אין קלפים ב-Graveyard להחיות.`);
      return;
    }

    const emptySlotIndex = board.findIndex(slot => slot === null);

    if (emptySlotIndex === -1) {
      log(`${card.name}: אין מקום פנוי בזירה להחייאה.`);
      return;
    }

    effects.showSkillBadge(owner, slotIndex, skill.icon || "✨", "החייאה");
    await effects.wait(350);

    const chosenIndex = await chooseFromGraveyard(owner, graveyard);
    if (chosenIndex === -1 || chosenIndex == null) return;

    const [revivedSource] = graveyard.splice(chosenIndex, 1);
    const revived = createBoardCard(revivedSource);

    // A card that just died can have hp at 0 (or even negative, on an
    // overkill hit) — createBoardCard's normal `card.hp || 12` fallback
    // doesn't handle that correctly. A revive should always come back at
    // full health, using the maxHp it had before it died.
    const restoredHp = revivedSource.maxHp || revivedSource.hp || 12;
    revived.hp = restoredHp;
    revived.maxHp = restoredHp;
    // A clean revive — no leftover poison/stun/shield carried over from
    // however the card originally died (createBoardCard's spread would
    // otherwise copy .poison straight from the dead source).
    revived.poison = 0;
    revived.stunned = false;
    revived.shield = 0;

    board[emptySlotIndex] = revived;
    render();

    log(`${card.name} החזיר לקרב את ${revived.name}!`);
    await effects.wait(500);
  });

  // Splash: when this card attacks and actually hits an enemy CARD (not
  // a direct hit to the hero — see hadTarget), the enemy cards in the
  // lanes immediately left/right of that target also take some damage.
  // "onAttack" trigger — resolved from autoAttack() right after this
  // card's own attack lands, not during the earlier beforeAttack phase.
  register("splash", async context => {
    const {
      enemyBoard,
      owner,
      slotIndex,
      skill,
      card,
      hadTarget,
      effects,
      damageCard,
      log
    } = context;

    if (!hadTarget) return; // hit the hero directly — nothing to splash off of

    const adjacentIndexes = [slotIndex - 1, slotIndex + 1]
      .filter(index => index >= 0 && index < enemyBoard.length && enemyBoard[index]);

    if (adjacentIndexes.length === 0) return;

    const value = getScaledSkillValue(skill, card);
    effects.showSkillBadge(owner, slotIndex, skill.icon || "💥", "התזה");
    log(`${card.name} התיז נזק לקלפים הסמוכים.`);

    for (const targetIndex of adjacentIndexes) {
      await damageCard(enemyBoard, targetIndex, value, card.name, true);
    }
  });

  // Rage: every time this card attacks (hitting a card OR the hero
  // directly — doesn't matter which), its own attack permanently goes
  // up for the rest of the battle. Unlike Motivate's tempAttackBonus
  // (resets every turn), this is a lasting increase to the card's own
  // base atk.
  register("rage", async context => {
    const { card, owner, slotIndex, skill, effects, render, log } = context;

    const value = getScaledSkillValue(skill, card);
    card.atk += value;

    effects.showSkillBadge(owner, slotIndex, skill.icon || "😡", "זעם");
    render();
    log(`${card.name} נכנס לזעם — ההתקפה שלו עולה ב-${value} לצמיתות!`);
  });

  // Poison: DOES NOT deal damage itself — it just marks the enemy card
  // directly across (same pattern as Stun) as poisoned. The actual
  // recurring damage happens once per turn via script.js's
  // processPoisonTicks(), called at the start of each side's own turn —
  // poison isn't "a skill firing on a trigger", it's a standing status
  // effect that outlives the single beforeAttack moment it was applied.
  register("poison", async context => {
    const { enemyBoard, owner, slotIndex, skill, card, effects, render, log } = context;

    const target = enemyBoard[slotIndex];
    if (!target) {
      log(`${card.name}: אין קלף מול להרעיל.`);
      return;
    }

    const value = getScaledSkillValue(skill, card);
    target.poison = (target.poison || 0) + value;

    effects.showSkillBadge(owner, slotIndex, skill.icon || "☠️", "הרעלה");
    render();
    log(`${card.name} הרעיל את ${target.name} — הוא יאבד ${target.poison} חיים בכל תור.`);
    await effects.wait(450);
  });

  return {
    register,
    resolveTrigger,
    getScaledSkillValue,
    SKILL_INFO
  };
})();
