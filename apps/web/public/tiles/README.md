# Local PMTiles

Place-built `dc.pmtiles` at `./dc.pmtiles`. It is intentionally **not checked in**
(see root `.gitignore`).

## Generate

From the repository root:

```bash
scripts/build_pmtiles.sh
```

Requirements: [`pmtiles` CLI](https://github.com/protomaps/go-pmtiles/releases) on
your `PATH`, network access for the initial range-request extract, and optionally
`SCOUT_PROTOMAPS_BUILD_DATE=YYYYMMDD` to prefer a specific daily
`build.protomaps.com` artifact. When the preferred date has rotated off the
server, the script walks back through recent days automatically (see
`SCOUT_PROTOMAPS_WALKBACK_DAYS` in `scripts/build_pmtiles.sh --help`).

For offline UI dev and CI browsers, Scout defaults to
`NEXT_PUBLIC_SCOUT_MAP_MODE=stub` (see `BasemapView`).

## Troubleshooting

### `pmtiles: command not found`

`scripts/build_pmtiles.sh` calls `pmtiles` by name, so the binary must be on
`$PATH`. A downloaded artifact in `~/Downloads/` is **not** on `$PATH`. Pick
one:

```bash
brew install go-pmtiles                       # recommended: also gets upgrades
# or move/symlink an existing download:
sudo mv /path/to/pmtiles /usr/local/bin/pmtiles
sudo chmod +x /usr/local/bin/pmtiles
```

Verify in a **new** shell: `which pmtiles && pmtiles version`.

### `HTTP error: 404` from `pmtiles extract`

```text
Failed to create range reader for YYYYMMDD.pmtiles, HTTP error: 404
```

`build.protomaps.com` only retains a short rolling window (~6 days) of daily
builds. `scripts/build_pmtiles.sh` probes the preferred
`SCOUT_PROTOMAPS_BUILD_DATE` (default in this script and `infra/Dockerfile`)
and, if that date 404s, walks back through the last 14 days for the first live
artifact. Check stderr for `resolved_build_date=…` to see which daily build was
used.

**If walk-back still fails** (Protomaps outage or an empty window), probe
manually and override the preferred date for one run:

```bash
for d in $(seq 0 14); do
  date_str=$(date -u -v-"${d}"d +%Y%m%d 2>/dev/null || date -u -d "${d} days ago" +%Y%m%d)
  code=$(curl -sI -o /dev/null -w '%{http_code}' "https://build.protomaps.com/${date_str}.pmtiles")
  echo "${date_str} -> ${code}"
done

SCOUT_PROTOMAPS_BUILD_DATE=YYYYMMDD ./scripts/build_pmtiles.sh --force
```

Optionally bump the preferred default in `scripts/build_pmtiles.sh`,
`infra/Dockerfile`'s `ARG SCOUT_PROTOMAPS_BUILD_DATE`, and
`.github/workflows/ci.yml` so the next run tries that date first. That is a
`chore:` PR — note the date change and that the resulting OSM extract may drift.

### Re-running after a failed extract

The script skips work when a complete `dc.pmtiles` already exists at the
target path. A partial `dc.pmtiles.tmp` is removed at the start of every
run, so simply re-running is safe. If the previous run produced a complete
but **wrong** artifact, force a rebuild:

```bash
./scripts/build_pmtiles.sh --force
```
