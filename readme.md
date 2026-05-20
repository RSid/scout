# Getting started

1. [Install uv](https://github.com/astral-sh/uv?tab=readme-ov-file#installation) for package management
2. Create virtual env with `uv venv` (if needed) 
3. Activate virtual env with `source .venv/bin/activate`
4. Run `fastapi dev main.py` in terminal to run

## Reporting issues

Use the GitHub Issues tab. You'll see two structured templates:

- **Bug report** — something in Scout itself isn't working.
- **Data is wrong about a place** — a feature is mis-described in the
  underlying DC dataset. (Scout surfaces public data; the city owns the
  source-of-record. An in-app correction flow lands with `M3-F25`.)

**Security vulnerabilities** do not go in public issues — open a private
security advisory on this repo's **Security** tab instead. See
`CONTRIBUTING.md` for the full process; `SECURITY.md` lands with `M1-T09`.
