---
sidebar_position: 2
---

# Automate

Set up _Feed me up, Scotty!_ to run on a regular schedule to detect new posts.

## Using GitHub Actions and GitHub Pages

This uses GitHub Actions to run on a regular schedule, and publishes the
resulting feed using GitHub Pages.

1. Fork [this repository](https://github.com/Vinnl/feeds/).
2. In your fork, edit `feeds.toml` to provide your desired data sources.
3. Create a new branch called `gh-pages`.
4. Under the _Actions_ tab, enable Workflows for your fork.

GitHub Actions will then automatically run twice a day to check for updates,
and publish your feeds at `https://<username>.github.io/feeds/<feedname>.xml`.

## Using GitLab CI/CD and GitLab Pages

This uses GitLab CI/CD to run on a regular schedule, and publishes the
resulting feed using GitLab Pages.

1. Fork [this repository](https://gitlab.com/vincenttunru/feeds).
2. In your fork, edit `feeds.toml` to provide your desired data sources.
3. [Create a new pipeline schedule](https://docs.gitlab.com/ee/ci/pipelines/schedules.html#configuring-pipeline-schedules)
   (_CI/CD → Schedules_).
4. Set it to your desired interval (e.g. `30 5,17 * * *` to run at 5:30 and 17:30).
5. Hit "Save pipeline schedule".

GitLab CI/CD will then automatically run at your selected interval to check for
updates, and publish your feeds at
`https://<username>.gitlab.io/feeds/<feedname>.xml`.
