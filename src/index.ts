import { Browser, firefox } from "playwright-firefox";
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
let browser: Browser;
let browsePromise: Promise<Browser>;
async function getBrowser() {
  if (typeof browser === "undefined") {
    if (typeof browsePromise === "undefined") {
      browsePromise = firefox.launch();
    }
    browser = await browsePromise;
  }

  return browser;
}

async function run() {
  const feedsData = await Promise.all(feedConfigs.map(generateFeed));
  const combinedFeedData = combineFeedData(feedsData);
  const feed = await toFeed(combinedFeedData);
  await mkdir("public").catch(() => console.log("Directory `public` already exists; continuing."));
  await writeFile("public/feed.xml", feed, "utf-8");
  const browser = await getBrowser();
  await browser.close();
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
  const url = new URL(config.url);
  const origin = url.origin;
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(config.url);
  const entriesElements = await page.$$(config.entrySelector);
  const entries: FeedData['elements'] = await Promise.all(entriesElements.map(async entryElement => {
    const titleElement = await entryElement.$(config.titleSelector);
    const linkElement = await entryElement.$(config.linkSelector);
    const linkValue = await linkElement?.getAttribute("href");
    const normalisedLink = linkValue
      ? (new URL(linkValue, origin).href)
      : undefined;
    return {
      title: await titleElement?.textContent() ?? undefined,
      contents: await entryElement.innerHTML(),
      link: normalisedLink,
    };
  }));

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
