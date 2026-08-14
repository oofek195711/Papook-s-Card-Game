const { cards, combos } = window.CardData;
const effects = window.GameEffects;
const skills = window.SkillEngine;
const ai = window.GameAI;
const sound = window.GameSound;

const MAX_HP = 30;
const BOARD_SIZE = 5;

let playerHp = MAX_HP;
let aiHp = MAX_HP;

let playerHand = [];
let aiHand = [];
let playerBoard = Array(BOARD_SIZE).fill(null);
let aiBoard = Array(BOARD_SIZE).fill(null);

let playerGraveyard = [];
let aiGraveyard = [];

let turn = "player";
let turnNumber = 1;
let actionLocked = false;
let gameEnded = false;
let draggedCardIndex = null;

// Which campaign stage (if any) this battle belongs to. null = a normal
// "quick battle" from the Home screen's PLAY button. Set by startGame().
let currentBattleConfig = null;

// Touch drag state
let mobileDragGhost = null;
let mobileDraggedElement = null;
let mobileHoveredSlot = null;

// Builds the AI's deck from a plain card-definition pool (characters +
// items), tripled — same as before. Used for the opponent only; the
// player's deck works completely differently now (see createPlayerDeck).
function createEnemyDeck(cardPool) {
  const deck = [];

  for (let i = 0; i < 3; i++) {
    cardPool.forEach(card => deck.push(structuredClone(card)));
  }

  return deck.sort(() => Math.random() - 0.5);
}

// Turns one owned character INSTANCE (see progression.js) into
// an actual playable card, with that instance's level baked into atk/hp
// right now — nothing downstream needs to look the level up again.
function buildPlayerCharacterCard(instance) {
  const base = cards.find(c => c.name === instance.cardName);
  if (!base) return null;

  const leveled = window.Progression.getStatsAtLevel(base.atk, base.hp, instance.level);

  return {
    ...structuredClone(base),
    atk: leveled.atk,
    hp: leveled.hp,
    level: instance.level,
    instanceId: instance.instanceId
  };
}

// Builds the PLAYER's deck from their ACTUAL owned instances instead of
// a generic pool — every owned copy of a character becomes exactly one
// deck card, at its own level. Items aren't instance-based (see
// progression.js), so unlocked items are still just included 3x each.
//
// TEMPORARY until there's a real Deck Builder: this uses the player's
// entire collection as their deck. Deck Builder will replace this with a
// manual pick of specific instances.
function createPlayerDeck() {
  const progress = window.Progression.getProgress();

  const characterCards = progress.ownedInstances
    .map(buildPlayerCharacterCard)
    .filter(Boolean);

  const itemCards = [];
  cards
    .filter(c => c.type === "item" && window.Progression.isItemUnlocked(c.name))
    .forEach(item => {
      for (let i = 0; i < 3; i++) itemCards.push(structuredClone(item));
    });

  return [...characterCards, ...itemCards].sort(() => Math.random() - 0.5);
}

let playerDeck = [];
let aiDeck = [];

function drawCard(owner) {
  if (owner === "player" && playerDeck.length > 0) {
    playerHand.push(playerDeck.pop());
  }

  if (owner === "ai" && aiDeck.length > 0) {
    aiHand.push(aiDeck.pop());
  }
}

// Resets every module-level battle variable back to a fresh game. Used to
// be unnecessary because the only way to play again was a full page
// reload — now that campaign stages can chain one battle into the next
// without leaving the page, this is what makes that safe.
function resetBattleState() {
  playerHp = MAX_HP;
  aiHp = MAX_HP;
  playerHand = [];
  aiHand = [];
  playerBoard = Array(BOARD_SIZE).fill(null);
  aiBoard = Array(BOARD_SIZE).fill(null);
  playerGraveyard = [];
  aiGraveyard = [];
  turn = "player";
  turnNumber = 1;
  actionLocked = false;
  gameEnded = false;
  draggedCardIndex = null;
  currentBattleConfig = null;
}

// Looks up a card definition by its DISPLAY name, checking both the base
// card pool (characters/items) and every Fusion combo's result — so a
// boss stage can pre-place an already-fused card like "אופק הקטר" just
// by name, the same name you'd see in-game.
function findCardDefinitionByName(name) {
  const base = cards.find(c => c.name === name);
  if (base) return { ...base };

  const comboResult = Object.values(combos).find(c => c.name === name);
  if (comboResult) return { ...comboResult, type: "character", isFusion: true };

  return null;
}

// Places a boss (or any pre-set) card directly onto the AI's board at
// battle start. Unlike a normal placement, it does NOT get summoning
// sickness (justPlaced) — the boss is already "at home" here, not
// something that was just fused mid-battle. enemyLevel applies the same
// stage-wide difficulty bump used for the rest of the AI's deck.
function placeBossCard(cardName, slotIndex, enemyLevel) {
  const def = findCardDefinitionByName(cardName);
  if (!def) {
    console.warn(`Campaign: unknown boss card "${cardName}"`);
    return;
  }

  const boardCard = createBoardCard(def);
  boardCard.isFusion = !!def.isFusion;
  boardCard.justPlaced = false;

  if (enemyLevel > 1) {
    const leveled = window.Progression.getStatsAtLevel(boardCard.atk, boardCard.hp, enemyLevel);
    boardCard.atk = leveled.atk;
    boardCard.hp = leveled.hp;
    boardCard.maxHp = leveled.hp;
  }

  aiBoard[slotIndex] = boardCard;
}

// A stage-wide difficulty bump for the AI (battleConfig.enemyLevel) —
// simpler than per-card player leveling: every enemy card in this one
// battle gets the same flat bonus, not saved anywhere. Early bosses use
// a low enemyLevel, later ones higher — see campaign-neighborhood.js.
function applyEnemyLevelToPool(cardPool, enemyLevel) {
  if (!enemyLevel || enemyLevel <= 1) return cardPool;

  return cardPool.map(card => {
    const leveled = { ...card };
    if (leveled.type === "character") {
      const stats = window.Progression.getStatsAtLevel(leveled.atk || 0, leveled.hp || 0, enemyLevel);
      leveled.atk = stats.atk;
      leveled.hp = stats.hp;
    } else {
      const stats = window.Progression.getStatsAtLevel(leveled.atkBonus || 0, leveled.hpBonus || 0, enemyLevel);
      leveled.atkBonus = stats.atk;
      leveled.hpBonus = stats.hp;
    }
    return leveled;
  });
}

function startGame(battleConfig = null) {
  resetBattleState();
  currentBattleConfig = battleConfig;

  const enemyPool = battleConfig?.enemyCards
    ? cards.filter(c => battleConfig.enemyCards.includes(c.name))
    : cards;

  const leveledEnemyPool = applyEnemyLevelToPool(
    enemyPool.length ? enemyPool : cards,
    battleConfig?.enemyLevel
  );

  playerDeck = createPlayerDeck();
  aiDeck = createEnemyDeck(leveledEnemyPool);

  for (let i = 0; i < 4; i++) {
    drawCard("player");
    drawCard("ai");
  }

  if (battleConfig?.enemyStartingBoard?.length) {
    battleConfig.enemyStartingBoard.forEach(entry => {
      placeBossCard(entry.cardName, entry.slot, battleConfig.enemyLevel);
    });
  }

  render();
  log(battleConfig ? `קרב: ${battleConfig.stageName}` : "בחר קלף וגרור אותו למשבצת.");

  if (battleConfig?.enemyStartingBoard?.length) {
    actionLocked = true;
    render();
    resolveSkills("ai", "battleStart").then(() => {
      actionLocked = false;
      render();
    });
  }
}

function render() {
  document.getElementById("playerHp").innerText = playerHp;
  document.getElementById("aiHp").innerText = aiHp;
  document.getElementById("turnText").innerText = turn === "player" ? "שחקן" : "AI";

  document.getElementById("playerHpBar").style.width =
    Math.max(0, (playerHp / MAX_HP) * 100) + "%";

  document.getElementById("aiHpBar").style.width =
    Math.max(0, (aiHp / MAX_HP) * 100) + "%";

  const phaseStatus = document.getElementById("phaseStatus");
  const skipBtn = document.getElementById("skipTurnBtn");
  const handArea = document.getElementById("handArea");

  const isPlayerTurnToAct = turn === "player" && !actionLocked && !gameEnded;
  const stuck = isPlayerTurnToAct && !hasAnyValidPlayerMove();

  // Hand is big while the player can actually act; the moment they play a
  // card (or it's the AI's turn), it shrinks down to a thin peeking strip
  // so the board gets that space back — same feel as Animation Throwdown.
  handArea.classList.toggle("collapsed", !isPlayerTurnToAct);

  skipBtn.classList.toggle("hidden", !stuck);

  if (gameEnded) {
    phaseStatus.innerText = "המשחק הסתיים";
  } else if (actionLocked) {
    phaseStatus.innerText = "מבצע פעולות...";
  } else if (stuck) {
    phaseStatus.innerText = "אין מהלך אפשרי";
  } else if (turn === "player") {
    phaseStatus.innerText = "בחר קלף";
  } else {
    phaseStatus.innerText = "תור היריב";
  }

  renderHand();
  renderBoard("player");
  renderBoard("ai");
}

function renderHand() {
  const handDiv = document.getElementById("playerHand");
  handDiv.innerHTML = "";

  playerHand.forEach((card, index) => {
    const div = document.createElement("div");
    div.className = `card ${card.type}`;
    div.draggable = turn === "player" && !actionLocked && !gameEnded;
    div.innerHTML = getCardHtml(card);

    div.ondragstart = () => {
      if (turn !== "player" || actionLocked || gameEnded) return;

      draggedCardIndex = index;
      setHandDragging(true);
      setTimeout(() => highlightValidSlots(card), 0);
    };

    div.ondragend = () => {
      setTimeout(() => {
        draggedCardIndex = null;
        setHandDragging(false);
        clearSlotHighlights();
        hideFusionPreview();
      }, 100);
    };

    div.onpointerdown = event => {
      if (event.pointerType === "mouse") return;
      if (turn !== "player" || actionLocked || gameEnded) return;

      startMobileCardDrag(event, div, index, card);
    };

    handDiv.appendChild(div);
  });
}

function setHandDragging(active) {
  document.getElementById("handArea").classList.toggle("drag-active", active);
}

function startMobileCardDrag(event, cardElement, handIndex, card) {
  event.preventDefault();

  draggedCardIndex = handIndex;
  mobileDraggedElement = cardElement;
  mobileDraggedElement.classList.add("mobile-selected");
  setHandDragging(true);

  highlightValidSlots(card);

  mobileDragGhost = cardElement.cloneNode(true);
  mobileDragGhost.classList.add("mobile-drag-ghost");
  document.body.appendChild(mobileDragGhost);

  moveMobileDragGhost(event.clientX, event.clientY);
  cardElement.setPointerCapture?.(event.pointerId);

  const moveHandler = moveEvent => {
    moveEvent.preventDefault();
    moveMobileDragGhost(moveEvent.clientX, moveEvent.clientY);
    updateMobileDropTarget(moveEvent.clientX, moveEvent.clientY);
  };

  const endHandler = endEvent => {
    endEvent.preventDefault();

    const slot = getSlotAtPoint(endEvent.clientX, endEvent.clientY);
    cleanupMobileDrag();

    if (slot?.dataset.owner === "player") {
      playCardOnSlot(Number(slot.dataset.index));
    }

    cardElement.removeEventListener("pointermove", moveHandler);
    cardElement.removeEventListener("pointerup", endHandler);
    cardElement.removeEventListener("pointercancel", endHandler);
  };

  cardElement.addEventListener("pointermove", moveHandler);
  cardElement.addEventListener("pointerup", endHandler);
  cardElement.addEventListener("pointercancel", endHandler);
}

function moveMobileDragGhost(x, y) {
  if (!mobileDragGhost) return;

  mobileDragGhost.style.left = `${x}px`;
  mobileDragGhost.style.top = `${y}px`;
}

function getSlotAtPoint(x, y) {
  if (mobileDragGhost) mobileDragGhost.style.display = "none";
  const element = document.elementFromPoint(x, y);
  if (mobileDragGhost) mobileDragGhost.style.display = "";

  return element?.closest?.(".slot") || null;
}

function updateMobileDropTarget(x, y) {
  const slot = getSlotAtPoint(x, y);

  if (mobileHoveredSlot && mobileHoveredSlot !== slot) {
    mobileHoveredSlot.classList.remove("mobile-drop-hover");
    hideFusionPreview();
  }

  mobileHoveredSlot = slot;

  if (!slot || slot.dataset.owner !== "player") return;

  const slotIndex = Number(slot.dataset.index);
  const draggedCard = playerHand[draggedCardIndex];
  const targetCard = playerBoard[slotIndex];

  if (!draggedCard) return;

  if (!targetCard || canFuse(draggedCard, targetCard)) {
    slot.classList.add("mobile-drop-hover");
  }

  if (targetCard && canFuse(draggedCard, targetCard)) {
    showFusionPreview(draggedCard, targetCard, slot);
  }
}

function cleanupMobileDrag() {
  mobileDragGhost?.remove();
  mobileDragGhost = null;

  mobileDraggedElement?.classList.remove("mobile-selected");
  mobileDraggedElement = null;

  mobileHoveredSlot?.classList.remove("mobile-drop-hover");
  mobileHoveredSlot = null;

  setHandDragging(false);
  clearSlotHighlights();
  hideFusionPreview();

  setTimeout(() => {
    draggedCardIndex = null;
  }, 0);
}

function renderBoard(owner) {
  const board = owner === "player" ? playerBoard : aiBoard;
  const boardDiv = document.getElementById(owner === "player" ? "playerBoard" : "aiBoard");

  boardDiv.innerHTML = "";

  for (let index = 0; index < BOARD_SIZE; index++) {
    const slot = document.createElement("div");
    const card = board[index];

    slot.className = `slot ${card ? "filled" : "empty"}`;
    slot.dataset.owner = owner;
    slot.dataset.index = index;
    slot.dataset.slot = index + 1;

    if (card) {
      const cardDiv = document.createElement("div");
      cardDiv.className = `card ${card.type} ${card.isFusion ? "fusion-card" : ""}`;
      cardDiv.innerHTML = getCardHtml(card);
      slot.appendChild(cardDiv);
    }

    if (owner === "player") {
      slot.ondragover = event => {
        event.preventDefault();

        const draggedCard = playerHand[draggedCardIndex];
        const targetCard = playerBoard[index];

        if (!draggedCard) return;

        if (!targetCard) {
          slot.classList.add("valid-place");
        } else if (canFuse(draggedCard, targetCard)) {
          slot.classList.add("valid-fusion");
          showFusionPreview(draggedCard, targetCard, slot);
        }
      };

      slot.ondragleave = () => {
        slot.classList.remove("valid-place", "valid-fusion");
        hideFusionPreview();
      };

      slot.ondrop = event => {
        event.preventDefault();
        event.stopPropagation();

        hideFusionPreview();
        playCardOnSlot(index);
      };
    }

    boardDiv.appendChild(slot);
  }
}

function getCardHtml(card) {
  const buff = card.tempAttackBonus || 0;
  const atkValue = (card.atk ?? card.atkBonus ?? 1) + buff;
  const hpValue = card.hp ?? card.hpBonus ?? 0;

  const visibleSkills = card.skills || [];
  const skillHtml = visibleSkills.length
    ? `<div class="skill-row">
        ${visibleSkills.map(skill =>
          `<div class="skill-slot" title="${skill.type}">${skill.icon || "✨"}</div>`
        ).join("")}
      </div>`
    : "";

  const shieldHtml = card.shield > 0
    ? `<div class="shield-badge">🛡️ ${card.shield}</div>`
    : "";

  const stunHtml = card.stunned
    ? `<div class="stun-badge">😵</div>`
    : "";

  const levelHtml = card.level > 1
    ? `<span class="level-badge">Lv.${card.level}</span>`
    : "";

  return `
    <img src="${card.image}" class="card-img">
    <div class="card-scrim"></div>
    ${card.isFusion ? `<img src="../images/fusion.png" class="fusion-icon">` : ""}
    <h3>${card.name}${levelHtml}</h3>
    ${skillHtml}
    ${shieldHtml}
    ${stunHtml}
    <div class="card-stats">
      <div class="atk-badge ${buff > 0 ? "buffed" : ""}">⚔️ ${atkValue}</div>
      <div class="hp-badge">❤️ ${hpValue}</div>
    </div>
  `;
}

function canFuse(cardA, cardB) {
  if (!cardA || !cardB) return false;

  // Once a card has been fused/upgraded, it's locked: no more combining
  // items into it. (Requirement: "אפשר להתאחד פעם אחת בלבד".)
  if (cardA.isFusion || cardB.isFusion) return false;

  return (
    (cardA.type === "item" && cardB.type === "character") ||
    (cardA.type === "character" && cardB.type === "item")
  );
}

// True if the player has SOME legal action available: an empty slot to
// place any card into, or a hand card that can fuse with something
// already on the board. If this is false, the player is stuck (e.g. the
// board is full of already-fused cards and the hand is all items) and
// the only way forward is the "דלג תור" safety-valve button.
function hasAnyValidPlayerMove() {
  if (playerHand.length === 0) return false;
  if (playerBoard.some(card => card === null)) return true;

  return playerHand.some(card =>
    playerBoard.some(target => canFuse(card, target))
  );
}

async function skipPlayerTurn() {
  if (turn !== "player" || actionLocked || gameEnded) return;
  if (hasAnyValidPlayerMove()) return;

  actionLocked = true;
  clearSlotHighlights();
  hideFusionPreview();
  log("אין מהלך אפשרי — מדלגים על התור.");
  render();

  await resolveAfterPlayerAction(null, false);
}

function highlightValidSlots(card) {
  document.querySelectorAll("#playerBoard .slot").forEach(slot => {
    const index = Number(slot.dataset.index);
    const target = playerBoard[index];

    if (!target) {
      slot.classList.add("valid-place");
    } else if (canFuse(card, target)) {
      slot.classList.add("valid-fusion");
    }
  });
}

function clearSlotHighlights() {
  document.querySelectorAll(".slot").forEach(slot => {
    slot.classList.remove("valid-place", "valid-fusion", "mobile-drop-hover");
  });
}

async function playCardOnSlot(slotIndex) {
  if (turn !== "player" || actionLocked || gameEnded) return;

  const draggedCard = playerHand[draggedCardIndex];
  if (!draggedCard) return;

  const target = playerBoard[slotIndex];

  if (target && !canFuse(draggedCard, target)) {
    log("אי אפשר לשים את הקלף הזה פה.");
    return;
  }

  actionLocked = true;
  clearSlotHighlights();
  hideFusionPreview();

  playerHand.splice(draggedCardIndex, 1);
  draggedCardIndex = null;

  const wasFusion = !!target;

  if (!target) {
    playerBoard[slotIndex] = createBoardCard(draggedCard);
    log(`${draggedCard.name} נכנס לעמדה ${slotIndex + 1}.`);
  } else {
    playerBoard[slotIndex] = fuseCards(draggedCard, target);
  }

  render();

  await resolveWeaknessTrigger("player", slotIndex);
  if (checkGameOver()) return;

  await resolveAfterPlayerAction(slotIndex, wasFusion);
}

function createBoardCard(card) {
  const hp = card.hp || 12;

  return {
    ...structuredClone(card),
    hp,
    maxHp: hp,
    atk: card.atk || Math.max(1, card.atkBonus || 1),
    type: card.type,
    isFusion: false,
    shield: 0,
    tempAttackBonus: 0,
    stunned: false,
    // A card that was just created (fresh placement, fusion, or upgrade)
    // can't attack until the NEXT attack phase. Consumed once in
    // autoAttack(). (Requirement #1: no attacking the turn you're placed.)
    justPlaced: true
  };
}

function fuseCards(cardA, cardB) {
  const character = cardA.type === "character" ? cardA : cardB;
  const item = cardA.type === "item" ? cardA : cardB;

  const combo = combos[`${character.name}|${item.name}`];

  if (combo) {
    effects.playFusion();
    sound.playFusion();

    log(`🔥 FUSION! ${combo.name}`);

    return {
      ...structuredClone(combo),
      type: "character",
      maxHp: combo.hp,
      item: item.name,
      isFusion: true,
      shield: 0,
      tempAttackBonus: 0,
      stunned: false,
      justPlaced: true,
      // Fusion results otherwise wouldn't inherit the source character's
      // weaknesses (they're a whole new object from the combo table) —
      // but a weakness like "תמר → דגדוגים" should still apply to any
      // of her fused forms, not just her un-fused base card.
      weaknesses: character.weaknesses || []
    };
  }

  // Generic upgrade (no combo defined for this character+item pairing):
  // the item's bonus is added to whatever the character's stats ALREADY
  // ARE right now — including any damage it's already taken. This must
  // NOT rebuild the card from its base definition (that used to reset
  // hp back up, silently healing it as a side effect of fusing an item).
  const upgraded = structuredClone(character);
  upgraded.atk = (character.atk || 0) + (item.atkBonus || 0);
  upgraded.hp = (character.hp || 0) + (item.hpBonus || 0);
  upgraded.maxHp = (character.maxHp ?? character.hp ?? 0) + (item.hpBonus || 0);
  upgraded.item = item.name;
  upgraded.isFusion = true;
  upgraded.tempAttackBonus = 0;
  upgraded.justPlaced = true;

  log(`${character.name} השתדרג עם ${item.name}.`);
  return upgraded;
}

function getFusionResult(cardA, cardB) {
  if (!canFuse(cardA, cardB)) return null;

  const character = cardA.type === "character" ? cardA : cardB;
  const item = cardA.type === "item" ? cardA : cardB;
  const combo = combos[`${character.name}|${item.name}`];

  if (combo) return combo;

  return {
    name: "שדרוג רגיל",
    image: character.image,
    atk: (character.atk || 1) + (item.atkBonus || 0),
    hp: (character.hp || 12) + (item.hpBonus || 0)
  };
}

function showFusionPreview(cardA, cardB, targetElement) {
  const result = getFusionResult(cardA, cardB);
  if (!result) return;

  let preview = document.getElementById("fusionPreview");

  if (!preview) {
    preview = document.createElement("div");
    preview.id = "fusionPreview";
    preview.className = "fusion-preview";
    document.body.appendChild(preview);
  }

  preview.innerHTML = `
    <div class="fusion-preview-title">${result.name}</div>
    <img src="${result.image}">
    <div class="fusion-preview-stats">⚔️ ${result.atk} | ❤️ ${result.hp}</div>
  `;

  const rect = targetElement.getBoundingClientRect();
  const width = preview.offsetWidth || 135;
  const height = preview.offsetHeight || 120;

  preview.style.left =
    Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2)) + "px";

  preview.style.top =
    Math.max(8, rect.top - height - 8) + "px";
}

function hideFusionPreview() {
  document.getElementById("fusionPreview")?.remove();
}

async function resolveAfterPlayerAction(actionSlotIndex, wasFusion) {
  if (wasFusion) {
    await resolveSkills("player", "onFusion", { onlySlotIndex: actionSlotIndex });
    if (checkGameOver()) return;
  }

  await resolveSkills("player", "beforeAttack");

  if (checkGameOver()) return;

  if (turnNumber > 1) {
    effects.playPhase("ATTACK PHASE!");
    await effects.wait(900);
    await autoAttack("player");
  } else {
    log("הסקילים הופעלו. בתור הראשון אין התקפה רגילה.");
    await effects.wait(650);
  }

  if (checkGameOver()) return;

  turn = "ai";
  render();
  await effects.wait(650);
  await runAiTurn();
}

async function runAiTurn() {
  drawCard("ai");

  const move = ai.chooseMove({
    hand: aiHand,
    board: aiBoard,
    canFuse
  });

  let aiWasFusion = false;
  let aiActionSlotIndex = null;

  if (move) {
    const card = aiHand[move.handIndex];

    if (move.type === "fusion") {
      aiBoard[move.slotIndex] = fuseCards(card, aiBoard[move.slotIndex]);
      log("היריב עשה Fusion.");
      aiWasFusion = true;
    } else {
      aiBoard[move.slotIndex] = createBoardCard(card);
      log(`היריב שם את ${card.name}.`);
    }

    aiActionSlotIndex = move.slotIndex;
    aiHand.splice(move.handIndex, 1);
    render();
    await effects.wait(550);

    await resolveWeaknessTrigger("ai", move.slotIndex);
    if (checkGameOver()) return;
  }

  if (aiWasFusion) {
    await resolveSkills("ai", "onFusion", { onlySlotIndex: aiActionSlotIndex });
    if (checkGameOver()) return;
  }

  await resolveSkills("ai", "beforeAttack");

  if (checkGameOver()) return;

  if (turnNumber > 1) {
    effects.playPhase("AI ATTACK!");
    await effects.wait(900);
    await autoAttack("ai");
  }

  if (checkGameOver()) return;

  turnNumber++;
  turn = "player";
  actionLocked = false;
  drawCard("player");
  render();
  log("התור שלך — בחר קלף.");
}

async function resolveSkills(owner, trigger, options = {}) {
  const board = owner === "player" ? playerBoard : aiBoard;
  const enemyBoard = owner === "player" ? aiBoard : playerBoard;
  const graveyard = owner === "player" ? playerGraveyard : aiGraveyard;

  await skills.resolveTrigger({
    owner,
    board,
    enemyBoard,
    trigger,
    onlySlotIndex: options.onlySlotIndex,
    effects,
    render,
    log,
    damageCard,
    graveyard,
    createBoardCard,
    chooseFromGraveyard,
    isGameOver: () => gameEnded
  });
}

// Weakness check: called right after ANY card is placed or fused, for
// player and AI alike, BEFORE the skills phase. Looks at whatever is
// sitting in the OPPOSING board's same lane, and lets weaknesses.js
// decide if that card's weaknesses match what was just placed. See
// weaknesses.js for the actual effect resolvers.
async function resolveWeaknessTrigger(placedOwner, slotIndex) {
  const ownerBoard = placedOwner === "player" ? playerBoard : aiBoard;
  const defenderBoard = placedOwner === "player" ? aiBoard : playerBoard;
  const defenderOwner = placedOwner === "player" ? "ai" : "player";
  const placedCard = ownerBoard[slotIndex];

  await window.WeaknessEngine.checkTrigger({
    placedCard,
    defenderBoard,
    defenderOwner,
    slotIndex,
    effects,
    render,
    log,
    damageCard,
    sound,
    isGameOver: () => gameEnded
  });
}

// Generic "player must choose" helper for skills like Revive. For the
// human player it opens a popup and waits for a tap; for the AI it picks
// automatically (no UI) so the game never blocks waiting for input that
// will never come. Any future skill that needs a real choice (not just
// Revive) can reuse this same pattern.
async function chooseFromGraveyard(owner, graveyard) {
  if (owner === "player") {
    return await effects.chooseCard(graveyard, "בחר קלף להחיות מה-Graveyard");
  }

  await effects.wait(400);
  if (graveyard.length === 0) return -1;
  return Math.floor(Math.random() * graveyard.length);
}

async function autoAttack(attackerOwner) {
  const attackerBoard = attackerOwner === "player" ? playerBoard : aiBoard;
  const defenderBoard = attackerOwner === "player" ? aiBoard : playerBoard;

  for (let slotIndex = 0; slotIndex < BOARD_SIZE; slotIndex++) {
    const attacker = attackerBoard[slotIndex];
    if (!attacker) continue;

    if (attacker.justPlaced) {
      attacker.justPlaced = false;
      log(`${attacker.name} רק נכנס לזירה ועדיין לא יכול לתקוף.`);
      continue;
    }

    if (attacker.stunned) {
      attacker.stunned = false;
      effects.showSkillBadge(attackerOwner, slotIndex, "😵", "מסונוור");
      log(`${attacker.name} מסונוור ומדלג על ההתקפה שלו.`);
      render();
      await effects.wait(500);
      continue;
    }

    const target = defenderBoard[slotIndex];
    const attackValue = attacker.atk + (attacker.tempAttackBonus || 0);

    effects.animateAttack(attackerOwner, slotIndex, !target);
    await effects.wait(850);

    if (target) {
      await damageCard(defenderBoard, slotIndex, attackValue, attacker.name);
    } else {
      await damagePlayer(
        attackerOwner === "player" ? "ai" : "player",
        attackValue,
        attacker.name
      );
    }

    render();

    if (checkGameOver()) return;
    await effects.wait(300);
  }

  attackerBoard.forEach(card => {
    if (card) card.tempAttackBonus = 0;
  });

  render();
}

async function damageCard(board, slotIndex, damage, attackerName, isSkillDamage = false) {
  const target = board[slotIndex];
  if (!target) return;

  const owner = board === aiBoard ? "ai" : "player";
  const slotElement = document.querySelector(
    `.slot[data-owner="${owner}"][data-index="${slotIndex}"]`
  );

  let remainingDamage = damage;

  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remainingDamage);
    target.shield -= absorbed;
    remainingDamage -= absorbed;

    log(`${target.name} חסם ${absorbed} נזק עם המגן.`);
    render();
    await effects.wait(250);
  }

  if (slotElement && remainingDamage > 0) {
    effects.shakeCard(slotElement);
    effects.showDamageNumber(slotElement, remainingDamage);

    // The generic per-skill chime already plays in skills.js whenever a
    // skill activates, so we only play the combat "Hit" sound for real
    // auto-attack damage — otherwise Punch etc. would sound twice.
    if (!isSkillDamage) sound.playHit();
  }

  target.hp -= remainingDamage;

  if (remainingDamage > 0) {
    log(`${attackerName} עשה ${remainingDamage} נזק ל-${target.name}.`);
  }

  if (target.hp <= 0) {
    sound.playDeath();
    await effects.playDeath(owner, slotIndex);

    const graveyard = board === aiBoard ? aiGraveyard : playerGraveyard;
    graveyard.push(structuredClone(target));

    log(`${target.name} הובס.`);
    board[slotIndex] = null;
    render();
  } else {
    render();
    await effects.wait(isSkillDamage ? 280 : 350);
  }
}

async function damagePlayer(player, damage, attackerName) {
  sound.playDirectHit();

  await effects.playHeroHit(player, damage, () => {
    if (player === "player") {
      playerHp = Math.max(0, playerHp - damage);
    } else {
      aiHp = Math.max(0, aiHp - damage);
    }

    render();
  });

  log(`${attackerName} תקף ישירות ועשה ${damage} נזק.`);
}

// Lets the player bail out of a battle early — resigns the fight with no
// win/loss consequence (no rewards, no defeat penalty, nothing saved).
// Safe now that resetBattleState() properly clears everything, so the
// next battle (whatever it is) always starts clean.
function exitBattle() {
  if (gameEnded) return;

  const sure = confirm("לצאת מהקרב? ההתקדמות בקרב הזה תאבד.");
  if (!sure) return;

  gameEnded = true;
  actionLocked = true;

  if (currentBattleConfig?.isCampaign) {
    window.CampaignUI.exitToLocationMap();
  } else {
    window.UI.showScreen("homeScreen");
  }
}

function checkGameOver() {
  if (gameEnded) return true;

  if (playerHp <= 0 || aiHp <= 0) {
    gameEnded = true;
    actionLocked = true;

    const won = aiHp <= 0;
    log(won ? "ניצחת!" : "הפסדת!");
    render();

    if (won) sound.playVictory(); else sound.playDefeat();

    if (won && currentBattleConfig?.isCampaign) {
      const result = window.Progression.completeStage(currentBattleConfig.stageId);
      effects.showGameEndScreen(true, () => {
        window.CampaignUI?.onStageComplete(result);
      }, { rewards: result, continueLabel: "המשך" });
    } else if (won && currentBattleConfig?.isQuickBattle) {
      const granted = window.Progression.rollQuickBattleReward(currentBattleConfig.rewardConfig);
      effects.showGameEndScreen(true, () => location.reload(), {
        rewards: { granted },
        continueLabel: "שחק שוב"
      });
    } else {
      effects.showGameEndScreen(won, () => location.reload());
    }

    return true;
  }

  return false;
}

function log(text) {
  document.getElementById("log").innerText = text;
}

window.addEventListener("orientationchange", () => {
  hideFusionPreview();
  cleanupMobileDrag();
  setTimeout(render, 150);
});

document.getElementById("muteButton").addEventListener("click", () => {
  const nowMuted = sound.toggleMuted();
  document.getElementById("muteButton").innerText = nowMuted ? "🔇" : "🔊";
});

document.getElementById("speedButton").addEventListener("click", () => {
  const newSpeed = effects.getSpeedMultiplier() === 1 ? 2 : 1;
  effects.setSpeedMultiplier(newSpeed);
  // Keep CSS animation durations (card lunge, shake, death, etc.) in sync
  // with the JS wait() timings — otherwise at 2x the game logic moves on
  // before the CSS animation finishes playing, and it looks cut off.
  document.documentElement.style.setProperty("--fx-speed", newSpeed);
  document.getElementById("speedButton").innerText = `${newSpeed}x`;
});

document.getElementById("exitBattleBtn").addEventListener("click", exitBattle);

document.getElementById("skipTurnBtn").addEventListener("click", skipPlayerTurn);

// startGame() used to run automatically the moment script.js loaded.
// Now the battle only starts when the player taps ⚔️ PLAY on the Home
// screen (see ui.js), so it's exposed here instead of self-invoking.
window.startBattle = startGame;
