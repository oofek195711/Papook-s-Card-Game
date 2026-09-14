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
// Set by the tutorial's onComplete callback (see startGame's
// Tutorial.start wiring) — NOT acted on immediately, since onComplete
// can fire from deep inside an in-progress playCardOnSlot() call's own
// await chain (Segment 2's final fuse action -> skill popup -> finish,
// all still within that SAME call). Actually starting a new battle
// right then (which resetBattleState()s everything) would corrupt the
// STILL-RUNNING original call's own slot/board references. Instead,
// this just gets checked once, at the natural end of that turn's full
// processing — see the check at the end of resolveAfterPlayerAction.
let tutorialCompletionPending = false;

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
// Builds the PLAYER's deck from their curated Deck Builder selection
// (see progression.js's getDeckSelection) — NOT their whole collection
// anymore. Each selected character instance becomes exactly one deck
// card at its own level; each selected item type contributes 3 copies
// (same as items always worked). If the player never opened Deck
// Builder, getDeckSelection() auto-materializes a sensible default
// (everything owned) the first time it's read, so this always works.
// Builds the PLAYER's deck from their curated Deck Builder selection
// (see progression.js's getDeckSelection) — NOT their whole collection
// anymore. Each selected character instance becomes exactly one deck
// card at its own level; each item contributes however many copies the
// player actually dialed in for it (0 up to however many they own). If
// the player never opened Deck Builder, getDeckSelection() auto-
// materializes a sensible default (everything owned) the first time
// it's read, so this always works even with zero manual setup.
function createPlayerDeck() {
  const deckSelection = window.Progression.getDeckSelection();
  const progress = window.Progression.getProgress();

  const characterCards = deckSelection.instanceIds
    .map(id => progress.ownedInstances.find(i => i.instanceId === id))
    .filter(Boolean)
    .map(buildPlayerCharacterCard)
    .filter(Boolean);

  const itemCards = [];
  Object.entries(deckSelection.itemCounts || {}).forEach(([itemName, count]) => {
    const item = cards.find(c => c.name === itemName && c.type === "item");
    if (!item || count <= 0) return;
    for (let i = 0; i < count; i++) itemCards.push(structuredClone(item));
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

  const comboEntry = Object.entries(combos).find(([, c]) => c.name === name);
  if (comboEntry) {
    const [comboKey, comboResult] = comboEntry;
    const characterName = comboKey.split("|")[0];
    const sourceCharacter = cards.find(c => c.name === characterName);

    return {
      ...comboResult,
      type: "character",
      isFusion: true,
      // Combo definitions in combos.js never carry a .weaknesses array
      // of their own (only fuseCards' runtime logic adds that, when a
      // PLAYER actually fuses mid-battle) — a boss placed directly via
      // its named combo (see placeBossCard) needs the exact same
      // inheritance applied here. Without this, a boss's weakness
      // (e.g. עומר → קטשופ) would silently never trigger, since its
      // board card had no weaknesses recorded on it at all.
      weaknesses: sourceCharacter?.weaknesses || []
    };
  }

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
  // Pre-placed boss cards used to skip the "wait a turn" rule entirely
  // (justPlaced: false), meaning they could attack on the very FIRST
  // turn, before the player even gets to act once. That's a real
  // "impossible to win" difficulty spike, not intentional boss
  // strength — a pre-placed boss should follow the exact same rule a
  // player's own fresh placement does.
  boardCard.justPlaced = true;

  if (enemyLevel > 1) {
    const leveled = window.Progression.getStatsAtLevel(boardCard.atk, boardCard.hp, enemyLevel);
    boardCard.atk = leveled.atk;
    boardCard.hp = leveled.hp;
    boardCard.maxHp = leveled.hp;
    // Same level badge a player's own leveled character gets — makes it
    // visually obvious a scaled-up boss is actually stronger than usual,
    // not just a number you'd have to notice by comparing stats.
    boardCard.level = enemyLevel;
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
      // Same level badge treatment as placeBossCard — see there for why.
      leveled.level = enemyLevel;
    } else {
      const stats = window.Progression.getStatsAtLevel(leveled.atkBonus || 0, leveled.hpBonus || 0, enemyLevel);
      leveled.atkBonus = stats.atk;
      leveled.hpBonus = stats.hp;
    }
    return leveled;
  });
}

// Applies (or clears) a location-specific background image on the
// battle screen — e.g. the DJ club behind a fight against דור, the
// train station behind אופק. Quick Battle and any location without one
// yet (see campaign-neighborhood.js) just fall back to the normal CSS
// gradient background, so nothing needs a background to keep working.
function applyBattleBackground(backgroundUrl) {
  const battleScreen = document.getElementById("battleScreen");

  if (backgroundUrl) {
    battleScreen.style.backgroundImage = `url("${backgroundUrl}")`;
    battleScreen.classList.add("has-custom-bg");
  } else {
    battleScreen.style.backgroundImage = "";
    battleScreen.classList.remove("has-custom-bg");
  }
}

function startGame(battleConfig = null) {
  resetBattleState();
  currentBattleConfig = battleConfig;
  applyBattleBackground(battleConfig?.background);

  if (battleConfig?.isTutorial) {
    // Fixed, unshuffled deck. The single AI card is FORCE-PLACED (same
    // placeBossCard() mechanism campaign bosses already use) rather
    // than left to the AI's own move-picking logic — that logic isn't
    // scripted and could land the card in an unpredictable slot, which
    // would break the deterministic Weakness demo. After the scripted
    // steps finish, the tutorial just steps out of the way and the
    // battle continues completely normally.
    playerDeck = buildTutorialPlayerDeck();
    aiDeck = [];
  } else {
    const enemyPool = battleConfig?.enemyCards
      ? cards.filter(c => battleConfig.enemyCards.includes(c.name))
      : cards;

    const leveledEnemyPool = applyEnemyLevelToPool(
      enemyPool.length ? enemyPool : cards,
      battleConfig?.enemyLevel
    );

    playerDeck = createPlayerDeck();
    aiDeck = createEnemyDeck(leveledEnemyPool);
  }

  for (let i = 0; i < 4; i++) {
    drawCard("player");
    drawCard("ai");
  }

  if (battleConfig?.enemyStartingBoard?.length) {
    battleConfig.enemyStartingBoard.forEach(entry => {
      placeBossCard(entry.cardName, entry.slot, battleConfig.enemyLevel);
    });
  }

  if (battleConfig?.isTutorial) {
    // Force-placed (same mechanism campaign bosses use) so its slot is
    // 100% predictable — directly facing where the player is about to
    // be told to place their own card. Stats overridden right after
    // placement to Segment 1's own numbers (see tutorial.js).
    const aiSlot = window.Tutorial.getSegment1Slot();
    placeBossCard(window.Tutorial.getAiCharacter(), aiSlot, 1);

    const aiStats = window.Tutorial.getSegment1AiStats();
    const aiCard = aiBoard[aiSlot];
    if (aiCard) {
      aiCard.atk = aiStats.atk;
      aiCard.hp = aiStats.hp;
      aiCard.maxHp = aiStats.hp;
    }
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

  if (battleConfig?.isTutorial) {
    window.Tutorial.start({
      showOverlay: (step, onContinue) => showTutorialOverlay(step, onContinue),
      showInstruction: text => showTutorialInstructionBanner(text),
      refreshRestriction: () => render(),
      onFinish: () => hideTutorialInstructionBanner(),
      // Fires once, when the tutorial ENTIRELY finishes (both segments
      // done) — not the same moment as onFinish, which also fires
      // between segments (Segment 1's own step-chain ending) whenever
      // there's no more scripted step to show right now. Deliberately
      // just sets a flag here rather than acting immediately — see the
      // big comment on tutorialCompletionPending above for why.
      onComplete: () => { tutorialCompletionPending = true; }
    });
  }
}

// Builds the tutorial's fixed, deterministic starting deck directly
// from base card definitions (level 1) — deliberately NOT going through
// the player's real owned instances/Deck Builder selection, so the
// tutorial works identically no matter what the player actually owns
// (including a genuinely fresh save with nothing customized yet).
function buildTutorialPlayerDeck() {
  const names = window.Tutorial.buildTutorialDeckNames();
  const segment1Stats = window.Tutorial.getSegment1CharacterStats();

  // buildTutorialDeckNames() lists names in DRAW order (first entry
  // drawn first); drawCard() pops from the END of the deck array, so
  // reverse here to match.
  return names.slice().reverse().map(name => {
    const base = cards.find(c => c.name === name);
    if (!base) return null;
    const card = structuredClone(base);

    if (card.type === "character") {
      card.level = 1;

      // Only Segment 1's own character gets its stats overridden to
      // deliberately weak numbers — Segment 2's character (תמר) keeps
      // her real cards.js stats, since that segment is about
      // demonstrating a Fusion SKILL, not a precisely-tuned kill.
      if (base.name === window.Tutorial.getSegment1Character()) {
        card.atk = segment1Stats.atk;
        card.hp = segment1Stats.hp;
      }
    }

    return card;
  }).filter(Boolean);
}

function render() {
  document.getElementById("playerHp").innerText = playerHp;
  document.getElementById("aiHp").innerText = aiHp;
  document.getElementById("turnText").innerText = turn === "player" ? "שחקן" : "AI";

  document.getElementById("playerHpBar").style.width =
    Math.max(0, (playerHp / MAX_HP) * 100) + "%";

  document.getElementById("aiHpBar").style.width =
    Math.max(0, (aiHp / MAX_HP) * 100) + "%";

  const skipBtn = document.getElementById("skipTurnBtn");
  const handArea = document.getElementById("handArea");

  const isPlayerTurnToAct = turn === "player" && !actionLocked && !gameEnded;
  const stuck = isPlayerTurnToAct && !hasAnyValidPlayerMove();

  // Hand is big while the player can actually act; the moment they play a
  // card (or it's the AI's turn), it shrinks down to a thin peeking strip
  // so the board gets that space back — same feel as Animation Throwdown.
  handArea.classList.toggle("collapsed", !isPlayerTurnToAct);

  skipBtn.classList.toggle("hidden", !stuck);

  renderHand();
  renderBoard("player");
  renderBoard("ai");
}

function renderHand() {
  const handDiv = document.getElementById("playerHand");
  handDiv.innerHTML = "";

  const tutorialStep = window.Tutorial?.isActive() ? window.Tutorial.currentStep() : null;
  const isRestrictedStep = tutorialStep?.type === "action";

  playerHand.forEach((card, index) => {
    const div = document.createElement("div");
    div.className = `card ${card.type}`;

    // During a restricted tutorial step, only the ONE expected card can
    // be picked up at all — everything else is both visually dimmed AND
    // functionally locked (not just styled to LOOK disabled), so the
    // player genuinely can't do anything except the scripted action.
    const isTutorialAllowed = !isRestrictedStep || card.name === tutorialStep.allowedCardName;
    div.classList.toggle("tutorial-dimmed", isRestrictedStep && !isTutorialAllowed);
    div.classList.toggle("tutorial-highlight", isRestrictedStep && isTutorialAllowed);

    div.draggable = turn === "player" && !actionLocked && !gameEnded && isTutorialAllowed;
    div.innerHTML = getCardHtml(card);

    div.ondragstart = () => {
      if (turn !== "player" || actionLocked || gameEnded || !isTutorialAllowed) return;

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
      if (turn !== "player" || actionLocked || gameEnded || !isTutorialAllowed) return;

      startMobileCardDrag(event, div, index, card);
    };

    handDiv.appendChild(div);
  });
}

// While a card is being actively dragged, the hand needs to get OUT OF
// THE WAY visually too — not just stop intercepting touch/mouse events
// (drag-active, see CSS). Otherwise the expanded hand overlay (which
// deliberately covers part of the board the rest of the time) blocks
// the exact board slots the player is trying to aim at. Uses a SEPARATE
// class from the turn-based .collapsed so the two don't fight each
// other if a render() happens to fire mid-drag.
function setHandDragging(active) {
  const handArea = document.getElementById("handArea");
  handArea.classList.toggle("drag-active", active);
  handArea.classList.toggle("dragging-collapsed", active);
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

    // Nudges the eye toward the one slot the current tutorial step
    // actually wants — every action step now specifies its own target
    // slot directly (requiredSlotIndex), whether that's where the
    // character needs to be fused, or the empty slot facing the AI's
    // card for the Weakness demo.
    if (owner === "player" && window.Tutorial?.isActive()) {
      const step = window.Tutorial.currentStep();
      if (step?.type === "action" && step.requiredSlotIndex === index) {
        slot.classList.add("tutorial-highlight");
      }
    }

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
  // Mirrors createBoardCard's exact fallback math (see there for why
  // items now scale off their own bonus values instead of a flat
  // 12hp/1atk floor), so the hand preview honestly matches what a card
  // becomes if placed standalone.
  const atkValue = (card.atk ?? Math.max(1, 2 + (card.atkBonus || 0))) + buff;
  const hpValue = card.hp ?? (5 + (card.hpBonus || 0));

  const visibleSkills = card.skills || [];
  const skillHtml = visibleSkills.length
    ? `<div class="skill-row">
        ${visibleSkills.map(skill => {
          // The tooltip (and now this inline badge) need the EFFECTIVE
          // value for THIS specific card (its own level baked in), not
          // just the raw skill definition — same helper skills.js
          // itself uses when the skill actually resolves, so nothing
          // ever shows a different number than what the skill really
          // does. Stun/Revive have no scalar "strength" (skill.value is
          // undefined for them), so they just don't get a number badge.
          const hasValue = skill.value !== undefined;
          const scaledValue = hasValue ? skills.getScaledSkillValue(skill, card) : null;
          const valueBadgeHtml = hasValue ? `<span class="skill-value-badge">${scaledValue}</span>` : "";
          return `<div class="skill-slot" data-skill-type="${skill.type}" data-skill-value="${scaledValue ?? ""}">${skill.icon || "✨"}${valueBadgeHtml}</div>`;
        }).join("")}
      </div>`
    : "";

  const shieldHtml = card.shield > 0
    ? `<div class="shield-badge">🛡️ ${card.shield}</div>`
    : "";

  const stunHtml = card.stunned
    ? `<div class="stun-badge">😵</div>`
    : "";

  const poisonHtml = card.poison > 0
    ? `<div class="poison-badge">☠️ ${card.poison}</div>`
    : "";

  const levelHtml = card.type === "character"
    ? buildRankIndicatorHtml(card.level)
    : "";

  return `
    <img src="${card.image}" class="card-img">
    <div class="card-scrim"></div>
    ${card.isFusion ? `<img src="../images/fusion.png" class="fusion-icon">` : ""}
    <h3>
      ${levelHtml}
      <span class="card-name-text">${card.name}</span>
    </h3>
    ${skillHtml}
    ${shieldHtml}
    ${stunHtml}
    ${poisonHtml}
    <div class="card-stats">
      <div class="atk-badge ${buff > 0 ? "buffed" : ""}">⚔️ ${atkValue}</div>
      <div class="hp-badge">❤️ ${hpValue}</div>
    </div>
  `;
}

// 5-diamond Rank Indicator, replacing the old "Lv.X" text badge — reads
// the level straight off the card instance (same field everything else
// already uses, see buildPlayerCharacterCard/createBoardCard/fuseCards).
// No new level system: this only decides how many of the 5 diamonds are
// lit. Items never show this (they don't have levels in the Progression
// model), only characters do.
function buildRankIndicatorHtml(level) {
  const maxLevel = window.Progression?.MAX_CARD_LEVEL || 5;
  const clampedLevel = Math.min(maxLevel, Math.max(1, level || 1));

  const diamonds = Array.from({ length: maxLevel }, (_, i) =>
    `<span class="rank-diamond ${i < clampedLevel ? "lit" : ""}"></span>`
  ).join("");

  return `<div class="rank-indicator">${diamonds}</div>`;
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

      // Extra highlight specifically for slots where this drop would
      // create a DEFINED combo (not just a generic stat bump) — shakes
      // to actually catch your eye mid-drag, since "some kind of fusion
      // is possible here" and "this makes something special" are very
      // different pieces of information to act on.
      const character = card.type === "character" ? card : target;
      const item = card.type === "item" ? card : target;
      if (combos[`${character.name}|${item.name}`]) {
        slot.classList.add("great-fusion");
      }
    }
  });
}

function clearSlotHighlights() {
  document.querySelectorAll(".slot").forEach(slot => {
    slot.classList.remove("valid-place", "valid-fusion", "great-fusion", "mobile-drop-hover");
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

  // Tutorial gate: during a scripted "action" step, only the exact card
  // + action the step is waiting for is allowed through — everything
  // else is already blocked from even being DRAGGED (see renderHand),
  // this is just the backstop in case something slipped through.
  if (window.Tutorial?.isActive() && !window.Tutorial.isActionAllowed(draggedCard.name, slotIndex, !!target)) {
    log(window.Tutorial.getBlockedMessage());
    return;
  }

  // Fusion Research gate: owning the character AND the item is no
  // longer enough by itself — a DEFINED combo also has to have been
  // researched first (see progression.js's Fusion Research API). This
  // only gates NAMED combos; a generic upgrade (no combos.js entry for
  // this character+item pair) was never part of Research and stays
  // completely free, same as always. Aborts cleanly before anything is
  // touched (hand untouched, nothing locked) — same as the "can't place
  // here" check above, so it never disturbs drag/touch state. The
  // tutorial's own scripted Fusion is exempt — it can't have been
  // researched yet (this may be the player's very first battle ever),
  // and forcing them through the Research Lab before the tutorial can
  // even finish would defeat the point.
  if (target && !window.Tutorial?.isActive()) {
    const character = draggedCard.type === "character" ? draggedCard : target;
    const item = draggedCard.type === "item" ? draggedCard : target;
    const comboKey = `${character.name}|${item.name}`;

    if (combos[comboKey] && !window.Progression.isFusionResearched(comboKey)) {
      log("🔒 השילוב הזה עדיין לא נחקר.");
      return;
    }
  }

  actionLocked = true;
  clearSlotHighlights();
  hideFusionPreview();

  playerHand.splice(draggedCardIndex, 1);
  draggedCardIndex = null;

  const wasFusion = !!target;

  // Know BEFORE calling fuseCards whether this will trigger the full
  // "FUSION!" screen animation (only named combos get one — a generic
  // upgrade doesn't), so we know whether to actually wait for it below.
  let isNamedComboFusion = false;
  if (wasFusion) {
    const character = draggedCard.type === "character" ? draggedCard : target;
    const item = draggedCard.type === "item" ? draggedCard : target;
    isNamedComboFusion = !!combos[`${character.name}|${item.name}`];
  }

  if (!target) {
    playerBoard[slotIndex] = createBoardCard(draggedCard);
    log(`${draggedCard.name} נכנס לעמדה ${slotIndex + 1}.`);
  } else {
    playerBoard[slotIndex] = fuseCards(draggedCard, target);
  }

  render();

  // Let the "FUSION!" screen animation actually finish playing before
  // anything else happens (weakness checks, skill banners, attack
  // phase...) — it used to fire off the animation and immediately move
  // on, so the next phase's own banner could appear while FUSION! was
  // still on screen.
  if (isNamedComboFusion) {
    await effects.wait(900);
  }

  // Same idea, for the tutorial's own explanation popups (e.g. "🎉 you
  // got a new skill!") — waits for the player to actually dismiss it
  // before the attack phase banner gets a chance to appear underneath.
  // A no-op Promise when there's no active tutorial (see onAction).
  await window.Tutorial?.onAction(slotIndex, wasFusion);

  await resolveWeaknessTrigger("player", slotIndex);
  if (checkGameOver()) return;

  // A beat of breathing room so the player actually SEES the HP bar
  // drop from the Weakness hit before the "ראיתם?" popup covers the
  // board — resolveWeaknessTrigger's own damage animation already runs
  // during the trigger above, but the modal used to appear right on
  // its heels, before that was visually done registering. A true no-op
  // (skipped entirely) outside the one specific tutorial step this
  // matters for.
  if (window.Tutorial?.isActive()) {
    await effects.wait(900);
  }

  // The tutorial's live Weakness demo step waits for THIS — the effect
  // needs to have actually happened before its "look what just
  // happened!" explanation makes sense. A no-op Promise outside that
  // one specific step (see onAfterWeakness in tutorial.js).
  await window.Tutorial?.onAfterWeakness(slotIndex);
  if (checkGameOver()) return;

  await resolveAfterPlayerAction(slotIndex, wasFusion);
}

function createBoardCard(card) {
  // Items used to ALL get a flat 12 HP / ~1-2 ATK when placed standalone
  // (a generic floor, ignoring each item's own atkBonus/hpBonus) — that
  // made every item feel identical on the board even though their
  // Fusion bonuses clearly differ. Now the standalone stats scale off
  // the item's own bonus values instead, so a "bigger" item (like בית,
  // +5 hp bonus) actually plays bigger than a "smaller" one (like כדור,
  // +0 hp bonus) even before any Fusion happens. Kept well below
  // character-level stats on purpose — items are still meant to feel
  // weaker than characters, not equivalent, to preserve the balance
  // already tuned for the roster.
  const hp = card.hp ?? (5 + (card.hpBonus || 0));
  const atk = card.atk ?? Math.max(1, 2 + (card.atkBonus || 0));

  return {
    ...structuredClone(card),
    hp,
    maxHp: hp,
    atk,
    type: card.type,
    isFusion: false,
    shield: 0,
    tempAttackBonus: 0,
    stunned: false,
    // A freshly placed card (dragged from hand onto an empty slot) can't
    // attack until the NEXT attack phase — matches Animation Throwdown.
    // Fusion results do NOT go through this function anymore (see
    // fuseCards), since Fusion is exempt from this wait and attacks
    // the same turn.
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

    // The combo's atk/hp in combos.js are tuned against the character's
    // BASE (level 1, undamaged) stats — but the card actually being
    // fused might be leveled up, already damaged, or both. Treating
    // combo.atk/combo.hp as fixed absolute numbers meant fusing a
    // half-dead level-1 Ofek could suddenly jump to a fixed 22 HP —
    // completely disconnected from what was actually on the board.
    //
    // Instead: figure out how much stronger the combo makes a PRISTINE
    // base character (the delta), then apply that same delta on top of
    // whatever this specific card's current stats actually are. This
    // also means WHICH copy you fuse matters strategically — fusing a
    // damaged copy carries its damage into the result (rescuing it, but
    // at whatever HP it currently has); fusing a fresh/leveled copy
    // gets the same boost from a higher starting point.
    const baseCharacter = cards.find(c => c.name === character.name);
    const atkDelta = combo.atk - (baseCharacter?.atk ?? combo.atk);
    const hpDelta = combo.hp - (baseCharacter?.hp ?? combo.hp);

    const resultAtk = Math.max(1, (character.atk || 0) + atkDelta);
    const resultHp = Math.max(1, (character.hp || 0) + hpDelta);
    const resultMaxHp = Math.max(1, (character.maxHp ?? character.hp ?? 0) + hpDelta);

    return {
      ...structuredClone(combo),
      type: "character",
      atk: resultAtk,
      hp: resultHp,
      maxHp: resultMaxHp,
      item: item.name,
      isFusion: true,
      shield: 0,
      tempAttackBonus: 0,
      stunned: false,
      // Fusion results attack the SAME turn they're created (matches
      // Animation Throwdown — a fresh, un-fused placement still waits a
      // turn, but Fusion doesn't). See createBoardCard for the "wait a
      // turn" default that applies to plain placements.
      justPlaced: false,
      // Fusion results otherwise wouldn't inherit the source character's
      // weaknesses (they're a whole new object from the combo table) —
      // but a weakness like "תמר → דגדוגים" should still apply to any
      // of her fused forms, not just her un-fused base card.
      weaknesses: character.weaknesses || [],
      // Same issue as weaknesses above — combo objects never carry a
      // .level field, so a leveled-up character used to lose its level
      // badge the moment it went through a named-combo Fusion (its
      // level effectively became undefined). Carry it forward.
      level: character.level
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
  // Same reasoning as the combo branch above — this is still a Fusion,
  // just without a named combo result, so it also attacks immediately.
  upgraded.justPlaced = false;

  log(`${character.name} השתדרג עם ${item.name}.`);
  return upgraded;
}

function getFusionResult(cardA, cardB) {
  if (!canFuse(cardA, cardB)) return null;

  const character = cardA.type === "character" ? cardA : cardB;
  const item = cardA.type === "item" ? cardA : cardB;
  const comboKey = `${character.name}|${item.name}`;
  const combo = combos[comboKey];

  if (combo) {
    // A defined combo that hasn't been researched yet (see Fusion
    // Research in progression.js) would actually be REJECTED if you
    // dropped here — the preview needs to say so instead of tempting
    // you with stats you can't actually get yet.
    if (!window.Progression.isFusionResearched(comboKey)) {
      return { locked: true, name: "טרם נחקר", image: combo.image };
    }

    // Same delta-based math as fuseCards's combo branch — the preview
    // has to show the REAL resulting stats (relative to this specific
    // card's current hp/atk), not the combo's fixed base-line numbers,
    // or the preview would lie about what you're about to get.
    const baseCharacter = cards.find(c => c.name === character.name);
    const atkDelta = combo.atk - (baseCharacter?.atk ?? combo.atk);
    const hpDelta = combo.hp - (baseCharacter?.hp ?? combo.hp);

    return {
      name: combo.name,
      image: combo.image,
      atk: Math.max(1, (character.atk || 0) + atkDelta),
      hp: Math.max(1, (character.hp || 0) + hpDelta)
    };
  }

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

  preview.classList.toggle("locked", !!result.locked);

  preview.innerHTML = result.locked
    ? `
      <div class="fusion-preview-title">🔒 ${result.name}</div>
      <img src="${result.image}" class="fusion-preview-locked-img">
      <div class="fusion-preview-stats">עדיין לא נחקר במעבדה</div>
    `
    : `
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

  // No more "skip the whole attack phase on turn 1" special case — the
  // justPlaced flag on every card already makes turn 1 a no-op attack
  // phase naturally (everyone's cards are freshly placed, so they all
  // skip themselves and clear their own flag). Special-casing turn 1 on
  // top of that meant a card's justPlaced flag never actually got
  // consumed during turn 1 (since autoAttack never ran), so it silently
  // ate ANOTHER turn later before the card could attack at all.
  //
  // The phase banner now plays BEFORE beforeAttack skills resolve (not
  // just before the lane attacks) — skills like Punch deal damage too,
  // so showing "ATTACK PHASE!" only after that damage already happened
  // looked backwards.
  effects.playPhase("ATTACK PHASE!");
  await effects.wait(500);

  // Scoped to ONLY the card placed/fused this exact turn — beforeAttack
  // is meant to be a one-time "just arrived" effect (same spirit as
  // onFusion above), not something that keeps re-triggering every turn
  // for as long as the card is alive. Without this scoping, Stun would
  // lock an opponent out of attacking forever, Motivate/Revive would
  // re-fire every turn too. beforeAttack now only covers Stun, Revive,
  // and Motivate — see below for Shield/Punch/Heal/Poison, which are
  // meant to feel like SUSTAINED effects instead and use their own
  // "everyTurn" trigger.
  await resolveSkills("player", "beforeAttack", { onlySlotIndex: actionSlotIndex });

  if (checkGameOver()) return;

  // Shield, Punch, Heal, and Poison are all meant to feel like
  // sustained, ongoing effects rather than one-time buffs — they use
  // their OWN trigger ("everyTurn"), resolved unscoped across the WHOLE
  // board every turn, not just the card placed this turn. See
  // combos.js for which skills use trigger:"everyTurn".
  await resolveSkills("player", "everyTurn");

  if (checkGameOver()) return;

  await autoAttack("player");

  if (checkGameOver()) return;

  // Segment 1's scripted steps end right after the Fusion+Weakness
  // combo, but the actual KILL only happens here, in the attack phase
  // that follows — this is the check that confirms it actually landed
  // and moves the tutorial into Segment 2 (force-placing a fresh AI
  // card for the Skill demo). A no-op on every other turn of every
  // other battle (isAwaitingKillConfirmation() is only ever true for
  // the one specific turn this matters).
  if (window.Tutorial?.isAwaitingKillConfirmation()) {
    const aiSlot = window.Tutorial.getSegment1Slot();
    const aiCardIsAlive = !!aiBoard[aiSlot];
    const advancedToSegment2 = await window.Tutorial.confirmSegment1Kill(aiCardIsAlive);

    if (advancedToSegment2) {
      // Segment 2's own fresh AI card — same force-placement approach
      // as Segment 1's, in a DIFFERENT lane (Segment 1's own fused
      // card is still alive and occupying its own slot).
      const segment2Slot = window.Tutorial.getSegment2Slot();
      placeBossCard(window.Tutorial.getAiCharacter(), segment2Slot, 1);

      const segment2AiStats = window.Tutorial.getSegment2AiStats();
      const segment2AiCard = aiBoard[segment2Slot];
      if (segment2AiCard) {
        segment2AiCard.atk = segment2AiStats.atk;
        segment2AiCard.hp = segment2AiStats.hp;
        segment2AiCard.maxHp = segment2AiStats.hp;
      }

      render();
    }
  }

  // Checked at the natural end of this turn's full processing (not
  // synchronously inside onComplete — see tutorialCompletionPending's
  // declaration for why) — this is where it's actually safe to start a
  // whole new battle.
  if (tutorialCompletionPending) {
    tutorialCompletionPending = false;
    await runTutorialCompletionFlow();
    return;
  }

  turn = "ai";
  render();
  await effects.wait(650);
  await runAiTurn();
}

// Poison doesn't deal its damage the moment it's applied — it ticks
// once at the start of the POISONED card's own owner's turn, every
// turn, until the card dies (or is otherwise removed). Called once per
// side per round — see the two call sites in runAiTurn/end-of-player-turn.
async function processPoisonTicks(owner) {
  const board = owner === "player" ? playerBoard : aiBoard;

  for (let i = 0; i < board.length; i++) {
    const card = board[i];
    if (!card || !(card.poison > 0)) continue;

    log(`${card.name} סופג ${card.poison} נזק מהרעלה.`);
    await damageCard(board, i, card.poison, "הרעלה", true);
    render();

    if (checkGameOver()) return;
    await effects.wait(300);
  }
}

async function runAiTurn() {
  await processPoisonTicks("ai");
  if (checkGameOver()) return;

  drawCard("ai");

  const move = ai.chooseMove({
    hand: aiHand,
    board: aiBoard,
    enemyBoard: playerBoard,
    canFuse
  });

  let aiWasFusion = false;
  let aiActionSlotIndex = null;

  if (move) {
    const card = aiHand[move.handIndex];
    let aiIsNamedComboFusion = false;

    if (move.type === "fusion") {
      const target = aiBoard[move.slotIndex];
      const character = card.type === "character" ? card : target;
      const item = card.type === "item" ? card : target;
      aiIsNamedComboFusion = !!combos[`${character.name}|${item.name}`];

      aiBoard[move.slotIndex] = fuseCards(card, target);
      log("היריב עשה Fusion.");
      aiWasFusion = true;
    } else {
      aiBoard[move.slotIndex] = createBoardCard(card);
      log(`היריב שם את ${card.name}.`);
    }

    aiActionSlotIndex = move.slotIndex;
    aiHand.splice(move.handIndex, 1);
    render();
    // Same "let the FUSION! animation actually finish" fix as the
    // player's side — a plain placement/generic upgrade only needs the
    // normal short beat, but a named combo needs enough time for its
    // full screen animation.
    await effects.wait(aiIsNamedComboFusion ? 900 : 550);

    await resolveWeaknessTrigger("ai", move.slotIndex);
    if (checkGameOver()) return;
  }

  if (aiWasFusion) {
    await resolveSkills("ai", "onFusion", { onlySlotIndex: aiActionSlotIndex });
    if (checkGameOver()) return;
  }

  // Banner plays BEFORE beforeAttack skills resolve — same fix as the
  // player's turn above.
  effects.playPhase("AI ATTACK!");
  await effects.wait(500);

  // Same once-only scoping fix as the player's side above — see the
  // detailed comment there for what beforeAttack vs everyTurn each
  // cover now.
  await resolveSkills("ai", "beforeAttack", { onlySlotIndex: aiActionSlotIndex });

  if (checkGameOver()) return;

  // Shield's own every-turn refresh — same as the player's side above.
  await resolveSkills("ai", "everyTurn");

  if (checkGameOver()) return;

  await autoAttack("ai");

  if (checkGameOver()) return;

  turnNumber++;
  turn = "player";
  drawCard("player");
  render();
  log("התור שלך — בחר קלף.");

  // actionLocked stays true (inherited from the AI's turn) through the
  // poison tick, so the player can't start dragging a card while a
  // poison-damage animation is still resolving — only unlocked once
  // that's fully done.
  await processPoisonTicks("player");
  if (checkGameOver()) return;

  actionLocked = false;
  render();
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
    // Only meaningful for the "onAttack" trigger — whether this specific
    // attack actually hit an enemy CARD (vs. a direct hit to the hero,
    // when the lane was empty). Splash-style skills need this; a simple
    // self-buff like Rage doesn't care and can ignore it.
    hadTarget: options.hadTarget,
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

    // Skills that trigger off the ATTACK itself (splash damage to
    // adjacent lanes, a self-buff like Rage, etc.) — scoped to just the
    // card that's attacking right now, separate from the beforeAttack
    // skills that already resolved earlier this same turn.
    await resolveSkills(attackerOwner, "onAttack", { onlySlotIndex: slotIndex, hadTarget: !!target });

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

  // Leaving mid-tutorial is treated the same as explicitly skipping it —
  // both clears the tutorial's own "active" flag (so it doesn't leak
  // restriction/dimming into whatever battle comes next) and marks it
  // seen (so it doesn't force again next time PLAY is tapped).
  if (window.Tutorial?.isActive()) {
    window.Tutorial.skip();
  }

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
      }, {
        rewards: result,
        continueLabel: "המשך",
        onHome: () => window.UI.showScreen("homeScreen")
      });
    } else if (won && currentBattleConfig?.isQuickBattle) {
      const granted = window.Progression.rollQuickBattleReward(currentBattleConfig.rewardConfig);
      effects.showGameEndScreen(true, () => window.startBattle(currentBattleConfig), {
        rewards: { granted },
        continueLabel: "שחק שוב",
        onHome: () => window.UI.showScreen("homeScreen")
      });
    } else {
      // Any loss (campaign or quick battle) — "try again" retries the
      // EXACT same battle directly (no page reload needed now that
      // resetBattleState() properly clears everything), and there's
      // always a clear, separate way back to the main menu.
      effects.showGameEndScreen(won, () => window.startBattle(currentBattleConfig), {
        onHome: () => window.UI.showScreen("homeScreen")
      });
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

document.getElementById("tutorialSkipLink").addEventListener("click", () => {
  window.Tutorial?.skip();
  hideTutorialInstructionBanner();
  render();
});

// Tap-to-explain: any skill icon on any card (board OR hand, player OR
// AI) shows what it actually does. Delegated on the whole document
// instead of wired per-card, since cards get torn down and rebuilt on
// every render() — a per-element listener would need constant
// re-wiring, this doesn't.
document.addEventListener("click", event => {
  const slot = event.target.closest(".skill-slot");
  if (!slot) return;
  showSkillInfoPopup(slot.dataset.skillType, slot.dataset.skillValue);
});

function showSkillInfoPopup(skillType, scaledValue) {
  const info = skills.SKILL_INFO?.[skillType];
  if (!info) return;

  const backdrop = document.createElement("div");
  backdrop.className = "choose-modal-backdrop skill-info-backdrop";
  backdrop.innerHTML = `
    <div class="choose-modal skill-info-modal">
      <div class="choose-modal-title">${info.name}</div>
      <div class="skill-info-desc">${info.description(scaledValue)}</div>
    </div>
  `;

  // Tapping anywhere (including the card itself) dismisses it — this is
  // a quick glance, not a screen that needs its own explicit close
  // button.
  backdrop.addEventListener("click", () => backdrop.remove());
  document.body.appendChild(backdrop);
}

// === Tutorial UI ===
// These are the callback implementations wired into window.Tutorial via
// startGame — the tutorial module itself has no DOM knowledge at all,
// it just calls these with plain data.

function showTutorialOverlay(step, onContinue) {
  hideTutorialInstructionBanner();

  const backdrop = document.createElement("div");
  backdrop.className = "choose-modal-backdrop tutorial-overlay-backdrop";
  backdrop.innerHTML = `
    <div class="choose-modal tutorial-overlay-modal">
      <div class="choose-modal-title">${step.title}</div>
      <div class="tutorial-overlay-text">${step.text}</div>
      <div class="upgrade-confirm-buttons">
        <button type="button" class="tutorial-skip-btn">דלג על המדריך</button>
        <button type="button" class="upgrade-confirm-ok">המשך</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector(".upgrade-confirm-ok").onclick = () => {
    backdrop.remove();
    onContinue();
  };
  backdrop.querySelector(".tutorial-skip-btn").onclick = () => {
    backdrop.remove();
    window.Tutorial.skip();
    hideTutorialInstructionBanner();
    render();
  };
}

function showTutorialInstructionBanner(text) {
  const banner = document.getElementById("tutorialInstructionBanner");
  if (!banner) return;
  banner.querySelector(".tutorial-instruction-text").innerText = text;
  banner.classList.remove("hidden");
}

function hideTutorialInstructionBanner() {
  document.getElementById("tutorialInstructionBanner")?.classList.add("hidden");
}

// Fires once, right after the tutorial's scripted Fusion+Weakness combo
// actually finishes off the AI's card (see the isAwaitingKillConfirmation
// check in resolveAfterPlayerAction). Two quick confirmation modals, then
// discards the tutorial battle entirely and drops straight into a real
// Quick Battle at the easiest difficulty — a smooth "now go" instead of
// leaving the player to figure out the next step themselves.
async function runTutorialCompletionFlow() {
  await showSimpleTutorialModal(
    "🎉 כל הכבוד!",
    "סיימת את המדריך! אפשר תמיד לחזור אליו דרך מסך HOW TO PLAY."
  );
  await showSimpleTutorialModal(
    "בהצלחה! 💪",
    "עכשיו תנסו בעצמכם — קרב אמיתי מתחיל."
  );

  // Matches QUICK_BATTLE_DIFFICULTIES.easy in ui.js exactly (kept as a
  // literal here rather than reaching into ui.js's internals — this is
  // the one specific, stable config the tutorial's own auto-start needs).
  window.startBattle({
    isQuickBattle: true,
    enemyLevel: 1,
    rewardConfig: {
      key: "easy", label: "קל", emoji: "🟢", enemyLevel: 1,
      coinsMin: 5, coinsMax: 15, bonusChance: 0.20, bonusType: "item",
      researchMin: 10, researchMax: 20
    }
  });
}

function showSimpleTutorialModal(title, text) {
  return new Promise(resolve => {
    const backdrop = document.createElement("div");
    backdrop.className = "choose-modal-backdrop tutorial-overlay-backdrop";
    backdrop.innerHTML = `
      <div class="choose-modal tutorial-overlay-modal">
        <div class="choose-modal-title">${title}</div>
        <div class="tutorial-overlay-text">${text}</div>
        <div class="upgrade-confirm-buttons">
          <button type="button" class="upgrade-confirm-ok tutorial-continue-full">המשך</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.querySelector(".upgrade-confirm-ok").onclick = () => {
      backdrop.remove();
      resolve();
    };
  });
}

// startGame() used to run automatically the moment script.js loaded.
// Now the battle only starts when the player taps ⚔️ PLAY on the Home
// screen (see ui.js), so it's exposed here instead of self-invoking.
window.startBattle = startGame;

// Reused by ui.js's Deck Builder so its own character tiles show the
// exact same 5-diamond Rank Indicator as battle cards, instead of a
// separate "Lv.X" text badge that would drift out of sync visually.
window.buildRankIndicatorHtml = buildRankIndicatorHtml;
