"""Build the static data files the app loads, from the raw files in .cache.

Outputs (in ../public/data):
  routes.bin    Little-endian Uint16 columns, one value per route per column
                (see ROUTE_COLUMNS). A route is one airline flying one way
                between two airports.
  catalog.json  Metadata: column layout, and the airports and airlines the
                route columns index into.

Only airports with at least one route are kept, busiest first, so an airport's
index doubles as its rank. Routes are sorted by origin, then destination, so
all the airlines flying one pair of airports sit together.
"""

import json
import sys
from array import array
from datetime import UTC, datetime
from pathlib import Path

import duckdb

ROOT = Path(__file__).parent
CACHE = ROOT / ".cache"
OUT = ROOT.parent / "public" / "data"

ROUTE_COLUMNS = [
    "from",  # index into airports
    "to",  # index into airports
    "airline",  # index into airlines, or NO_AIRLINE
    "minutes",  # scheduled flight time
]
# The source lists a few routes without saying who flies them.
NO_AIRLINE = 0xFFFF


def main() -> None:
    con = duckdb.connect()

    # The source is one JSON object keyed by IATA code, so read it as text and
    # split it into a row per airport rather than a column per airport.
    con.execute(
        """
        create table source as
        select json_transform(value, '{
            "iata": "varchar", "name": "varchar", "city_name": "varchar", "country": "varchar",
            "latitude": "double", "longitude": "double",
            "routes": [{"iata": "varchar", "min": "integer",
                        "carriers": [{"iata": "varchar", "name": "varchar"}]}]
        }') as airport
        from json_each((select content from read_text(?)))
        """,
        [str(CACHE / "airline-routes.json")],
    )

    # One row per airline per direction. The source repeats a few destinations
    # and lists a few airports as their own destination.
    con.execute(
        """
        create table flights as
        with pairs as (
            select airport.iata as src, unnest(airport.routes) as route from source
        )
        select src, route.iata as dst, carrier.iata as airline,
               any_value(carrier.name) as airline_name,
               max(route.min) as minutes
        from pairs
        -- A left join keeps the routes that have no carriers listed.
        left join unnest(route.carriers) as c(carrier) on true
        where src <> route.iata
        group by all
        """
    )

    con.execute(
        """
        create table airports as
        with counts as (
            select code, count(*) as n
            from (select src as code from flights union all select dst from flights)
            group by code
        )
        select (row_number() over (order by c.n desc, c.code) - 1)::integer as idx,
               c.code, trim(a.name) as name, trim(a.city_name) as city,
               trim(a.country) as country,
               round(a.latitude, 4) as lat, round(a.longitude, 4) as lon
        from counts c join (select unnest(airport) from source) a on a.iata = c.code
        """
    )
    con.execute(
        """
        create table airlines as
        select (row_number() over (order by count(*) desc, airline) - 1)::integer as idx,
               airline as code, any_value(airline_name) as name
        from flights where airline is not null group by airline
        """
    )

    routes = con.execute(
        f"""
        select s.idx, d.idx, coalesce(l.idx, {NO_AIRLINE}), coalesce(f.minutes, 0)
        from flights f
        join airports s on s.code = f.src
        join airports d on d.code = f.dst
        left join airlines l on l.code = f.airline
        order by s.idx, d.idx, l.idx
        """
    ).fetchall()

    def column(table: str, name: str) -> list:
        return [v for (v,) in con.execute(f"select {name} from {table} order by idx").fetchall()]

    airports = {name: column("airports", name) for name in ["code", "name", "city", "country", "lat", "lon"]}
    airlines = {name: column("airlines", name) for name in ["code", "name"]}
    if max(len(airports["code"]), len(airlines["code"])) >= NO_AIRLINE:
        raise SystemExit("too many airports or airlines to index with Uint16")

    packed = array("H", [value for col in zip(*routes) for value in col])
    if sys.byteorder == "big":
        packed.byteswap()

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "routes.bin").write_bytes(packed.tobytes())
    downloaded = datetime.fromtimestamp((CACHE / "airline-routes.json").stat().st_mtime, UTC)
    catalog = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "downloadedAt": downloaded.isoformat(),
        "count": len(routes),
        "columns": ROUTE_COLUMNS,
        "noAirline": NO_AIRLINE,
        "airports": airports,
        "airlines": airlines,
        "sources": [
            "Airline route data, Jonty Wareing, github.com/Jonty/airline-route-data (from flightsfrom.com)",
        ],
    }
    (OUT / "catalog.json").write_text(json.dumps(catalog, separators=(",", ":"), ensure_ascii=False))

    pairs = len({(src, dst) for src, dst, _, _ in routes})
    print(
        f"  {len(routes)} routes on {pairs} airport pairs between {len(airports['code'])} airports "
        f"by {len(airlines['code'])} airlines -> {OUT}"
    )


if __name__ == "__main__":
    main()
