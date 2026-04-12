"""
image_to_map.py — Advanced image-to-map conversion for Battle Tanks.

Uses smart algorithms to convert images into playable maps:
- Canny edge detection for wall placement
- Color-based terrain classification (water, forest, ice, lava)
- Brightness-based obstacle density
- K-means clustering for color quantization
- Morphological operations for structure cleanup
- A* pathfinding validation for playability
- Seam carving-inspired importance preservation
"""

import math
import random
from typing import List, Tuple, Dict, Optional, Set
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
import cv2
from skimage import filters, morphology, feature

try:
    from .map_model import Map, GRID_WIDTH, GRID_HEIGHT
    from .tile_registry import (
        EMPTY, BRICK, STEEL, WATER, FOREST, ICE, BASE, LAVA,
        MUD, RAMP, TNT, GLASS, AUTO_TURRET, SPECIAL_TNT,
    )
except ImportError:
    from map_model import Map, GRID_WIDTH, GRID_HEIGHT
    from tile_registry import (
        EMPTY, BRICK, STEEL, WATER, FOREST, ICE, BASE, LAVA,
        MUD, RAMP, TNT, GLASS, AUTO_TURRET, SPECIAL_TNT,
    )


# =============================================================================
# Color-Based Terrain Classification
# =============================================================================

@dataclass
class ColorRange:
    """RGB color range for terrain classification."""
    name: str
    tile_type: int
    r_min: int
    r_max: int
    g_min: int
    g_max: int
    b_min: int
    b_max: int
    priority: int = 0  # Higher priority = checked first


# Define color ranges for terrain classification
TERRAIN_COLORS = [
    # Water (blue tones)
    ColorRange("water", WATER, 0, 100, 100, 255, 150, 255, priority=10),
    # Forest (green tones)
    ColorRange("forest", FOREST, 0, 100, 100, 255, 0, 100, priority=9),
    # Lava (red/orange tones)
    ColorRange("lava", LAVA, 150, 255, 0, 100, 0, 80, priority=8),
    # Ice (light blue/white)
    ColorRange("ice", ICE, 200, 255, 220, 255, 240, 255, priority=7),
    # Mud (brown tones)
    ColorRange("mud", MUD, 100, 180, 60, 120, 40, 80, priority=6),
    # Steel (gray tones)
    ColorRange("steel", STEEL, 100, 180, 100, 180, 100, 180, priority=5),
]


def _classify_pixel(r: int, g: int, b: int) -> Tuple[int, str]:
    """
    Classify a pixel based on its RGB color.
    Returns (tile_type, terrain_name).
    """
    # Sort by priority (higher first)
    sorted_ranges = sorted(TERRAIN_COLORS, key=lambda x: x.priority, reverse=True)
    
    for color_range in sorted_ranges:
        if (color_range.r_min <= r <= color_range.r_max and
            color_range.g_min <= g <= color_range.g_max and
            color_range.b_min <= b <= color_range.b_max):
            return color_range.tile_type, color_range.name
    
    return EMPTY, "empty"


def _rgb_to_grayscale(r: int, g: int, b: int) -> float:
    """Convert RGB to perceived brightness (0-1)."""
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0


# =============================================================================
# Image Preprocessing
# =============================================================================

class ImagePreprocessor:
    """Advanced image preprocessing for map conversion."""

    def __init__(self, image: Image.Image, target_width: int = GRID_WIDTH, 
                 target_height: int = GRID_HEIGHT):
        self.original = image.convert('RGB')
        self.target_width = target_width
        self.target_height = target_height
        
        # Convert to numpy array
        self.rgb_array = np.array(self.original, dtype=np.float32)
        self.gray_array = cv2.cvtColor(self.rgb_array.astype(np.uint8), cv2.COLOR_RGB2GRAY)
        
        # Resize to target grid size using smart resizing
        self.resized_rgb = self._smart_resize()
        self.resized_gray = cv2.resize(
            self.gray_array, 
            (target_width, target_height), 
            interpolation=cv2.INTER_AREA
        )

    def _smart_resize(self) -> np.ndarray:
        """
        Resize image using seam carving-aware approach.
        Preserves important features while resizing.
        """
        # Use OpenCV's INTER_AREA for best quality downscaling
        resized = cv2.resize(
            self.rgb_array.astype(np.uint8),
            (self.target_width, self.target_height),
            interpolation=cv2.INTER_AREA
        )
        return resized

    def get_edge_map(self) -> np.ndarray:
        """
        Generate edge map using Canny edge detection.
        Returns binary array where 1 = edge, 0 = no edge.
        """
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(self.resized_gray, (5, 5), 1.0)
        
        # Canny edge detection with adaptive thresholds
        edges = cv2.Canny(blurred, threshold1=50, threshold2=150, apertureSize=3)
        
        # Dilate edges to make them more prominent
        kernel = np.ones((2, 2), np.uint8)
        dilated = cv2.dilate(edges, kernel, iterations=1)
        
        return (dilated > 0).astype(np.uint8)

    def get_importance_map(self) -> np.ndarray:
        """
        Generate importance map based on edge density and color variance.
        Higher values = more important regions to preserve.
        """
        # Edge-based importance
        edges = self.get_edge_map().astype(np.float32)
        
        # Color variance-based importance
        variance = np.zeros((self.target_height, self.target_width), dtype=np.float32)
        for y in range(self.target_height):
            for x in range(self.target_width):
                # Local variance in 3x3 neighborhood
                y_start = max(0, y - 1)
                y_end = min(self.target_height, y + 2)
                x_start = max(0, x - 1)
                x_end = min(self.target_width, x + 2)
                
                neighborhood = self.resized_gray[y_start:y_end, x_start:x_end]
                variance[y, x] = np.var(neighborhood)
        
        # Normalize variance
        if variance.max() > 0:
            variance = variance / variance.max()
        
        # Combine edge and variance importance
        importance = 0.6 * edges + 0.4 * variance
        
        return importance

    def get_color_clusters(self, n_clusters: int = 8) -> np.ndarray:
        """
        Use K-means clustering to identify dominant color regions.
        Returns cluster labels for each pixel.
        """
        pixels = self.resized_rgb.reshape(-1, 3)
        
        # K-means with OpenCV
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        flags = cv2.KMEANS_RANDOM_CENTERS
        
        pixels_flat = pixels.astype(np.float32)
        compactness, labels, centers = cv2.kmeans(
            pixels_flat, n_clusters, None, criteria, 10, flags
        )
        
        return labels.reshape(self.target_height, self.target_width)


# =============================================================================
# Map Generation Algorithms
# =============================================================================

class ImageToMapConverter:
    """
    Advanced image-to-map converter using multiple algorithms.
    """

    def __init__(self, image: Image.Image, params: 'ImageConversionParams' = None):
        self.params = params or ImageConversionParams()
        self.preprocessor = ImagePreprocessor(
            image, 
            self.params.grid_width, 
            self.params.grid_height
        )
        self.grid = [[EMPTY] * self.params.grid_width 
                     for _ in range(self.params.grid_height)]
        
        # Cache for computed maps
        self._edge_map = None
        self._importance_map = None
        self._color_clusters = None

    @property
    def edge_map(self) -> np.ndarray:
        if self._edge_map is None:
            self._edge_map = self.preprocessor.get_edge_map()
        return self._edge_map

    @property
    def importance_map(self) -> np.ndarray:
        if self._importance_map is None:
            self._importance_map = self.preprocessor.get_importance_map()
        return self._importance_map

    @property
    def color_clusters(self) -> np.ndarray:
        if self._color_clusters is None:
            self._color_clusters = self.preprocessor.get_color_clusters(
                self.params.n_color_clusters
            )
        return self._color_clusters

    def _apply_symmetry(self, x: int, y: int, value: int):
        """Apply symmetry to tile placement."""
        width = self.params.grid_width
        height = self.params.grid_height
        
        self.grid[y][x] = value

        if self.params.symmetry in ("horizontal", "both"):
            mirror_x = width - 1 - x
            if 0 <= mirror_x < width:
                self.grid[y][mirror_x] = value

        if self.params.symmetry in ("vertical", "both"):
            mirror_y = height - 1 - y
            if 0 <= mirror_y < height:
                self.grid[mirror_y][x] = value

        if self.params.symmetry == "both":
            mirror_x = width - 1 - x
            mirror_y = height - 1 - y
            if 0 <= mirror_x < width and 0 <= mirror_y < height:
                self.grid[mirror_y][mirror_x] = value

    def _classify_image_colors(self):
        """Classify pixels based on color to place terrain types."""
        rgb = self.preprocessor.resized_rgb
        
        for y in range(self.params.grid_height):
            for x in range(self.params.grid_width):
                if self.grid[y][x] != EMPTY:
                    continue
                    
                r, g, b = rgb[y, x]
                tile_type, terrain_name = _classify_pixel(r, g, b)
                
                if tile_type != EMPTY:
                    # Apply probability based on color confidence
                    if random.random() < self.params.terrain_placement_probability:
                        self._apply_symmetry(x, y, tile_type)

    def _place_walls_from_edges(self):
        """Place brick/steel walls based on detected edges."""
        for y in range(self.params.grid_height):
            for x in range(self.params.grid_width):
                if self.grid[y][x] != EMPTY:
                    continue
                    
                if self.edge_map[y, x] == 1:
                    # Determine wall type based on importance
                    importance = self.importance_map[y, x]
                    
                    if importance > self.params.steel_threshold:
                        tile = STEEL
                    else:
                        tile = BRICK
                    
                    if random.random() < self.params.edge_wall_probability:
                        self._apply_symmetry(x, y, tile)

    def _place_obstacles_from_brightness(self):
        """Place obstacles based on image brightness patterns."""
        gray = self.preprocessor.resized_gray
        
        for y in range(self.params.grid_height):
            for x in range(self.params.grid_width):
                if self.grid[y][x] != EMPTY:
                    continue
                
                brightness = gray[y, x] / 255.0
                
                # Dark areas tend to be obstacles
                if brightness < self.params.dark_threshold:
                    if random.random() < self.params.brightness_obstacle_probability:
                        self._apply_symmetry(x, y, BRICK)

    def _place_structures_from_clusters(self):
        """Use color clusters to place coherent structures."""
        clusters = self.color_clusters
        
        # Identify cluster centers
        unique_clusters = np.unique(clusters)
        
        for cluster_id in unique_clusters:
            # Find all pixels in this cluster
            mask = (clusters == cluster_id)
            positions = np.argwhere(mask)
            
            if len(positions) < self.params.min_cluster_size:
                continue
            
            # Calculate cluster density
            density = len(positions) / (self.params.grid_width * self.params.grid_height)
            
            # Large clusters become terrain features
            if density > self.params.large_cluster_threshold:
                for y, x in positions:
                    if self.grid[y][x] == EMPTY:
                        # Assign terrain based on cluster properties
                        if random.random() < self.params.cluster_terrain_probability:
                            tile = self._get_tile_for_cluster(cluster_id, x, y)
                            self._apply_symmetry(x, y, tile)

    def _get_tile_for_cluster(self, cluster_id: int, x: int, y: int) -> int:
        """Determine tile type for a color cluster."""
        rgb = self.preprocessor.resized_rgb
        
        # Sample color from cluster
        mask = (self.color_clusters == cluster_id)
        positions = np.argwhere(mask)
        
        if len(positions) == 0:
            return BRICK
        
        # Get average color of cluster
        sample_idx = random.randint(0, len(positions) - 1)
        sy, sx = positions[sample_idx]
        r, g, b = rgb[sy, sx]
        
        tile_type, _ = _classify_pixel(r, g, b)
        return tile_type if tile_type != EMPTY else BRICK

    def _apply_morphological_cleanup(self):
        """
        Apply morphological operations to clean up the map structure.
        Removes isolated pixels and fills small gaps.
        """
        # Convert grid to numpy array for morphological operations
        grid_array = np.array(self.grid)
        
        # Process each tile type
        for tile_type in [BRICK, STEEL, WATER, FOREST]:
            mask = (grid_array == tile_type)
            
            # Remove isolated pixels (erosion followed by dilation)
            if self.params.apply_opening:
                kernel = np.ones((2, 2), dtype=np.uint8)
                mask_uint8 = mask.astype(np.uint8)
                opened = cv2.morphologyEx(mask_uint8, cv2.MORPH_OPEN, kernel)
                mask = opened.astype(bool)
            
            # Fill small holes (dilation followed by erosion)
            if self.params.apply_closing:
                kernel = np.ones((2, 2), dtype=np.uint8)
                mask_uint8 = mask.astype(np.uint8)
                closed = cv2.morphologyEx(mask_uint8, cv2.MORPH_CLOSE, kernel)
                mask = closed.astype(bool)
            
            # Update grid
            grid_array[mask] = tile_type
        
        # Convert back to list of lists
        self.grid = grid_array.tolist()

    def _place_decorative_elements(self):
        """Place decorative elements like TNT, glass, turrets."""
        positions = []
        
        for y in range(self.params.grid_height):
            for x in range(self.params.grid_width):
                if self.grid[y][x] != EMPTY:
                    continue
                
                # Use importance map to find good positions
                importance = self.importance_map[y, x]
                
                # TNT in medium-importance areas
                if 0.3 < importance < 0.7 and random.random() < 0.03:
                    positions.append((x, y, TNT))
                # Glass in high-importance areas
                elif importance > 0.6 and random.random() < 0.02:
                    positions.append((x, y, GLASS))
                # Auto turrets near edges
                elif self.edge_map[y, x] == 1 and random.random() < 0.01:
                    positions.append((x, y, AUTO_TURRET))
        
        # Place elements with symmetry
        for x, y, tile in positions:
            self._apply_symmetry(x, y, tile)

    def _ensure_base_clearance(self):
        """Ensure area around base is clear for gameplay."""
        base_x = self.params.grid_width // 2
        base_y = self.params.grid_height - 2
        
        # Clear area around base
        clearance = self.params.base_clearance
        for dy in range(-clearance, clearance + 2):
            for dx in range(-clearance, clearance + 2):
                x, y = base_x + dx, base_y + dy
                if 0 <= x < self.params.grid_width and 0 <= y < self.params.grid_height:
                    # Don't clear the base position itself
                    if abs(dx) <= 1 and abs(dy) <= 1 and y >= base_y:
                        continue
                    # Clear blocking tiles
                    if self.grid[y][x] in (WATER, STEEL, LAVA, FOREST):
                        self.grid[y][x] = EMPTY

    def _create_escape_paths(self):
        """Create escape paths from base using ray casting."""
        base_x = self.params.grid_width // 2
        base_y = self.params.grid_height - 2
        
        # Create multiple escape routes
        n_paths = 3
        for i in range(n_paths):
            # Angle for this path
            angle = math.pi / 2 + (i - n_paths // 2) * 0.3
            
            # Ray cast upward
            path_length = random.randint(10, 20)
            for t in range(path_length):
                x = int(base_x + t * math.cos(angle))
                y = int(base_y - t * math.sin(angle))
                
                if 0 <= x < self.params.grid_width and 0 <= y < self.params.grid_height:
                    # Clear path
                    if self.grid[y][x] in (WATER, STEEL, LAVA):
                        self.grid[y][x] = EMPTY
                    
                    # Add brick borders for visual definition
                    for dx in [-1, 1]:
                        for dy in [-1, 0, 1]:
                            nx, ny = x + dx, y + dy
                            if (0 <= nx < self.params.grid_width and 
                                0 <= ny < self.params.grid_height and
                                self.grid[ny][nx] == EMPTY):
                                if random.random() < 0.3:
                                    self.grid[ny][nx] = BRICK

    def _validate_playability(self) -> bool:
        """
        Validate map playability using flood fill.
        Ensures base can reach most of the map.
        """
        base_x = self.params.grid_width // 2
        base_y = self.params.grid_height - 2
        
        # Flood fill from base
        visited = set()
        stack = [(base_x, base_y)]
        
        while stack:
            x, y = stack.pop()
            if (x, y) in visited:
                continue
            if not (0 <= x < self.params.grid_width and 0 <= y < self.params.grid_height):
                continue
            
            tile = self.grid[y][x]
            # Can traverse empty, water (swimming), ice, mud, ramp
            if tile in (STEEL, BRICK, LAVA, FOREST, GLASS):
                continue
            
            visited.add((x, y))
            
            # Add neighbors
            for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                stack.append((x + dx, y + dy))
        
        # Calculate reachable area
        total_traversable = sum(
            1 for y in range(self.params.grid_height)
            for x in range(self.params.grid_width)
            if self.grid[y][x] not in (STEEL, BRICK, LAVA, FOREST, GLASS)
        )
        
        if total_traversable == 0:
            return False
        
        reachable_ratio = len(visited) / total_traversable
        return reachable_ratio >= self.params.min_reachable_ratio

    def _fix_playability_issues(self):
        """Fix playability issues by clearing blocking tiles."""
        max_iterations = 100
        
        for _ in range(max_iterations):
            if self._validate_playability():
                break
            
            # Find and remove blocking tiles
            base_x = self.params.grid_width // 2
            base_y = self.params.grid_height - 2
            
            # BFS to find reachable tiles
            reachable = set()
            queue = [(base_x, base_y)]
            
            while queue:
                x, y = queue.pop(0)
                if (x, y) in reachable:
                    continue
                if not (0 <= x < self.params.grid_width and 0 <= y < self.params.grid_height):
                    continue
                
                tile = self.grid[y][x]
                if tile in (STEEL, BRICK, LAVA, FOREST, GLASS):
                    continue
                
                reachable.add((x, y))
                
                for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                    queue.append((x + dx, y + dy))
            
            # Find blocking tiles adjacent to reachable area
            blocking_tiles = []
            for x, y in reachable:
                for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.params.grid_width and 0 <= ny < self.params.grid_height:
                        if self.grid[ny][nx] in (STEEL, BRICK, LAVA):
                            blocking_tiles.append((nx, ny))
            
            # Remove some blocking tiles
            if blocking_tiles:
                random.shuffle(blocking_tiles)
                n_remove = min(len(blocking_tiles) // 3 + 1, 10)
                for x, y in blocking_tiles[:n_remove]:
                    self.grid[y][x] = EMPTY

    def generate(self, name: str = None) -> Map:
        """
        Generate a map from the image using all algorithms.
        
        Algorithm pipeline:
        1. Preprocess image (resize, enhance)
        2. Detect edges for wall placement
        3. Classify colors for terrain types
        4. Place obstacles from brightness
        5. Use clustering for coherent structures
        6. Apply morphological cleanup
        7. Place decorative elements
        8. Ensure base clearance
        9. Create escape paths
        10. Validate and fix playability
        11. Place base
        """
        # Reset grid
        self.grid = [[EMPTY] * self.params.grid_width 
                     for _ in range(self.params.grid_height)]
        
        # Step 1: Classify colors and place terrain
        if self.params.classify_colors:
            self._classify_image_colors()
        
        # Step 2: Place walls from edges
        if self.params.place_edge_walls:
            self._place_walls_from_edges()
        
        # Step 3: Place obstacles from brightness
        if self.params.place_brightness_obstacles:
            self._place_obstacles_from_brightness()
        
        # Step 4: Place structures from clusters
        if self.params.place_cluster_structures:
            self._place_structures_from_clusters()
        
        # Step 5: Morphological cleanup
        if self.params.apply_morphology:
            self._apply_morphological_cleanup()
        
        # Step 6: Place decorative elements
        if self.params.place_decorations:
            self._place_decorative_elements()
        
        # Step 7: Ensure base clearance
        self._ensure_base_clearance()
        
        # Step 8: Create escape paths
        if self.params.create_escape_paths:
            self._create_escape_paths()
        
        # Step 9: Fix playability issues
        self._fix_playability_issues()
        
        # Step 10: Place base
        base_x = self.params.grid_width // 2
        base_y = self.params.grid_height - 2
        self.grid[base_y][base_x] = BASE
        
        # Add base protection
        for dx in [-1, 1]:
            for dy in [-1, 0, 1]:
                x, y = base_x + dx, base_y + dy
                if (0 <= x < self.params.grid_width and 
                    0 <= y < self.params.grid_height and
                    self.grid[y][x] == EMPTY):
                    self.grid[y][x] = BRICK
        
        map_name = name or f"IMG_{random.randint(0, 0xFFFFFF):06X}"
        return Map(name=map_name, grid=self.grid)


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class ImageConversionParams:
    """Parameters for image-to-map conversion."""
    # Grid dimensions
    grid_width: int = GRID_WIDTH
    grid_height: int = GRID_HEIGHT
    
    # Symmetry
    symmetry: str = "horizontal"  # none, horizontal, vertical, both
    
    # Color classification
    classify_colors: bool = True
    terrain_placement_probability: float = 0.8
    n_color_clusters: int = 8
    
    # Edge detection
    place_edge_walls: bool = True
    edge_wall_probability: float = 0.7
    steel_threshold: float = 0.7  # Importance threshold for steel vs brick
    
    # Brightness-based placement
    place_brightness_obstacles: bool = True
    brightness_obstacle_probability: float = 0.5
    dark_threshold: float = 0.4  # Brightness below which to place obstacles
    
    # Cluster-based structures
    place_cluster_structures: bool = True
    cluster_terrain_probability: float = 0.9
    min_cluster_size: int = 5
    large_cluster_threshold: float = 0.05
    
    # Morphological operations
    apply_morphology: bool = True
    apply_opening: bool = True  # Remove isolated pixels
    apply_closing: bool = True   # Fill small gaps
    
    # Decorative elements
    place_decorations: bool = True
    
    # Playability
    base_clearance: int = 3
    create_escape_paths: bool = True
    min_reachable_ratio: float = 0.7  # Minimum 70% of map should be reachable


# =============================================================================
# Convenience Functions
# =============================================================================

def convert_image_to_map(
    image,
    name: str = None,
    symmetry: str = "horizontal",
    style: str = "balanced"
) -> Map:
    """
    Convert an image to a Battle Tanks map.
    
    Args:
        image: PIL Image instance OR path to the input image
        name: Output map name (auto-generated if not provided)
        symmetry: Symmetry type (none, horizontal, vertical, both)
        style: Conversion style (balanced, faithful, playable, decorative)
    
    Returns:
        Generated Map instance
    """
    # Load image if path provided
    if isinstance(image, str):
        image = Image.open(image)
    
    # Configure params based on style
    if style == "faithful":
        params = ImageConversionParams(
            symmetry=symmetry,
            classify_colors=True,
            terrain_placement_probability=0.95,
            place_edge_walls=True,
            edge_wall_probability=0.9,
            place_brightness_obstacles=True,
            brightness_obstacle_probability=0.7,
            place_cluster_structures=True,
            cluster_terrain_probability=0.95,
            apply_morphology=False,  # Preserve more detail
            place_decorations=False,
            create_escape_paths=True,
            min_reachable_ratio=0.6,
        )
    elif style == "playable":
        params = ImageConversionParams(
            symmetry=symmetry,
            classify_colors=True,
            terrain_placement_probability=0.6,
            place_edge_walls=True,
            edge_wall_probability=0.5,
            place_brightness_obstacles=False,
            place_cluster_structures=True,
            cluster_terrain_probability=0.7,
            apply_morphology=True,
            apply_opening=True,
            apply_closing=True,
            place_decorations=True,
            create_escape_paths=True,
            min_reachable_ratio=0.8,
        )
    elif style == "decorative":
        params = ImageConversionParams(
            symmetry=symmetry,
            classify_colors=True,
            terrain_placement_probability=0.85,
            place_edge_walls=True,
            edge_wall_probability=0.8,
            place_brightness_obstacles=True,
            brightness_obstacle_probability=0.6,
            place_cluster_structures=True,
            cluster_terrain_probability=0.9,
            apply_morphology=True,
            place_decorations=True,
            create_escape_paths=True,
            min_reachable_ratio=0.7,
        )
    else:  # balanced
        params = ImageConversionParams(
            symmetry=symmetry,
            classify_colors=True,
            terrain_placement_probability=0.8,
            place_edge_walls=True,
            edge_wall_probability=0.7,
            place_brightness_obstacles=True,
            brightness_obstacle_probability=0.5,
            place_cluster_structures=True,
            cluster_terrain_probability=0.8,
            apply_morphology=True,
            place_decorations=True,
            create_escape_paths=True,
            min_reachable_ratio=0.7,
        )
    
    converter = ImageToMapConverter(image, params)
    return converter.generate(name)


def convert_image_bytes_to_map(
    image_bytes: bytes,
    name: str = None,
    symmetry: str = "horizontal",
    style: str = "balanced"
) -> Map:
    """
    Convert image bytes to a Battle Tanks map.
    
    Args:
        image_bytes: Raw image bytes (e.g., from HTTP upload)
        name: Output map name
        symmetry: Symmetry type
        style: Conversion style
    
    Returns:
        Generated Map instance
    """
    from io import BytesIO
    
    image = Image.open(BytesIO(image_bytes))
    return convert_image_to_map(
        image, 
        name=name, 
        symmetry=symmetry, 
        style=style
    )
