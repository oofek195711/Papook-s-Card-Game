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

  function randomOccupiedSlot(board) {
    const occupied = [];
    board.forEach((card, index) => { if (card) occupied.push(index); });
    if (!occupied.length) return null;
    return occupied[Math.floor(Math.random() * occupied.length)];
  }

  // Called right after ANY card is placed or fused — for the player AND
  // the AI — before the skills phase starts, exactly once. Fires only if
  // the card DIRECTLY FACING the one that was just placed (same lane,
  // opposing board) has a weakness matching the item involved — but the
  // EFFECT itself then lands on a random card somewhere on the opponent's
  // board, not necessarily the one that "has" the weakness. Placement
  // still has to be in the right lane for it to trigger at all; where the
  // hit actually lands afterward is the random part.
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

  register("damage", async ctx => {
    const { facingCard, weakness, defenderOwner, defenderBoard, effects, render, log, damageCard, sound } = ctx;

    const targetIndex = randomOccupiedSlot(defenderBoard);
    if (targetIndex === null) return;
    const targetCard = defenderBoard[targetIndex];

    log(`⚠️ ${weakness.item} היא חולשה של ${facingCard.name}! הפגיעה פוגעת ב-${targetCard.name}.`);
    effects.showSkillBadge(defenderOwner, targetIndex, "⚠️", "חולשה!");
    sound?.playSkill();
    render();
    await effects.wait(400);

    // isSkillDamage=true so damageCard doesn't also play the combat
    // "Hit" sound — the weakness chime above already covers it.
    await damageCard(defenderBoard, targetIndex, weakness.value, weakness.item, true);
  });

  register("stun", async ctx => {
    const { facingCard, weakness, defenderOwner, defenderBoard, effects, render, log, sound } = ctx;

    const targetIndex = randomOccupiedSlot(defenderBoard);
    if (targetIndex === null) return;
    const targetCard = defenderBoard[targetIndex];
    targetCard.stunned = true;

    log(`⚠️ ${weakness.item} היא חולשה של ${facingCard.name}! ${targetCard.name} מסונוור.`);
    effects.showSkillBadge(defenderOwner, targetIndex, "😵", "חולשה!");
    sound?.playSkill();
    render();
    await effects.wait(400);
  });

  return { register, checkTrigger };
})();
