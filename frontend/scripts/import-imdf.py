"""Convert PolyMap's IMDF snapshot into the browser and native map bundle."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path, help="Path to the original IMDFData directory")
parser.add_argument("--revision", required=True)
args = parser.parse_args()

def load(name):
    return json.loads((args.source / f"{name}.geojson").read_text())["features"]

def label(value):
    return (value or {}).get("ru") or (value or {}).get("en") or ""

def index(name):
    return {feature["id"]: feature for feature in load(name)}

levels = index("level")
units = index("unit")
anchors = index("anchor")
addresses = index("address")
buildings = index("building")
attractions = index("attraction")
places = []

def place(feature, position, *, level=None, unit=None, building=None):
    props = feature["properties"]
    building = building or (levels[level]["properties"]["building_ids"][0] if level else None)
    address_id = buildings[building]["properties"].get("address_id") if building in buildings else None
    name = label(props.get("name"))
    if name and position:
        places.append(dict(
            id=feature["id"], name=name, short=label(props.get("shortName") or props.get("short_name")),
            alternate=label(props.get("alt_name")), category=props["category"],
            level=level, building=building, unit=unit, position=position,
            address=addresses.get(address_id, {}).get("properties", {}).get("address"),
            description=label(props.get("description")) if isinstance(props.get("description"), dict) else props.get("description"),
        ))

for feature in attractions.values():
    place(feature, feature["geometry"]["coordinates"], building=feature["properties"].get("building_id"))
for feature in load("enviromentAmenity"):
    place(feature, feature["geometry"]["coordinates"])
for feature in load("occupant"):
    anchor = anchors[feature["properties"]["anchor_id"]]
    unit = anchor["properties"]["unit_id"]
    if unit in units:
        place(feature, anchor["geometry"]["coordinates"], unit=unit, level=units[unit]["properties"]["level_id"])
for feature in load("amenity"):
    unit = next((key for key in feature["properties"]["unit_ids"] if key in units), None)
    if unit:
        place(feature, feature["geometry"]["coordinates"], unit=unit, level=units[unit]["properties"]["level_id"])

named_units = {p["unit"] for p in places}
for unit, feature in units.items():
    if unit not in named_units:
        props = feature["properties"]
        place(feature, (props.get("display_point") or {}).get("coordinates"), unit=unit, level=props["level_id"])

def layer(features):
    return [dict(type="Feature", id=f["id"], geometry=f["geometry"],
                 properties={k: f["properties"][k] for k in ("category", "level_id", "restriction")
                             if k in f["properties"]}) for f in features if f["geometry"]]

names = {f["properties"].get("building_id"): label(f["properties"].get("name")) for f in attractions.values()}
floor_plans = {}
for name in ("level", "unit", "detail", "opening"):
    for feature in layer(load(name)):
        level = feature["id"] if name == "level" else feature["properties"].get("level_id")
        floor_plans.setdefault(level, []).append(feature)
bundle = {
    "revision": args.revision,
    "defaultStart": load("venue")[0]["properties"]["navpath_begin_id"],
    "campus": layer(load("enviroment") + list(buildings.values())) + floor_plans.get(None, []),
    "buildings": [{
        "id": key, "name": names.get(key) or label(f["properties"]["name"]),
        "position": (f["properties"].get("display_point") or {}).get("coordinates"),
        "floors": sorted([dict(id=i, name=label(l["properties"]["short_name"]),
                              ordinal=l["properties"]["ordinal"], geometry=floor_plans.get(i, []))
                          for i,l in levels.items() if key in l["properties"]["building_ids"]],
                         key=lambda floor: floor["ordinal"]),
    } for key,f in buildings.items()],
    "places": places,
    "nodes": [[f["id"], f["geometry"]["coordinates"], f["properties"]["level_id"],
               f["properties"]["builing_id"], f["properties"]["weight"],
               f["properties"]["tags"], f["properties"]["neighbours"]] for f in load("navPath")],
    "connections": [[f["properties"]["associeted_id"], f["properties"]["pathNode_id"]]
                    for f in load("navPathAssocieted")],
}
encoded = json.dumps(bundle, ensure_ascii=False, separators=(",", ":")).encode()
version = hashlib.sha256(encoded).hexdigest()[:16]
output = Path(__file__).resolve().parents[1] / "public/maps"
(output / "campus.json").write_bytes(encoded)
(output / "manifest.json").write_text(json.dumps(dict(version=version, url="/maps/campus.json")))
