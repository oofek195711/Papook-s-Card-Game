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
      stageProgress: {}    // stageId -> { completed: true, stars: 1-3 }
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

      return {
        coins: parsed.coins || 0,
        itemCounts,
        ownedInstances: Array.isArray(parsed.ownedInstances) && parsed.ownedInstances.length
          ? parsed.ownedInstances
          : seedStarterInstances(),
        deck: parsed.deck && Array.isArray(parsed.deck.instanceIds) ? parsed.deck : null,
        stageProgress: parsed.stageProgress || {}
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

  // --- Card instances & merge-upgrades ---
  const MAX_CARD_LEVEL = 5;
  const LEVEL_ATK_BONUS = 2;
  const LEVEL_HP_BONUS = 5;

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
    // can't stay "in the deck" (they don't exist anymore). If BOTH of
    // them were actually in the deck, swap them for the new merged
    // instance so the deck doesn't silently shrink from under you.
    if (state.deck) {
      const hadBoth = state.deck.instanceIds.includes(instanceIdA)
        && state.deck.instanceIds.includes(instanceIdB);

      state.deck.instanceIds = state.deck.instanceIds.filter(
        id => id !== instanceIdA && id !== instanceIdB
      );

      if (hadBoth) state.deck.instanceIds.push(merged.instanceId);
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
    const granted = { coins: 0, items: [], characterCopies: [] };

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
