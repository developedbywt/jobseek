# Jobseek

Monitors company career pages for new job postings. Companies are configured via CSV — a Python crawler monitors boards and extracts job details, a Next.js frontend serves the data.

## Contributing: Add a Company

Open issues labeled [`company-request`](https://github.com/colophon-group/jobseek/issues?q=is%3Aopen+label%3Acompany-request) are companies waiting to be added. Each one can be resolved by any coding agent that can run shell commands and access the web.

### Quick start

```
pip install jobseek-crawler-setup
```

Pick an open issue, then hand your agent this prompt:

```
Run `ws task --issue <NUMBER>` and follow the printed instructions.
```

### Requirements

The agent environment needs:
- `git`, `gh` (GitHub CLI, authenticated)
- Python 3.12+
- Web access (to research companies and fetch career pages)

## GitHub Hybrid Agent Automation

This repo also includes a personal-use GitHub-first automation loop for general engineering tasks.

- Open an issue using the `Agent task` template
- Add the `agent:plan` label to generate a plan
- Review `ai/runs/<issue>/Spec.md` and `Plan.json`
- Add the `agent:build` label to execute the approved plan
- Review the PR on GitHub, then add the `agent:review` label to the PR for a bounded review pass

See `docs/14-github-hybrid-agent-automation.md` for setup and operating details.
