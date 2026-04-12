"""
input_recorder.py — Player input history for Clone powerup effect.

Records player input frames (direction + fire) in a ring buffer so the clone
tank can replay them with a fixed delay.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Optional


@dataclass
class InputFrame:
    """A single frame of player input."""
    direction: Optional[str]  # "up", "down", "left", "right", or None
    fire: bool


class InputRecorder:
    """
    Ring buffer for recording player inputs.

    The clone effect replays inputs with a fixed delay (e.g., 15 ticks).
    This recorder stores the last N frames and allows retrieval by offset.
    """

    def __init__(self, max_frames: int = 1200) -> None:
        """
        Initialize the input recorder.

        Args:
            max_frames: Maximum number of frames to store (~20 seconds at 60 FPS)
        """
        self.max_frames = max_frames
        self._buffer: deque[InputFrame] = deque(maxlen=max_frames)
        self._tick_count: int = 0

    def record(self, direction: Optional[str], fire: bool) -> None:
        """Record the current frame's input."""
        self._buffer.append(InputFrame(direction=direction, fire=fire))
        self._tick_count += 1

    def get_frame(self, ticks_ago: int) -> Optional[InputFrame]:
        """
        Get the input frame from ticks_ago ticks in the past.

        Args:
            ticks_ago: How many ticks back to look (1 = previous tick)

        Returns:
            InputFrame if available, None if not enough history
        """
        if ticks_ago <= 0 or ticks_ago > len(self._buffer):
            return None
        return self._buffer[-ticks_ago]

    def get_input(self, ticks_ago: int) -> tuple[Optional[str], bool]:
        """
        Get the direction and fire state from ticks_ago ticks in the past.

        Args:
            ticks_ago: How many ticks back to look

        Returns:
            Tuple of (direction, fire) or (None, False) if not available
        """
        frame = self.get_frame(ticks_ago)
        if frame is None:
            return None, False
        return frame.direction, frame.fire

    def clear(self) -> None:
        """Clear the buffer."""
        self._buffer.clear()
        self._tick_count = 0

    @property
    def frame_count(self) -> int:
        """Number of frames currently stored."""
        return len(self._buffer)

    @property
    def total_ticks(self) -> int:
        """Total ticks recorded since creation/clear."""
        return self._tick_count
