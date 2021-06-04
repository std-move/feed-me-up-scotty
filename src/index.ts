import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { Feed } from "feed";
import { writeFile, mkdir } from "fs/promises";

type FeedConfig = {
  url: string;
  title: string;
  entrySelector: string;
  titleSelector: string;
  linkSelector: string;
};

const feedConfigs: FeedConfig[] = [
  {
    url: "https://en.wikipedia.org/wiki/Main_Page",
    entrySelector: "#mp-dyk > ul li",
    titleSelector: "b",
    linkSelector: "b a",
    title: "Wikipedia — did you know?",
  },
];

run();

async function run() {
  const feedsData = await Promise.all(feedConfigs.map(generateFeed));
  const combinedFeedData = combineFeedData(feedsData);
  const feed = await toFeed(combinedFeedData);
  await mkdir("public").catch(() => console.log("Directory `public` already exists; continuing."));
  await writeFile("public/feed.xml", feed, "utf-8");
  console.log("Feed generated at public/feed.xml");
}

type FeedData = {
  title: string;
  url: string;
  elements: Array<{
    title?: string;
    contents: string;
    link?: string;
  }>;
};

async function generateFeed(config: FeedConfig): Promise<FeedData> {
  const response = await fetch(config.url);
  const rawHtml = await response.text();
  const { document } = (new JSDOM(rawHtml)).window;
  const entriesElements = document.querySelectorAll(config.entrySelector);
  const entries: FeedData['elements'] = Array.from(entriesElements).map(entryElement => {
    const titleElement = entryElement.querySelector(config.titleSelector);
    const linkElement = entryElement.querySelector(config.linkSelector);
    return {
      title: titleElement?.textContent ?? undefined,
      contents: entryElement.outerHTML,
      link: linkElement?.getAttribute("href") ?? undefined,
    };
  });

  return {
    title: config.title,
    url: config.url,
    elements: entries,
  };
}

function combineFeedData(feedsData: FeedData[]): FeedData {
  const elements = feedsData.reduce((soFar, feedData) => soFar.concat(feedData.elements), [] as FeedData['elements']);
  return {
    title: "Combined feed",
    url: "https://example.com",
    elements: elements,
  };
}

function toFeed(feedData: FeedData): string {
  const feed = new Feed({
    title: feedData.title,
    id: feedData.url,
    copyright: "",
  });
  feedData.elements.forEach((element, i) => {
    feed.addItem({
      title: element.title ?? i.toString(),
      link: element.link ?? feedData.url,
      content: element.contents,
      date: new Date(2021),
    });
  });

  return feed.atom1();
}
