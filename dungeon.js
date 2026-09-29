// Dungeon mode's own small UI module — deliberately separate from
// campaign.js. Dungeon isn't worlds/locations/stages, it's a flat list
// of standalone, repeatable boss encounters, so it doesn't need
// campaign.js's nested rendering or Progression's stage-completion
// tracking at all.
window.DungeonUI = (() => {
  function getBoss(bossId) {
    return (window.DungeonData?.bosses || []).find(b => b.id === bossId);
  }

  // The list screen — one tile per boss, each showing its own
  // mechanic hint right on the tile (no separate "location map" step
  // needed, unlike Campaign — there's nothing to build up to, every
  // Dungeon boss IS its own destination).
  function renderDungeonList() {
    const bosses = window.DungeonData?.bosses || [];

    const tilesHtml = bosses.map(boss => `
      <button type="button" class="dungeon-tile" data-boss-id="${boss.id}">
        <div class="dungeon-tile-icon">${boss.icon || "👑"}</div>
        <div class="dungeon-tile-name">${boss.name}</div>
        ${boss.mechanicHint ? `<div class="boss-hint-box">🧩 ${boss.mechanicHint}</div>` : ""}
      </button>
    `).join("");

    document.getElementById("dungeonList").innerHTML = tilesHtml
      || `<div class="coming-soon">עדיין אין בוסים במרתף — בקרוב.</div>`;

    document.querySelectorAll(".dungeon-tile").forEach(tile => {
      tile.addEventListener("click", () => startDungeonBoss(tile.dataset.bossId));
    });
  }

  function startDungeonBoss(bossId) {
    const boss = getBoss(bossId);
    if (!boss) return;

    window.UI.showScreen("battleScreen");
    window.startBattle({
      isDungeon: true,
      dungeonBossId: boss.id,
      stageName: boss.name,
      enemyLevel: boss.enemyLevel,
      enemyCards: boss.enemyCards,
      enemyStartingBoard: boss.enemyStartingBoard,
      rewards: boss.rewards
    });
  }

  // Called by script.js's exitBattle() when the player resigns —
  // mirrors Campaign's exitToLocationMap, just landing back on the
  // flat Dungeon list instead.
  function exitToDungeonList() {
    renderDungeonList();
    window.UI.showScreen("dungeonScreen");
  }

  function init() {
    document.getElementById("dungeonBackBtn").addEventListener("click", () => {
      window.UI.showScreen("gameModesScreen");
    });
  }

  init();

  return { renderDungeonList, exitToDungeonList };
})();
