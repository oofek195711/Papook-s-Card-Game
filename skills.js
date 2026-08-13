window.SkillEngine = (() => {
  const registry = new Map();

  function register(type, resolver) {
    registry.set(type, resolver);
  }

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
      effects,
      damageCard,
      log
    } = context;

    const targetIndex = randomOccupiedIndex(enemyBoard);
    if (targetIndex === -1) {
      log(`${context.card.name}: אין קלף אויב לאגרוף.`);
      return;
    }

    effects.showSkillBadge(owner, slotIndex, skill.icon || "👊", "אגרוף");
    log(`${context.card.name} הפעיל אגרוף!`);
    await effects.wait(350);
    await damageCard(enemyBoard, targetIndex, skill.value, context.card.name, true);
    await effects.wait(200);
  });

  register("heal", async context => {
    const {
      board,
      owner,
      slotIndex,
      skill,
      effects,
      render,
      log
    } = context;

    const damagedIndexes = board
      .map((card, index) => card && card.hp < card.maxHp ? index : -1)
      .filter(index => index !== -1);

    if (damagedIndexes.length === 0) {
      log(`${context.card.name}: אין קלף פצוע לריפוי.`);
      return;
    }

    const targetIndex = damagedIndexes[Math.floor(Math.random() * damagedIndexes.length)];
    const target = board[targetIndex];
    const healed = Math.min(skill.value, target.maxHp - target.hp);

    if (healed <= 0) return;

    effects.showSkillBadge(owner, slotIndex, skill.icon || "❤️", "ריפוי");
    await effects.wait(250);

    target.hp += healed;
    render();

    const targetElement = document.querySelector(
      `.slot[data-owner="${owner}"][data-index="${targetIndex}"] .card`
    );

    if (targetElement) effects.showHealNumber(targetElement, healed);

    log(`${context.card.name} ריפא את ${target.name} ב-${healed}.`);
    await effects.wait(450);
  });

  register("motivate", async context => {
    const {
      board,
      owner,
      slotIndex,
      skill,
      effects,
      render,
      log
    } = context;

    const adjacentIndexes = [slotIndex - 1, slotIndex + 1]
      .filter(index => index >= 0 && index < board.length && board[index]);

    if (adjacentIndexes.length === 0) {
      log(`${context.card.name}: אין קלפים סמוכים לחיזוק.`);
      return;
    }

    effects.showSkillBadge(owner, slotIndex, skill.icon || "📣", "עידוד");

    for (const targetIndex of adjacentIndexes) {
      board[targetIndex].tempAttackBonus =
        (board[targetIndex].tempAttackBonus || 0) + skill.value;
    }

    render();
    log(`${context.card.name} חיזק את הקלפים שלידו ב-${skill.value} התקפה לתור הזה.`);
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

    card.shield = Math.max(card.shield || 0, skill.value);

    effects.showSkillBadge(owner, slotIndex, skill.icon || "🛡️", "מגן");
    render();
    log(`${card.name} קיבל מגן של ${skill.value}.`);
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

    board[emptySlotIndex] = revived;
    render();

    log(`${card.name} החזיר לקרב את ${revived.name}!`);
    await effects.wait(500);
  });

  return {
    register,
    resolveTrigger
  };
})();
