import os
from PIL import Image

ASSETS_DIR = "frontend/assets"
if not os.path.exists(ASSETS_DIR):
    os.makedirs(ASSETS_DIR)

CELL_SIZE = 32

def _img_from_text_grid(text_grid, palette, scale_to=None):
    """
    Creates a PIL image from a text grid and a color palette, scaled up.
    """
    h = len(text_grid)
    w = len(text_grid[0]) if h > 0 else 0
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    pixels = img.load()
    
    for y, row in enumerate(text_grid):
        for x, char in enumerate(row):
            if char in palette:
                pixels[x, y] = palette[char]
    
    # Scale up using NEAREST to keep pixel art crisp
    target = scale_to if scale_to is not None else CELL_SIZE
    if target and (target != w or target != h):
        img = img.resize((target, target), Image.NEAREST)
    return img


def _save_img(filename, img):
    img.save(os.path.join(ASSETS_DIR, filename))
    print(f"Generated {filename}")


def create_sprite(filename, text_grid, palette, scale_to=None):
    img = _img_from_text_grid(text_grid, palette, scale_to=scale_to)
    _save_img(filename, img)

# --- Palettes ---
# Brick: Oranges and dark shadows
C_BRICK = {
    '0': (0, 0, 0, 0),        # Transparent
    '1': (200, 76, 12, 255),  # Light orange brick
    '2': (124, 8, 0, 255),    # Dark red/brown outline
    '3': (252, 152, 56, 255), # Highlight
    'X': (0, 0, 0, 255),      # Black cement/mortar
}

# Steel: Grays and whites
C_STEEL = {
    '0': (0, 0, 0, 0),        # Transparent
    '1': (188, 188, 188, 255),# Light gray body
    '2': (116, 116, 116, 255),# Dark gray edges
    '3': (252, 252, 252, 255),# White highlight
}

# Water: Blues
C_WATER = {
    '1': (60, 188, 252, 255), # Light cyan 
    '2': (0, 64, 88, 255),    # Deep blue 
    '3': (0, 112, 236, 255),  # Mid blue
}

# Base: Eagle
C_BASE = {
    '0': (0, 0, 0, 255),       # Black background
    '2': (188, 188, 188, 255), # Gray wings/details
    '3': (252, 152, 56, 255),  # Orange beak/legs
    '4': (252, 252, 252, 255), # White body
}

# Base defeated: Skull
C_SKULL = {
    '0': (0, 0, 0, 255),        # Black background
    '1': (252, 252, 252, 255),  # Bone
    '2': (188, 188, 188, 255),  # Shadow
    '3': (252, 152, 56, 255),   # Accent (eyes)
}

# Tanks - New design for better "coolness"
C_P_TANK = {
    '0': (0, 0, 0, 0),         # Transparent
    'B': (252, 152, 56, 255),  # Yellow body
    'D': (200, 76, 12, 255),   # Darker yellow for detail
    'T': (100, 100, 100, 255), # Tracks
    'H': (255, 255, 255, 100), # Highlight
}

C_E_TANK = {
    '0': (0, 0, 0, 0),
    'B': (180, 180, 180, 255), # Silver body
    'D': (100, 100, 100, 255), # Dark gray
    'T': (40, 40, 40, 255),    # Black tracks
    'H': (255, 255, 255, 80),
}

# Explosion
C_EXP = {
    '0': (0, 0, 0, 0),         # Transparent
    '1': (255, 255, 255, 255), # White core
    '2': (255, 252, 64, 255),  # Yellow
    '3': (252, 152, 56, 255),  # Orange
    '4': (252, 12, 0, 255),    # Red
}

BRICK_MAP = [
    "2222222X2222222X",
    "2111113X2111113X",
    "2111113X2111113X",
    "2333333X2333333X",
    "XXXXXXXXXXXXXX2X",
    "222X2222222X221X",
    "113X2111113X211X",
    "113X2111113X211X",
    "333X2333333X233X",
    "XXXX2XXXXXXXXXXX",
    "2222222X2222222X",
    "2111113X2111113X",
    "2111113X2111113X",
    "2333333X2333333X",
    "XXXXXXXXXXXXXX2X",
    "222X2222222X221X",
]

STEEL_MAP = [
    "3333333322222222",
    "3111111321111112",
    "3111111321111112",
    "3112211321122112",
    "3121121321211212",
    "3112211321122112",
    "3111111321111112",
    "3333333322222222",
    "3333333322222222",
    "3111111321111112",
    "3111111321111112",
    "3112211321122112",
    "3121121321211212",
    "3112211321122112",
    "3111111321111112",
    "3333333322222222",
]

WATER_MAP = [
    "1111111111111111",
    "1222222222222221",
    "1221122112211221",
    "1223322332233221",
    "1223322332233221",
    "1221122112211221",
    "1222222222222221",
    "1111111111111111",
    "1111111111111111",
    "1222222222222221",
    "1221122112211221",
    "1223322332233221",
    "1223322332233221",
    "1221122112211221",
    "1222222222222221",
    "1111111111111111",
]

WATER2_MAP = [
    "1111111111111111",
    "1222222222222221",
    "1122112211221122",
    "1332233223322332",
    "1332233223322332",
    "1122112211221122",
    "1222222222222221",
    "1111111111111111",
    "1111111111111111",
    "1222222222222221",
    "1122112211221122",
    "1332233223322332",
    "1332233223322332",
    "1122112211221122",
    "1222222222222221",
    "1111111111111111",
]

BASE_MAP = [
    "0000000000000000",
    "0000000220000000",
    "0000002442000000",
    "0000022442200000",
    "0000224444422000",
    "0002244222442200",
    "0022442442424420",
    "0244424444424442",
    "0244444444444442",
    "0024444334444420",
    "0002444334444200",
    "0000222442220000",
    "0000002442000000",
    "0000000303000000",
    "0000000333000000",
    "0000000000000000",
]

SKULL_MAP = [
    "0000000000000000",
    "0000001111000000",
    "0000111111110000",
    "0001111111111000",
    "0011112222111100",
    "0011122222211100",
    "0011122332211100",
    "0011112222111100",
    "0001111111111000",
    "0000111111110000",
    "0000011111100000",
    "0000011211200000",
    "0000011111100000",
    "0000001111000000",
    "0000000000000000",
    "0000000000000000",
]

# Tank design — classic top-down tank: turret, body, tracks
# T/t = Track segments (alternating for animation), B = Body, D = Dark/outline, H = Highlight, 0 = Trans
# Facing up: turret at top, body center, tracks left/right
TANK_MAP_F1 = [
    "0000000HH0000000",
    "000000DBBD000000",
    "00000DBBBD000000",
    "0000DBBBBD000000",
    "T00DBBBBBBD00t00",
    "tT0BBBBBBBB0Tt0T",
    "Tt0BBBDDDDB0tT0t",
    "tT0BBDHHHDB0Tt0T",
    "Tt0BBDHHHDB0tT0t",
    "tT0BBBDDDDB0Tt0T",
    "Tt0BBBBBBBB0tT0t",
    "tT0DBBBBBBD0Tt0T",
    "Tt00DBBBBD00t00T",
    "tTT00DBBD00Ttt0T",
    "Ttt00D0000ttT00t",
    "00Tt0000000Tt000",
]

# Frame 2: swap T/t for track scroll animation
TANK_MAP_F2 = [row.replace('T', 'x').replace('t', 'T').replace('x', 't') for row in TANK_MAP_F1]

C_TANK_P = {
    '0': (0, 0, 0, 0),
    'B': (252, 192, 0, 255),   # Yellow
    'D': (200, 152, 0, 255),   # Dark yellow
    'H': (255, 255, 200, 255), # Highlight
    'T': (40, 40, 40, 255),    # Track segment 1
    't': (80, 80, 80, 255),    # Track segment 2
    '1': (20, 20, 20, 255),    # Inner track shadow
}

C_TANK_E = {
    '0': (0, 0, 0, 0),
    'B': (180, 180, 180, 255), # Silver
    'D': (120, 120, 120, 255), # Dark gray
    'H': (240, 240, 240, 255), # Highlight
    'T': (20, 20, 20, 255),
    't': (50, 50, 50, 255),
    '1': (10, 10, 10, 255),
}

def _tank_palette(body, dark, hi, t1, t2):
    return {
        '0': (0, 0, 0, 0),
        'B': body,
        'D': dark,
        'H': hi,
        'T': t1,
        't': t2,
        '1': (10, 10, 10, 255),
    }


ENEMY_TANK_PALETTES = {
    "basic": C_TANK_E,
    "fast": _tank_palette((128, 203, 196, 255), (60, 140, 132, 255), (210, 255, 250, 255), (20, 20, 20, 255), (50, 50, 50, 255)),
    "power": _tank_palette((239, 154, 154, 255), (180, 90, 90, 255), (255, 230, 230, 255), (20, 20, 20, 255), (50, 50, 50, 255)),
    "armor": _tank_palette((255, 224, 130, 255), (200, 152, 0, 255), (255, 250, 210, 255), (20, 20, 20, 255), (50, 50, 50, 255)),
}


def _rotate_and_save(base_img, filename_prefix):
    angles = {"up": 0, "right": -90, "down": 180, "left": 90}
    for d, a in angles.items():
        img = base_img.rotate(a, resample=Image.NEAREST, expand=False)
        _save_img(f"{filename_prefix}_{d}.png", img)


def _rotate_and_save_frames(img_f1, img_f2, filename_prefix):
    angles = {"up": 0, "right": -90, "down": 180, "left": 90}
    for d, a in angles.items():
        _save_img(f"{filename_prefix}_{d}_f1.png", img_f1.rotate(a, resample=Image.NEAREST, expand=False))
        _save_img(f"{filename_prefix}_{d}_f2.png", img_f2.rotate(a, resample=Image.NEAREST, expand=False))

# Explosion maps — 16x16 for dramatic effect
EXP_1 = [
    "0000001111000000",
    "0000112222110000",
    "0001222222210000",
    "0012222222221000",
    "0122222222222100",
    "0122222222222100",
    "1222222222222210",
    "1222222222222210",
    "1222222222222210",
    "1222222222222210",
    "0122222222222100",
    "0122222222222100",
    "0012222222221000",
    "0001222222210000",
    "0000112222110000",
    "0000001111000000",
]
EXP_2 = [
    "0000333333330000",
    "0033222222233300",
    "0332222222222330",
    "3322222222222233",
    "3222222222222223",
    "3222222222222223",
    "3222222222222223",
    "3222222222222223",
    "3222222222222223",
    "3222222222222223",
    "3222222222222223",
    "3222222222222223",
    "3322222222222233",
    "0332222222222330",
    "0033222222233300",
    "0000333333330000",
]
EXP_3 = [
    "4444444444444444",
    "4433333333333344",
    "4332222222222334",
    "4322222222222234",
    "4322211112222234",
    "4322111111222234",
    "4322111111222234",
    "4322111111222234",
    "4322111111222234",
    "4322111111222234",
    "4322211112222234",
    "4322222222222234",
    "4332222222222334",
    "4433222222223344",
    "4443333333333344",
    "4444444444444444",
]

ICE_MAP = ["1212121212121212", "2121212121212121"] * 8
FOREST_MAP = [
    "0011100001110000",
    "0111110011111000",
    "1111111111111100",
    "1112211111221100",
    "0112211112211100",
    "0001100000110000",
    "0000001110000000",
    "0000011111000000",
    "0011111111111100",
    "0111112211111100",
    "1111112211111100",
    "0011111111110000",
    "0000011100000000",
    "0111000011100000",
    "1111100111110000",
    "0111000011100000",
]

def main():
    # Tiles (scaled to CELL_SIZE)
    create_sprite("brick.png", BRICK_MAP, C_BRICK)
    create_sprite("steel.png", STEEL_MAP, C_STEEL)
    create_sprite("water1.png", WATER_MAP, C_WATER)
    create_sprite("water2.png", WATER2_MAP, C_WATER)
    create_sprite("base.png", BASE_MAP, C_BASE)
    create_sprite("base_defeated.png", SKULL_MAP, C_SKULL)
    create_sprite("ice.png", ICE_MAP, {"1":(230,255,255,255), "2":(180,240,255,255)})
    create_sprite("forest.png", FOREST_MAP, {"0":(0,0,0,0), "1":(34,139,34,200), "2":(0,100,0,200)})

    # Tanks (animated frames, rotated into 4 directions)
    p_f1 = _img_from_text_grid(TANK_MAP_F1, C_TANK_P)
    p_f2 = _img_from_text_grid(TANK_MAP_F2, C_TANK_P)
    _rotate_and_save_frames(p_f1, p_f2, "tank_player")

    for tank_type, pal in ENEMY_TANK_PALETTES.items():
        e_f1 = _img_from_text_grid(TANK_MAP_F1, pal)
        e_f2 = _img_from_text_grid(TANK_MAP_F2, pal)
        _rotate_and_save_frames(e_f1, e_f2, f"tank_enemy_{tank_type}")

    # Explosions
    create_sprite("exp_f1.png", EXP_1, C_EXP)
    create_sprite("exp_f2.png", EXP_2, C_EXP)
    create_sprite("exp_f3.png", EXP_3, C_EXP)

if __name__ == "__main__":
    main()
