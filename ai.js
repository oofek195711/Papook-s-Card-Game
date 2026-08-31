window.GameAI = (() => {
  function findFusionMove(hand, board, canFuse) {
    for (let handIndex = 0; handIndex < hand.length; handIndex++) {
      for (let slotIndex = 0; slotIndex < board.length; slotIndex++) {
        if (board[slotIndex] && canFuse(hand[handIndex], board[slotIndex])) {
          return { handIndex, slotIndex };
        }
      }
    }

    return null;
  }

  // Picks the best EMPTY slot to defend, instead of just "the first empty
  // one" — otherwise a player can place a card in a lane the AI's
  // left-to-right fill never reaches (e.g. slot 5 while the AI is still
  // working through 1-4) and take free, permanent direct damage from it.
  // Prioritizes the enemy's strongest unanswered lane; if several lanes
  // are equally undefended, picks the highest-ATK threat first.
  function chooseDefensiveSlot(board, enemyBoard) {
    let bestSlot = null;
    let bestThreat = -1;

    for (let i = 0; i < board.length; i++) {
      if (board[i] !== null) continue;
      const enemyCard = enemyBoard[i];
      if (!enemyCard) continue;

      const threat = enemyCard.atk || 0;
      if (threat > bestThreat) {
        bestThreat = threat;
        bestSlot = i;
      }
    }

    return bestSlot;
  }

  function chooseMove({ hand, board, enemyBoard, canFuse }) {
    if (hand.length === 0) return null;

    const fusion = findFusionMove(hand, board, canFuse);
    if (fusion) return { type: "fusion", ...fusion };

    const emptySlot = board.findIndex(card => card === null);
    if (emptySlot === -1) return null;

    // Defend the biggest unanswered threat lane if there is one;
    // otherwise fall back to the old "first empty slot" behavior.
    const defensiveSlot = chooseDefensiveSlot(board, enemyBoard || []);
    const targetSlot = defensiveSlot !== null ? defensiveSlot : emptySlot;

    const characterIndex = hand.findIndex(card => card.type === "character");
    const handIndex = characterIndex !== -1 ? characterIndex : 0;

    return {
      type: "place",
      handIndex,
      slotIndex: targetSlot
    };
  }

  return { chooseMove };
})();
