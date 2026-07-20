# Security and privacy

Do not post real resumes, photos, contact details, private company documents, API keys, or `.resume-harness/` contents in a public issue.

For a suspected vulnerability, open an issue containing only a minimal synthetic reproduction and ask the maintainer for a private contact channel. Do not include secrets or applicant data in the report.

The optional `resuml` wrapper is designed for local computation without file reads, file writes, job search, auto-install, rendering, or exposed network tools. Its in-process network guards are best-effort and are not an OS-level sandbox; use a container, firewall, or network-isolated runner when enforced isolation is required. Dependency versions are locked and checked in CI. This repository does not claim that local resume data is encrypted; project state is stored as plaintext JSON and should be excluded from Git.
