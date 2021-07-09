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

## `title`

Optional, [string](https://toml.io/en/v1.0.0#string).

A title for your feed.

## `url`

Required, [string](https://toml.io/en/v1.0.0#string).

URL of which to generate an RSS feed.

You can also pass an array of strings, e.g. to concatenate contents of multiple
pages into a single RSS feed.

## `entrySelector`

Required, [string](https://toml.io/en/v1.0.0#string).

[CSS
Selector](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Selectors)
matching the elements that contain individual feed entries. For example,
`article`.

## `titleSelector`

Required, [string](https://toml.io/en/v1.0.0#string).

[CSS
Selector](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Selectors)
matching the element inside individual feed entries containing that entry's
title. For example, `h2`.

## `linkSelector`

Required, [string](https://toml.io/en/v1.0.0#string).

[CSS
Selector](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Selectors)
matching the `<a>` element inside individual feed entries containing the link
to view that entry in your browser. For example, `a.permalink`.

## `contentSelector`

Optional, [string](https://toml.io/en/v1.0.0#string).

[CSS
Selector](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Selectors)
matching the element inside individual feed entries containing that entry's
content. For example, `p.lead`. If not provided, the entry as a whole will be
used as the content.

## `timeout`

Optional, [integer](https://toml.io/en/v1.0.0#integer).

Number of seconds to wait for the given page to load. Defaults to 60.

## `filters`

Optional, [array](https://toml.io/en/v1.0.0#array) of
[strings](https://toml.io/en/v1.0.0#string).

If set, entries containing one or more of the given strings will not be
included. For example, `["Next page"]`.
