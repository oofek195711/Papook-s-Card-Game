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
      renderDeckScreen("character");
      document.querySelectorAll("#deckScreen .tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelector('#deckScreen .tab-btn[data-deck-tab="character"]').classList.add("active");
      showScreen("deckScreen");
    });

    document.getElementById("goHowToPlayBtn").addEventListener("click", () => {
      howToIndex = 0;
      renderHowToSlide();
      showScreen("howToPlayScreen");
    });

    document.getElementById("collectionBackBtn").addEventListener("click", () => showScreen("homeScreen"));
    document.getElementById("deckBackBtn").addEventListener("click", () => showScreen("homeScreen"));
    document.getElementById("howToPlayBackBtn").addEventListener("click", () => showScreen("homeScreen"));

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
    initHowToPlay();
    showScreen("homeScreen");
  }

  init();

  return { showScreen, updateCoinsDisplay };
})();
