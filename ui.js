// Handles everything OUTSIDE the battle itself: the Home screen, screen
// navigation, and the Collection browser. Kept separate from script.js
// (the battle engine) on purpose, same reasoning as the cards/skills/
// effects/ai split — so this file can grow without script.js turning
// into one giant file again.
window.UI = (() => {
  const { cards, combos } = window.CardData;

  // First-visit "what is this screen for" popups — one per screen,
  // shown once ever (tracked via Progression's seenScreenIntros), then
  // never again. Content lives here since it's purely a UI concern;
  // Progression only tracks the seen/not-seen flag itself.
  const SCREEN_INTROS = {
    deckScreen: {
      title: "🎴 החפיסה שלי",
      text: "כאן בונים את החפיסה שאיתה נכנסים לקרב. גוררים קלפים בין \"האוסף שלי\" ל\"החפיסה שלי\" כדי לבחור מי משתתף — עד 7 דמויות, וכמות חפצים לבחירתכם."
    },
    researchLabScreen: {
      title: "🔬 מעבדת השילובים",
      text: "כאן חוקרים שילובים (Fusion) לפני שאפשר להשתמש בהם בקרב. משלמים נקודות מחקר (🧬), מחכים לטיימר, ואז לוקחים (Claim) את השילוב שנפתח."
    },
    collectionScreen: {
      title: "🃏 האוסף שלי",
      text: "כאן רואים את כל הדמויות, החפצים, והשילובים שכבר גיליתם. זה מסך תצוגה בלבד — שינויים בפועל (מיזוג, בחירת חפיסה) נעשים במסך \"החפיסה שלי\"."
    },
    shopScreen: {
      title: "🛒 חנות",
      text: "כאן קונים עוד עותקים של חפצים שכבר פתחתם, וגם קיצורי זמן למחקר — הכל תמורת מטבעות (💰)."
    },
    campaignWorldScreen: {
      title: "🗺️ קמפיין",
      text: "מסע דרך \"השכונה\" נגד 5 בוסים, כל אחד עם חוקים משלו. כל שלב שמנצחים נותן מטבעות, ולפעמים גם פריטים או עותקי דמויות חדשים."
    }
  };

  // Shown right on top of whatever's already rendered on that screen —
  // call this AFTER the screen's own render, not before.
  function maybeShowScreenIntro(screenId) {
    const intro = SCREEN_INTROS[screenId];
    if (!intro) return;
    if (window.Progression.hasSeenScreenIntro(screenId)) return;

    const backdrop = document.createElement("div");
    backdrop.className = "choose-modal-backdrop tutorial-overlay-backdrop";
    backdrop.innerHTML = `
      <div class="choose-modal tutorial-overlay-modal">
        <div class="choose-modal-title">${intro.title}</div>
        <div class="tutorial-overlay-text">${intro.text}</div>
        <div class="upgrade-confirm-buttons">
          <button type="button" class="upgrade-confirm-ok">הבנתי</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    backdrop.querySelector(".upgrade-confirm-ok").onclick = () => {
      backdrop.remove();
      window.Progression.markScreenIntroSeen(screenId);
    };
  }

  function showScreen(id) {
    document.querySelectorAll(".home-screen, .sub-screen, #battleScreen")
      .forEach(el => el.classList.add("hidden"));

    document.getElementById(id).classList.remove("hidden");

    // Coins are visible everywhere EXCEPT mid-battle (battle has its
    // own top-bar; showing them there too would be clutter). Research
    // Points aren't a floating badge anymore — they live inside the
    // Research Lab screen's own header, updated by rlUpdatePointsBadge
    // when that screen is actually opened (see goResearchLabBtn).
    const coinsDisplay = document.getElementById("coinsDisplay");

    if (id === "battleScreen") {
      coinsDisplay.classList.add("hidden");
    } else {
      coinsDisplay.classList.remove("hidden");
      updateCoinsDisplay();
    }

    // Leaving the Research Lab screen should stop its 1-second timer
    // loop — no point ticking a countdown nobody can see.
    if (id !== "researchLabScreen") {
      rlStopTimerLoop();
    }

    if (id === "homeScreen") {
      updateCampaignLockState();
    }
  }

  // Visually reflects whether Campaign is actually reachable right now
  // — same flag as the click-time check in the button's own listener,
  // just updated every time the Home screen is shown (including right
  // after finishing/skipping the tutorial) so it's never stale.
  function updateCampaignLockState() {
    const btn = document.getElementById("goCampaignBtn");
    if (!btn) return;
    const locked = window.Progression.shouldShowTutorial();
    btn.classList.toggle("locked", locked);
    btn.innerHTML = locked ? "🔒 CAMPAIGN" : "🗺️ CAMPAIGN";
  }

  // A brief, self-dismissing toast — for quick feedback on the Home
  // screen (like the Campaign lock message) that doesn't need a full
  // modal with its own confirm button.
  function flashHomeMessage(text) {
    document.getElementById("homeFlashMessage")?.remove();

    const toast = document.createElement("div");
    toast.id = "homeFlashMessage";
    toast.className = "home-flash-message";
    toast.innerText = text;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2600);
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

    return `
      <div class="collection-card instance-card" data-instance-id="${instance.instanceId}">
        <img src="${baseCard.image}" class="collection-card-img" alt="${baseCard.name}">
        <div class="collection-card-name">${baseCard.name}</div>
        <div class="collection-level-row"><span class="collection-level-badge">Lv.${instance.level}</span></div>
        <div class="collection-stats"><span>⚔️ ${leveled.atk}</span><span>❤️ ${leveled.hp}</span></div>
      </div>
    `;
  }

  function renderCharacterInstances() {
    const grid = document.getElementById("collectionGrid");
    // Rebuilding the whole grid's innerHTML resets its scroll position to
    // the top — which felt like a jarring "jump" every time the grid
    // re-rendered mid-scroll. Save and restore it across the rebuild.
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

    grid.scrollTop = scrollTop;
  }

  // Confirmation popup before spending coins on a merge — shows the
  // before/after stats side by side so it actually FEELS like the merge
  // makes something stronger, instead of just silently consuming cards.
  // Collection itself no longer triggers this (merging now only happens
  // via the Deck Builder's drag/tap flow) — kept here since it's still
  // shared/reused from there.
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

  // Speeds up the CURRENTLY active research by a flat chunk of minutes,
  // for coins — only shown at all while a research is actually running
  // (there's nothing to speed up otherwise). Rendered as the first tile
  // in the same grid as items, reusing the same tile look.
  function researchSpeedupTileHtml() {
    const P = window.Progression;
    const canAfford = P.getCoins() >= P.RESEARCH_SPEEDUP_PRICE;
    const owned = P.getResearchSpeedupCharges();

    return `
      <div class="collection-card research-speedup-card">
        <div class="research-speedup-icon">⏩</div>
        <div class="collection-card-name">קיצור מחקר</div>
        <div class="research-speedup-desc">−${P.RESEARCH_SPEEDUP_MINUTES} דקות לשימוש</div>
        <div class="collection-owned-badge">יש לך: ${owned}</div>
        <button type="button" class="shop-buy-btn research-speedup-btn ${canAfford ? "" : "disabled"}"
          ${canAfford ? "" : "disabled"}>
          🛒 קנה (💰${P.RESEARCH_SPEEDUP_PRICE})
        </button>
      </div>
    `;
  }

  function renderShop() {
    const grid = document.getElementById("shopGrid");
    const P = window.Progression;

    const unlockedItems = cards.filter(c => c.type === "item" && P.isItemUnlocked(c.name));
    const speedupTile = researchSpeedupTileHtml();
    const itemsHtml = unlockedItems.length
      ? unlockedItems.map(shopTileHtml).join("")
      : "";

    grid.innerHTML = speedupTile + itemsHtml;

    grid.querySelectorAll(".research-speedup-btn:not(.disabled)").forEach(btn => {
      btn.addEventListener("click", () => {
        const result = P.buySpeedupCharge();
        if (result.success) {
          updateCoinsDisplay();
          renderShop();
        }
      });
    });

    grid.querySelectorAll(".shop-buy-btn:not(.research-speedup-btn):not(.disabled)").forEach(btn => {
      btn.addEventListener("click", () => {
        const result = P.buyItem(btn.dataset.itemName);
        if (result.success) {
          updateCoinsDisplay();
          renderShop();
        }
      });
    });
  }

  // === Research Lab ===
  // Pure UI on top of progression.js's Fusion Research API — all the
  // actual rules (cost, timing, requirements, what counts as "ready")
  // live there. This just renders it and wires up taps.

  let researchTimerInterval = null;
  let researchLastStatus = null;
  let researchMessageTimer = null;

  function rlCharacterName(comboKey) { return comboKey.split("|")[0]; }
  function rlItemName(comboKey) { return comboKey.split("|")[1]; }

  function rlFormatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = n => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function rlUpdatePointsBadge() {
    const badge = document.getElementById("researchPointsBadge");
    if (badge) badge.innerText = `🧬 ${window.Progression.getResearchPoints()}`;
  }

  function rlReasonMessage(reason, cost) {
    switch (reason) {
      case "points": return `אין מספיק נקודות מחקר (צריך ${cost}🧬).`;
      case "slot-busy": return "כבר יש מחקר פעיל — אפשר רק אחד בכל פעם.";
      case "missing-requirements": return "חסרה לך הדמות או החפץ הנדרשים.";
      case "already-researched": return "השילוב הזה כבר נחקר.";
      default: return "לא ניתן להתחיל את המחקר הזה כרגע.";
    }
  }

  function rlFlashMessage(message) {
    const area = document.getElementById("researchStatusArea");
    if (!area) return;
    clearTimeout(researchMessageTimer);
    area.innerHTML = `<div class="research-flash-message">⚠️ ${message}</div>`;
    researchMessageTimer = setTimeout(rlRenderStatusArea, 1800);
  }

  function rlRenderStatusArea() {
    const P = window.Progression;
    const area = document.getElementById("researchStatusArea");
    if (!area) return;
    const status = P.getResearchStatus();

    if (status === "idle") {
      const charges = P.getResearchSpeedupCharges();
      area.innerHTML = `
        <div class="research-status-title">בחר את המחקר הבא</div>
        ${charges > 0 ? `<div class="research-speedup-stock">⏩ יש לך ${charges} קיצורי זמן (${P.RESEARCH_SPEEDUP_MINUTES} דק' כל אחד) — ישמשו אותך כשיתחיל מחקר</div>` : ""}
      `;
      return;
    }

    const active = P.getActiveResearch();
    const combo = combos[active.comboKey];
    const baseCard = cards.find(c => c.name === rlCharacterName(active.comboKey));
    const itemCard = cards.find(c => c.name === rlItemName(active.comboKey));
    if (!combo || !baseCard || !itemCard) return;

    if (status === "ready") {
      area.innerHTML = `
        <div class="research-complete-panel">
          <div class="research-complete-title">🎉 RESEARCH COMPLETE</div>
          <div class="research-combo-row">
            <img src="${baseCard.image}" class="research-mini-img" alt="${baseCard.name}">
            <span class="research-plus">+</span>
            <img src="${itemCard.image}" class="research-mini-img" alt="${itemCard.name}">
          </div>
          <div class="research-arrow">↓</div>
          <div class="research-result-card">
            <img src="${combo.image}" class="research-result-img" alt="${combo.name}">
            <div class="research-result-name">${combo.name}</div>
          </div>
          <button type="button" id="claimResearchBtn" class="research-claim-btn">CLAIM FUSION</button>
        </div>
      `;
      document.getElementById("claimResearchBtn").addEventListener("click", rlHandleClaim);
      return;
    }

    // status === "researching"
    const charges = P.getResearchSpeedupCharges();

    area.innerHTML = `
      <div class="research-active-panel">
        <div class="research-active-title">🔬 Researching</div>
        <div class="research-combo-row">
          <img src="${baseCard.image}" class="research-mini-img" alt="${baseCard.name}">
          <span class="research-plus">+</span>
          <img src="${itemCard.image}" class="research-mini-img" alt="${itemCard.name}">
        </div>
        <div class="research-combo-name">${combo.name}</div>
        <div id="researchTimerDisplay" class="research-timer">⏱️ ${rlFormatDuration(active.finishAt - Date.now())}</div>
        ${charges > 0
          ? `<button type="button" id="useSpeedupBtn" class="research-speedup-use-btn">⏩ השתמש בקיצור (יש לך: ${charges})</button>`
          : `<div class="research-speedup-empty">אין לך קיצורי זמן — אפשר לקנות בחנות</div>`
        }
      </div>
    `;

    const useBtn = document.getElementById("useSpeedupBtn");
    if (useBtn) useBtn.addEventListener("click", rlHandleUseSpeedup);
  }

  function rlHandleUseSpeedup() {
    const P = window.Progression;
    const charges = P.getResearchSpeedupCharges();

    const backdrop = document.createElement("div");
    backdrop.className = "choose-modal-backdrop";
    backdrop.innerHTML = `
      <div class="choose-modal research-confirm-modal">
        <div class="choose-modal-title">להשתמש בקיצור?</div>
        <div class="research-confirm-cost">−${P.RESEARCH_SPEEDUP_MINUTES} דקות &nbsp;·&nbsp; נותרו לך: ${charges}</div>
        <div class="upgrade-confirm-buttons">
          <button type="button" class="upgrade-confirm-cancel">ביטול</button>
          <button type="button" class="upgrade-confirm-ok">השתמש</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    backdrop.querySelector(".upgrade-confirm-cancel").onclick = () => backdrop.remove();
    backdrop.querySelector(".upgrade-confirm-ok").onclick = () => {
      backdrop.remove();
      const result = P.useSpeedupCharge();
      if (result.success) rlRenderAll();
    };
  }

  function rlTileHtml(comboKey) {
    const P = window.Progression;
    const combo = combos[comboKey];
    const characterName = rlCharacterName(comboKey);
    const itemName = rlItemName(comboKey);

    if (P.isFusionResearched(comboKey)) {
      return `
        <div class="research-tile researched">
          <img src="${combo.image}" class="research-tile-img" alt="${combo.name}">
          <div class="research-tile-name">${combo.name}</div>
          <div class="research-tile-recipe">${characterName} + ${itemName}</div>
          <div class="research-tile-status done">✅ Researched</div>
        </div>
      `;
    }

    const progress = P.getProgress();
    const ownsCharacter = progress.ownedInstances.some(i => i.cardName === characterName);
    const ownsItem = P.getOwnedItemCount(itemName) > 0;

    if (!ownsCharacter || !ownsItem) {
      // Locked — don't reveal what it actually is, matching the same
      // mystery-tile convention already used for locked items/Fusions
      // in Collection.
      return `
        <div class="research-tile locked">
          <div class="research-mystery-icon">🔒</div>
          <div class="research-tile-name">???</div>
          <div class="research-tile-status">LOCKED</div>
        </div>
      `;
    }

    const baseCard = cards.find(c => c.name === characterName);
    const itemCard = cards.find(c => c.name === itemName);
    const check = P.canStartResearch(comboKey);

    return `
      <div class="research-tile available" data-combo-key="${comboKey}">
        <div class="research-tile-status ready">🔬 AVAILABLE</div>
        <div class="research-tile-combo-row">
          <img src="${baseCard.image}" class="research-tile-mini-img" alt="${characterName}">
          <span class="research-tile-plus">+</span>
          <img src="${itemCard.image}" class="research-tile-mini-img" alt="${itemName}">
        </div>
        <div class="research-tile-recipe">${characterName} + ${itemName}</div>
        <div class="research-tile-cost">🧬 ${combo.researchCost} &nbsp;·&nbsp; ⏱️ ${rlFormatDuration(combo.researchTime)}</div>
        <button type="button" class="research-tile-btn" ${check.canStart ? "" : "disabled"}>Research</button>
      </div>
    `;
  }

  function rlRenderList() {
    const grid = document.getElementById("researchListArea");
    if (!grid) return;
    const P = window.Progression;
    const active = P.getActiveResearch();

    const tiles = Object.keys(combos)
      .filter(key => !active || key !== active.comboKey)
      .map(rlTileHtml)
      .join("");

    grid.innerHTML = tiles || `<div class="coming-soon">אין עוד שילובים לחקור כרגע.</div>`;

    grid.querySelectorAll(".research-tile-btn:not([disabled])").forEach(btn => {
      btn.addEventListener("click", () => {
        const comboKey = btn.closest(".research-tile").dataset.comboKey;
        rlHandleStartResearch(comboKey);
      });
    });
  }

  // A real "are you sure?" step before actually spending Research
  // Points — reuses the same confirm-modal button styling already
  // established for the Collection merge-confirm (upgrade-confirm-*
  // classes), just with Research-specific content.
  function rlShowStartConfirm(comboKey) {
    const combo = combos[comboKey];
    const characterName = rlCharacterName(comboKey);
    const itemName = rlItemName(comboKey);
    const baseCard = cards.find(c => c.name === characterName);
    const itemCard = cards.find(c => c.name === itemName);

    const backdrop = document.createElement("div");
    backdrop.className = "choose-modal-backdrop";
    backdrop.innerHTML = `
      <div class="choose-modal research-confirm-modal">
        <div class="choose-modal-title">להתחיל מחקר?</div>
        <div class="research-combo-row">
          <img src="${baseCard.image}" class="research-mini-img" alt="${characterName}">
          <span class="research-plus">+</span>
          <img src="${itemCard.image}" class="research-mini-img" alt="${itemName}">
        </div>
        <div class="research-combo-name">${combo.name}</div>
        <div class="research-confirm-cost">🧬 ${combo.researchCost} &nbsp;·&nbsp; ⏱️ ${rlFormatDuration(combo.researchTime)}</div>
        <div class="upgrade-confirm-buttons">
          <button type="button" class="upgrade-confirm-cancel">ביטול</button>
          <button type="button" class="upgrade-confirm-ok">התחל מחקר</button>
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
        backdrop.remove();
        resolve(true);
      };
    });
  }

  async function rlHandleStartResearch(comboKey) {
    const P = window.Progression;

    const confirmed = await rlShowStartConfirm(comboKey);
    if (!confirmed) return;

    const result = P.startResearch(comboKey);

    if (!result.success) {
      rlFlashMessage(rlReasonMessage(result.reason, result.cost));
      return;
    }

    rlRenderAll();
  }

  function rlHandleClaim() {
    const P = window.Progression;
    const result = P.claimResearch();
    if (!result.success) return;

    const combo = combos[result.comboKey];
    rlShowClaimCelebration(combo);
    rlRenderAll();
  }

  function rlShowClaimCelebration(combo) {
    const backdrop = document.createElement("div");
    backdrop.className = "choose-modal-backdrop";
    backdrop.innerHTML = `
      <div class="choose-modal research-claim-modal">
        <div class="research-claim-celebrate">🎉</div>
        <div class="choose-modal-title">${combo.name} נפתח!</div>
        <img src="${combo.image}" class="research-claim-img" alt="${combo.name}">
        <div class="research-claim-hint">אפשר להשתמש בשילוב הזה בקרב.</div>
      </div>
    `;
    backdrop.addEventListener("click", () => backdrop.remove());
    document.body.appendChild(backdrop);
    setTimeout(() => backdrop.remove(), 2600);
  }

  function rlRenderAll() {
    rlUpdatePointsBadge();
    rlRenderStatusArea();
    rlRenderList();
  }

  // Ticks the visible countdown once a second while the screen is open,
  // WITHOUT a full re-render every second (just updates the timer text
  // in place) — only re-renders everything when the status actually
  // changes (idle -> researching -> ready -> idle again after claim).
  function rlStartTimerLoop() {
    rlStopTimerLoop();
    researchLastStatus = window.Progression.getResearchStatus();

    researchTimerInterval = setInterval(() => {
      const P = window.Progression;
      const status = P.getResearchStatus();

      if (status !== researchLastStatus) {
        researchLastStatus = status;
        rlRenderAll();
        return;
      }

      if (status === "researching") {
        const active = P.getActiveResearch();
        const display = document.getElementById("researchTimerDisplay");
        if (active && display) {
          display.innerText = `⏱️ ${rlFormatDuration(active.finishAt - Date.now())}`;
        }
      }
    }, 1000);
  }

  function rlStopTimerLoop() {
    if (researchTimerInterval) {
      clearInterval(researchTimerInterval);
      researchTimerInterval = null;
    }
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
        <div class="db-tile-rank">${window.buildRankIndicatorHtml(instance.level)}</div>
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
  //
  // A gesture starts as "pending" (no ghost, no preventDefault yet) so
  // native vertical scrolling inside a panel keeps working — only once
  // the touch has moved noticeably MORE horizontally than vertically do
  // we commit to an actual drag (create the ghost, start blocking
  // scroll). A gesture that never moves past that threshold at all is a
  // plain tap, handled the same way every time — no more inconsistent
  // "sometimes it selects, sometimes it doesn't".

  const DB_COMMIT_THRESHOLD = 10;

  function dbGetPanelEls() {
    return {
      deck: document.querySelector(".db-panel-deck"),
      collection: document.querySelector(".db-panel-collection")
    };
  }

  function dbBeginPendingDrag(tileEl, clientX, clientY) {
    if (dbDrag) return;
    dbDrag = {
      phase: "pending", // "pending" -> "dragging" once committed
      tileEl,
      data: dbTileData(tileEl),
      startX: clientX,
      startY: clientY,
      ghost: null,
      offsetX: 0,
      offsetY: 0
    };
  }

  // Called once a pending gesture has moved enough to prove intent —
  // only past this point do we touch the DOM (ghost, dimming) or start
  // calling preventDefault, so a tap or a scroll never sees any of it.
  function dbCommitDrag(clientX, clientY) {
    const tileEl = dbDrag.tileEl;
    const rect = tileEl.getBoundingClientRect();
    const ghost = tileEl.cloneNode(true);
    ghost.className = "db-tile db-drag-ghost";
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.appendChild(ghost);

    tileEl.classList.add("db-dragging-source");

    dbDrag.phase = "dragging";
    dbDrag.ghost = ghost;
    dbDrag.offsetX = clientX - rect.left;
    dbDrag.offsetY = clientY - rect.top;

    dbUpdateDragGhost(clientX, clientY);
  }

  function dbUpdateDragGhost(clientX, clientY) {
    dbDrag.ghost.style.left = `${clientX - dbDrag.offsetX}px`;
    dbDrag.ghost.style.top = `${clientY - dbDrag.offsetY}px`;

    const { deck, collection } = dbGetPanelEls();
    deck?.classList.toggle("db-drop-hover", dbPointInRect(clientX, clientY, deck.getBoundingClientRect()));
    collection?.classList.toggle("db-drop-hover", dbPointInRect(clientX, clientY, collection.getBoundingClientRect()));
  }

  // Returns true if this touchmove was consumed as part of an actual
  // (or newly-committed) drag — the caller should preventDefault when
  // true, and otherwise leave the event alone so native scroll works.
  function dbHandleMove(clientX, clientY) {
    if (!dbDrag) return false;

    if (dbDrag.phase === "dragging") {
      dbUpdateDragGhost(clientX, clientY);
      return true;
    }

    // still pending — decide whether this is turning into a drag or a
    // vertical scroll, based on which direction dominates.
    const dx = clientX - dbDrag.startX;
    const dy = clientY - dbDrag.startY;

    if (Math.abs(dx) < DB_COMMIT_THRESHOLD && Math.abs(dy) < DB_COMMIT_THRESHOLD) {
      return false; // not enough movement yet either way
    }

    if (Math.abs(dy) > Math.abs(dx)) {
      // Vertical-dominant — this is a scroll, not a drag. Bail out
      // entirely and let the browser handle it natively from here.
      dbDrag = null;
      return false;
    }

    dbCommitDrag(clientX, clientY);
    return true;
  }

  function dbPointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function dbEndGesture(clientX, clientY) {
    if (!dbDrag) return;
    const { phase, tileEl, ghost, data } = dbDrag;
    dbDrag = null;

    if (phase === "pending") {
      // Never moved enough to become a drag OR a scroll — a plain tap.
      dbHandleTap(tileEl, data);
      return;
    }

    const { deck, collection } = dbGetPanelEls();
    deck?.classList.remove("db-drop-hover");
    collection?.classList.remove("db-drop-hover");
    ghost.remove();
    tileEl.classList.remove("db-dragging-source");

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
        dbBeginPendingDrag(tile, t.clientX, t.clientY);
      }, { passive: true });

      // NOT passive — a committed drag needs to preventDefault so the
      // page doesn't ALSO scroll while the ghost is following the
      // finger. A gesture that turns out to be a vertical scroll never
      // calls preventDefault at all (see dbHandleMove), so scrolling
      // inside either panel keeps working normally.
      tile.addEventListener("touchmove", event => {
        if (!dbDrag) return;
        const t = event.touches[0];
        if (dbHandleMove(t.clientX, t.clientY)) event.preventDefault();
      }, { passive: false });

      tile.addEventListener("touchend", () => {
        if (!dbDrag) return;
        // touchend has no coordinates of its own — reuse the ghost's
        // last known center as the drop point (or the tile's own
        // start position if the gesture never left the "pending" phase).
        if (dbDrag.phase === "dragging") {
          const rect = dbDrag.ghost.getBoundingClientRect();
          dbEndGesture(rect.left + rect.width / 2, rect.top + rect.height / 2);
        } else {
          dbEndGesture(dbDrag.startX, dbDrag.startY);
        }
      });

      // Mouse equivalents, for desktop/DevTools testing. Chrome's device
      // emulation mode sometimes fires BOTH a real touchstart AND a
      // synthetic compatibility mousedown for the same click — the
      // dbDrag guard in dbBeginPendingDrag stops that from double-firing.
      tile.addEventListener("mousedown", event => {
        event.preventDefault();
        dbBeginPendingDrag(tile, event.clientX, event.clientY);

        const onMove = moveEvent => dbHandleMove(moveEvent.clientX, moveEvent.clientY);
        const onUp = upEvent => {
          dbEndGesture(upEvent.clientX, upEvent.clientY);
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
      researchMin: 10, researchMax: 20,
      description: "יריב בסיסי, לחימום."
    },
    medium: {
      key: "medium", label: "בינוני", emoji: "🟡", enemyLevel: 2,
      coinsMin: 15, coinsMax: 30, bonusChance: 0.15, bonusType: "item",
      researchMin: 15, researchMax: 30,
      description: "יריב מחוזק, תגמול משמעותית יותר גבוה."
    },
    hard: {
      key: "hard", label: "קשה", emoji: "🔴", enemyLevel: 3,
      coinsMin: 25, coinsMax: 40, bonusChance: 0.15, bonusType: "characterCopy",
      researchMin: 25, researchMax: 40,
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
    { icon: "📖", title: "כל הסקילים", isGlossary: true },
    { icon: "📱", title: "טיפ", body: "המשחק מיועד למובייל במצב לרוחב (Landscape) בלבד. לחוויה הכי טובה — אפשר \"להוסיף למסך הבית\" מתפריט הדפדפן ולפתוח כמו אפליקציה, בלי שורת הכתובת.", tip: true }
  ];

  let howToIndex = 0;

  function howToGlossaryHtml() {
    const S = window.SkillEngine;
    if (!S) return "";

    return Object.entries(S.SKILL_INFO).map(([type, info]) => {
      // "X" — a placeholder, not a real number. The actual amount
      // always depends on the specific card's base value and level
      // (see skills.js's getScaledSkillValue), so showing any single
      // fixed number here would just be misleading.
      const desc = info.description("X");
      return `
        <div class="howto-glossary-row">
          <div class="howto-glossary-icon">${info.icon}</div>
          <div class="howto-glossary-text">
            <div class="howto-glossary-name">${info.name}</div>
            <div class="howto-glossary-desc">${desc}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderHowToSlide() {
    const slide = HOW_TO_PLAY_SLIDES[howToIndex];
    const isLast = howToIndex === HOW_TO_PLAY_SLIDES.length - 1;

    document.getElementById("howToSlide").innerHTML = slide.isGlossary
      ? `
        <div class="howto-card howto-glossary-card">
          <div class="howto-card-icon">${slide.icon}</div>
          <div class="howto-card-title">${slide.title}</div>
          <div class="howto-glossary-list">${howToGlossaryHtml()}</div>
        </div>
      `
      : `
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
      // First-ever PLAY tap launches the guided tutorial battle instead
      // of the normal difficulty picker — see tutorial.js. Every tap
      // after that (once hasSeenTutorial is set, whether by finishing
      // or explicitly skipping) goes straight to the normal flow.
      if (window.Progression.shouldShowTutorial()) {
        showScreen("battleScreen");
        window.startBattle({ isTutorial: true, stageName: "מדריך" });
        return;
      }

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
      // Locked until the tutorial is done — a brand new player jumping
      // straight into a boss fight without ever having placed or fused
      // a card would be lost. Same flag used everywhere else
      // (shouldShowTutorial/markTutorialSeen) — nothing new to track.
      if (window.Progression.shouldShowTutorial()) {
        flashHomeMessage("קודם סיימו את המדריך (⚔️ PLAY) כדי לפתוח את הקמפיין.");
        return;
      }

      window.CampaignUI.renderWorldMap("neighborhood");
      showScreen("campaignWorldScreen");
      maybeShowScreenIntro("campaignWorldScreen");
    });

    document.getElementById("goCollectionBtn").addEventListener("click", () => {
      renderCollection("character");
      showScreen("collectionScreen");
      maybeShowScreenIntro("collectionScreen");
    });

    document.getElementById("goDeckBtn").addEventListener("click", () => {
      dbSelectedInstanceId = null;
      dbFilter = "all";
      document.querySelectorAll(".db-filter-btn").forEach(b => b.classList.remove("active"));
      const allBtn = document.querySelector('.db-filter-btn[data-db-filter="all"]');
      if (allBtn) allBtn.classList.add("active");
      dbRenderAll();
      showScreen("deckScreen");
      maybeShowScreenIntro("deckScreen");
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
      maybeShowScreenIntro("shopScreen");
    });

    // Now a real Home screen button, matching PLAY/CAMPAIGN/etc, instead
    // of a floating badge — see the change note in showScreen above.
    document.getElementById("goResearchLabBtn").addEventListener("click", () => {
      rlRenderAll();
      rlStartTimerLoop();
      showScreen("researchLabScreen");
      maybeShowScreenIntro("researchLabScreen");
    });

    document.getElementById("collectionBackBtn").addEventListener("click", () => showScreen("homeScreen"));
    document.getElementById("deckBackBtn").addEventListener("click", () => showScreen("homeScreen"));
    document.getElementById("howToPlayBackBtn").addEventListener("click", () => showScreen("homeScreen"));

    // Explicit replay — starts the tutorial battle directly regardless
    // of hasSeenTutorial (that flag only controls the AUTOMATIC
    // first-ever-PLAY trigger, not this deliberate request).
    document.getElementById("replayTutorialBtn").addEventListener("click", () => {
      showScreen("battleScreen");
      window.startBattle({ isTutorial: true, stageName: "מדריך" });
    });
    document.getElementById("shopBackBtn").addEventListener("click", () => showScreen("homeScreen"));
    document.getElementById("researchLabBackBtn").addEventListener("click", () => {
      rlStopTimerLoop();
      showScreen("homeScreen");
    });

    // Dev-only utility: wipe the local save (coins, unlocked items, card
    // instances, stage progress) and start over. Gated behind a code
    // now (not just the confirm()) — this is going out to friends, and
    // a curious tap on a plainly-labelled "(Dev)" button is a very
    // different risk than one hidden behind a real barrier.
    document.getElementById("resetProgressBtn").addEventListener("click", () => {
      const code = prompt("קוד גישה:");
      if (code === null) return; // cancelled

      if (code !== "2259") {
        flashHomeMessage("קוד שגוי.");
        return;
      }

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
