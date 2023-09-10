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
5. Make sure the Publishing Source for your GitHub Pages site is set to the
   `gh-pages` branch.
   [Instructions here.](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

GitHub Actions will then automatically run twice a day to check for updates,
and publish your feeds at `https://<username>.github.io/feeds/<feedname>.xml`.

## Using GitLab CI/CD and GitLab Pages

This uses GitLab CI/CD to run on a regular schedule, and publishes the
resulting feed using GitLab Pages.

1. Fork [this repository](https://gitlab.com/vincenttunru/feeds).
2. In your fork, edit `feeds.toml` to provide your desired data sources.
3. [Create a new pipeline schedule](https://docs.gitlab.com/ee/ci/pipelines/schedules.html#configuring-pipeline-schedules)
   (_Build → Pipeline schedules_).
4. Set it to your desired interval (e.g. `30 5,17 * * *` to run at 5:30 and 17:30).
5. Hit "Save pipeline schedule".

GitLab CI/CD will then automatically run at your selected interval to check for
updates, and publish your feeds at
`https://<username>.gitlab.io/feeds/<feedname>.xml`.

## Elsewhere

To generate feeds with _Feed me up, Scotty!_ you need:

1. A place to run (Node.js) code on a schedule.
2. A place to publish the resulting feeds.

Feeds can be generated on machines that have a recent version of Node.js
installed by running:

```bash
npx feed-me-up-scotty
```

This will read the configuration file from `feeds.toml`, and create a folder
`public/` containing the generated RSS feeds for you to publish.

If you set an environment variable `$CI_PAGES_URL` with the base URL where you
are publishing the feeds (e.g. `https://vincenttunru.gitlab.io/feeds/`), then
_Feed me up, Scotty!_ will fetch the feed data in advance and set the correct
publication date for the feed entries.
