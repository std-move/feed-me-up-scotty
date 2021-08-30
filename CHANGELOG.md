# Changelog

This project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

The following changes have been implemented but not released yet:

## [Unreleased]

### New features

- `matchOneOf` and `matchAllOf` options that complement the `filters` option:
  allows you to only include entries that have one of or all of the given
  words, respectively.

The following sections document changes that have been released already:

## [1.5.3] - 2021-08-30

### Bugs fixed

- When errors occur generating a feed, Feed me up, Scotty! now exits with a
  non-zero exit code.

## [1.5.2] - 2021-08-23

### Changed

- Added some more debug logging when run with `$DEBUG="info"`.

## [1.5.1] - 2021-08-13

### Bugs fixed

- Some internal changes should make _Feed me up, Scotty!_ more stable.

## [1.5.0] - 2021-08-03

### New features

- The publication date can now be extracted from the page using `dateSelector`
  and `dateFormat`, thanks to @hawk01.

### Bugs fixed

- Some links (specifically: links relative to the crawled page) were not
  resolved correctly.

## [1.4.0] - 2021-07-17

### New features

- When the element matched by `entrySelector` is the element that contains the
  entry's link, you can now target that element by setting `linkSelector` to
  `*`.

## [1.3.0] - 2021-07-09

### New features

- By adding a [table](https://toml.io/en/v1.0.0#table) called `default`, you can
  now set default feed options that will be used for feed configurations that do
  not have those options defined themselves. For example, you can use this to
  increase the default `timeout`.

## [1.2.0] - 2021-07-07

### New features

- An optional `contentSelector` can now be set to use a subset of an entry as
  its content.
- You can now pass multiple URLs for a single feed, to support e.g. pagination.
- You can set a custom timeout per feed.

## [1.1.0] - 2021-07-06

### New features

- RSS feeds now include the favicon of the page they were fetched from.
- Pages are now only considered fully loaded when they're no longer performing
  network requests.

## [1.0.0] - 2021-07-02

### New features

First release! Few customisation options, but feed generations of arbitrary
pages is possible.
