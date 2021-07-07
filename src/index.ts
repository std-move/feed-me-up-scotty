#!/usr/bin/env node
import { Browser, firefox, Page } from "playwright-firefox";
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
  await generateFeed("all", combinedFeedData);
  await Promise.all(individualFeedPromises);

  const browser = await getBrowser();
  await browser.close();
  console.log("Feeds generated in `public/`.");
  if (typeof getRootUrl() === "string") {
    console.log("\nThey will be published at:");
    feedConfigs.forEach(feedConfig => {
      console.log(`- ${getRootUrl()}${feedConfig.id}.xml`);
    });
    console.log(`\nA combined feed is available at:\n\t${getRootUrl()}all.xml`);
  }
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
  url: string | string[];
  title?: string;
  entrySelector: string;
  titleSelector: string;
  linkSelector: string;
  contentSelector?: string;
  filters?: string[];
};

async function loadFeedConfigs(): Promise<FeedConfig[]> {
  const configFile = await readFile("./feeds.toml", "utf-8");
  const parsed = parse(configFile, 1.0, "\n");

  const feedIds = Object.keys(parsed);
  return feedIds.map(feedId => {
    const feedToml = parsed[feedId] as unknown as FeedConfig;
    return {
      id: feedId,
      title: feedToml.title ?? feedId,
      entrySelector: feedToml.entrySelector,
      titleSelector: feedToml.titleSelector,
      linkSelector: feedToml.linkSelector,
      contentSelector: feedToml.contentSelector,
      url: feedToml.url,
      filters: feedToml.filters,
    };
  });
}

type FeedData = {
  title: string;
  url: string;
  favicon?: string;
  elements: Array<{
    title?: string;
    contents: string;
    link?: string;
    retrieved: number;
  }>;
};

async function fetchFeedData(config: FeedConfig): Promise<FeedData> {
  const firstUrl = Array.isArray(config.url) ? config.url[0] : config.url;
  const url = new URL(firstUrl);
  const origin = url.origin;
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(firstUrl, { timeout: 60 * 1000, waitUntil: "networkidle" });
  const faviconElement = await page.$("link[rel='icon']");
  const faviconPath = faviconElement
    ? await faviconElement.getAttribute("href") ?? "favicon.ico"
    : "favicon.ico";
  const faviconUrl = (new URL(faviconPath, origin)).href;
  const allUrls = Array.isArray(config.url) ? config.url : [config.url];
  const entries = await allUrls.reduce(async (accPromise, url) => {
    const acc = await accPromise;
    const pageEntries = await fetchPageEntries(page, url, origin, config);
    return acc.concat(pageEntries);
  }, Promise.resolve([] as FeedData['elements']));

  const filters = config.filters;
  const filteredEntries = Array.isArray(filters)
    ? entries.filter(entry => filters.every(filter => !entry.contents.includes(filter)))
    : entries;

  return {
    title: config.title ?? config.id,
    url: firstUrl,
    favicon: faviconUrl,
    elements: filteredEntries,
  };
}

async function fetchPageEntries(page: Page, url: string, origin: string, config: FeedConfig): Promise<FeedData['elements']> {
  await page.goto(url, { timeout: 60 * 1000, waitUntil: "networkidle" });
  const entriesElements = await page.$$(config.entrySelector);
  const entries: FeedData['elements'] = await Promise.all(entriesElements.map(async entryElement => {
    const titleElement = await entryElement.$(config.titleSelector);
    const linkElement = await entryElement.$(config.linkSelector);
    const linkValue = await linkElement?.getAttribute("href");
    const normalisedLink = linkValue
      ? (new URL(linkValue, origin).href)
      : undefined;
    const contentElement = typeof config.contentSelector === "string"
      ? await entryElement.$(config.contentSelector) ?? entryElement
      : entryElement;
    return {
      title: (await titleElement?.textContent())?.trim() ?? undefined,
      contents: (await contentElement.innerHTML()).trim(),
      link: normalisedLink,
      retrieved: Date.now(),
    };
  }));

  return entries;
}

function combineFeedData(feedsData: FeedData[]): FeedData {
  const elements = feedsData.reduce(
    (soFar, feedData) => soFar.concat(
      feedData.elements.map(element => ({ ...element, title: element.title + ` (${feedData.title})` })
    )),
    [] as FeedData['elements']
  );
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
    favicon: feedData.favicon,
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
  const rootUrl = process.env.CI_PAGES_URL ?? getGithubPagesUrl();
  if (typeof rootUrl !== "string") {
    return rootUrl;
  }
  const rootUrlWithTrailingSlash = rootUrl.endsWith("/")
    ? rootUrl
    : rootUrl + "/";
  return rootUrlWithTrailingSlash;
}

function getGithubPagesUrl(): string | undefined {
  const repositorySlug = process.env.GITHUB_REPOSITORY;
  if (typeof repositorySlug !== "string" || !repositorySlug.includes("/")) {
    return;
  }

  const [owner, repository] = repositorySlug.split("/");
  return `https://${owner}.github.io/${repository}/`;
}
