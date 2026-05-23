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
`SCOUT_PROTOMAPS_BUILD_DATE=YYYYMMDD` to pin against a daily
`build.protomaps.com` artifact.

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

`build.protomaps.com` only retains a short rolling window of daily builds.
The `SCOUT_PROTOMAPS_BUILD_DATE` pin (default in this script and
`infra/Dockerfile`) eventually rotates off the server.

**Unblock yourself** by probing for a date that still exists and overriding
the pin for the run:

```bash
for d in $(seq 0 14); do
  date_str=$(date -u -v-"${d}"d +%Y%m%d 2>/dev/null || date -u -d "${d} days ago" +%Y%m%d)
  code=$(curl -sI -o /dev/null -w '%{http_code}' "https://build.protomaps.com/${date_str}.pmtiles")
  echo "${date_str} -> ${code}"
done

SCOUT_PROTOMAPS_BUILD_DATE=YYYYMMDD ./scripts/build_pmtiles.sh --force
```

If the available window has drifted past the pinned default in this repo,
**bump the constant in both places** (`scripts/build_pmtiles.sh` and
`infra/Dockerfile`'s `ARG SCOUT_PROTOMAPS_BUILD_DATE`) in the same PR so
the script and Docker image stay in sync. The PR is a `chore:` — note the
date change and the fact that the resulting OSM extract may drift.

### Re-running after a failed extract

The script skips work when a complete `dc.pmtiles` already exists at the
target path. A partial `dc.pmtiles.tmp` is removed at the start of every
run, so simply re-running is safe. If the previous run produced a complete
but **wrong** artifact, force a rebuild:

```bash
./scripts/build_pmtiles.sh --force
```
