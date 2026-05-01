export const GRID_W = 64;
export const GRID_H = 42;
export const CELL = 32;

/** Populated from GET /api/tiles via syncTileCatalogFromApiTiles */
export let TILE_TOGGLES = [];

export let TIMED_TILE_IDS = new Set();

export let NON_MANUAL_TILE_IDS = new Set();

export let TILE_GROUPS = {};

const _TOGGLE_LABELS = {
    tile_brick: "BRICK",
    tile_steel: "STEEL",
    tile_water: "WATER",
    tile_forest: "FOREST",
    tile_ice: "ICE",
    tile_lava: "LAVA",
    tile_conveyor: "CONVEYOR",
    tile_mud: "SAND",
    tile_ramp: "RAMP",
    tile_tnt: "TNT",
    tile_glass: "GLASS",
    tile_sunflower: "SUNFLWR",
    tile_turret: "TURRET",
    tile_mushroom_box: "MUSH BOX",
    tile_rainbow_box: "RAINBOW",
    tile_chick_box: "CHICK BOX",
    tile_spec_tnt: "SPEC TNT",
    tile_money: "MONEY",
    tile_sun: "SUN",
    tile_megagun: "MEGA GUN",
    tile_banana: "BANANA",
    tile_clone: "CLONE",
    tile_fireworks: "FIREWORKS",
    tile_jump: "JUMP",
    tile_rainbow_world: "RAINBOW",
    tile_airplane: "AIRPLANE",
    tile_magnet: "MAGNET",
    tile_sahur: "SAHUR",
    tile_zzz: "ZZZ",
    tile_octopus: "OCTOPUS",
};

/**
 * Rebuild TILE_TOGGLES, TILE_GROUPS, TIMED_TILE_IDS, NON_MANUAL_TILE_IDS from API payload.
 */
export function syncTileCatalogFromApiTiles(tiles) {
    if (!tiles || !tiles.length) return;
    const byKey = new Map();
    const idToTile = new Map(tiles.map((t) => [t.id, t]));

    for (const t of tiles) {
        if (!t.settings_toggle_key) continue;
        let row = byKey.get(t.settings_toggle_key);
        if (!row) {
            row = {
                key: t.settings_toggle_key,
                label: _TOGGLE_LABELS[t.settings_toggle_key] || (t.label || t.name || "").toUpperCase().slice(0, 12),
                ids: [],
                color: t.color || "#888",
            };
            byKey.set(t.settings_toggle_key, row);
        }
        row.ids.push(t.id);
        if (t.random_gen) row.autoGen = t.random_gen;
    }

    TILE_TOGGLES = [...byKey.values()].map((r) => ({
        ...r,
        ids: r.ids.sort((a, b) => a - b),
    }));

    TILE_GROUPS = TILE_TOGGLES.reduce((acc, toggle) => {
        acc[toggle.key] = toggle.ids.slice();
        return acc;
    }, {});

    TIMED_TILE_IDS = new Set(tiles.filter((x) => x.spawn_timing === "timed").map((x) => x.id));
    NON_MANUAL_TILE_IDS = new Set(
        tiles.filter((x) => !x.editor_placeable && x.spawn_timing !== "timed").map((x) => x.id)
    );
}
