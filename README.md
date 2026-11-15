# Flights

A visualisation of the world's flight routes. Served at [berryde.com/projects/flights](https://berryde.com/projects/flights).

V2 is a rewrite, in progress, of a 2022 Svelte project (see the `master` branch history).

## How it works

- **`pipeline/`**: Python (uv) + DuckDB. Downloads the raw tables into `pipeline/.cache` and builds the static files in `public/data/`. It runs locally or in CI, never on Cloudflare.
- **`src/`**: Vite + React + TypeScript, styled with Tailwind. `src/data/catalog.ts` loads and types the pipeline's output.
- **Hosting**: a static-assets-only Cloudflare Worker (`wrangler.jsonc`), routed at `berryde.com/projects/flights*`. There is no Worker script, so serving it is free and unmetered.

## Commands

```sh
npm install
npm run data      # generate public/data (needs uv); required once after cloning, as it isn't committed
npm run dev       # http://localhost:5173/projects/flights/
npm run build     # type-check and build into dist/projects/flights/
npm run preview   # build and serve through wrangler, as in production
npm run deploy    # build and deploy with wrangler
```

## Data

- [Jonty/airline-route-data](https://github.com/Jonty/airline-route-data) by Jonty Wareing: every passenger airport and its outbound routes, with the airlines flying them and the flight time. It is scraped from [flightsfrom.com](https://www.flightsfrom.com) and published without a licence, so it is used here with credit, for a non-commercial project.

`public/data/routes.bin` holds one row per airline per direction between two airports, as four little-endian `Uint16` columns (from, to, airline, minutes). `public/data/catalog.json` holds the airports and airlines those columns index into, with the airport that has the most routes first.
