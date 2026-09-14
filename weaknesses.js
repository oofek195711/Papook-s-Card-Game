// Weakness engine. Deliberately SEPARATE from skills.js's Skill Engine,
// because it's the opposite kind of event: a skill is "my card does
// something", a weakness is "the OPPONENT placed something, and it hurts
// ME because of where they put it". Same modular register()/resolve()
// shape as skills.js on purpose — new effect types (attack reduction,
// remove shield, ...) just need a new register() call here, never an
// `if (card.name === ...)` anywhere in the battle engine.
window.WeaknessEngine = (() => {
  const registry = new Map();

  function register(effectType, resolver) {
    registry.set(effectType, resolver);
  }

  // Called right after ANY card is placed or fused — for the player AND
  // the AI — before the skills phase starts, exactly once. Fires only if
  // the card DIRECTLY FACING the one that was just placed (same lane,
  // opposing board) has a weakness matching the item involved — and the
  // effect lands directly on THAT card (the one with the weakness), not
  // a random card elsewhere on the board.
  //
  // "The item that was involved" is `placedCard.item` if this was a
  // Fusion (every fused card carries the item's name in `.item`, even a
  // named combo — see fuseCards), or `placedCard.name` itself if it's a
  // standalone item card placed with no target — so a weakness to
  // "קטשופ" triggers whether קטשופ was dropped alone OR fused into some
  // other character.
  async function checkTrigger(context) {
    const { placedCard, defenderBoard, slotIndex, isGameOver } = context;
    if (!placedCard) return;

    const facingCard = defenderBoard[slotIndex];
    if (!facingCard || !facingCard.weaknesses?.length) return;

    const triggeringItemName = placedCard.item || placedCard.name;
    const matched = facingCard.weaknesses.find(w => w.item === triggeringItemName);
    if (!matched) return;

    const resolver = registry.get(matched.effect);
    if (!resolver) {
      console.warn(`Weakness: unknown effect type "${matched.effect}"`);
      return;
    }

    await resolver({ ...context, facingCard, weakness: matched });
    if (isGameOver()) return;
  }

  // Both effects now hit the card that ACTUALLY has the weakness,
  // directly — not a random card somewhere on the board. slotIndex is
  // exactly where facingCard sits (see checkTrigger: facingCard =
  // defenderBoard[slotIndex]), so it's the correct target already,
  // no need to pick one.
  register("damage", async ctx => {
    const { facingCard, weakness, defenderOwner, defenderBoard, slotIndex, effects, render, log, damageCard, sound } = ctx;

    log(`⚠️ ${weakness.item} היא חולשה של ${facingCard.name}! הפגיעה פוגעת בו ישירות.`);
    effects.showSkillBadge(defenderOwner, slotIndex, "⚠️", "חולשה!");
    sound?.playSkill();
    render();
    await effects.wait(400);

    // isSkillDamage=true so damageCard doesn't also play the combat
    // "Hit" sound — the weakness chime above already covers it.
    await damageCard(defenderBoard, slotIndex, weakness.value, weakness.item, true);
  });

  register("stun", async ctx => {
    const { facingCard, weakness, defenderOwner, defenderBoard, slotIndex, effects, render, log, sound } = ctx;

    facingCard.stunned = true;

    log(`⚠️ ${weakness.item} היא חולשה של ${facingCard.name}! הוא מסונוור.`);
    effects.showSkillBadge(defenderOwner, slotIndex, "😵", "חולשה!");
    sound?.playSkill();
    render();
    await effects.wait(400);
  });

  return { register, checkTrigger };
})();
