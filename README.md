# Feed me up, Scotty!

Generate RSS feeds for websites that don't have them, using CSS selectors.

To use, create a file `feeds.toml`, in which you can define the feeds to create
as follows:

```toml
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

Then run:

    npx feed-me-up-scotty

This will generate two RSS feeds in `public/funfacts.xml` and
`public/wikivoyage.xml`. Additionally, it will generate a combined RSS feed in
`public/all.xml`.
