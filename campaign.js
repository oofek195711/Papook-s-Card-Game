// World map + location map screens. Talks to Progression (unlock state)
// and CampaignData (content), and hands off to script.js's
// window.startBattle() to actually fight a stage. Kept separate from
// ui.js the same way ui.js is kept separate from script.js — this file
// can grow (more worlds, a proper stage-select summary, etc.) without
// touching the battle engine or the Home/Collection code.
window.CampaignUI = (() => {
  let currentWorldId = null;
  let currentLocationId = null;

  function getWorld(worldId) {
    return (window.CampaignData?.worlds || []).find(w => w.id === worldId);
  }

  function getLocationEntry(locationId) {
    for (const world of window.CampaignData?.worlds || []) {
      const location = world.locations.find(l => l.id === locationId);
      if (location) return { world, location };
    }
    return null;
  }

  function getStageEntry(stageId) {
    for (const world of window.CampaignData?.worlds || []) {
      for (const location of world.locations) {
        const stage = location.stages.find(s => s.id === stageId);
        if (stage) return { world, location, stage };
      }
    }
    return null;
  }

  function nodeState(completed, unlocked) {
    if (completed) return "completed";
    if (unlocked) return "unlocked";
    return "locked";
  }

  // Coins are shown plainly ("💰60"); a new-item reward stays a mystery
  // ("🎁 ???") even in the preview, so it's not spoiled before you win it.
  function rewardsPreviewHtml(stage, revealed) {
    const parts = (stage.rewards || []).map(reward => {
      if (reward.type === "coins") return `<span class="campaign-reward-chip">💰${reward.amount}</span>`;
      if (reward.type === "unlockItem") {
        return revealed
          ? `<span class="campaign-reward-chip">🎁 ${reward.item}</span>`
          : `<span class="campaign-reward-chip mystery">🎁 ???</span>`;
      }
      if (reward.type === "characterCopy") {
        return revealed
          ? `<span class="campaign-reward-chip">🎴 ${reward.character}</span>`
          : `<span class="campaign-reward-chip">🎴 עותק נוסף</span>`;
      }
      return "";
    }).filter(Boolean);

    if (!parts.length) return "";
    return `<span class="campaign-node-rewards">${parts.join("")}</span>`;
  }

  function renderWorldMap(worldId) {
    currentWorldId = worldId;
    const world = getWorld(worldId);
    if (!world) return;

    document.getElementById("campaignWorldTitle").innerText = world.name;

    const P = window.Progression;
    const points = world.locations
      .map(loc => `${loc.mapPosition.x},${loc.mapPosition.y}`)
      .join(" ");

    const nodesHtml = world.locations.map(loc => {
      const bossStage = loc.stages[loc.stages.length - 1];
      const completed = P.isStageCompleted(bossStage.id);
      const unlocked = P.isLocationUnlocked(loc.id);
      const state = nodeState(completed, unlocked);

      return `
        <button type="button" class="campaign-node location-node ${state}"
          style="left:${loc.mapPosition.x}%; top:${loc.mapPosition.y}%;"
          data-location-id="${loc.id}" ${unlocked ? "" : "disabled"}>
          <span class="campaign-node-icon">${unlocked ? loc.icon : "🔒"}</span>
          ${completed ? '<span class="campaign-node-badge">✓</span>' : ""}
          <span class="campaign-node-label">${loc.name}</span>
        </button>
      `;
    }).join("");

    const container = document.getElementById("campaignWorldMap");
    container.innerHTML = `
      <svg class="campaign-path" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points="${points}" />
      </svg>
      ${nodesHtml}
    `;

    container.querySelectorAll(".location-node").forEach(node => {
      node.addEventListener("click", () => {
        renderLocationMap(node.dataset.locationId);
        window.UI.showScreen("campaignLocationScreen");
      });
    });
  }

  function renderLocationMap(locationId) {
    currentLocationId = locationId;
    const found = getLocationEntry(locationId);
    if (!found) return;
    const { location } = found;

    document.getElementById("campaignLocationTitle").innerText = location.name;

    const P = window.Progression;
    const n = location.stages.length;
    const xFor = i => (n === 1 ? 50 : 10 + i * (80 / (n - 1)));
    const points = location.stages.map((s, i) => `${xFor(i)},50`).join(" ");

    const nodesHtml = location.stages.map((stage, i) => {
      const completed = P.isStageCompleted(stage.id);
      const unlocked = P.isStageUnlocked(stage.id);
      const state = nodeState(completed, unlocked);
      const isBoss = stage.type === "boss";
      const icon = isBoss ? "👑" : (unlocked ? "⚔️" : "🔒");

      return `
        <button type="button" class="campaign-node stage-node ${state} ${isBoss ? "boss-node" : ""}"
          style="left:${xFor(i)}%; top:50%;"
          data-stage-id="${stage.id}" ${unlocked ? "" : "disabled"}>
          <span class="campaign-node-icon">${icon}</span>
          ${completed ? '<span class="campaign-node-badge">★</span>' : ""}
          <span class="campaign-node-label">${stage.name}</span>
          ${rewardsPreviewHtml(stage, completed)}
        </button>
      `;
    }).join("");

    const container = document.getElementById("campaignLocationMap");
    container.innerHTML = `
      <svg class="campaign-path" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points="${points}" />
      </svg>
      ${nodesHtml}
    `;

    container.querySelectorAll(".stage-node").forEach(node => {
      node.addEventListener("click", () => startStage(node.dataset.stageId));
    });
  }

  function startStage(stageId) {
    if (!window.Progression.isStageUnlocked(stageId)) return;

    const found = getStageEntry(stageId);
    if (!found) return;
    const { location, stage } = found;

    window.UI.showScreen("battleScreen");
    window.startBattle({
      isCampaign: true,
      stageId: stage.id,
      stageName: stage.name,
      enemyCards: stage.enemyCards,
      enemyStartingBoard: stage.enemyStartingBoard,
      enemyLevel: stage.enemyLevel,
      background: location.background
    });
  }

  // Called by script.js's checkGameOver() right after a campaign win has
  // been recorded in Progression. Takes the player back to the (now
  // updated) location map instead of reloading the whole page.
  function onStageComplete() {
    if (currentLocationId) {
      renderLocationMap(currentLocationId);
    }
    window.UI.showScreen("campaignLocationScreen");
  }

  // Called by script.js's exitBattle() when the player resigns mid-fight.
  // No rewards, no progress change — just re-show the location map as it
  // already was.
  function exitToLocationMap() {
    if (currentLocationId) {
      renderLocationMap(currentLocationId);
    }
    window.UI.showScreen("campaignLocationScreen");
  }

  function init() {
    document.getElementById("campaignWorldBackBtn").addEventListener("click", () => {
      window.UI.showScreen("homeScreen");
    });

    document.getElementById("campaignLocationBackBtn").addEventListener("click", () => {
      renderWorldMap(currentWorldId);
      window.UI.showScreen("campaignWorldScreen");
    });
  }

  init();

  return { renderWorldMap, renderLocationMap, onStageComplete, exitToLocationMap };
})();
