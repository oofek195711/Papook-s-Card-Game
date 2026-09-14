// Campaign save data + unlock rules. Everything reads/writes through the
// functions below — nothing else in the app should touch localStorage
// directly. If this ever moves to a server/account-based save, only this
// file needs to change.
//
// NOTE: this used to live at campaign/progression.js. Moved to the root
// (flat, no folder) because nested folders don't reliably survive a
// drag-and-drop upload to GitHub — that's what broke the deployed game
// last time. See combos.js for the same fix applied there.
//
// CHARACTERS are owned as individual INSTANCES (each with its own level —
// you can own two "אופק טלקר" at different levels, both playable).
// ITEMS are owned as simple QUANTITIES (itemCounts[name] = how many you
// have) — no per-copy level, but you CAN own several and choose how many
// go into your deck, same spirit as characters just without the level
// axis. Battle wins (campaign or Quick Battle) are the only way to gain
// more of an item; nothing hands them out automatically otherwise.
window.Progression = (() => {
  const STORAGE_KEY = "papook_progress";

  function getDefaultState() {
    return {
      coins: 0,
      // These 3 aren't fusion-building items (they're the "weakness"
      // items used AGAINST the original 5 characters), so starting with
      // a few of them doesn't spoil any campaign "I built a new card!"
      // moment — it just means Quick Battle and the Deck Builder aren't
      // completely empty of items on a brand new save.
      itemCounts: { "חתול": 3, "קטשופ": 3, "דגדוגים": 3 },
      // Seeded with one level-1 copy of every base character — "the core
      // roster is always yours", just formalized as real owned instances
      // now instead of a blanket always-unlocked rule.
      ownedInstances: seedStarterInstances(),
      // null = "not customized yet". getDeckSelection() materializes it
      // (everything owned, by default) the first time anything actually
      // asks for the deck — see below.
      deck: null,
      stageProgress: {},   // stageId -> { completed: true, stars: 1-3 }

      // --- Fusion Research ---
      // A SEPARATE currency from coins — coins still only ever pay for
      // the existing merge-upgrade system. Research Points exist purely
      // to unlock the ABILITY to perform a specific named Fusion combo
      // in battle at all (owning the character+item is no longer
      // enough by itself). Starting amount is generous for testing —
      // no real source grants these yet (see addResearchPoints).
      researchPoints: 500,
      // Combo keys ("CharacterName|ItemName") the player has actually
      // claimed research for — see combos.js for where researchCost/
      // researchTime live on each combo definition (not duplicated
      // here). A combo with no entry in combos.js at all (a "generic
      // upgrade" pairing) was never gated by Research in the first
      // place and doesn't need to appear here.
      researchedFusions: [],
      // A stockpile of "shave 10 minutes off the active research"
      // charges, bought from the Shop — see buySpeedupCharge/
      // useSpeedupCharge. Buying and using are separate: buying a
      // charge doesn't touch any research, it just adds to this count;
      // using one is a deliberate, per-charge choice made from the
      // Research Lab screen.
      researchSpeedupCharges: 0,
      // Single research slot: { comboKey, startedAt, finishAt } (both
      // real epoch milliseconds) or null when idle. Deliberately NOT
      // storing a "remaining seconds" countdown — that would need to
      // keep ticking down even while the game is closed, which a plain
      // stored number can't do. Timestamps let getResearchStatus()
      // always compute the true remaining time from Date.now(),
      // whether the player checked back in 2 minutes or 2 days.
      activeResearch: null,
      // Whether the player has finished (or explicitly skipped) the
      // guided first-battle tutorial — see tutorial.js. A fresh save
      // hasn't, so the very first tap on PLAY launches the tutorial
      // battle instead of a normal one.
      hasSeenTutorial: false,
      // First-visit explainer per SCREEN (Deck Builder, Research Lab,
      // Collection, Shop, Campaign, ...) — { screenId: true } once
      // shown. Separate from hasSeenTutorial (that's specifically the
      // guided BATTLE) and from each other (visiting Deck Builder for
      // the first time doesn't mark Research Lab's own intro as seen).
      seenScreenIntros: {}
    };
  }

  function seedStarterInstances() {
    const baseCards = window.CardData?.cards || [];
    return baseCards
      .filter(c => c.type === "character")
      .map(c => ({ instanceId: makeInstanceId(), cardName: c.name, level: 1 }));
  }

  function makeInstanceId() {
    return `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultState();
      const parsed = JSON.parse(raw);

      // Migrate old saves: itemCounts used to be a simple unlockedItems
      // array (unlocked or not, no quantity). Give each previously
      // unlocked item a starting count of 3 so nothing is lost.
      let itemCounts = parsed.itemCounts && typeof parsed.itemCounts === "object"
        ? parsed.itemCounts
        : null;

      if (!itemCounts) {
        itemCounts = {};
        (Array.isArray(parsed.unlockedItems) ? parsed.unlockedItems : []).forEach(name => {
          itemCounts[name] = 3;
        });
      }

      // Fusion Research migration: old saves have no researchedFusions
      // field at all. Grandfather in anything the player could ALREADY
      // perform before this system existed — any named combo whose
      // item they already own — so nobody has to re-research something
      // they'd effectively already unlocked.
      let researchedFusions = Array.isArray(parsed.researchedFusions)
        ? parsed.researchedFusions
        : null;

      if (!researchedFusions) {
        researchedFusions = [];
        const comboDefs = window.CardData?.combos || {};
        Object.keys(comboDefs).forEach(comboKey => {
          const itemName = comboKey.split("|")[1];
          if (itemCounts[itemName] > 0) researchedFusions.push(comboKey);
        });
      }

      const activeResearch = parsed.activeResearch
        && typeof parsed.activeResearch.comboKey === "string"
        && typeof parsed.activeResearch.finishAt === "number"
        ? parsed.activeResearch
        : null;

      return {
        coins: parsed.coins || 0,
        itemCounts,
        ownedInstances: Array.isArray(parsed.ownedInstances) && parsed.ownedInstances.length
          ? parsed.ownedInstances
          : seedStarterInstances(),
        deck: parsed.deck && Array.isArray(parsed.deck.instanceIds) ? parsed.deck : null,
        stageProgress: parsed.stageProgress || {},
        researchPoints: typeof parsed.researchPoints === "number" ? parsed.researchPoints : 500,
        researchedFusions,
        researchSpeedupCharges: typeof parsed.researchSpeedupCharges === "number"
          ? parsed.researchSpeedupCharges
          : 0,
        activeResearch,
        // Migration default is TRUE (already seen), not false — anyone
        // loading an old save already has real progress and clearly
        // knows how to play; only a genuinely brand-new save (no
        // localStorage at all, using getDefaultState() instead of this
        // migration path) should default to false and get the guided
        // tutorial.
        hasSeenTutorial: typeof parsed.hasSeenTutorial === "boolean" ? parsed.hasSeenTutorial : true,
        // Unlike hasSeenTutorial, this one just defaults to empty for
        // EVERYONE (including migrated saves) — these are low-stakes,
        // purely informational, dismiss-and-forget popups, not a gate,
        // so there's no harm (and maybe even a nice reminder) in a
        // returning player seeing them once too.
        seenScreenIntros: parsed.seenScreenIntros && typeof parsed.seenScreenIntros === "object"
          ? parsed.seenScreenIntros
          : {}
      };
    } catch (err) {
      console.warn("Progression: failed to load save, starting fresh.", err);
      return getDefaultState();
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("Progression: failed to save.", err);
    }
  }

  let state = load();

  function getProgress() {
    return state;
  }

  function getCoins() {
    return state.coins;
  }

  function isStageCompleted(stageId) {
    return !!state.stageProgress[stageId]?.completed;
  }

  function getOwnedItemCount(itemName) {
    return state.itemCounts[itemName] || 0;
  }

  function isItemUnlocked(itemName) {
    return getOwnedItemCount(itemName) > 0;
  }

  function grantItem(itemName, amount = 1) {
    state.itemCounts[itemName] = (state.itemCounts[itemName] || 0) + amount;
  }

  // --- Shop: buy MORE copies of an item you've already discovered.
  // Deliberately can't buy something you've never unlocked — that would
  // bypass the whole "discover it via Campaign/Quick Battle" mystery
  // system. This is just a reliable way to stock up on things you
  // already know about, instead of hoping for another random drop.
  const SHOP_ITEM_PRICE = 25;

  function buyItem(itemName) {
    if (!isItemUnlocked(itemName)) {
      return { success: false, reason: "locked" };
    }

    if (state.coins < SHOP_ITEM_PRICE) {
      return { success: false, reason: "coins", cost: SHOP_ITEM_PRICE };
    }

    state.coins -= SHOP_ITEM_PRICE;
    grantItem(itemName, 1);
    persist();

    return { success: true, cost: SHOP_ITEM_PRICE };
  }

  // --- Fusion Research ---
  // A SEPARATE currency (researchPoints) from coins, and a separate
  // "researched or not" flag PER NAMED COMBO — owning the character and
  // item is no longer enough on its own to actually perform that combo
  // in battle (see script.js's playCardOnSlot for the battle-side gate).
  // Only ONE research slot for now (state.activeResearch is a single
  // object, not an array) — adding a second slot later just means
  // turning that into an array and teaching a couple of these functions
  // to loop over it; nothing else here needs to change shape for that.

  function getResearchPoints() {
    return state.researchPoints;
  }

  // No real source grants these yet — this is the one deliberately
  // "unwired" hook the spec asked for, ready for Stages/Bosses/Missions
  // to call later without touching anything else in this module.
  function addResearchPoints(amount) {
    state.researchPoints += amount;
    persist();
    return state.researchPoints;
  }

  function isFusionResearched(comboKey) {
    return state.researchedFusions.includes(comboKey);
  }

  function getActiveResearch() {
    return state.activeResearch;
  }

  function getComboDef(comboKey) {
    return (window.CardData?.combos || {})[comboKey] || null;
  }

  // "idle" (nothing running) | "researching" (timer still counting
  // down) | "ready" (timer done, waiting on claimResearch()). Always
  // computed fresh from Date.now() vs the stored finishAt timestamp —
  // never from a ticking-down counter, so it's correct even after the
  // game was closed for hours.
  function getResearchStatus() {
    if (!state.activeResearch) return "idle";
    return Date.now() >= state.activeResearch.finishAt ? "ready" : "researching";
  }

  function ownsComboRequirements(comboKey) {
    const combo = getComboDef(comboKey);
    if (!combo) return false;

    const [characterName, itemName] = comboKey.split("|");
    const ownsCharacter = state.ownedInstances.some(i => i.cardName === characterName);
    const ownsItem = getOwnedItemCount(itemName) > 0;

    return ownsCharacter && ownsItem;
  }

  // Doesn't just return true/false — the UI needs to explain WHY a
  // research can't start (missing character, missing item, not enough
  // points, a slot already busy, or already researched), so this
  // returns a reason code instead of throwing/guessing.
  function canStartResearch(comboKey) {
    const combo = getComboDef(comboKey);
    if (!combo) return { canStart: false, reason: "no-combo" };
    if (isFusionResearched(comboKey)) return { canStart: false, reason: "already-researched" };
    if (state.activeResearch) return { canStart: false, reason: "slot-busy" };
    if (!ownsComboRequirements(comboKey)) return { canStart: false, reason: "missing-requirements" };

    const cost = combo.researchCost ?? 0;
    if (state.researchPoints < cost) return { canStart: false, reason: "points", cost };

    return { canStart: true };
  }

  function startResearch(comboKey) {
    const check = canStartResearch(comboKey);
    if (!check.canStart) return { success: false, reason: check.reason, cost: check.cost };

    const combo = getComboDef(comboKey);
    const cost = combo.researchCost ?? 0;
    const durationMs = combo.researchTime ?? 0;

    state.researchPoints -= cost;
    state.activeResearch = {
      comboKey,
      startedAt: Date.now(),
      finishAt: Date.now() + durationMs
    };

    persist();
    return { success: true };
  }

  // Only actually unlocks the Fusion once the player explicitly claims
  // it (never silently in the background) — matches the "🎉 RESEARCH
  // COMPLETE" / "CLAIM FUSION" flow in the Research Lab screen.
  function claimResearch() {
    if (getResearchStatus() !== "ready") {
      return { success: false, reason: "not-ready" };
    }

    const comboKey = state.activeResearch.comboKey;
    state.researchedFusions.push(comboKey);
    state.activeResearch = null;

    persist();
    return { success: true, comboKey };
  }

  // Shop item: pay coins to shave time off the CURRENTLY active
  // research. Each purchase is a flat, small chunk — never enough to
  // trivialize research on its own, just a convenience for someone who
  // wants to shorten a wait a bit. Buying and USING are two separate
  // steps now: buying just adds to a stockpile of charges (no active
  // research required), and each charge is applied to the currently
  // active research explicitly, one at a time, whenever the player
  // actually wants to spend one.
  const RESEARCH_SPEEDUP_MINUTES = 10;
  const RESEARCH_SPEEDUP_PRICE = 15;

  function getResearchSpeedupCharges() {
    return state.researchSpeedupCharges;
  }

  function buySpeedupCharge() {
    if (state.coins < RESEARCH_SPEEDUP_PRICE) {
      return { success: false, reason: "coins", cost: RESEARCH_SPEEDUP_PRICE };
    }

    state.coins -= RESEARCH_SPEEDUP_PRICE;
    state.researchSpeedupCharges += 1;

    persist();
    return { success: true, cost: RESEARCH_SPEEDUP_PRICE, charges: state.researchSpeedupCharges };
  }

  function useSpeedupCharge() {
    if (state.researchSpeedupCharges <= 0) {
      return { success: false, reason: "no-charges" };
    }

    if (getResearchStatus() !== "researching") {
      return { success: false, reason: "no-active-research" };
    }

    state.researchSpeedupCharges -= 1;
    state.activeResearch.finishAt -= RESEARCH_SPEEDUP_MINUTES * 60 * 1000;

    persist();
    return {
      success: true,
      minutesSaved: RESEARCH_SPEEDUP_MINUTES,
      chargesLeft: state.researchSpeedupCharges
    };
  }

  // --- Tutorial ---
  function shouldShowTutorial() {
    return !state.hasSeenTutorial;
  }

  function markTutorialSeen() {
    state.hasSeenTutorial = true;
    persist();
  }

  // --- Screen intros (first-visit "what is this screen for" popups) ---
  function hasSeenScreenIntro(screenId) {
    return !!state.seenScreenIntros[screenId];
  }

  function markScreenIntroSeen(screenId) {
    state.seenScreenIntros[screenId] = true;
    persist();
  }

  // --- Card instances & merge-upgrades ---
  const MAX_CARD_LEVEL = 5;
  // HP bonus was 5 before the Animation-Throwdown-style rebalance
  // (base characters used to sit around 20-24 HP). Now that base HP is
  // down around 15-18, a flat +5/level would dominate the whole curve —
  // dropped to +3 so leveling still matters without swamping base stats.
  const LEVEL_ATK_BONUS = 2;
  const LEVEL_HP_BONUS = 3;

  function getInstance(instanceId) {
    return state.ownedInstances.find(i => i.instanceId === instanceId) || null;
  }

  function getInstancesByCardName(cardName) {
    return state.ownedInstances.filter(i => i.cardName === cardName);
  }

  function getUpgradeCost(level) {
    return level * 40; // level 1->2 costs 40, 2->3 costs 80, etc.
  }

  // Single source of truth for "what does level X actually DO to stats" —
  // used both by the real battle (script.js) and by the Collection screen
  // preview (ui.js), so they can never drift apart from each other.
  function getStatsAtLevel(baseAtk, baseHp, level) {
    const bonus = Math.max(0, level - 1);
    return {
      atk: baseAtk + bonus * LEVEL_ATK_BONUS,
      hp: baseHp + bonus * LEVEL_HP_BONUS
    };
  }

  // Merges two identical-level copies of the same character into ONE
  // copy at level+1, spending coins. Both source instances are consumed.
  // Returns a result object instead of throwing, so the UI can show
  // *why* it failed without try/catch everywhere.
  function mergeUpgrade(instanceIdA, instanceIdB) {
    if (instanceIdA === instanceIdB) {
      return { success: false, reason: "same" };
    }

    const a = getInstance(instanceIdA);
    const b = getInstance(instanceIdB);

    if (!a || !b) return { success: false, reason: "missing" };
    if (a.cardName !== b.cardName) return { success: false, reason: "mismatch" };
    if (a.level !== b.level) return { success: false, reason: "mismatch" };
    if (a.level >= MAX_CARD_LEVEL) return { success: false, reason: "max" };

    const cost = getUpgradeCost(a.level);
    if (state.coins < cost) return { success: false, reason: "coins", cost };

    state.coins -= cost;
    state.ownedInstances = state.ownedInstances.filter(
      i => i.instanceId !== instanceIdA && i.instanceId !== instanceIdB
    );

    const merged = { instanceId: makeInstanceId(), cardName: a.cardName, level: a.level + 1 };
    state.ownedInstances.push(merged);

    // Keep the deck selection consistent: the two consumed instances
    // can't stay "in the deck" (they don't exist anymore). If EITHER of
    // them was in the deck, the merged result takes its place — so
    // merging a card that's actually equipped never silently drops it
    // from the deck. (Net character count can only go DOWN by one here
    // — two consumed, one created — so this can never push the deck
    // over MAX_DECK_CHARACTERS.)
    if (state.deck) {
      const hadEither = state.deck.instanceIds.includes(instanceIdA)
        || state.deck.instanceIds.includes(instanceIdB);

      state.deck.instanceIds = state.deck.instanceIds.filter(
        id => id !== instanceIdA && id !== instanceIdB
      );

      if (hadEither) state.deck.instanceIds.push(merged.instanceId);
    }

    persist();

    return { success: true, newInstance: merged, cost };
  }

  // Grants a brand new level-1 copy of a character (campaign reward type
  // "characterCopy"). Not a merge — just adds to the pool. Auto-joins the
  // deck too (if a deck already exists and there's room under the
  // MAX_DECK_CHARACTERS cap) — remove it in Deck Builder if unwanted.
  function grantCharacterCopy(cardName) {
    const instance = { instanceId: makeInstanceId(), cardName, level: 1 };
    state.ownedInstances.push(instance);
    if (state.deck && state.deck.instanceIds.length < MAX_DECK_CHARACTERS) {
      state.deck.instanceIds.push(instance.instanceId);
    }
    return instance;
  }

  // --- Deck Builder ---
  const MIN_DECK_SIZE = 10;
  // Deliberately less than "all 12" — forces an actual choice about
  // which characters to bring, instead of just including everyone.
  // That's the whole point of a deck at all: real tradeoffs.
  const MAX_DECK_CHARACTERS = 7;

  // Materializes a real, persisted deck the first time anything actually
  // needs one — defaulting to the first MAX_DECK_CHARACTERS instances you
  // own (not "everything", now that there's a cap), plus every owned
  // item at its full owned count. After this runs once, it's a real
  // saved selection the player can edit; future character grants keep
  // adding to it by default if there's room (see grantCharacterCopy) —
  // item grants do NOT auto-add to the deck, since item COUNTS in the
  // deck are something the player explicitly dials in, not an on/off
  // switch anymore.
  function ensureDeckMaterialized() {
    if (state.deck) return state.deck;

    state.deck = {
      instanceIds: state.ownedInstances.slice(0, MAX_DECK_CHARACTERS).map(i => i.instanceId),
      itemCounts: { ...state.itemCounts }
    };
    persist();

    return state.deck;
  }

  function getDeckSelection() {
    return ensureDeckMaterialized();
  }

  function isInstanceInDeck(instanceId) {
    return ensureDeckMaterialized().instanceIds.includes(instanceId);
  }

  function toggleDeckInstance(instanceId) {
    const deck = ensureDeckMaterialized();
    const idx = deck.instanceIds.indexOf(instanceId);

    if (idx === -1) deck.instanceIds.push(instanceId);
    else deck.instanceIds.splice(idx, 1);

    persist();
    return deck.instanceIds.includes(instanceId);
  }

  function getDeckItemCount(itemName) {
    return ensureDeckMaterialized().itemCounts[itemName] || 0;
  }

  // Sets how many copies of this item go in the deck — clamped between
  // 0 and however many you actually OWN (can't put in more than you have).
  function setDeckItemCount(itemName, count) {
    const deck = ensureDeckMaterialized();
    const owned = getOwnedItemCount(itemName);
    const clamped = Math.max(0, Math.min(count, owned));

    deck.itemCounts[itemName] = clamped;
    persist();

    return clamped;
  }

  // Characters count 1-for-1; items count by however many copies were
  // actually dialed in for the deck (see setDeckItemCount) — no more
  // fixed "x3 per included item" like before.
  function getDeckCount() {
    const deck = ensureDeckMaterialized();
    const characters = deck.instanceIds.length;
    const itemCopies = Object.values(deck.itemCounts).reduce((sum, n) => sum + n, 0);
    return { characters, itemCopies, total: characters + itemCopies };
  }

  // Total owned across everything (characters + item copies) — used for
  // the Deck Builder's "X מתוך Y" (X out of Y) counter.
  function getTotalOwnedCount() {
    const characters = state.ownedInstances.length;
    const itemCopies = Object.values(state.itemCounts).reduce((sum, n) => sum + n, 0);
    return characters + itemCopies;
  }

  function findStage(stageId) {
    const worlds = window.CampaignData?.worlds || [];
    for (const world of worlds) {
      for (const location of world.locations) {
        const stage = location.stages.find(s => s.id === stageId);
        if (stage) return { world, location, stage };
      }
    }
    return null;
  }

  function findLocation(locationId) {
    const worlds = window.CampaignData?.worlds || [];
    for (const world of worlds) {
      const location = world.locations.find(l => l.id === locationId);
      if (location) return { world, location };
    }
    return null;
  }

  function isWorldCompleted(worldId) {
    const world = (window.CampaignData?.worlds || []).find(w => w.id === worldId);
    if (!world) return false;

    return world.locations.every(location => {
      const bossStage = location.stages[location.stages.length - 1];
      return isStageCompleted(bossStage.id);
    });
  }

  function isWorldUnlocked(worldId) {
    const world = (window.CampaignData?.worlds || []).find(w => w.id === worldId);
    if (!world) return false;
    if (!world.unlockRequiresWorldCompleted) return true;
    return isWorldCompleted(world.unlockRequiresWorldCompleted);
  }

  function isLocationUnlocked(locationId) {
    const found = findLocation(locationId);
    if (!found) return false;
    const { world, location } = found;
    if (!isWorldUnlocked(world.id)) return false;
    if (!location.unlockRequiresStage) return true;
    return isStageCompleted(location.unlockRequiresStage);
  }

  function isStageUnlocked(stageId) {
    const found = findStage(stageId);
    if (!found) return false;
    const { location, stage } = found;

    if (!isLocationUnlocked(location.id)) return false;

    const idx = location.stages.findIndex(s => s.id === stage.id);
    if (idx <= 0) return true;

    const previousStage = location.stages[idx - 1];
    return isStageCompleted(previousStage.id);
  }

  function grantRewards(rewards = []) {
    const granted = { coins: 0, items: [], characterCopies: [], researchPoints: 0 };

    rewards.forEach(reward => {
      if (reward.type === "coins") {
        state.coins += reward.amount;
        granted.coins += reward.amount;
      } else if (reward.type === "unlockItem") {
        grantItem(reward.item, reward.amount || 1);
        granted.items.push(reward.item);
      } else if (reward.type === "characterCopy") {
        grantCharacterCopy(reward.character);
        granted.characterCopies.push(reward.character);
      } else if (reward.type === "researchPoints") {
        addResearchPoints(reward.amount);
        granted.researchPoints += reward.amount;
      }
    });

    return granted;
  }

  // --- Quick Battle rewards (difficulty-based, no campaign stage
  // involved) ---

  // Items never "run out" anymore (you can always get another copy of
  // something you already have — it's still useful, since the Deck
  // Builder lets you include multiple), so this just picks any item
  // uniformly — no more "all unlocked, fall back to coins" edge case.
  function pickRandomItemName() {
    const allItemNames = (window.CardData?.cards || [])
      .filter(c => c.type === "item")
      .map(c => c.name);

    if (!allItemNames.length) return null;
    return allItemNames[Math.floor(Math.random() * allItemNames.length)];
  }

  function pickRandomCharacterName() {
    const characterNames = (window.CardData?.cards || [])
      .filter(c => c.type === "character")
      .map(c => c.name);

    if (!characterNames.length) return null;
    return characterNames[Math.floor(Math.random() * characterNames.length)];
  }

  // Rolls a Quick Battle win's reward from a difficulty config:
  // { coinsMin, coinsMax, bonusChance, bonusType: "item" | "characterCopy" }
  // Coins are always granted; the bonus is a separate independent roll
  // ON TOP of the coins (not instead of them) — see the design note in
  // chat for why "always something, sometimes something extra" beats
  // "sometimes less".
  function rollQuickBattleReward(config) {
    const coins = Math.floor(config.coinsMin + Math.random() * (config.coinsMax - config.coinsMin + 1));
    const rewards = [{ type: "coins", amount: coins }];

    // Research Points from Quick Battle wins — the ONLY real source of
    // these right now (the starting 500 was always just a testing
    // default, with nothing else topping it up). Always granted (like
    // coins), not a chance roll like the item/characterCopy bonus below.
    if (config.researchMin !== undefined && config.researchMax !== undefined) {
      const researchPoints = Math.floor(
        config.researchMin + Math.random() * (config.researchMax - config.researchMin + 1)
      );
      rewards.push({ type: "researchPoints", amount: researchPoints });
    }

    if (Math.random() < config.bonusChance) {
      if (config.bonusType === "item") {
        const item = pickRandomItemName();
        if (item) rewards.push({ type: "unlockItem", item });
      } else if (config.bonusType === "characterCopy") {
        const character = pickRandomCharacterName();
        if (character) rewards.push({ type: "characterCopy", character });
      }
    }

    return grantRewards(rewards);
  }

  // Called when a stage is won. Rewards only grant on the FIRST clear —
  // replaying an already-completed stage is still allowed (for practice)
  // but doesn't hand out coins/items/copies again, since you already
  // have them.
  function completeStage(stageId) {
    const found = findStage(stageId);
    if (!found) return null;

    const { world, location, stage } = found;
    const alreadyCompleted = isStageCompleted(stageId);
    const granted = alreadyCompleted ? { coins: 0, items: [], characterCopies: [] } : grantRewards(stage.rewards || []);

    state.stageProgress[stageId] = {
      completed: true,
      stars: 3
    };

    let bonusGranted = null;

    if (
      stage.type === "boss" &&
      world.completionBonus &&
      isWorldCompleted(world.id) &&
      !state.stageProgress[world.completionBonus.id]?.completed
    ) {
      bonusGranted = grantRewards(world.completionBonus.rewards || []);
      state.stageProgress[world.completionBonus.id] = { completed: true };
    }

    persist();

    return {
      stage,
      location,
      world,
      granted,
      bonusGranted,
      alreadyCompleted
    };
  }

  function resetProgress() {
    state = getDefaultState();
    persist();
  }

  return {
    getProgress,
    getCoins,
    isStageCompleted,
    isStageUnlocked,
    isLocationUnlocked,
    isWorldUnlocked,
    isWorldCompleted,
    isItemUnlocked,
    buyItem,
    getResearchPoints,
    addResearchPoints,
    isFusionResearched,
    getActiveResearch,
    getResearchStatus,
    canStartResearch,
    startResearch,
    claimResearch,
    getResearchSpeedupCharges,
    buySpeedupCharge,
    useSpeedupCharge,
    shouldShowTutorial,
    markTutorialSeen,
    hasSeenScreenIntro,
    markScreenIntroSeen,
    RESEARCH_SPEEDUP_MINUTES,
    RESEARCH_SPEEDUP_PRICE,
    SHOP_ITEM_PRICE,
    getOwnedItemCount,
    getInstance,
    getInstancesByCardName,
    getUpgradeCost,
    getStatsAtLevel,
    mergeUpgrade,
    grantCharacterCopy,
    rollQuickBattleReward,
    getDeckSelection,
    isInstanceInDeck,
    toggleDeckInstance,
    getDeckItemCount,
    setDeckItemCount,
    getDeckCount,
    getTotalOwnedCount,
    MAX_CARD_LEVEL,
    MIN_DECK_SIZE,
    MAX_DECK_CHARACTERS,
    completeStage,
    resetProgress
  };
})();
