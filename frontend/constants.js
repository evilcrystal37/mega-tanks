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
    // Timed tiles - these spawn dynamically during gameplay and can be disabled/enabled
    { key: "tile_money",        label: "MONEY",    ids: [37],            color: "#FFD700" },
    { key: "tile_sun",          label: "SUN",      ids: [43],            color: "#FF8C00" },
    { key: "tile_megagun",      label: "MEGA GUN", ids: [47],            color: "#4A4A4A" },
];

// Timed tiles that spawn dynamically during gameplay and should NEVER be manually placeable in the editor.
// These tiles have timers that control their lifespan and spawning behavior.
// IMPORTANT: When adding new timed tiles in the future, always add their IDs to this set.
export const TIMED_TILE_IDS = new Set([
    37, 38, 39, 40, // Money tiles (MONEY_PAD, MONEY_CRACK2, MONEY_CRACK1, MONEY_BOX)
    43, 44, 45, 46, // Sun tiles (SUN_PAD, SUN_CRACK2, SUN_CRACK1, SUN_BOX)
    47, 48, 49, 50, // Mega gun tiles (MEGAGUN_PAD, MEGAGUN_CRACK2, MEGAGUN_CRACK1, MEGAGUN_BOX)
]);

// Other tiles that should not be manually placeable in the editor (but are not timed)
export const NON_MANUAL_TILE_IDS = new Set([
    6,    // Base - placed automatically
    16, 17, // Glass cracks - intermediate states
    20, 21, // Sandworm parts - enemy components
    23, 24, // Raw item pickups (rainbow pad, mushroom pad) - should be inside boxes
    26, 27, // Mushroom cracks - intermediate states
    29, 30, // Rainbow cracks - intermediate states
    32, 33, 34, // Chick cracks and pad - should be inside boxes
    41,   // Golden frame - decorative/special
]);

export const TILE_GROUPS = TILE_TOGGLES.reduce((acc, toggle) => {
    acc[toggle.key] = toggle.ids.slice();
    return acc;
}, {});
