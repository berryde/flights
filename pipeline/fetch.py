"""Download raw source data into pipeline/.cache.

Sources are only re-downloaded when the cached copy is older than the source's
update interval, so running the pipeline repeatedly never hammers them.
Pass --force to download regardless.
"""

import sys
import time
import urllib.request
from pathlib import Path

CACHE = Path(__file__).parent / ".cache"
USER_AGENT = "flights-pipeline/2.0"

DAY = 86400
SOURCES = {
    # Every passenger airport and its outbound routes, scraped weekly from
    # flightsfrom.com by Jonty Wareing. One 23 MB JSON file, keyed by IATA code.
    "airline-routes.json": (
        "https://raw.githubusercontent.com/Jonty/airline-route-data/master/airline_routes.json",
        DAY,
    ),
    # Natural Earth 1:50m land polygons (public domain), for the map's land mask.
    # Coastlines don't change, so this is fetched once; land.py rasterises it.
    "ne_50m_land.geojson": (
        "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson",
        365 * DAY,
    ),
}


def fetch(name: str, url: str, max_age: float, force: bool) -> None:
    path = CACHE / name
    if not force and path.exists() and time.time() - path.stat().st_mtime < max_age:
        print(f"  {name}: cached")
        return

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        body = response.read()

    path.write_bytes(body)
    print(f"  {name}: downloaded {len(body) / 1e6:.1f} MB")


def main() -> None:
    force = "--force" in sys.argv
    CACHE.mkdir(exist_ok=True)
    failures = []
    for name, (url, max_age) in SOURCES.items():
        try:
            fetch(name, url, max_age, force)
        except OSError as error:
            failures.append(name)
            print(f"  {name}: FAILED ({error})", file=sys.stderr)
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
