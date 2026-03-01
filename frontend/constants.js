export const GRID_W = 64;
export const GRID_H = 42;
export const CELL = 32;

export const TILE_TOGGLES = [
    { key: "tile_brick", label: "BRICK", ids: [1], color: "#c0522a" },
    { key: "tile_steel", label: "STEEL", ids: [2], color: "#7a8fa6" },
    { key: "tile_water", label: "WATER", ids: [3], color: "#1565c0" },
    { key: "tile_forest", label: "FOREST", ids: [4], color: "#2e7d32" },
    { key: "tile_ice", label: "ICE", ids: [5], color: "#80deea" },
    { key: "tile_lava", label: "LAVA", ids: [7], color: "#ff3300" },
    { key: "tile_conveyor", label: "CONVEYOR", ids: [8, 9, 10, 11], color: "#555555" },
    { key: "tile_mud", label: "SAND", ids: [12], color: "#c8a84b" },
    { key: "tile_ramp", label: "RAMP", ids: [13], color: "#ff9800" },
    { key: "tile_tnt", label: "TNT", ids: [14], color: "#d32f2f" },
    { key: "tile_glass", label: "GLASS", ids: [15], color: "#aaddff" },
    { key: "tile_sunflower", label: "SUNFLWR", ids: [18], color: "#ffeb3b" },
    { key: "tile_turret", label: "TURRET", ids: [25], color: "#607d8b" },
    { key: "tile_mushroom_box", label: "MUSH BOX", ids: [28], color: "#8bc34a" },
    { key: "tile_rainbow_box", label: "RAINBOW", ids: [31], color: "#ff69b4" },
    { key: "tile_chick_box", label: "CHICK BOX", ids: [35], color: "#ffee58" },
    { key: "tile_spec_tnt", label: "SPEC TNT", ids: [36], color: "#ff6600" },
];

export const TILE_GROUPS = TILE_TOGGLES.reduce((acc, toggle) => {
    acc[toggle.key] = toggle.ids.slice();
    return acc;
}, {});
