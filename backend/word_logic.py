import random
from dataclasses import dataclass, field
from typing import List, Set, Tuple, Optional

@dataclass
class Overlay:
    x: int
    y: int
    letter: str

@dataclass
class GameState:
    width: int
    height: int
    current_prefix: str
    overlays: List[Overlay]

@dataclass
class Params:
    spawn_choices_k: int
    max_overlays: int
    prefer_complete_at_3: bool
    allow_extend_to_4: bool
    forbidden_positions: Set[Tuple[int, int]] = field(default_factory=set)

# Events
class Event:
    pass

@dataclass
class LetterAccepted(Event):
    letter: str
    x: int
    y: int
    new_prefix: str

@dataclass
class LetterRejected(Event):
    letter: str
    x: int
    y: int
    reason: str

@dataclass
class WordCompleted(Event):
    word: str

@dataclass
class PrefixReset(Event):
    old_prefix: str
    reason: str

@dataclass
class OverlaySpawned(Event):
    letter: str
    x: int
    y: int

@dataclass
class OverlayRemoved(Event):
    letter: str
    x: int
    y: int

@dataclass
class UpdateResult:
    new_state: GameState
    events: List[Event]

class PrefixIndex:
    def __init__(self, words: List[str]):
        self.next_letters_map = {}
        self.is_complete_word_map = {}
        for word in words:
            word = word.upper()
            self.is_complete_word_map[word] = True
            for i in range(len(word)):
                prefix = word[:i]
                if prefix not in self.next_letters_map:
                    self.next_letters_map[prefix] = set()
                if i < len(word):
                    self.next_letters_map[prefix].add(word[i])
                if prefix not in self.is_complete_word_map:
                    self.is_complete_word_map[prefix] = False

    def nextLetters(self, prefix: str) -> Set[str]:
        return self.next_letters_map.get(prefix, set())

    def isCompleteWord(self, prefix: str) -> bool:
        return self.is_complete_word_map.get(prefix, False)

def ensureContinuationOverlays(state: GameState, prefixIndex: PrefixIndex, params: Params, rng: random.Random) -> Tuple[GameState, List[Event]]:
    P = state.current_prefix
    validNext = prefixIndex.nextLetters(P)
    events: List[Event] = []

    if not validNext:
        if not prefixIndex.isCompleteWord(P):
            if P != "":
                events.append(PrefixReset(P, "dead_prefix"))
                state.current_prefix = ""
        return state, events

    # If there is already ANY overlay with a letter in validNext, spawn nothing.
    has_valid_overlay = any(overlay.letter in validNext for overlay in state.overlays)
    if has_valid_overlay:
        return state, events

    # Need to spawn up to min(spawnChoicesK, |validNext|) distinct valid letters
    num_to_spawn = min(params.spawn_choices_k, len(validNext))
    current_overlay_count = len(state.overlays)
    
    # Cap by maxOverlays
    if current_overlay_count + num_to_spawn > params.max_overlays:
        num_to_spawn = max(0, params.max_overlays - current_overlay_count)

    if num_to_spawn <= 0:
        return state, events

    # Sample distinct valid letters
    chosen_letters = rng.sample(list(validNext), num_to_spawn)

    # valid empty positions
    occupied_positions = {(ov.x, ov.y) for ov in state.overlays}
    all_empty_positions = []
    for y in range(state.height):
        for x in range(state.width):
            pos = (x, y)
            if pos not in occupied_positions and pos not in params.forbidden_positions:
                all_empty_positions.append(pos)
                
    if not all_empty_positions:
        return state, events
        
    num_to_spawn = min(num_to_spawn, len(all_empty_positions))
    if num_to_spawn <= 0:
        return state, events
        
    chosen_positions = rng.sample(all_empty_positions, num_to_spawn)

    for letter, pos in zip(chosen_letters[:num_to_spawn], chosen_positions):
        new_overlay = Overlay(x=pos[0], y=pos[1], letter=letter)
        state.overlays.append(new_overlay)
        events.append(OverlaySpawned(letter=letter, x=pos[0], y=pos[1]))

    return state, events

def handleLetterShot(state: GameState, prefixIndex: PrefixIndex, shotX: int, shotY: int, params: Params, rng: random.Random) -> UpdateResult:
    events: List[Event] = []
    
    # Find overlay
    target_overlay = None
    for ov in state.overlays:
        if ov.x == shotX and ov.y == shotY:
            target_overlay = ov
            break
            
    if not target_overlay:
        # no overlay at (shotX, shotY)
        return UpdateResult(new_state=state, events=[])
        
    L = target_overlay.letter
    validNext = prefixIndex.nextLetters(state.current_prefix)
    
    if L not in validNext:
        events.append(LetterRejected(letter=L, x=shotX, y=shotY, reason="invalid_next_letter"))
        return UpdateResult(new_state=state, events=events)
        
    # Accept letter
    newPrefix = state.current_prefix + L
    state.current_prefix = newPrefix
    state.overlays.remove(target_overlay)
    events.append(LetterAccepted(letter=L, x=shotX, y=shotY, new_prefix=newPrefix))
    events.append(OverlayRemoved(letter=L, x=shotX, y=shotY))
    
    # Completion rules
    if len(newPrefix) >= 4:
        if prefixIndex.isCompleteWord(newPrefix):
            events.append(WordCompleted(word=newPrefix))
            state.current_prefix = ""
        else:
            events.append(PrefixReset(old_prefix=newPrefix, reason="invalid_4"))
            state.current_prefix = ""
    elif len(newPrefix) == 3:
        if prefixIndex.isCompleteWord(newPrefix):
            if params.prefer_complete_at_3:
                events.append(WordCompleted(word=newPrefix))
                state.current_prefix = ""
            elif params.allow_extend_to_4 and prefixIndex.nextLetters(newPrefix):
                # allow continuing
                pass
            else:
                events.append(WordCompleted(word=newPrefix))
                state.current_prefix = ""
                
    # Continuation guarantees
    state, cont_events = ensureContinuationOverlays(state, prefixIndex, params, rng)
    events.extend(cont_events)
    
    return UpdateResult(new_state=state, events=events)
