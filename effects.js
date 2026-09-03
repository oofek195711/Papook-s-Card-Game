window.GameEffects = (() => {
  // Global playback speed multiplier — 1x normal, 2x for people who want
  // the game to just move faster. Every animation timing in this file
  // goes through wait(), so this one variable controls all of them.
  let speedMultiplier = 1;

  function setSpeedMultiplier(x) {
    speedMultiplier = x;
  }

  function getSpeedMultiplier() {
    return speedMultiplier;
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms / speedMultiplier));

  function playOverlay(className, text, duration) {
    const overlay = document.createElement("div");
    overlay.className = className;
    overlay.innerHTML = `<div class="${className === "fusion-overlay" ? "fusion-text" : "phase-text"}">${text}</div>`;
    document.body.appendChild(overlay);

    setTimeout(() => overlay.remove(), duration);
  }

  function playPhase(text = "ATTACK PHASE!") {
    playOverlay("phase-overlay", text, 900);
  }

  function playFusion(text = "FUSION!") {
    playOverlay("fusion-overlay", text, 1000);
  }

  // Renders the small "you earned..." summary inside the Victory screen
  // for campaign stages. `rewards` is the object Progression.completeStage()
  // returns ({ granted: {coins, items}, bonusGranted }), or undefined for
  // a quick battle (no summary shown at all).
  function buildRewardsHtml(rewards) {
    if (!rewards?.granted) return "";

    if (rewards.alreadyCompleted) {
      return `<div class="game-end-rewards">
        <div class="game-end-reward-line already-done">✅ כבר השלמת את השלב הזה — בלי פרסים נוספים, אבל תמיד כיף לנצח שוב.</div>
      </div>`;
    }

    const lines = [];

    if (rewards.granted.coins > 0) {
      lines.push(`<div class="game-end-reward-line">💰 +${rewards.granted.coins} מטבעות</div>`);
    }

    rewards.granted.items.forEach(item => {
      lines.push(`<div class="game-end-reward-line">🎁 פריט חדש נפתח: ${item}</div>`);
    });

    (rewards.granted.characterCopies || []).forEach(character => {
      lines.push(`<div class="game-end-reward-line">🎴 עותק נוסף של ${character}!</div>`);
    });

    if (rewards.bonusGranted) {
      if (rewards.bonusGranted.coins > 0) {
        lines.push(`<div class="game-end-reward-line bonus">⭐ בונוס אזור: +${rewards.bonusGranted.coins} מטבעות</div>`);
      }
      rewards.bonusGranted.items.forEach(item => {
        lines.push(`<div class="game-end-reward-line bonus">⭐ בונוס אזור: ${item}</div>`);
      });
      (rewards.bonusGranted.characterCopies || []).forEach(character => {
        lines.push(`<div class="game-end-reward-line bonus">⭐ בונוס אזור: עותק נוסף של ${character}</div>`);
      });
    }

    if (lines.length === 0) return "";

    return `<div class="game-end-rewards">${lines.join("")}</div>`;
  }

  // Full Victory/Defeat screen. Stays on screen until the player taps the
  // continue button — onContinue is whatever the caller wants to happen
  // next (page reload for a quick battle, or returning to the campaign
  // map for a campaign stage). `options.rewards` (from
  // Progression.completeStage()) renders a small coins/items summary.
  function showGameEndScreen(won, onContinue, options = {}) {
    const backdrop = document.createElement("div");
    backdrop.className = `game-end-backdrop ${won ? "won" : "lost"}`;

    const title = won ? "🏆 ניצחת!" : "💀 הפסדת";
    const subtitle = won ? "כל הכבוד, ניצחת את היריב!" : "היריב ניצח הפעם.";
    const continueLabel = options.continueLabel || "שחק שוב";
    const onHome = options.onHome || (() => location.reload());

    const rewardsHtml = buildRewardsHtml(options.rewards);

    backdrop.innerHTML = `
      <div class="game-end-modal">
        <div class="game-end-title">${title}</div>
        <div class="game-end-subtitle">${subtitle}</div>
        ${rewardsHtml}
        <div class="game-end-buttons">
          <button type="button" class="game-end-button secondary" id="gameEndHomeBtn">🏠 לתפריט הראשי</button>
          <button type="button" class="game-end-button" id="gameEndContinueBtn">${continueLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    backdrop.querySelector("#gameEndContinueBtn").onclick = () => {
      backdrop.remove();
      onContinue();
    };

    backdrop.querySelector("#gameEndHomeBtn").onclick = () => {
      backdrop.remove();
      onHome();
    };
  }

  function animateAttack(owner, slotIndex, isDirectAttack = false) {
    const cardElement = document.querySelector(
      `.slot[data-owner="${owner}"][data-index="${slotIndex}"] .card`
    );

    if (!cardElement) return;

    const className = isDirectAttack
      ? owner === "player" ? "direct-attack-player" : "direct-attack-ai"
      : owner === "player" ? "attack-forward-player" : "attack-forward-ai";

    cardElement.classList.remove(className);
    void cardElement.offsetWidth;
    cardElement.classList.add(className);

    setTimeout(() => cardElement.classList.remove(className), 850 / speedMultiplier);
  }

  function showDamageNumber(element, damage, className = "") {
    const rect = element.getBoundingClientRect();
    const damageDiv = document.createElement("div");

    damageDiv.className = `damage-number ${className}`.trim();
    damageDiv.innerText = `-${damage}`;
    damageDiv.style.left = rect.left + rect.width / 2 + "px";
    damageDiv.style.top = rect.top + rect.height / 2 + "px";

    document.body.appendChild(damageDiv);
    setTimeout(() => damageDiv.remove(), 800 / speedMultiplier);
  }

  function showHealNumber(element, amount) {
    const rect = element.getBoundingClientRect();
    const healDiv = document.createElement("div");

    healDiv.className = "heal-number";
    healDiv.innerText = `+${amount}`;
    healDiv.style.left = rect.left + rect.width / 2 + "px";
    healDiv.style.top = rect.top + rect.height / 2 + "px";

    document.body.appendChild(healDiv);
    setTimeout(() => healDiv.remove(), 800 / speedMultiplier);
  }

  function showSkillBadge(owner, slotIndex, icon, label) {
    const card = document.querySelector(
      `.slot[data-owner="${owner}"][data-index="${slotIndex}"] .card`
    );

    if (!card) return;

    const badge = document.createElement("div");
    badge.className = "skill-activation";
    badge.innerHTML = `<span>${icon}</span><small>${label}</small>`;
    card.appendChild(badge);

    setTimeout(() => badge.remove(), 700 / speedMultiplier);
  }

  function shakeCard(slotElement) {
    if (!slotElement) return;

    slotElement.classList.remove("card-hit");
    void slotElement.offsetWidth;
    slotElement.classList.add("card-hit");

    setTimeout(() => slotElement.classList.remove("card-hit"), 350 / speedMultiplier);
  }

  function playDeath(owner, slotIndex) {
    return new Promise(resolve => {
      const card = document.querySelector(
        `.slot[data-owner="${owner}"][data-index="${slotIndex}"] .card`
      );

      if (!card) {
        resolve();
        return;
      }

      card.classList.add("dying");
      setTimeout(resolve, 700 / speedMultiplier);
    });
  }

  // Generic "pick one card from a list" popup. Resolves with the chosen
  // card's index in `list`, or -1 if the list was empty. Used by the
  // Revive skill to let the player choose which card comes back from the
  // Graveyard, but written generically so any future skill needing a real
  // player choice (not just Revive) can reuse it too.
  function chooseCard(list, title = "בחר קלף") {
    return new Promise(resolve => {
      if (!list || list.length === 0) {
        resolve(-1);
        return;
      }

      const backdrop = document.createElement("div");
      backdrop.className = "choose-modal-backdrop";

      const modal = document.createElement("div");
      modal.className = "choose-modal";

      const titleDiv = document.createElement("div");
      titleDiv.className = "choose-modal-title";
      titleDiv.innerText = title;
      modal.appendChild(titleDiv);

      const grid = document.createElement("div");
      grid.className = "choose-modal-grid";

      list.forEach((card, index) => {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "choose-card-tile";
        tile.innerHTML = `
          <img src="${card.image}" class="choose-card-img">
          <div class="choose-card-name">${card.name}</div>
          <div class="choose-card-stats">⚔️ ${card.atk ?? card.atkBonus ?? 1} | ❤️ ${card.maxHp ?? card.hp ?? 0}</div>
        `;

        tile.onclick = () => {
          backdrop.remove();
          resolve(index);
        };

        grid.appendChild(tile);
      });

      modal.appendChild(grid);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    });
  }

  async function playHeroHit(player, damage, updateHp) {
    const hpElement = document.getElementById(player === "player" ? "playerHp" : "aiHp");
    const heroPanel = hpElement?.closest(".hero-panel");

    if (heroPanel) {
      showDamageNumber(heroPanel, damage);
      heroPanel.classList.remove("taking-direct-hit");
      void heroPanel.offsetWidth;
      heroPanel.classList.add("taking-direct-hit");
    }

    await wait(300);
    updateHp();
    await wait(420);
    heroPanel?.classList.remove("taking-direct-hit");
  }

  return {
    wait,
    setSpeedMultiplier,
    getSpeedMultiplier,
    playPhase,
    playFusion,
    showGameEndScreen,
    animateAttack,
    showDamageNumber,
    showHealNumber,
    showSkillBadge,
    shakeCard,
    playDeath,
    playHeroHit,
    chooseCard
  };
})();
