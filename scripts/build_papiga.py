#!/usr/bin/env python3
"""Write the parrot spots into data/papiga.json (scrambled with XOR+base64 like Wordle – NOT secure).

Input: the Drive sheet »papiga« tab »spots« copied as tab-separated text (date <TAB> spot), e.g.
    2. 11. 2026	x 1575, y 715, r 65
Usage: python3 scripts/build_papiga.py spots.tsv   (or pipe the rows on stdin)
Each date must already have a puzzle in data/papiga.json (picture in assets/papiga/<date>.webp).
"""
import base64, json, re, sys

PATH = "data/papiga.json"
KEY = "papiga2026"

def obf(text, key=KEY):
    b = text.encode("utf-8")
    return base64.b64encode(bytes(c ^ ord(key[i % len(key)]) for i, c in enumerate(b))).decode()

def iso(d):
    m = re.match(r"\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})", d)
    return f"{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}" if m else d.strip()[:10]

src = open(sys.argv[1], encoding="utf-8") if len(sys.argv) > 1 else sys.stdin
spots = {}
for line in src:
    if "\t" not in line:
        continue
    d, s = line.rstrip("\n").split("\t")[:2]
    n = [float(v) if "." in v else int(v) for v in re.findall(r"\d+(?:\.\d+)?", s)]
    if len(n) >= 3:
        spots[iso(d)] = n[:3]

data = json.load(open(PATH, encoding="utf-8"))
data["key"] = KEY
data["orig"] = [1792, 2400]
for p in data["puzzles"]:
    if p["date"] in spots:
        p["s"] = obf(json.dumps(spots[p["date"]], separators=(",", ":")))
missing = [p["date"] for p in data["puzzles"] if "s" not in p]
rows = ",\n".join("  " + json.dumps(p, ensure_ascii=False) for p in data["puzzles"])
head = {k: v for k, v in data.items() if k != "puzzles"}
out = "{\n" + "".join(f" {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},\n" for k, v in head.items()) + f' "puzzles": [\n{rows}\n ]\n}}\n'
open(PATH, "w", encoding="utf-8").write(out)
print(f"{len(spots)} spots written" + (f"; WITHOUT a spot: {', '.join(missing)}" if missing else ""))
