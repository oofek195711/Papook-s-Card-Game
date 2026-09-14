// Guided first-battle tutorial. Deliberately a SEPARATE module (like
// skills.js/weaknesses.js/ai.js) that HOOKS INTO script.js's battle
// engine at a few clearly-marked integration points, rather than
// scattering "if tutorial..." checks all over the battle engine itself.
//
// Two scripted segments, back to back, in the SAME battle (no scene
// "cut" needed — see the "wait-kill" step type):
//
//  Segment 1 (Weakness): place a deliberately weak character facing a
//  deliberately weak AI card, fuse the AI's own Weakness item directly
//  onto it — one action that both upgrades the player's card AND
//  triggers the Weakness on the AI's, in the same moment. The player
//  gets normal control back the instant this segment's steps are done;
//  the tutorial just quietly watches ("wait-kill") for that AI card to
//  actually die before moving on.
//
//  Segment 2 (Skills): once that kill is confirmed, a FRESH AI card is
//  force-placed in a different lane, and the player fuses a character
//  with an actual NAMED combo (one that grants a skill) onto a second
//  character of their own — demonstrating that Fusion can grant skills,
//  not just stat boosts, using the exact same skill data/description
//  the in-battle tap-to-explain tooltip already uses.
//
// Only once BOTH segments are done does the tutorial actually finish —
// see callbacks.onComplete, which script.js uses to run the
// congratulations -> "try it yourself" -> fresh real battle flow.
window.Tutorial = (() => {
  // --- Segment 1: Weakness ---
  const SEGMENT1_CHARACTER = "אופק טלקר";
  // The fused item IS the Weakness item — עומר שמואלי's own weakness is
  // קטשופ (see cards.js) — so fusing it onto the player's card both
  // upgrades that card AND triggers the Weakness on whoever's facing it.
  const SEGMENT1_ITEM = "קטשופ";
  const SEGMENT1_SLOT = 2;
  // Deliberately weak so a single hit doesn't just win on its own.
  const SEGMENT1_CHARACTER_ATK = 2;
  const SEGMENT1_CHARACTER_HP = 2;

  const AI_CHARACTER = "עומר שמואלי";
  const AI_HP_SEGMENT1 = 5;
  const AI_ATK_SEGMENT1 = 5; // flavor only — it never gets a turn to use this

  // --- Segment 2: Skills ---
  const SEGMENT2_CHARACTER = "תמר גולן";
  // A NAMED combo this time (תמר גולן|ציפס אמריקאי -> "תמר משחקת באוכל",
  // which grants a Punch skill — see combos.js) — the whole point of
  // this segment is showing that Fusion can grant a skill, not just
  // raw stats like Segment 1's generic upgrade did.
  const SEGMENT2_ITEM = "ציפס אמריקאי";
  const SEGMENT2_SLOT = 1; // different lane — Segment 1's own fused card is still sitting in SEGMENT1_SLOT
  const AI_HP_SEGMENT2 = 10;
  const AI_ATK_SEGMENT2 = 5; // flavor

  let phase = "idle"; // "idle" | "scripted" | "done"
  let stepIndex = -1;
  let callbacks = null; // wired up by script.js — see start()
  // Set by onAction() ONLY when it matches a step flagged
  // advanceAfterWeakness — remembers EXACTLY which step is waiting, so
  // the later onAfterWeakness() call (for that SAME player action)
  // advances that specific step and nothing else. Without this, calling
  // onAfterWeakness() right after onAction() (both fire for every
  // single placement/fusion, not just this one special step) would
  // re-check "whatever the current step happens to be NOW" — which, if
  // onAction() had just advanced to a DIFFERENT step that also happens
  // to be flagged advanceAfterWeakness, would incorrectly fire that
  // step's explanation immediately, one full action too early.
  let pendingWeaknessStepIndex = null;

  // Card NAMES in DRAW order (first array element drawn FIRST). Actual
  // deck array building (script.js) pops from the END, so this list
  // gets reversed there — kept here in natural reading order. All 4
  // cards needed across BOTH segments are in the starting hand from
  // turn zero (exactly 4 cards are drawn to start) — segment 2's cards
  // just sit unused (and visually dimmed, see script.js's renderHand)
  // until their own steps come up, how ever many turns into segment 1
  // that ends up taking.
  function buildTutorialDeckNames() {
    return [
      SEGMENT1_CHARACTER,
      SEGMENT1_ITEM,
      SEGMENT2_CHARACTER,
      SEGMENT2_ITEM
    ];
  }

  function getAiCharacter() { return AI_CHARACTER; }
  function getSegment1Character() { return SEGMENT1_CHARACTER; }
  function getSegment1Slot() { return SEGMENT1_SLOT; }
  function getSegment1CharacterStats() { return { atk: SEGMENT1_CHARACTER_ATK, hp: SEGMENT1_CHARACTER_HP }; }
  function getSegment1AiStats() { return { atk: AI_ATK_SEGMENT1, hp: AI_HP_SEGMENT1 }; }
  function getSegment2Slot() { return SEGMENT2_SLOT; }
  function getSegment2AiStats() { return { atk: AI_ATK_SEGMENT2, hp: AI_HP_SEGMENT2 }; }

  function segment2SkillExplanation() {
    const combo = window.CardData?.combos?.[`${SEGMENT2_CHARACTER}|${SEGMENT2_ITEM}`];
    const skill = combo?.skills?.[0];
    const info = skill ? window.SkillEngine?.SKILL_INFO?.[skill.type] : null;

    if (!combo || !skill || !info) {
      return { title: "🎉 קיבלתם סקיל!", text: "חלק מהשילובים מעניקים לקלף סקיל מיוחד, לא רק שיפור בסטטיסטיקה." };
    }

    const scaledValue = window.SkillEngine.getScaledSkillValue(skill, { level: 1 });
    return {
      title: `🎉 ${combo.name} קיבלה סקיל!`,
      text: `${skill.icon || ""} ${info.name}: ${info.description(scaledValue)} לא כל שילוב נותן סקיל — אלה שכן, שווה להכיר.`
    };
  }

  const STEPS = [
    {
      id: "welcome",
      type: "overlay",
      title: "ברוכים הבאים ל-Papook! 🃏",
      text: "בואו נלמד לשחק תוך כדי קרב קצר וידידותי, נגד עומר."
    },
    {
      id: "place-character",
      type: "action",
      instruction: `גרור את ${SEGMENT1_CHARACTER} למשבצת שממש מול עומר`,
      allowedCardName: SEGMENT1_CHARACTER,
      expectedActionType: "place",
      requiredSlotIndex: SEGMENT1_SLOT
    },
    {
      id: "fuse-item",
      type: "action",
      instruction: `עומר מפחד מ${SEGMENT1_ITEM}! גרור אותו בדיוק על ${SEGMENT1_CHARACTER} כדי למזג ולפגוע בעומר בו-זמנית`,
      allowedCardName: SEGMENT1_ITEM,
      expectedActionType: "fuse",
      requiredSlotIndex: SEGMENT1_SLOT,
      // The follow-up explanation has to wait until AFTER the Weakness
      // effect actually resolves (see script.js's resolveWeaknessTrigger)
      // — onAction() alone fires too early — so this step is advanced
      // by onAfterWeakness() instead.
      advanceAfterWeakness: true
    },
    {
      id: "explain-weakness-result",
      type: "overlay",
      title: "ראיתם? 💥",
      text: `עומר נפגע מיד כי ${SEGMENT1_ITEM} היא בדיוק החולשה שלו — וגם ${SEGMENT1_CHARACTER} התחזק מהמיזוג עצמו. שני דברים מאותה פעולה אחת. עכשיו תראו את ההתקפה מסיימת אותו.`
    },
    {
      // No restriction at all while here — the player has completely
      // normal control. script.js polls isAwaitingKillConfirmation()
      // after every attack phase and calls confirmSegment1Kill() once
      // the AI's card is actually gone.
      id: "wait-kill-1",
      type: "wait-kill"
    },
    {
      id: "place-character-2",
      type: "action",
      instruction: `עומר חדש הצטרף! גרור את ${SEGMENT2_CHARACTER} למשבצת שממש מולו`,
      allowedCardName: SEGMENT2_CHARACTER,
      expectedActionType: "place",
      requiredSlotIndex: SEGMENT2_SLOT
    },
    {
      id: "fuse-item-2",
      type: "action",
      instruction: `גרור את ה${SEGMENT2_ITEM} בדיוק על ${SEGMENT2_CHARACTER} — לשילוב הזה יש הפתעה`,
      allowedCardName: SEGMENT2_ITEM,
      expectedActionType: "fuse",
      requiredSlotIndex: SEGMENT2_SLOT
    },
    {
      id: "explain-skill",
      type: "overlay",
      ...segment2SkillExplanation()
    },
    {
      id: "finish",
      type: "finish"
    }
  ];

  function isActive() {
    return phase === "scripted" && STEPS[stepIndex]?.type === "action";
  }

  function isAwaitingKillConfirmation() {
    return phase === "scripted" && STEPS[stepIndex]?.type === "wait-kill";
  }

  function currentStep() {
    return phase === "scripted" ? STEPS[stepIndex] : null;
  }

  // Called by script.js whenever the player attempts to place/fuse a
  // card, BEFORE anything actually happens — returns false to block the
  // action entirely (with no side effects) if it doesn't match what the
  // current step expects. Only "action" steps restrict anything.
  function isActionAllowed(cardName, targetSlotIndex, isFusionAttempt) {
    if (!isActive()) return true;

    const step = STEPS[stepIndex];
    if (cardName !== step.allowedCardName) return false;
    if (step.requiredSlotIndex !== undefined && targetSlotIndex !== step.requiredSlotIndex) return false;

    if (step.expectedActionType === "place" && isFusionAttempt) return false;
    if (step.expectedActionType === "fuse" && !isFusionAttempt) return false;

    return true;
  }

  function getBlockedMessage() {
    const step = STEPS[stepIndex];
    return step?.instruction ? `👉 ${step.instruction}` : "👉 עקבו אחרי ההוראות למעלה.";
  }

  function onAction(slotIndex, wasFusion) {
    if (!isActive()) return Promise.resolve();
    const step = STEPS[stepIndex];

    const matchesType = (step.expectedActionType === "place" && !wasFusion)
      || (step.expectedActionType === "fuse" && wasFusion);

    if (!matchesType) return Promise.resolve();

    if (step.advanceAfterWeakness) {
      pendingWeaknessStepIndex = stepIndex;
      return Promise.resolve();
    }

    return new Promise(resolve => {
      stepIndex += 1;
      runCurrentStep(resolve);
    });
  }

  function onAfterWeakness(slotIndex) {
    if (phase !== "scripted") return Promise.resolve();
    if (pendingWeaknessStepIndex === null || pendingWeaknessStepIndex !== stepIndex) {
      return Promise.resolve();
    }

    const step = STEPS[stepIndex];
    if (step.requiredSlotIndex !== undefined && slotIndex !== step.requiredSlotIndex) return Promise.resolve();

    pendingWeaknessStepIndex = null;

    return new Promise(resolve => {
      stepIndex += 1;
      runCurrentStep(resolve);
    });
  }

  // Called by script.js once per attack-phase resolution WHILE
  // isAwaitingKillConfirmation() is true. Returns a Promise resolving
  // to true (and advances past the wait-kill step) the moment the AI's
  // Segment-1 card is actually dead — false otherwise, meaning
  // script.js should just let the battle continue and check again next
  // time. When it DOES resolve true, script.js still needs to force-
  // place Segment 2's fresh AI card itself — see getSegment2Slot/
  // getSegment2AiStats — this function only advances the tutorial's own
  // step pointer, it doesn't touch the board.
  function confirmSegment1Kill(aiCardIsAlive) {
    if (!isAwaitingKillConfirmation()) return Promise.resolve(false);
    if (aiCardIsAlive) return Promise.resolve(false);

    return new Promise(resolve => {
      stepIndex += 1;
      runCurrentStep(() => resolve(true));
    });
  }

  function runCurrentStep(onStepSettled) {
    if (phase !== "scripted") {
      onStepSettled?.();
      return;
    }

    const step = STEPS[stepIndex];

    if (!step || step.type === "finish") {
      phase = "done";
      callbacks?.onFinish();
      window.Progression?.markTutorialSeen();
      callbacks?.onComplete();
      onStepSettled?.();
      return;
    }

    if (step.type === "overlay") {
      callbacks.showOverlay(step, () => {
        stepIndex += 1;
        runCurrentStep(onStepSettled);
      });
    } else if (step.type === "action") {
      callbacks.showInstruction(step.instruction);
      onStepSettled?.();
    } else if (step.type === "wait-kill") {
      // Nothing to show — the player already has completely normal
      // control at this point. Just let the caller (onAction, from
      // whatever move the player makes next) proceed normally.
      onStepSettled?.();
    }

    callbacks.refreshRestriction();
  }

  function start(providedCallbacks) {
    callbacks = providedCallbacks;
    phase = "scripted";
    stepIndex = 0;
    pendingWeaknessStepIndex = null;
    runCurrentStep();
  }

  // Explicit skip — jumps straight to "done" without waiting through
  // the remaining steps. Available any time the tutorial is running,
  // including mid-Segment-2 or during the wait-kill gap between
  // segments.
  function skip() {
    if (phase !== "scripted") return;
    phase = "done";
    window.Progression?.markTutorialSeen();
    callbacks?.onFinish();
  }

  return {
    isActive,
    isAwaitingKillConfirmation,
    currentStep,
    getAiCharacter,
    getSegment1Character,
    getSegment1Slot,
    getSegment1CharacterStats,
    getSegment1AiStats,
    getSegment2Slot,
    getSegment2AiStats,
    isActionAllowed,
    getBlockedMessage,
    onAction,
    onAfterWeakness,
    confirmSegment1Kill,
    start,
    skip,
    buildTutorialDeckNames
  };
})();
