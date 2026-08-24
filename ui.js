// Handles everything OUTSIDE the battle itself: the Home screen, screen
// navigation, and the Collection browser. Kept separate from script.js
// (the battle engine) on purpose, same reasoning as the cards/skills/
// effects/ai split — so this file can grow without script.js turning
// into one giant file again.
window.UI = (() => {
  const { cards, combos } = window.CardData;

  // Tap-to-select state for the merge-to-upgrade flow (Collection ->
  // characters tab only). Not persisted anywhere — purely UI state.
  let selectedInstanceId = null;

  function showScreen(id) {
    document.querySelectorAll(".home-screen, .sub-screen, #battleScreen")
      .forEach(el => el.classList.add("hidden"));

    document.getElementById(id).classList.remove("hidden");

    // Coins are visible everywhere EXCEPT mid-battle (battle has its own
    // top-bar; showing them there too would be clutter).
    const coinsDisplay = document.getElementById("coinsDisplay");
    if (id === "battleScreen") {
      coinsDisplay.classList.add("hidden");
    } else {
      coinsDisplay.classList.remove("hidden");
      updateCoinsDisplay();
    }
  }

  function updateCoinsDisplay() {
    const amountEl = document.getElementById("coinsAmount");
    if (amountEl && window.Progression) {
      amountEl.innerText = window.Progression.getCoins();
    }
  }

  // All the Fusion recipes a character can take part in, e.g. for
  // "אור לוין" -> [{ itemName: "כדור", comboName: "אור המאמן" }]
  function fusionsForCharacter(characterName) {
    return Object.entries(combos)
      .filter(([key]) => key.startsWith(`${characterName}|`))
      .map(([key, combo]) => ({
        itemName: key.split("|")[1],
        comboName: combo.name
      }));
  }

  // Same idea in reverse, for an item card, e.g. for "כדור" ->
  // [{ characterName: "אור לוין", comboName: "אור המאמן" }]
  function fusionsForItem(itemName) {
    return Object.entries(combos)
      .filter(([key]) => key.endsWith(`|${itemName}`))
      .map(([key, combo]) => ({
        characterName: key.split("|")[0],
        comboName: combo.name
      }));
  }

  function isItemLocked(itemName) {
    return !!window.Progression && !window.Progression.isItemUnlocked(itemName);
  }

  // A locked item card renders as a total mystery — no name, no image,
  // no stats, nothing that spoils what it is. Only appears once unlocked.
  function mysteryTileHtml() {
    return `
      <div class="collection-card locked mystery">
        <div class="collection-mystery-icon">🔒</div>
        <div class="collection-card-name">???</div>
      </div>
    `;
  }

  // Full equation both ways: "אופק + הגדלה → אופק הגדלה" (not just
  // "+ item → result", which reads backwards) — and a mystery chip if
  // the item involved is still locked, so it doesn't spoil the name.
  function fusionsHtmlFor(characterName, isCharacterTile, card, fusions) {
    if (!fusions.length) {
      return `<div class="collection-fusions no-fusions">אין Fusion מוגדר עדיין</div>`;
    }

    return `<div class="collection-fusions">
      ${fusions.map(f => {
        const charName = isCharacterTile ? card.name : f.characterName;
        const itemName = isCharacterTile ? f.itemName : card.name;

        if (isItemLocked(itemName)) {
          return `<div class="fusion-chip mystery">${charName} + ??? → ???</div>`;
        }
        return `<div class="fusion-chip">${charName} + ${itemName} → ${f.comboName}</div>`;
      }).join("")}
    </div>`;
  }

  // --- Characters tab: one tile PER OWNED INSTANCE, not per character.
  // Two "אופק LV2" copies show as two separate, individually-tappable
  // tiles — tapping two matching ones (same name, same level) opens a
  // merge-to-upgrade confirmation.

  function instanceCardTileHtml(instance, baseCard) {
    const P = window.Progression;
    const leveled = P.getStatsAtLevel(baseCard.atk, baseCard.hp, instance.level);
    const isSelected = instance.instanceId === selectedInstanceId;
    const maxed = instance.level >= P.MAX_CARD_LEVEL;

    const weaknessHtml = baseCard.weaknesses?.length
      ? `<div class="collection-weakness">חולשה: ${baseCard.weaknesses.map(w => w.item).join(", ")}</div>`
      : "";

    const hintHtml = maxed
      ? `<div class="collection-level-maxed">רמה מקסימלית</div>`
      : `<div class="collection-merge-hint">${isSelected ? "בחר עותק זהה למיזוג" : "הקש לבחירה"}</div>`;

    const fusions = fusionsForCharacter(baseCard.name);

    return `
      <div class="collection-card instance-card ${isSelected ? "selected" : ""}"
        data-instance-id="${instance.instanceId}">
        <img src="${baseCard.image}" class="collection-card-img" alt="${baseCard.name}">
        <div class="collection-card-name">${baseCard.name}</div>
        <div class="collection-level-row"><span class="collection-level-badge">Lv.${instance.level}</span></div>
        <div class="collection-stats"><span>⚔️ ${leveled.atk}</span><span>❤️ ${leveled.hp}</span></div>
        ${weaknessHtml}
        ${hintHtml}
        ${fusionsHtmlFor(baseCard.name, true, baseCard, fusions)}
      </div>
    `;
  }

  function renderCharacterInstances() {
    const grid = document.getElementById("collectionGrid");
    // Rebuilding the whole grid's innerHTML resets its scroll position to
    // the top — which felt like a jarring "jump" every time you tapped a
    // card mid-scroll. Save and restore it across the rebuild.
    const scrollTop = grid.scrollTop;

    const instances = [...window.Progression.getProgress().ownedInstances].sort((a, b) => {
      if (a.cardName !== b.cardName) return a.cardName.localeCompare(b.cardName, "he");
      return b.level - a.level;
    });

    grid.innerHTML = instances
      .map(inst => {
        const baseCard = cards.find(c => c.name === inst.cardName);
        return baseCard ? instanceCardTileHtml(inst, baseCard) : "";
      })
      .join("");

    grid.querySelectorAll(".instance-card").forEach(el => {
      el.addEventListener("click", () => handleInstanceTap(el.dataset.instanceId));
    });

    grid.scrollTop = scrollTop;
  }

  // Confirmation popup before spending coins on a merge — shows the
  // before/after stats side by side so it actually FEELS like the merge
  // makes something stronger, instead of just silently consuming cards.
  function showMergeConfirm(baseCard, level) {
    const P = window.Progression;
    const before = P.getStatsAtLevel(baseCard.atk, baseCard.hp, level);
    const after = P.getStatsAtLevel(baseCard.atk, baseCard.hp, level + 1);
    const cost = P.getUpgradeCost(level);
    const canAfford = P.getCoins() >= cost;

    const backdrop = document.createElement("div");
    backdrop.className = "choose-modal-backdrop";

    backdrop.innerHTML = `
      <div class="choose-modal upgrade-confirm-modal">
        <div class="choose-modal-title">למזג 2× ${baseCard.name} (Lv.${level})?</div>
        <div class="upgrade-confirm-levels">מיזוג: מרמה ${level} לרמה ${level + 1}</div>
        <div class="upgrade-confirm-stats">
          <div class="upgrade-confirm-stat-row">
            <span>⚔️ התקפה</span>
            <span class="upgrade-confirm-before">${before.atk}</span>
            <span class="upgrade-confirm-arrow">←</span>
            <span class="upgrade-confirm-after">${after.atk}</span>
          </div>
          <div class="upgrade-confirm-stat-row">
            <span>❤️ חיים</span>
            <span class="upgrade-confirm-before">${before.hp}</span>
            <span class="upgrade-confirm-arrow">←</span>
            <span class="upgrade-confirm-after">${after.hp}</span>
          </div>
        </div>
        <div class="upgrade-confirm-cost">מחיר: ${cost}💰 ${canAfford ? "" : "(אין מספיק מטבעות)"}</div>
        <div class="upgrade-confirm-buttons">
          <button type="button" class="upgrade-confirm-cancel">ביטול</button>
          <button type="button" class="upgrade-confirm-ok" ${canAfford ? "" : "disabled"}>מזג!</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    return new Promise(resolve => {
      backdrop.querySelector(".upgrade-confirm-cancel").onclick = () => {
        backdrop.remove();
        resolve(false);
      };
      backdrop.querySelector(".upgrade-confirm-ok").onclick = () => {
        if (!canAfford) return;
        backdrop.remove();
        resolve(true);
      };
    });
  }

  async function handleInstanceTap(instanceId) {
    const P = window.Progression;
    const tapped = P.getInstance(instanceId);
    if (!tapped) return;

    if (!selectedInstanceId) {
      selectedInstanceId = instanceId;
      renderCharacterInstances();
      return;
    }

    if (selectedInstanceId === instanceId) {
      selectedInstanceId = null;
      renderCharacterInstances();
      return;
    }

    const first = P.getInstance(selectedInstanceId);

    // Doesn't match (different character or different level) — just
    // switch the selection to whatever was tapped instead of a dead end.
    if (!first || first.cardName !== tapped.cardName || first.level !== tapped.level) {
      selectedInstanceId = instanceId;
      renderCharacterInstances();
      return;
    }

    if (tapped.level >= P.MAX_CARD_LEVEL) {
      selectedInstanceId = null;
      renderCharacterInstances();
      return;
    }

    const baseCard = cards.find(c => c.name === tapped.cardName);
    const confirmed = baseCard && await showMergeConfirm(baseCard, tapped.level);

    selectedInstanceId = null;

    if (confirmed) {
      const result = P.mergeUpgrade(first.instanceId, tapped.instanceId);
      if (result.success) updateCoinsDisplay();
    }

    renderCharacterInstances();
  }

  // --- Items tab: plain, no levels (items don't have levels — see
  // progression.js). Locked items render as a mystery tile.

  function itemCardTileHtml(card) {
    if (isItemLocked(card.name)) return mysteryTileHtml();

    const owned = window.Progression.getOwnedItemCount(card.name);
    const statsHtml = `<div class="collection-stats"><span>⚔️ +${card.atkBonus || 0}</span><span>❤️ +${card.hpBonus || 0}</span></div>`;
    const fusions = fusionsForItem(card.name);

    return `
      <div class="collection-card">
        <img src="${card.image}" class="collection-card-img" alt="${card.name}">
        <div class="collection-card-name">${card.name}</div>
        <div class="collection-owned-badge">יש לך: ${owned}</div>
        ${statsHtml}
        ${fusionsHtmlFor(card.name, false, card, fusions)}
      </div>
    `;
  }

  function renderItems() {
    const grid = document.getElementById("collectionGrid");
    grid.innerHTML = cards
      .filter(c => c.type === "item")
      .map(itemCardTileHtml)
      .join("");
  }

  function renderCollection(filterType) {
    selectedInstanceId = null;
    if (filterType === "character") {
      renderCharacterInstances();
    } else {
      renderItems();
    }
  }

  function initTabs() {
    document.querySelectorAll("#collectionScreen .tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#collectionScreen .tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderCollection(btn.dataset.tab);
      });
    });
  }

  // --- Deck Builder: pick exactly which owned character instances, and
  // how many copies of each owned item, actually go into your playable
  // deck. Character tiles just toggle in/out; item tiles have a real
  // -/+ stepper since you can own (and include) several copies of the
  // same item. Everything auto-saves immediately, no separate "save".

  function updateDeckCountBadge() {
    const P = window.Progression;
    const counts = P.getDeckCount();
    const owned = P.getTotalOwnedCount();
    const badge = document.getElementById("deckCountBadge");
    if (badge) {
      badge.innerText = `${counts.total} מתוך ${owned} קלפים · ${counts.characters}/${P.MAX_DECK_CHARACTERS} דמויות`;
    }
  }

  function deckCharacterTileHtml(instance, baseCard) {
    const P = window.Progression;
    const leveled = P.getStatsAtLevel(baseCard.atk, baseCard.hp, instance.level);
    const inDeck = P.isInstanceInDeck(instance.instanceId);

    return `
      <div class="collection-card deck-tile ${inDeck ? "in-deck" : "out-deck"}"
        data-instance-id="${instance.instanceId}">
        <img src="${baseCard.image}" class="collection-card-img" alt="${baseCard.name}">
        <div class="collection-card-name">${baseCard.name}</div>
        <div class="collection-level-row"><span class="collection-level-badge">Lv.${instance.level}</span></div>
        <div class="collection-stats"><span>⚔️ ${leveled.atk}</span><span>❤️ ${leveled.hp}</span></div>
        <div class="deck-toggle-hint">${inDeck ? "✅ בחפיסה" : "➕ הוסף לחפיסה"}</div>
      </div>
    `;
  }

  // Items get a real quantity stepper (0 up to however many you own) —
  // not just an on/off switch, since owning and using multiple copies
  // of the same item is the whole point now.
  function deckItemTileHtml(card) {
    const P = window.Progression;
    const owned = P.getOwnedItemCount(card.name);
    const inDeck = P.getDeckItemCount(card.name);

    return `
      <div class="collection-card deck-tile ${inDeck > 0 ? "in-deck" : "out-deck"}" data-item-name="${card.name}">
        <img src="${card.image}" class="collection-card-img" alt="${card.name}">
        <div class="collection-card-name">${card.name}</div>
        <div class="collection-stats"><span>⚔️ +${card.atkBonus || 0}</span><span>❤️ +${card.hpBonus || 0}</span></div>
        <div class="collection-owned-badge">יש לך: ${owned}</div>
        <div class="deck-item-stepper">
          <button type="button" class="deck-stepper-btn deck-stepper-minus" ${inDeck <= 0 ? "disabled" : ""}>−</button>
          <span class="deck-stepper-count">${inDeck}</span>
          <button type="button" class="deck-stepper-btn deck-stepper-plus" ${inDeck >= owned ? "disabled" : ""}>+</button>
        </div>
      </div>
    `;
  }

  function renderDeckScreen(filterType) {
    const grid = document.getElementById("deckGrid");
    const scrollTop = grid.scrollTop;
    const P = window.Progression;

    if (filterType === "character") {
      const instances = [...P.getProgress().ownedInstances].sort((a, b) => {
        if (a.cardName !== b.cardName) return a.cardName.localeCompare(b.cardName, "he");
        return b.level - a.level;
      });

      grid.innerHTML = instances
        .map(inst => {
          const baseCard = cards.find(c => c.name === inst.cardName);
          return baseCard ? deckCharacterTileHtml(inst, baseCard) : "";
        })
        .join("");

      grid.querySelectorAll(".deck-tile[data-instance-id]").forEach(el => {
        el.addEventListener("click", () => {
          const instanceId = el.dataset.instanceId;
          const currentlyIn = P.isInstanceInDeck(instanceId);

          if (currentlyIn) {
            if (P.getDeckCount().total - 1 < P.MIN_DECK_SIZE) {
              alert(`החפיסה חייבת להכיל לפחות ${P.MIN_DECK_SIZE} קלפים.`);
              return;
            }
          } else if (P.getDeckCount().characters >= P.MAX_DECK_CHARACTERS) {
            alert(`אפשר לכלול עד ${P.MAX_DECK_CHARACTERS} דמויות בחפיסה. הוצא אחת כדי להוסיף אחרת.`);
            return;
          }

          P.toggleDeckInstance(instanceId);
          renderDeckScreen("character");
        });
      });
    } else {
      const items = cards.filter(c => c.type === "item" && P.isItemUnlocked(c.name));
      grid.innerHTML = items.map(deckItemTileHtml).join("");

      grid.querySelectorAll(".deck-stepper-minus").forEach(btn => {
        btn.addEventListener("click", event => {
          event.stopPropagation();
          const itemName = btn.closest(".deck-tile").dataset.itemName;
          const current = P.getDeckItemCount(itemName);
          if (current <= 0) return;
          if (P.getDeckCount().total - 1 < P.MIN_DECK_SIZE) {
            alert(`החפיסה חייבת להכיל לפחות ${P.MIN_DECK_SIZE} קלפים.`);
            return;
          }
          P.setDeckItemCount(itemName, current - 1);
          renderDeckScreen("item");
        });
      });

      grid.querySelectorAll(".deck-stepper-plus").forEach(btn => {
        btn.addEventListener("click", event => {
          event.stopPropagation();
          const itemName = btn.closest(".deck-tile").dataset.itemName;
          const current = P.getDeckItemCount(itemName);
          P.setDeckItemCount(itemName, current + 1);
          renderDeckScreen("item");
        });
      });
    }

    grid.scrollTop = scrollTop;
    updateDeckCountBadge();
  }

  function initDeckTabs() {
    document.querySelectorAll("#deckScreen .tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#deckScreen .tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderDeckScreen(btn.dataset.deckTab);
      });
    });
  }

  // --- Quick Battle difficulty picker ---
  // enemyLevel reuses the exact same stage-wide scaling campaign bosses
  // already use (see script.js's applyEnemyLevelToPool) — no new
  // difficulty engine needed, just wiring an existing one up here too.
  // Coins always grant; bonusChance is a SEPARATE roll for something
  // extra on top (see rollQuickBattleReward in progression.js for why
  // "always something + sometimes more" beats "sometimes less").
  const QUICK_BATTLE_DIFFICULTIES = {
    easy: {
      key: "easy", label: "קל", emoji: "🟢", enemyLevel: 1,
      coinsMin: 5, coinsMax: 15, bonusChance: 0.20, bonusType: "item",
      description: "יריב בסיסי, לחימום."
    },
    medium: {
      key: "medium", label: "בינוני", emoji: "🟡", enemyLevel: 2,
      coinsMin: 15, coinsMax: 30, bonusChance: 0.15, bonusType: "item",
      description: "יריב מחוזק, תגמול משמעותית יותר גבוה."
    },
    hard: {
      key: "hard", label: "קשה", emoji: "🔴", enemyLevel: 3,
      coinsMin: 25, coinsMax: 40, bonusChance: 0.15, bonusType: "characterCopy",
      description: "יריב חזק משמעותית — סיכוי לעותק דמות נוסף למיזוג."
    }
  };

  // Two-step picker: first just the 3 plain labels (no spoilers), THEN —
  // only after tapping one — the details for that specific level plus a
  // real confirm/cancel. Nothing starts the battle until "אשר" is tapped.
  function showDifficultyPicker() {
    const backdrop = document.createElement("div");
    backdrop.className = "choose-modal-backdrop";
    document.body.appendChild(backdrop);

    function renderStep1() {
      const optionsHtml = Object.values(QUICK_BATTLE_DIFFICULTIES).map(d => `
        <button type="button" class="difficulty-option-simple" data-key="${d.key}">
          ${d.emoji} ${d.label}
        </button>
      `).join("");

      backdrop.innerHTML = `
        <div class="choose-modal difficulty-modal">
          <div class="choose-modal-title">בחר רמת קושי</div>
          <div class="difficulty-options">${optionsHtml}</div>
          <button type="button" class="difficulty-cancel">ביטול</button>
        </div>
      `;

      backdrop.querySelectorAll(".difficulty-option-simple").forEach(btn => {
        btn.onclick = () => renderStep2(QUICK_BATTLE_DIFFICULTIES[btn.dataset.key]);
      });
      backdrop.querySelector(".difficulty-cancel").onclick = () => {
        backdrop.remove();
        resolveFn(null);
      };
    }

    function renderStep2(d) {
      backdrop.innerHTML = `
        <div class="choose-modal difficulty-modal">
          <div class="choose-modal-title">בחרת: ${d.emoji} ${d.label}</div>
          <div class="difficulty-detail" data-key="${d.key}">
            <div class="difficulty-option-desc">${d.description}</div>
            <div class="difficulty-option-rewards">
              💰 ${d.coinsMin}-${d.coinsMax}
              &nbsp;·&nbsp; ${Math.round(d.bonusChance * 100)}% ${d.bonusType === "item" ? "🎁 פריט" : "🎴 עותק דמות"}
            </div>
          </div>
          <div class="upgrade-confirm-buttons">
            <button type="button" class="upgrade-confirm-cancel">חזרה</button>
            <button type="button" class="upgrade-confirm-ok">אשר</button>
          </div>
        </div>
      `;

      backdrop.querySelector(".upgrade-confirm-cancel").onclick = renderStep1;
      backdrop.querySelector(".upgrade-confirm-ok").onclick = () => {
        backdrop.remove();
        resolveFn(d);
      };
    }

    let resolveFn;
    return new Promise(resolve => {
      resolveFn = resolve;
      renderStep1();
    });
  }

  function init() {
    document.getElementById("goPlayBtn").addEventListener("click", async () => {
      const difficulty = await showDifficultyPicker();
      if (!difficulty) return;

      showScreen("battleScreen");
      window.startBattle({
        isQuickBattle: true,
        enemyLevel: difficulty.enemyLevel,
        rewardConfig: difficulty
      });
    });

    document.getElementById("goCampaignBtn").addEventListener("click", () => {
      window.CampaignUI.renderWorldMap("neighborhood");
      showScreen("campaignWorldScreen");
    });

    document.getElementById("goCollectionBtn").addEventListener("click", () => {
      renderCollection("character");
      showScreen("collectionScreen");
    });

    document.getElementById("goDeckBtn").addEventListener("click", () => {
      renderDeckScreen("character");
      document.querySelectorAll("#deckScreen .tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelector('#deckScreen .tab-btn[data-deck-tab="character"]').classList.add("active");
      showScreen("deckScreen");
    });

    document.getElementById("collectionBackBtn").addEventListener("click", () => showScreen("homeScreen"));
    document.getElementById("deckBackBtn").addEventListener("click", () => showScreen("homeScreen"));

    // Dev-only utility: wipe the local save (coins, unlocked items, card
    // instances, stage progress) and start over. Guarded by a confirm()
    // so a stray tap can't nuke real progress later.
    document.getElementById("resetProgressBtn").addEventListener("click", () => {
      const sure = confirm("לאפס את כל ההתקדמות (מטבעות, קלפים, פריטים פתוחים, שלבים)? אי אפשר לבטל.");
      if (sure) {
        window.Progression.resetProgress();
        location.reload();
      }
    });

    initTabs();
    initDeckTabs();
    showScreen("homeScreen");
  }

  init();

  return { showScreen, updateCoinsDisplay };
})();
