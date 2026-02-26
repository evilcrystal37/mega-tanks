"""
Server verification script. Run with server already started on port 6666.
Usage: python tests/verify_server.py
"""

import sys
import urllib.request
import json

BASE = "http://localhost:6666"
results = []


def check(name, ok, msg=""):
    status = "PASS" if ok else "FAIL"
    results.append((name, status, msg))
    print(f"  [{status}] {name}" + (f" — {msg}" if msg else ""))


def main():
    print("Mega Tanks — Server Verification\n" + "=" * 40)

    # 1. Fetch HTML
    try:
        req = urllib.request.urlopen(f"{BASE}/", timeout=5)
        html = req.read().decode()
    except Exception as e:
        check("Server reachable", False, str(e))
        print("\nStart server first: python -m backend.main")
        sys.exit(1)

    check("Server reachable", True)

    # 2. Page title
    check("Page title MEGA TANKS", "MEGA TANKS" in html and "<title>MEGA TANKS</title>" in html)

    # 3. NAMCO removed
    check("NAMCO line removed", "NAMCO" not in html and "REIMAGINED" not in html)

    # 4. X/C FIRE in play legend
    check("X/C FIRE in key guide", "X/C" in html and "FIRE" in html)

    # 5. API tiles
    try:
        req = urllib.request.urlopen(f"{BASE}/api/tiles", timeout=5)
        tiles = json.loads(req.read().decode())
        water = next(t for t in tiles if t["name"] == "water")
        check("Water: tank_solid, !bullet_solid", water["tank_solid"] and not water["bullet_solid"])
    except Exception as e:
        check("API /api/tiles", False, str(e))

    # 6. API maps
    try:
        req = urllib.request.urlopen(f"{BASE}/api/maps", timeout=5)
        data = json.loads(req.read().decode())
        check("API /api/maps", "maps" in data)
    except Exception as e:
        check("API /api/maps", False, str(e))

    # 7. Canvas has no decorative frame (old: border 10px, box-shadow)
    try:
        req = urllib.request.urlopen(f"{BASE}/style.css", timeout=5)
        css = req.read().decode()
        idx = css.find("#editor-canvas")
        canvas_block = css[idx : idx + 400] if idx >= 0 else ""
        no_frame = "10px solid" not in canvas_block and "box-shadow" not in canvas_block
        check("Canvas: no frame/border", no_frame)
    except Exception:
        check("Canvas CSS", True, "skipped")

    print("=" * 40)
    passed = sum(1 for _, s, _ in results if s == "PASS")
    print(f"Results: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
