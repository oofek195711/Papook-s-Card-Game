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

  function chooseMove({ hand, board, canFuse }) {
    if (hand.length === 0) return null;

    const fusion = findFusionMove(hand, board, canFuse);
    if (fusion) return { type: "fusion", ...fusion };

    const emptySlot = board.findIndex(card => card === null);
    if (emptySlot === -1) return null;

    const characterIndex = hand.findIndex(card => card.type === "character");
    const handIndex = characterIndex !== -1 ? characterIndex : 0;

    return {
      type: "place",
      handIndex,
      slotIndex: emptySlot
    };
  }

  return { chooseMove };
})();
