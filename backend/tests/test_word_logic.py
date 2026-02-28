import unittest
import random
from backend.word_logic import (
    PrefixIndex, GameState, Params, Overlay, handleLetterShot, ensureContinuationOverlays,
    LetterAccepted, LetterRejected, WordCompleted, PrefixReset, OverlaySpawned, OverlayRemoved
)

SAMPLE_WORDS = [
    # 3-letter
    "ANT", "ART", "BAG", "BAT", "BED", "BEE", "BOX", "BOY", "BUS", "CAT", "COW", "CUP",
    "DOG", "EAR", "EGG", "FAN", "FLY", "FOG", "GAS", "HAT", "HEN", "ICE", "INK", "JAM",
    "JAR", "KEY", "KID", "LEG", "LIP", "LOG", "MAP", "MUG", "NET",
    # 4-letter
    "BALL", "BARK", "BARN", "BEAR", "BIKE", "BIRD", "BLUE", "BOAT", "BOOK", "BOSS",
    "CAKE", "CAMP", "CARD", "CORN", "CRAB", "CROW", "DOOR", "DUCK", "FARM", "FISH",
    "FLAG", "FROG", "GAME", "GIFT", "GIRL", "GOLD", "HAND", "HEAD", "HOME", "JUMP",
    "KITE", "KING", "LION", "MOON", "NEST"
]

class TestWordLogic(unittest.TestCase):
    def setUp(self):
        self.prefix_index = PrefixIndex(SAMPLE_WORDS)
        self.rng = random.Random(42) # Seeded for determinism

    def test_prefix_index_correctness(self):
        # 3. Registry compliance
        self.assertTrue(self.prefix_index.isCompleteWord("CAT"))
        self.assertFalse(self.prefix_index.isCompleteWord("CA"))
        self.assertIn("A", self.prefix_index.nextLetters("C"))
        self.assertIn("O", self.prefix_index.nextLetters("C"))
        self.assertNotIn("Z", self.prefix_index.nextLetters("C"))

    def test_prefix_correctness_invalid_shot(self):
        # 1. Prefix correctness (reject)
        state = GameState(width=10, height=10, current_prefix="C", overlays=[
            Overlay(x=1, y=1, letter="Z") # Z is invalid after C
        ])
        params = Params(spawn_choices_k=2, max_overlays=5, prefer_complete_at_3=True, allow_extend_to_4=True)
        
        result = handleLetterShot(state, self.prefix_index, 1, 1, params, self.rng)
        
        self.assertEqual(result.new_state.current_prefix, "C") # unchanged
        self.assertEqual(len(result.new_state.overlays), 1) # overlay stays (or we could have removed, but default kept)
        self.assertTrue(any(isinstance(e, LetterRejected) for e in result.events))

    def test_guarantee_continuation(self):
        # 2. Guarantee: next letters are non-empty, guarantee at least one valid next
        state = GameState(width=10, height=10, current_prefix="C", overlays=[
            Overlay(x=1, y=1, letter="Z") # No valid next overlays
        ])
        params = Params(spawn_choices_k=2, max_overlays=5, prefer_complete_at_3=True, allow_extend_to_4=True)
        
        updated_state, events = ensureContinuationOverlays(state, self.prefix_index, params, self.rng)
        
        # Valid next letters for 'C' include 'A', 'O', 'U', 'R' etc.
        valid_next = self.prefix_index.nextLetters("C")
        
        has_valid = any(ov.letter in valid_next for ov in updated_state.overlays)
        self.assertTrue(has_valid)
        self.assertTrue(any(isinstance(e, OverlaySpawned) for e in events))

    def test_completion_3_letters(self):
        # 4. Completion: 3-letter complete, prefer complete at 3 = True
        state = GameState(width=10, height=10, current_prefix="CA", overlays=[
            Overlay(x=2, y=2, letter="T") # forms CAT
        ])
        params = Params(spawn_choices_k=2, max_overlays=5, prefer_complete_at_3=True, allow_extend_to_4=False)
        
        result = handleLetterShot(state, self.prefix_index, 2, 2, params, self.rng)
        
        self.assertEqual(result.new_state.current_prefix, "") # reset
        self.assertTrue(any(isinstance(e, WordCompleted) and e.word == "CAT" for e in result.events))

    def test_completion_4_letters(self):
        # 4. Completion: 4-letter complete
        state = GameState(width=10, height=10, current_prefix="CAK", overlays=[
            Overlay(x=2, y=2, letter="E") # forms CAKE
        ])
        params = Params(spawn_choices_k=2, max_overlays=5, prefer_complete_at_3=False, allow_extend_to_4=True)
        
        result = handleLetterShot(state, self.prefix_index, 2, 2, params, self.rng)
        
        self.assertEqual(result.new_state.current_prefix, "") # reset
        self.assertTrue(any(isinstance(e, WordCompleted) and e.word == "CAKE" for e in result.events))

    def test_dead_prefix(self):
        # Prefix Reset: dead prefix -> reset to ""
        state = GameState(width=10, height=10, current_prefix="BO", overlays=[
            Overlay(x=3, y=3, letter="Z") # Let's assume we forcibly added it somehow or test 4-letter dead
        ])
        state.current_prefix = "BZZ" # force dead
        params = Params(spawn_choices_k=2, max_overlays=5, prefer_complete_at_3=False, allow_extend_to_4=True)
        
        updated_state, events = ensureContinuationOverlays(state, self.prefix_index, params, self.rng)
        self.assertEqual(updated_state.current_prefix, "")
        self.assertTrue(any(isinstance(e, PrefixReset) for e in events))

    def test_determinism(self):
        # 5. Determinism
        state1 = GameState(width=10, height=10, current_prefix="B", overlays=[])
        rng1 = random.Random(99)
        params = Params(spawn_choices_k=3, max_overlays=5, prefer_complete_at_3=True, allow_extend_to_4=True)
        
        state1, ev1 = ensureContinuationOverlays(state1, self.prefix_index, params, rng1)
        
        state2 = GameState(width=10, height=10, current_prefix="B", overlays=[])
        rng2 = random.Random(99)
        
        state2, ev2 = ensureContinuationOverlays(state2, self.prefix_index, params, rng2)
        
        self.assertEqual(state1.overlays, state2.overlays)
        self.assertEqual(len(ev1), len(ev2))

    def test_key_example(self):
        # 6. Key example from the prompt
        # Registry contains only words starting with CA.. for the C branch.
        # "CAT", "CAKE", "CAMP", "CARD" are in our list. Let's make a custom index for exact match.
        custom_words = ["CAT", "CAPE", "CARS"]
        custom_index = PrefixIndex(custom_words)
        
        # Scenario:
        # Overlays currently include C somewhere and A somewhere.
        # currentPrefix = ""
        # Kid shoots C
        state = GameState(width=10, height=10, current_prefix="", overlays=[
            Overlay(x=1, y=1, letter="C"),
            Overlay(x=5, y=5, letter="A")
        ])
        params = Params(spawn_choices_k=2, max_overlays=5, prefer_complete_at_3=True, allow_extend_to_4=True)
        
        # Kid shoots C
        result = handleLetterShot(state, custom_index, 1, 1, params, self.rng)
        
        # Accept C; now currentPrefix="C"
        self.assertEqual(result.new_state.current_prefix, "C")
        
        # validNext for "C" is {"A"} only
        self.assertEqual(custom_index.nextLetters("C"), {"A"})
        
        # Since an "A" overlay already exists, ensureContinuationOverlays spawns nothing.
        spawn_events = [e for e in result.events if isinstance(e, OverlaySpawned)]
        self.assertEqual(len(spawn_events), 0)
        self.assertEqual(len(result.new_state.overlays), 1) # A is still there
        self.assertEqual(result.new_state.overlays[0].letter, "A")

if __name__ == '__main__':
    unittest.main()
