import { Browser, firefox } from "playwright-firefox";
import { Feed } from "feed";
import { writeFile, mkdir, readFile } from "fs/promises";
import fetch from "node-fetch";
import { URL } from "url";
import { parse } from "@ltd/j-toml";

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
  const feedConfigs = await loadFeedConfigs();
  const feedsData = await Promise.all(feedConfigs.map(fetchFeedData));
  const individualFeedPromises = feedsData.map((feedData, i) => generateFeed(feedConfigs[i].id, feedData));

  const combinedFeedData = combineFeedData(feedsData);
  const combinedFeedDataWithDates = await reconcileDates("all", combinedFeedData);
  await generateFeed("all", combinedFeedDataWithDates);
  await Promise.all(individualFeedPromises);

  const browser = await getBrowser();
  await browser.close();
  console.log("Feeds generated in `public/`.");
}

async function generateFeed(feedId: string, feedData: FeedData) {
  const feedDataWithDates = await reconcileDates(feedId, feedData);
  const feed = await toFeed(feedDataWithDates);
  await mkdir("public").catch(() => {
    // Directory `public` already exists; continuing.
  });
  await writeFile(`public/${feedId}.xml`, feed, "utf-8");
  await writeFile(`public/${feedId}.json`, JSON.stringify(feedDataWithDates), "utf-8");
}

type FeedConfig = {
  id: string;
  url: string;
  title: string;
  entrySelector: string;
  titleSelector: string;
  linkSelector: string;
};

async function loadFeedConfigs(): Promise<FeedConfig[]> {
  const configFile = await readFile("./feeds.toml", "utf-8");
  const parsed = parse(configFile, 1.0, "\n");

  const feedIds = Object.keys(parsed);
  return feedIds.map(feedId => {
    const feedToml = parsed[feedId] as FeedConfig;
    return {
      id: feedId,
      title: feedToml.title ?? feedId,
      entrySelector: feedToml.entrySelector,
      titleSelector: feedToml.titleSelector,
      linkSelector: feedToml.linkSelector,
      url: feedToml.url,
    };
  });
}

type FeedData = {
  title: string;
  url: string;
  elements: Array<{
    title?: string;
    contents: string;
    link?: string;
    retrieved: number;
  }>;
};

async function fetchFeedData(config: FeedConfig): Promise<FeedData> {
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
      retrieved: Date.now(),
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
    url: (getRootUrl() ?? "https://example.com/") + "all.xml",
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
      date: new Date(element.retrieved),
    });
  });

  return feed.atom1();
}

async function reconcileDates(feedId: string, feedData: FeedData): Promise<FeedData> {
  const rootUrl = getRootUrl();
  if (typeof rootUrl !== "string") {
    return feedData;
  }
  const response = await fetch(`${rootUrl}${feedId}.json`);
  if (!response.ok) {
    return feedData;
  }

  const existingFeedData: FeedData = await response.json();

  const newElements = feedData.elements.map(element => {
    const existingElement = existingFeedData.elements.find(el => typeof el.link === "string" && el.link === element.link);
    if (!existingElement) {
      return element;
    }
    return {
      ...element,
      retrieved: existingElement.retrieved,
    };
  });

  return {
    ...feedData,
    elements: newElements,
  };
}

function getRootUrl(): string | undefined {
  return process.env.CI_PAGES_URL;
}
