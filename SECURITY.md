# Security Policy

Scout is an open-source accessibility navigation tool that is publicly
deployed and handles routing data for disabled users. We take security and
privacy seriously and appreciate reports that help keep the project safe.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.** Public disclosure
before a fix is available puts users at risk.

The preferred channel is a private GitHub security advisory:

- Open a report at
  [github.com/RSid/scout/security/advisories/new](https://github.com/RSid/scout/security/advisories/new).

This keeps the discussion private between you and the maintainer until a fix
ships. Please include enough detail to reproduce the issue: affected endpoint
or page, steps or a proof-of-concept, and the impact you observed. Avoid
including real personal data (addresses, precise coordinates) in your report —
an approximate description is enough.

## What to expect

Scout is maintained by a single person, so triage is **best-effort** with no
guaranteed service-level agreement. That said, our targets are:

- **Acknowledgement** of your report within **7 days**.
- An initial assessment (severity, whether we can reproduce it, rough fix
  timeline) shortly after acknowledgement.
- Progress updates through the advisory thread until the issue is resolved.

## Out of scope

The following are generally **not** treated as security vulnerabilities:

- Spam, social-engineering, or phishing reports unrelated to a flaw in Scout.
- Hypothetical dependency advisories with no demonstrated, exploitable impact
  on Scout — please include a working proof-of-concept against Scout.
- Reports produced solely by automated scanners without a concrete,
  reproducible attack path.
- Best-practice suggestions with no exploitable consequence (file these as a
  regular issue or PR instead).

## Related

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to contribute, including the
  "Security issues" note that points here.
