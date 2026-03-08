export const GRID_W = 64;
export const GRID_H = 42;
export const CELL = 32;

// autoGen controls how a tile group participates in _generateRandomMap():
//   { weight: N }            — added N times per id into the random fill pool (rectangles)
//   { type: "turret_2x2" }  — placed as a 2×2 block (single instance per placement)
//   { type: "powerup_2x2" } — placed as a 2×2 power-up box
//   (absent)                — never placed by the auto-generator
export const TILE_TOGGLES = [
    { key: "tile_brick",        label: "BRICK",    ids: [1],             color: "#c0522a", autoGen: { weight: 8 } },
    { key: "tile_steel",        label: "STEEL",    ids: [2],             color: "#7a8fa6", autoGen: { weight: 3 } },
    { key: "tile_water",        label: "WATER",    ids: [3],             color: "#1565c0", autoGen: { weight: 2 } },
    { key: "tile_forest",       label: "FOREST",   ids: [4],             color: "#2e7d32", autoGen: { weight: 3 } },
    { key: "tile_ice",          label: "ICE",      ids: [5],             color: "#80deea", autoGen: { weight: 2 } },
    { key: "tile_lava",         label: "LAVA",     ids: [7],             color: "#ff3300", autoGen: { weight: 1 } },
    { key: "tile_conveyor",     label: "CONVEYOR", ids: [8, 9, 10, 11],  color: "#555555", autoGen: { weight: 1 } },
    { key: "tile_mud",          label: "SAND",     ids: [12],            color: "#c8a84b", autoGen: { weight: 1 } },
    { key: "tile_ramp",         label: "RAMP",     ids: [13],            color: "#ff9800", autoGen: { weight: 1 } },
    { key: "tile_tnt",          label: "TNT",      ids: [14],            color: "#d32f2f", autoGen: { weight: 1 } },
    { key: "tile_glass",        label: "GLASS",    ids: [15],            color: "#aaddff", autoGen: { weight: 1 } },
    { key: "tile_sunflower",    label: "SUNFLWR",  ids: [18],            color: "#ffeb3b", autoGen: { weight: 1 } },
    { key: "tile_turret",       label: "TURRET",   ids: [25],            color: "#607d8b", autoGen: { type: "turret_2x2" } },
    { key: "tile_mushroom_box", label: "MUSH BOX", ids: [28],            color: "#8bc34a", autoGen: { type: "powerup_2x2" } },
    { key: "tile_rainbow_box",  label: "RAINBOW",  ids: [31],            color: "#ff69b4", autoGen: { type: "powerup_2x2" } },
    { key: "tile_chick_box",    label: "CHICK BOX",ids: [35],            color: "#ffee58", autoGen: { type: "powerup_2x2" } },
    { key: "tile_spec_tnt",     label: "SPEC TNT", ids: [36],            color: "#ff6600", autoGen: { weight: 1 } },
    { key: "tile_money_box",    label: "MONEY BOX",ids: [40],            color: "#FFD700", autoGen: { type: "powerup_2x2" } },
];

export const TILE_GROUPS = TILE_TOGGLES.reduce((acc, toggle) => {
    acc[toggle.key] = toggle.ids.slice();
    return acc;
}, {});
