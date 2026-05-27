#!/usr/bin/env python3
"""Download Scryfall Oracle Cards bulk data and filter to Momir-legal creatures indexed by CMC."""

import json
import requests
import sys

print("Fetching bulk data URL...")
bulk_meta = requests.get("https://api.scryfall.com/bulk-data/oracle-cards").json()
download_url = bulk_meta["download_uri"]
print(f"Downloading {bulk_meta['size'] / 1024 / 1024:.0f}MB...")

resp = requests.get(download_url)
resp.raise_for_status()
cards = resp.json()
print(f"Loaded {len(cards)} cards total")

# Filter to Momir-legal creatures
momir_cards = {}
for card in cards:
    # Must be vintage legal
    if card.get("legalities", {}).get("vintage") != "legal":
        continue
    # No funny sets
    if card.get("set_type") == "funny":
        continue
    # Must have a type line with Creature on front face
    type_line = card.get("type_line", "")
    # For double-faced cards, front face is before " // "
    front_type = type_line.split(" // ")[0]
    if "Creature" not in front_type:
        continue
    # No lands
    if "Land" in front_type:
        continue
    # Must have a mana cost
    mana_cost = card.get("mana_cost", "")
    if not mana_cost or mana_cost == "":
        continue
    # No X in mana cost
    if "X" in mana_cost:
        continue
    # Must have image
    if "image_uris" not in card:
        continue

    cmc = str(int(card.get("cmc", 0)))
    entry = {
        "name": card["name"],
        "img": card["image_uris"]["border_crop"],
        "c": card.get("colors", []),
    }

    momir_cards.setdefault(cmc, []).append(entry)

# Summary
total = sum(len(v) for v in momir_cards.values())
print(f"\nFiltered to {total} Momir-legal creatures across {len(momir_cards)} CMC values:")
for cmc in sorted(momir_cards.keys(), key=int):
    print(f"  CMC {cmc:>2}: {len(momir_cards[cmc])} creatures")

# Write output
output_path = "momir-cards.json"
with open(output_path, "w") as f:
    json.dump(momir_cards, f, separators=(",", ":"))

size_mb = len(json.dumps(momir_cards, separators=(",", ":"))) / 1024 / 1024
print(f"\nSaved to {output_path} ({size_mb:.1f}MB)")
