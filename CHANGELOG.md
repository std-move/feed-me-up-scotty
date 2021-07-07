# Changelog

This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

The following changes have been implemented but not released yet:

## [Unreleased]

### New features

- An optional `contentSelector` can now be set to use a subset of an entry as
  its content.
- You can now pass multiple URLs for a single feed, to support e.g. pagination.
- You can set a custom timeout per feed.

The following sections document changes that have been released already:

## [1.1.0] - 2021-07-06

### New features

- RSS feeds now include the favicon of the page they were fetched from.
- Pages are now only considered fully loaded when they're no longer performing
  network requests.

## [1.0.0] - 2021-07-02

### New features

First release! Few customisation options, but feed generations of arbitrary
pages is possible.
