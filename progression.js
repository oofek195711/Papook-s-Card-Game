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
// you can own two "אופק טלקר" at different levels, both playable). ITEMS
// stay simple booleans (unlocked or not) — they don't level up on their
// own, they just add a flat bonus to whatever character they're fused
// onto (see script.js's fuseCards).
window.Progression = (() => {
  const STORAGE_KEY = "papook_progress";

  function getDefaultState() {
    return {
      coins: 0,
      // These 3 aren't fusion-building items (they're the "weakness"
      // items used AGAINST the original 5 characters), so unlocking them
      // by default doesn't spoil any campaign "I built a new card!"
      // moment — it just means Quick Battle and Collection aren't
      // completely empty of items on a brand new save.
      unlockedItems: ["חתול", "קטשופ", "דגדוגים"],
      // Seeded with one level-1 copy of every base character — "the core
      // roster is always yours", just formalized as real owned instances
      // now instead of a blanket always-unlocked rule.
      ownedInstances: seedStarterInstances(),
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
      return {
        coins: parsed.coins || 0,
        unlockedItems: Array.isArray(parsed.unlockedItems) ? parsed.unlockedItems : [],
        ownedInstances: Array.isArray(parsed.ownedInstances) && parsed.ownedInstances.length
          ? parsed.ownedInstances
          : seedStarterInstances(),
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

  function isItemUnlocked(itemName) {
    return state.unlockedItems.includes(itemName);
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

    persist();

    return { success: true, newInstance: merged, cost };
  }

  // Grants a brand new level-1 copy of a character (campaign reward type
  // "characterCopy"). Not a merge — just adds to the pool.
  function grantCharacterCopy(cardName) {
    const instance = { instanceId: makeInstanceId(), cardName, level: 1 };
    state.ownedInstances.push(instance);
    return instance;
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
        if (!state.unlockedItems.includes(reward.item)) {
          state.unlockedItems.push(reward.item);
          granted.items.push(reward.item);
        }
      } else if (reward.type === "characterCopy") {
        grantCharacterCopy(reward.character);
        granted.characterCopies.push(reward.character);
      }
    });

    return granted;
  }

  // --- Quick Battle rewards (difficulty-based, no campaign stage
  // involved) ---

  function pickRandomLockedItem() {
    const allItemNames = (window.CardData?.cards || [])
      .filter(c => c.type === "item")
      .map(c => c.name);

    const locked = allItemNames.filter(name => !state.unlockedItems.includes(name));
    if (!locked.length) return null;

    return locked[Math.floor(Math.random() * locked.length)];
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
    let bonusMissedFallbackCoins = 0;

    if (Math.random() < config.bonusChance) {
      if (config.bonusType === "item") {
        const item = pickRandomLockedItem();
        if (item) {
          rewards.push({ type: "unlockItem", item });
        } else {
          // Every item already unlocked — give half the coin roll again
          // instead of a bonus that has nothing left to give.
          bonusMissedFallbackCoins = Math.round(coins * 0.5);
          rewards.push({ type: "coins", amount: bonusMissedFallbackCoins });
        }
      } else if (config.bonusType === "characterCopy") {
        const character = pickRandomCharacterName();
        if (character) rewards.push({ type: "characterCopy", character });
      }
    }

    return grantRewards(rewards);
  }

  // Called once when a stage is won. Idempotent-ish: replaying an already
  // completed stage still grants rewards again (that's a deliberate,
  // simple choice for now — no "first clear only" bookkeeping yet).
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
    getInstance,
    getInstancesByCardName,
    getUpgradeCost,
    getStatsAtLevel,
    mergeUpgrade,
    grantCharacterCopy,
    rollQuickBattleReward,
    MAX_CARD_LEVEL,
    completeStage,
    resetProgress
  };
})();
