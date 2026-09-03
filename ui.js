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

  // --- Characters tab: one tile PER OWNED INSTANCE, not per character.
  // Two "אופק LV2" copies show as two separate, individually-tappable
  // tiles — tapping two matching ones (same name, same level) opens a
  // merge-to-upgrade confirmation.

  function instanceCardTileHtml(instance, baseCard) {
    const P = window.Progression;
    const leveled = P.getStatsAtLevel(baseCard.atk, baseCard.hp, instance.level);
    const isSelected = instance.instanceId === selectedInstanceId;
    const maxed = instance.level >= P.MAX_CARD_LEVEL;

    // When something's already selected, mark every OTHER tile that's
    // actually a valid merge partner (same character, same level) —
    // not just a text change, an actual glow + pulse so it's obvious at
    // a glance which tiles you can tap next.
    let isCandidate = false;
    if (selectedInstanceId && !isSelected) {
      const selected = P.getInstance(selectedInstanceId);
      isCandidate = !!selected
        && selected.cardName === instance.cardName
        && selected.level === instance.level;
    }

    let hintHtml;
    if (maxed) {
      hintHtml = `<div class="collection-level-maxed">רמה מקסימלית</div>`;
    } else if (isSelected) {
      hintHtml = `<div class="collection-merge-hint">בחר עותק זהה למיזוג</div>`;
    } else if (isCandidate) {
      hintHtml = `<div class="collection-merge-hint candidate">👉 מזג לכאן!</div>`;
    } else {
      hintHtml = `<div class="collection-merge-hint">הקש לבחירה</div>`;
    }

    return `
      <div class="collection-card instance-card ${isSelected ? "selected" : ""} ${isCandidate ? "merge-candidate" : ""}"
        data-instance-id="${instance.instanceId}">
        <img src="${baseCard.image}" class="collection-card-img" alt="${baseCard.name}">
        <div class="collection-card-name">${baseCard.name}</div>
        <div class="collection-level-row"><span class="collection-level-badge">Lv.${instance.level}</span></div>
        <div class="collection-stats"><span>⚔️ ${leveled.atk}</span><span>❤️ ${leveled.hp}</span></div>
        ${hintHtml}
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

    return `
      <div class="collection-card">
        <img src="${card.image}" class="collection-card-img" alt="${card.name}">
        <div class="collection-card-name">${card.name}</div>
        <div class="collection-owned-badge">יש לך: ${owned}</div>
        ${statsHtml}
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

  // --- Shop: buy MORE copies of items you've already discovered. Never
  // sells anything you haven't unlocked yet — that stays a Campaign/
  // Quick Battle discovery, the shop is just a reliable way to restock.

  function shopTileHtml(card) {
    const P = window.Progression;
    const owned = P.getOwnedItemCount(card.name);
    const price = P.SHOP_ITEM_PRICE;
    const canAfford = P.getCoins() >= price;

    return `
      <div class="collection-card">
        <img src="${card.image}" class="collection-card-img" alt="${card.name}">
        <div class="collection-card-name">${card.name}</div>
        <div class="collection-owned-badge">יש לך: ${owned}</div>
        <button type="button" class="shop-buy-btn ${canAfford ? "" : "disabled"}"
          data-item-name="${card.name}" ${canAfford ? "" : "disabled"}>
          🛒 קנה (💰${price})
        </button>
      </div>
    `;
  }

  function renderShop() {
    const grid = document.getElementById("shopGrid");
    const P = window.Progression;

    const unlockedItems = cards.filter(c => c.type === "item" && P.isItemUnlocked(c.name));

    grid.innerHTML = unlockedItems.length
      ? unlockedItems.map(shopTileHtml).join("")
      : `<div class="coming-soon">עדיין לא פתחת אף חפץ — נצחונות בקמפיין ובקרב מהיר פותחים חפצים חדשים.</div>`;

    grid.querySelectorAll(".shop-buy-btn:not(.disabled)").forEach(btn => {
      btn.addEventListener("click", () => {
        const result = P.buyItem(btn.dataset.itemName);
        if (result.success) {
          updateCoinsDisplay();
          renderShop();
        }
      });
    });
  }

  // --- Fusion tab: every combo you've ALREADY discovered (its item is
  // unlocked) shows in full; anything else is a total mystery — no name,
  // no image, no stats. Since every combo needs an unlocked item to ever
  // actually make, "item unlocked" is exactly "you've seen this Fusion".

  function fusionTileHtml(comboKey, combo) {
    const [characterName, itemName] = comboKey.split("|");

    if (isItemLocked(itemName)) return mysteryTileHtml();

    const statsHtml = `<div class="collection-stats"><span>⚔️ ${combo.atk}</span><span>❤️ ${combo.hp}</span></div>`;
    const skillsHtml = combo.skills?.length
      ? `<div class="collection-fusion-skills">${combo.skills.map(s => s.icon || "✨").join(" ")}</div>`
      : "";

    return `
      <div class="collection-card">
        <img src="${combo.image}" class="collection-card-img" alt="${combo.name}">
        <div class="collection-card-name">${combo.name}</div>
        <div class="collection-fusion-recipe">${characterName} + ${itemName}</div>
        ${statsHtml}
        ${skillsHtml}
      </div>
    `;
  }

  function renderFusions() {
    const grid = document.getElementById("collectionGrid");
    grid.innerHTML = Object.entries(combos)
      .map(([key, combo]) => fusionTileHtml(key, combo))
      .join("");
  }

  function renderCollection(filterType) {
    selectedInstanceId = null;
    if (filterType === "character") {
      renderCharacterInstances();
    } else if (filterType === "item") {
      renderItems();
    } else {
      renderFusions();
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

  // === Deck Builder (two-panel: my deck / my collection) ===
  //
  // Reuses the EXACT existing Progression API — getDeckSelection,
  // isInstanceInDeck, toggleDeckInstance, getDeckItemCount,
  // setDeckItemCount, getOwnedItemCount, getDeckCount, MIN_DECK_SIZE,
  // MAX_DECK_CHARACTERS — nothing new was added there. This section is
  // purely a new UI on top of data/logic that already existed.

  let dbSelectedInstanceId = null; // for merge-candidate highlighting AND fusion glow
  let dbFilter = "all";            // "all" | "character" | "item"
  let dbStatusFlashTimer = null;
  let dbDrag = null;               // active drag state, see dbStartDrag

  // Does this item have a DEFINED combo with this character? (Only used
  // to decide what glows — never touches how Fusion itself resolves.)
  function dbHasCombo(characterName, itemName) {
    return !!combos[`${characterName}|${itemName}`];
  }

  function dbCharacterHasInstanceInDeck(characterName) {
    const P = window.Progression;
    return P.getInstancesByCardName(characterName).some(i => P.isInstanceInDeck(i.instanceId));
  }

  function dbSelectedCharacterName() {
    if (!dbSelectedInstanceId) return null;
    return window.Progression.getInstance(dbSelectedInstanceId)?.cardName || null;
  }

  function dbCharacterTileHtml(instance, baseCard, location) {
    const P = window.Progression;
    const leveled = P.getStatsAtLevel(baseCard.atk, baseCard.hp, instance.level);
    const isSelected = dbSelectedInstanceId === instance.instanceId;

    // Merge candidate: any OTHER owned instance with the same name+level
    // as whatever is currently selected — regardless of which panel it's
    // in, since merging cares about the instances, not their location.
    let isMergeCandidate = false;
    if (dbSelectedInstanceId && !isSelected) {
      const selected = P.getInstance(dbSelectedInstanceId);
      isMergeCandidate = !!selected
        && selected.cardName === instance.cardName
        && selected.level === instance.level;
    }

    return `
      <div class="db-tile db-tile-character ${isSelected ? "db-selected" : ""} ${isMergeCandidate ? "db-merge-candidate" : ""}"
        data-instance-id="${instance.instanceId}" data-card-name="${baseCard.name}" data-location="${location}">
        <img src="${baseCard.image}" class="db-tile-img" alt="${baseCard.name}">
        <span class="db-tile-level">Lv.${instance.level}</span>
        <div class="db-tile-name">${baseCard.name}</div>
        <div class="db-tile-stats"><span>⚔️${leveled.atk}</span><span>❤️${leveled.hp}</span></div>
        ${isMergeCandidate ? `<div class="db-merge-hint">מזג!</div>` : ""}
      </div>
    `;
  }

  function dbItemTileHtml(card, location) {
    const selectedCharacter = dbSelectedCharacterName();
    const hasFusion = selectedCharacter && dbHasCombo(selectedCharacter, card.name);
    const fusionReady = hasFusion && location === "deck"
      && dbCharacterHasInstanceInDeck(selectedCharacter);

    return `
      <div class="db-tile db-tile-item ${hasFusion ? "db-fusion-glow" : ""}"
        data-item-name="${card.name}" data-location="${location}">
        <img src="${card.image}" class="db-tile-img" alt="${card.name}">
        <div class="db-tile-name">${card.name}</div>
        <div class="db-tile-stats"><span>⚔️+${card.atkBonus || 0}</span><span>❤️+${card.hpBonus || 0}</span></div>
        ${fusionReady ? `<div class="db-fusion-ready">🟣 FUSION READY</div>` : ""}
      </div>
    `;
  }

  function dbFlashStatus(message) {
    const statusBar = document.getElementById("dbStatusBar");
    clearTimeout(dbStatusFlashTimer);
    statusBar.innerText = `⚠️ ${message}`;
    statusBar.classList.add("warning");
    dbStatusFlashTimer = setTimeout(dbUpdateStatsBar, 1800);
  }

  function dbPointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function dbTileData(tileEl) {
    if (tileEl.classList.contains("db-tile-character")) {
      return {
        type: "character",
        instanceId: tileEl.dataset.instanceId,
        cardName: tileEl.dataset.cardName,
        location: tileEl.dataset.location
      };
    }
    return { type: "item", itemName: tileEl.dataset.itemName, location: tileEl.dataset.location };
  }

  // --- Tap: select for the Fusion-glow indicator, or (tapping a second
  // matching character) trigger the SAME merge-confirm flow already used
  // in Collection — no new merge system, just calling into it here too.
  async function dbHandleTap(tileEl, data) {
    if (data.type !== "character") return; // items have no tap behavior of their own

    const P = window.Progression;

    if (dbSelectedInstanceId && dbSelectedInstanceId !== data.instanceId) {
      const first = P.getInstance(dbSelectedInstanceId);
      const second = P.getInstance(data.instanceId);

      if (first && second && first.cardName === second.cardName && first.level === second.level) {
        if (second.level >= P.MAX_CARD_LEVEL) {
          dbSelectedInstanceId = null;
          dbRenderAll();
          return;
        }

        const baseCard = cards.find(c => c.name === second.cardName);
        const confirmed = baseCard && await showMergeConfirm(baseCard, second.level);

        dbSelectedInstanceId = null;

        if (confirmed) {
          const result = P.mergeUpgrade(first.instanceId, second.instanceId);
          if (result.success) updateCoinsDisplay();
        }

        dbRenderAll();
        return;
      }
    }

    dbSelectedInstanceId = (dbSelectedInstanceId === data.instanceId) ? null : data.instanceId;
    dbRenderAll();
  }

  // --- Drag: the actual way to move a card between the deck and
  // collection panels now (tap is reserved for selection/merge above).
  // Custom touch handling since native HTML5 drag has poor mobile
  // support — same general approach as the battle board's own card
  // dragging in script.js, just a separate implementation scoped to
  // this screen's own DOM.

  function dbGetPanelEls() {
    return {
      deck: document.querySelector(".db-panel-deck"),
      collection: document.querySelector(".db-panel-collection")
    };
  }

  function dbStartDrag(tileEl, clientX, clientY) {
    const rect = tileEl.getBoundingClientRect();
    const ghost = tileEl.cloneNode(true);
    ghost.className = "db-tile db-drag-ghost";
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.appendChild(ghost);

    tileEl.classList.add("db-dragging-source");

    dbDrag = {
      tileEl,
      ghost,
      data: dbTileData(tileEl),
      startX: clientX,
      startY: clientY,
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      moved: false
    };
  }

  function dbMoveDrag(clientX, clientY) {
    if (!dbDrag) return;

    if (!dbDrag.moved && (Math.abs(clientX - dbDrag.startX) > 8 || Math.abs(clientY - dbDrag.startY) > 8)) {
      dbDrag.moved = true;
    }

    dbDrag.ghost.style.left = `${clientX - dbDrag.offsetX}px`;
    dbDrag.ghost.style.top = `${clientY - dbDrag.offsetY}px`;

    const { deck, collection } = dbGetPanelEls();
    deck?.classList.toggle("db-drop-hover", dbPointInRect(clientX, clientY, deck.getBoundingClientRect()));
    collection?.classList.toggle("db-drop-hover", dbPointInRect(clientX, clientY, collection.getBoundingClientRect()));
  }

  function dbEndDrag(clientX, clientY) {
    if (!dbDrag) return;
    const { tileEl, ghost, data, moved } = dbDrag;
    const { deck, collection } = dbGetPanelEls();

    deck?.classList.remove("db-drop-hover");
    collection?.classList.remove("db-drop-hover");
    ghost.remove();
    tileEl.classList.remove("db-dragging-source");
    dbDrag = null;

    if (!moved) {
      dbHandleTap(tileEl, data);
      return;
    }

    const droppedOnDeck = deck && dbPointInRect(clientX, clientY, deck.getBoundingClientRect());
    const droppedOnCollection = collection && dbPointInRect(clientX, clientY, collection.getBoundingClientRect());
    const targetLocation = droppedOnDeck ? "deck" : droppedOnCollection ? "collection" : null;

    if (!targetLocation || targetLocation === data.location) return; // dropped nowhere valid, or same panel

    dbPerformMove(data, targetLocation);
  }

  function dbPerformMove(data, targetLocation) {
    const P = window.Progression;
    const movingIntoDeck = targetLocation === "deck";

    if (data.type === "character") {
      if (movingIntoDeck) {
        if (P.getDeckCount().characters >= P.MAX_DECK_CHARACTERS) {
          dbFlashStatus(`אפשר לכלול עד ${P.MAX_DECK_CHARACTERS} דמויות בחפיסה.`);
          return;
        }
      } else if (P.getDeckCount().total - 1 < P.MIN_DECK_SIZE) {
        dbFlashStatus(`החפיסה חייבת להכיל לפחות ${P.MIN_DECK_SIZE} קלפים.`);
        return;
      }

      P.toggleDeckInstance(data.instanceId);
      dbRenderAll();
      dbPlayArriveAnimation(targetLocation, `[data-instance-id="${data.instanceId}"]`);
    } else {
      const current = P.getDeckItemCount(data.itemName);

      if (!movingIntoDeck && P.getDeckCount().total - 1 < P.MIN_DECK_SIZE) {
        dbFlashStatus(`החפיסה חייבת להכיל לפחות ${P.MIN_DECK_SIZE} קלפים.`);
        return;
      }

      P.setDeckItemCount(data.itemName, movingIntoDeck ? current + 1 : current - 1);
      dbRenderAll();
      dbPlayArriveAnimation(targetLocation, `[data-item-name="${data.itemName}"]`);
    }
  }

  // A little "just arrived" pop, on top of the normal dbTileEnter every
  // fresh tile already gets — makes the specific card that was dragged
  // stand out for a beat rather than blending in with the rest.
  function dbPlayArriveAnimation(targetLocation, selector) {
    const gridId = targetLocation === "deck" ? "dbDeckGrid" : "dbCollectionGrid";
    const grid = document.getElementById(gridId);
    const tile = grid?.querySelector(selector);
    if (!tile) return;
    tile.classList.add("db-just-arrived");
    setTimeout(() => tile.classList.remove("db-just-arrived"), 320);
  }

  function dbWireTileInteractions(container) {
    container.querySelectorAll(".db-tile").forEach(tile => {
      tile.addEventListener("touchstart", event => {
        const t = event.touches[0];
        dbStartDrag(tile, t.clientX, t.clientY);
      }, { passive: true });

      tile.addEventListener("touchmove", event => {
        if (!dbDrag) return;
        const t = event.touches[0];
        dbMoveDrag(t.clientX, t.clientY);
      }, { passive: true });

      tile.addEventListener("touchend", () => {
        if (!dbDrag) return;
        // touchend has no coordinates of its own — reuse the ghost's
        // last known center as the drop point.
        const rect = dbDrag.ghost.getBoundingClientRect();
        dbEndDrag(rect.left + rect.width / 2, rect.top + rect.height / 2);
      });

      // Mouse equivalents, for desktop testing.
      tile.addEventListener("mousedown", event => {
        event.preventDefault();
        dbStartDrag(tile, event.clientX, event.clientY);

        const onMove = moveEvent => dbMoveDrag(moveEvent.clientX, moveEvent.clientY);
        const onUp = upEvent => {
          dbEndDrag(upEvent.clientX, upEvent.clientY);
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    });
  }

  function dbRenderDeckPanel() {
    const P = window.Progression;
    const grid = document.getElementById("dbDeckGrid");
    const deckSelection = P.getDeckSelection();
    const progress = P.getProgress();

    const characterEntries = deckSelection.instanceIds
      .map(id => progress.ownedInstances.find(i => i.instanceId === id))
      .filter(Boolean)
      .map(inst => ({ inst, base: cards.find(c => c.name === inst.cardName) }))
      .filter(entry => entry.base)
      .sort((a, b) => {
        if (a.inst.cardName !== b.inst.cardName) return a.inst.cardName.localeCompare(b.inst.cardName, "he");
        return b.inst.level - a.inst.level;
      });

    const itemTiles = [];
    Object.entries(deckSelection.itemCounts || {}).forEach(([name, count]) => {
      const base = cards.find(c => c.name === name && c.type === "item");
      if (!base || count <= 0) return;
      for (let i = 0; i < count; i++) itemTiles.push(base);
    });

    let html = "";
    if (dbFilter === "all" || dbFilter === "character") {
      html += characterEntries.map(({ inst, base }) => dbCharacterTileHtml(inst, base, "deck")).join("");
    }
    if (dbFilter === "all" || dbFilter === "item") {
      html += itemTiles.map(base => dbItemTileHtml(base, "deck")).join("");
    }

    grid.innerHTML = html || `<div class="db-empty-hint">החפיסה ריקה — הקש על קלפים באוסף כדי להוסיף.</div>`;
    dbWireTileInteractions(grid);
  }

  function dbRenderCollectionPanel() {
    const P = window.Progression;
    const grid = document.getElementById("dbCollectionGrid");
    const progress = P.getProgress();

    const availableEntries = progress.ownedInstances
      .filter(inst => !P.isInstanceInDeck(inst.instanceId))
      .map(inst => ({ inst, base: cards.find(c => c.name === inst.cardName) }))
      .filter(entry => entry.base)
      .sort((a, b) => {
        if (a.inst.cardName !== b.inst.cardName) return a.inst.cardName.localeCompare(b.inst.cardName, "he");
        return b.inst.level - a.inst.level;
      });

    const availableItemTiles = [];
    cards.filter(c => c.type === "item" && P.isItemUnlocked(c.name)).forEach(base => {
      const available = P.getOwnedItemCount(base.name) - P.getDeckItemCount(base.name);
      for (let i = 0; i < available; i++) availableItemTiles.push(base);
    });

    let html = "";
    if (dbFilter === "all" || dbFilter === "character") {
      html += availableEntries.map(({ inst, base }) => dbCharacterTileHtml(inst, base, "collection")).join("");
    }
    if (dbFilter === "all" || dbFilter === "item") {
      html += availableItemTiles.map(base => dbItemTileHtml(base, "collection")).join("");
    }

    grid.innerHTML = html || `<div class="db-empty-hint">הכל כבר בחפיסה.</div>`;
    dbWireTileInteractions(grid);
  }

  function dbUpdateStatsBar() {
    const P = window.Progression;
    const counts = P.getDeckCount();
    const owned = P.getTotalOwnedCount();

    document.getElementById("dbMainCounter").innerText = `${counts.total} / ${owned}`;
    document.getElementById("dbCharCount").innerText = `${counts.characters}/${P.MAX_DECK_CHARACTERS} דמויות`;
    document.getElementById("dbItemCount").innerText = `${counts.itemCopies} חפצים`;

    const statusBar = document.getElementById("dbStatusBar");
    statusBar.classList.remove("warning");

    if (counts.total >= P.MIN_DECK_SIZE) {
      statusBar.innerText = "✅ החפיסה מוכנה לקרב";
    } else {
      statusBar.innerText = `⚠️ חסרים ${P.MIN_DECK_SIZE - counts.total} קלפים`;
      statusBar.classList.add("warning");
    }
  }

  function dbRenderAll() {
    dbRenderDeckPanel();
    dbRenderCollectionPanel();
    dbUpdateStatsBar();
  }

  function initDbFilters() {
    document.querySelectorAll(".db-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".db-filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        dbFilter = btn.dataset.dbFilter;
        dbRenderAll();
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

  // --- How to Play: one topic per card, Next/Previous + dots, instead of
  // one long scroll — easier to actually read on a small landscape phone.
  const HOW_TO_PLAY_SLIDES = [
    { icon: "⚔️", title: "מטרת המשחק", body: "מורידים את החיים של היריב (❤️30) לאפס, לפני שהוא מוריד את שלכם." },
    { icon: "🎴", title: "הזירה", body: "לכל שחקן 5 עמדות (Lanes). קלף תוקף תמיד את הקלף שממול אותו באותה עמדה. אם אין קלף מול — הפגיעה ישירה בחיים של היריב." },
    { icon: "✋", title: "הנחת קלף", body: "גוררים קלף מהיד למשבצת ריקה. קלף שרק הונח מחכה תור אחד לפני שהוא תוקף בפעם הראשונה." },
    { icon: "🔥", title: "Fusion", body: "גוררים חפץ על קלף דמות שכבר בזירה (או להפך) ליצירת שילוב חדש וחזק יותר. בשונה מהנחה רגילה, קלף Fusion תוקף מיד באותו תור! אי אפשר לשלב קלף שכבר עבר Fusion בעבר." },
    { icon: "✨", title: "סקילים", body: "חלק מהקלפים (בעיקר Fusion) מקבלים יכולות אוטומטיות: נזק, ריפוי, הגנה (Shield), חיזוק לקלפים סמוכים, סינוור (Stun) והחייאה. הם מופעלים לבד — אין צורך ללחוץ על שום דבר." },
    { icon: "⚠️", title: "חולשות (Weakness)", body: "לחלק מהדמויות יש חולשה לפריט מסוים. אם היריב מניח בדיוק את הפריט הזה מול הדמות עם החולשה — נגרם נזק/אפקט מיידי לקלף אקראי אצלו. שווה לשים לב איפה מניחים חפצים." },
    { icon: "🗺️", title: "קמפיין", body: "מסע דרך \"השכונה\" נגד 5 בוסים, כל אחד עם חוקים מיוחדים משלו. כל שלב נותן מטבעות, ולפעמים גם פריטים או עותקי דמויות נוספים." },
    { icon: "🃏", title: "אוסף וחפיסה", body: "כל דמות שיש לכם היא עותק עצמאי עם רמה משלו. מוזגים שני עותקים זהים באותה רמה (+ מטבעות) כדי לשדרג. ב-MY DECK בוחרים עד 7 דמויות וכמות חפצים לחפיסה שאיתה נכנסים לקרב." },
    { icon: "🎯", title: "PLAY מהיר", body: "בוחרים רמת קושי (קל/בינוני/קשה) ומקבלים פרס בסוף — סיכוי גם לעותק דמות או פריט חדש, לא רק מטבעות." },
    { icon: "📱", title: "טיפ", body: "המשחק מיועד למובייל במצב לרוחב (Landscape) בלבד. לחוויה הכי טובה — אפשר \"להוסיף למסך הבית\" מתפריט הדפדפן ולפתוח כמו אפליקציה, בלי שורת הכתובת.", tip: true }
  ];

  let howToIndex = 0;

  function renderHowToSlide() {
    const slide = HOW_TO_PLAY_SLIDES[howToIndex];
    const isLast = howToIndex === HOW_TO_PLAY_SLIDES.length - 1;

    document.getElementById("howToSlide").innerHTML = `
      <div class="howto-card ${slide.tip ? "tip" : ""}">
        <div class="howto-card-icon">${slide.icon}</div>
        <div class="howto-card-title">${slide.title}</div>
        <div class="howto-card-body">${slide.body}</div>
      </div>
    `;

    document.getElementById("howToDots").innerHTML = HOW_TO_PLAY_SLIDES
      .map((_, i) => `<span class="howto-dot ${i === howToIndex ? "active" : ""}"></span>`)
      .join("");

    document.getElementById("howToCounter").innerText = `${howToIndex + 1} / ${HOW_TO_PLAY_SLIDES.length}`;

    const prevBtn = document.getElementById("howToPrevBtn");
    prevBtn.disabled = howToIndex === 0;
    prevBtn.classList.toggle("disabled", howToIndex === 0);

    document.getElementById("howToNextBtn").innerText = isLast ? "סגור" : "הבא";
  }

  function initHowToPlay() {
    document.getElementById("howToPrevBtn").addEventListener("click", () => {
      if (howToIndex === 0) return;
      howToIndex--;
      renderHowToSlide();
    });

    document.getElementById("howToNextBtn").addEventListener("click", () => {
      if (howToIndex === HOW_TO_PLAY_SLIDES.length - 1) {
        showScreen("homeScreen");
        return;
      }
      howToIndex++;
      renderHowToSlide();
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
      dbSelectedInstanceId = null;
      dbFilter = "all";
      document.querySelectorAll(".db-filter-btn").forEach(b => b.classList.remove("active"));
      const allBtn = document.querySelector('.db-filter-btn[data-db-filter="all"]');
      if (allBtn) allBtn.classList.add("active");
      dbRenderAll();
      showScreen("deckScreen");
    });

    document.getElementById("goHowToPlayBtn").addEventListener("click", () => {
      howToIndex = 0;
      renderHowToSlide();
      showScreen("howToPlayScreen");
    });

    // The coins display itself is the shop entry point now — tap your
    // money, anywhere it's shown (not just Home), to go spend it.
    document.getElementById("coinsDisplay").addEventListener("click", () => {
      renderShop();
      showScreen("shopScreen");
    });

    document.getElementById("collectionBackBtn").addEventListener("click", () => showScreen("homeScreen"));
    document.getElementById("deckBackBtn").addEventListener("click", () => showScreen("homeScreen"));
    document.getElementById("howToPlayBackBtn").addEventListener("click", () => showScreen("homeScreen"));
    document.getElementById("shopBackBtn").addEventListener("click", () => showScreen("homeScreen"));

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
    initDbFilters();
    initHowToPlay();
    showScreen("homeScreen");
  }

  init();

  return { showScreen, updateCoinsDisplay };
})();
