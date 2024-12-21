---
sidebar_position: 1
---

# Set up

_Feed me up, Scotty!_ is configured by creating a [TOML](https://toml.io) file
called `feeds.toml`. Example:

```toml title=feeds.toml
[default]
timeout = 30

[funfacts]
title = "Wikipedia — did you know?"
url = "https://en.wikipedia.org/wiki/Main_Page"
entrySelector = "#mp-dyk > ul li"
titleSelector = "b"
linkSelector = "b a"

[wikivoyage]
title = "Wikivoyage recommendations"
url = "https://en.wikivoyage.org/wiki/Main_Page"
entrySelector = ".jcarousel-wrapper .jcarousel-item"
titleSelector = "h2"
linkSelector = "h2 a"
```

Run `npx feed-me-up-scotty` (requires Node.js to be installed) to generate
the configured feeds in a new folder called `public/`.

:::tip

If the options below do not produce the results you expect, see [Debugging](#debugging) for pointers on how to diagnose.

:::

# Fields

[Table headers](https://toml.io/en/v1.0.0#table) serve as the feed identifier;
they will be used to determine the feed file names. For example, the
configuration above would generate the feeds `funfacts.xml` and
`wikivoyage.xml`.

Additionally, a single feed combining all the posts from the other feeds will be
generated in `all.xml`.

Adding the below options to a table labelled `default` sets the given value for
every feed configuration that does not specify a value for that option itself.
For example, the configuration above would time out if the two source pages do
not load within 30 seconds.

### `title`

Optional, [string](https://toml.io/en/v1.0.0#string).

A title for your feed.

### `url`

Required, [string](https://toml.io/en/v1.0.0#string).

URL of which to generate an RSS feed.

You can also pass an array of strings, e.g. to concatenate contents of multiple
pages into a single RSS feed.

### `entrySelector`

Required, [string](https://toml.io/en/v1.0.0#string).

[CSS
Selector](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Selectors)
matching the elements that contain individual feed entries. For example,
`"article"`.

### `titleSelector`

Required, [string](https://toml.io/en/v1.0.0#string) or [array](https://toml.io/en/v1.0.0#array) of
[strings](https://toml.io/en/v1.0.0#string).

[CSS
Selector](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Selectors)
matching the element inside individual feed entries containing that entry's
title. For example, `"h2"` or `["h2", ".price"]`.

If provided with an array of CSS Selectors, the contents of the matching elements
will be joined together by spaces (` `). (Since version **1.9.0**.)

Set it to `*` if the full entry should be used as the title. (Since version
**1.10.0**.)

### `linkSelector`

Required, [string](https://toml.io/en/v1.0.0#string).

[CSS
Selector](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Selectors)
matching the `<a>` element inside individual feed entries containing the link
to view that entry in your browser. For example, `"a.permalink"`.

Set it to `*` if the link is to be found on the element matched by
`entrySelector`.

### `contentSelector`

Optional, [string](https://toml.io/en/v1.0.0#string) or [array](https://toml.io/en/v1.0.0#array) of
[strings](https://toml.io/en/v1.0.0#string).

[CSS
Selector](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Selectors)
matching the element inside individual feed entries containing that entry's
content. For example, `"p.lead"`, or `[".image", ".caption"]`. If not provided,
the entry as a whole will be used as the content.

If provided with an array of CSS Selectors, the contents of the matching elements
will be joined together by spaces (` `). (Since version **1.9.0**.)

Available since version: **1.2.0**.

### `dateSelector`

Optional, [string](https://toml.io/en/v1.0.0#string).

[CSS
Selector](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Selectors)
matching the element inside individual feed entries containing that entry's
publication date. For example, `"time"`. If not provided, the date the feed was
generated will be used as the publication time.

Available since version: **1.5.0**.

### `dateFormat`

Optional, [string](https://toml.io/en/v1.0.0#string).

Used in combination with `dateSelector`.
[Format string as understood by `date-fns`](https://date-fns.org/v2.23.0/docs/parse)
that describes the format of the date in the element matched by `dateSelector`.

Available since version: **1.5.0**.

### `timeout`

Optional, [integer](https://toml.io/en/v1.0.0#integer).

Number of seconds to wait for the given page to load. Defaults to 60.

### `filters`

Optional, [array](https://toml.io/en/v1.0.0#array) of
[strings](https://toml.io/en/v1.0.0#string).

If set, entries containing one or more of the given strings will not be
included. For example, `["Next page"]`.

### `matchOneOf`

Optional, [array](https://toml.io/en/v1.0.0#array) of
[strings](https://toml.io/en/v1.0.0#string).

If set, only entries containing one or more of the given strings will be
included. For example, `["New", "Available"]`.

Available since version: **1.6.0.**.

### `matchAllOf`

Optional, [array](https://toml.io/en/v1.0.0#array) of
[strings](https://toml.io/en/v1.0.0#string).

If set, only entries containing all of the given strings will be included. For
example, `["Verified", "HD"]`.

Available since version: **1.6.0.**.

# Experimental fields

The following fields are experimental and may be removed or changed in a future
version. They can help dealing with unstable feed sources.

### `onFail`

Optional, one of `"error"` (default), `"stale"`, or `"exclude"`.

What to do when fetching a feed source failed. Possible values:

- `"error"`: default, throw an error and abort the feed generation.
- `"stale"`: don't update this feed, but preserve a previously-fetched feed if
  available.
- `"skip"`: don't update this feed, and don't preserve previously fetched feeds.

### `waitUntil`

Optional, one of `"domcontentloaded"` (default), `"load"`, or `"networkidle"`

When to consider the page loaded. This is useful for sites that first return an
empty page, and then execute some JavaScript after the fact to add the content
you want to see in your feed.

See https://playwright.dev/docs/api/class-page#page-goto-option-wait-until for
documentation on the different options.

### `waitForSelector`

Optional, [string](https://toml.io/en/v1.0.0#string).

Can be used to provide a selector that indicates when the page is fully loaded.
If set, _Feed me up, Scotty!_ will start looking for the feed content only when
a matching element is added to the page.

## Debugging

If your configuration is not producing the entries you expect, you can configure
_Feed me up, Scotty!_ to log more information to help you debugging it. To do so,
set the environment variable `$DEBUG` to `"info"`, `"warning"` or `"error"`
(default), where `"info"` logs most information, and `"error"` only logs
critical errors.

You can set an environment variable when running the command, e.g.:

```bash
DEBUG="info" npx feed-me-up-scotty
```

Additionally, if you want a dump of what the fetched HTML looks like, you can use
`:root` as the `entrySelector`.
