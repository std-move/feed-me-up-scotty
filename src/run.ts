import { firefox, Page } from "playwright-firefox";
import { Feed } from "feed";
import { writeFile, mkdir, readFile } from "fs/promises";
import fetch from "node-fetch";
import { URL } from "url";
import { parse as parseToml } from "@ltd/j-toml";
import { getContents, getDate, getImage, getLink, getTitle } from "./parse.js";

export async function run(configFilePath = "./feeds.toml"): Promise<void> {
  const feedConfigs = await loadFeedConfigs(configFilePath);
  const feedsData: FeedData[] = await feedConfigs.reduce(
    async (feedsDataPromise, feedConfig) => {
      const feedsData = await feedsDataPromise;
      const nextFeedData = await fetchFeedData(feedConfig);
      if (isNotNull(nextFeedData)) {
        feedsData.push(nextFeedData);
      }
      return feedsData;
    },
    Promise.resolve([] as FeedData[])
  );
  const individualFeedPromises = feedsData.map((feedData, i) =>
    generateFeed(feedConfigs[i].id, feedData)
  );

  const combinedFeedData = combineFeedData(feedsData);
  await generateFeed("all", combinedFeedData);
  await Promise.all(individualFeedPromises);

  console.log("Feeds generated in `public/`.");
  if (typeof getRootUrl() === "string") {
    console.log("\nThey will be published at:");
    feedConfigs.forEach((feedConfig) => {
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
  await writeFile(
    `public/${feedId}.json`,
    JSON.stringify(feedDataWithDates),
    "utf-8"
  );
}

export type FeedConfig = {
  id: string;
  url: string | string[];
  title?: string;
  entrySelector: string;
  titleSelector: string | string[];
  linkSelector?: string;
  contentSelector?: string | string[];
  dateSelector?: string;
  dateFormat?: string;
  imageSelector?: string;
  filters?: string[];
  matchOneOf?: string[];
  matchAllOf?: string[];
  timeout?: number;
  /** This option is experimental, and may be removed at any time: */
  waitForSelector?: string;
  /** This option is experimental, and may be removed at any time: */
  waitUntil?: NonNullable<Parameters<Page["goto"]>[1]>["waitUntil"];
  /** This option is experimental, and may be removed at any time: */
  onFail?: "error" | "stale" | "exclude";
};

async function loadFeedConfigs(configFilePath: string): Promise<FeedConfig[]> {
  const configFile = await readFile(configFilePath);
  const parsed = parseToml(configFile, 1.0, "\n", false);
  const defaultSettingsId = "default";

  const feedIds = Object.keys(parsed).filter(
    (feedId) => feedId !== defaultSettingsId
  );
  const defaultConfig: Partial<FeedConfig> =
    (parsed[defaultSettingsId] as unknown as Partial<FeedConfig>) ?? {};
  return feedIds.map((feedId) => {
    const feedToml = parsed[feedId] as unknown as FeedConfig;
    return {
      ...defaultConfig,
      ...feedToml,
      title: feedToml.title ?? defaultConfig.title ?? feedId,
      id: feedId,
    };
  });
}

export type FeedData = {
  title: string;
  url: string;
  favicon?: string;
  elements: Array<{
    title?: string;
    contents: string;
    link?: string;
    retrieved: number;
    image?: string;
  }>;
};

async function fetchFeedData(config: FeedConfig): Promise<FeedData | null> {
  const browser = await firefox.launch();
  try {
    const firstUrl = Array.isArray(config.url) ? config.url[0] : config.url;
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(firstUrl, {
      timeout: (config.timeout ?? 60) * 1000,
      waitUntil: config.waitUntil ?? "domcontentloaded",
    });
    if (typeof config.waitForSelector === "string") {
      await page.waitForSelector(config.waitForSelector);
    }
    const faviconElement = await page.$("link[rel='icon']");
    const faviconPath = faviconElement
      ? (await faviconElement.getAttribute("href")) ?? "favicon.ico"
      : "favicon.ico";
    const faviconUrl = new URL(faviconPath, firstUrl).href;
    const allUrls = Array.isArray(config.url) ? config.url : [config.url];
    const entries = await allUrls.reduce(async (accPromise, url) => {
      const acc = await accPromise;
      const pageEntries = await fetchPageEntries(page, url, firstUrl, config);
      return acc.concat(pageEntries);
    }, Promise.resolve([] as FeedData["elements"]));

    debug(`Fetched ${config.id} (${entries.length} entries).`, "info");

    const filters = config.filters;
    const filteredEntries = Array.isArray(filters)
      ? entries.filter((entry) =>
          filters.every((filter) => !entry.contents.includes(filter))
        )
      : entries;
    const oneOfMatchers = config.matchOneOf;
    const matchedOneEntries = Array.isArray(oneOfMatchers)
      ? filteredEntries.filter((entry) =>
          oneOfMatchers.some((matcher) => entry.contents.includes(matcher))
        )
      : filteredEntries;
    const allOfMatchers = config.matchAllOf;
    const matchedAllEntries = Array.isArray(allOfMatchers)
      ? matchedOneEntries.filter((entry) =>
          allOfMatchers.every((matcher) => entry.contents.includes(matcher))
        )
      : matchedOneEntries;

    debug(
      `Applied filters and matchers to ${config.id}, final count: ${matchedAllEntries.length} entries.`,
      "info"
    );
    return {
      title: config.title ?? config.id,
      url: firstUrl,
      favicon: faviconUrl,
      elements: matchedAllEntries,
    };
  } catch (e: unknown) {
    if (config.onFail === "stale") {
      const existingFeedData = await fetchExistingFeedData(config.id);
      debug(
        `Could not fetch ${config.id}; preserving existing feed.`,
        "warning"
      );
      return existingFeedData;
    }

    if (config.onFail === "exclude") {
      debug(
        `Could not fetch ${config.id}; not generating its feed.`,
        "warning"
      );
      return null;
    }

    throw e;
  } finally {
    await browser.close();
  }
}

async function fetchPageEntries(
  page: Page,
  url: string,
  baseUrl: string,
  config: FeedConfig
): Promise<FeedData["elements"]> {
  debug(`Fetching ${url} for ${config.id}`, "info");
  await page.goto(url, {
    timeout: (config.timeout ?? 60) * 1000,
    waitUntil: config.waitUntil ?? "domcontentloaded",
  });
  if (typeof config.waitForSelector === "string") {
    await page.waitForSelector(config.waitForSelector);
  }
  const entriesElements = await page.$$(config.entrySelector);
  const entries: FeedData["elements"] = await Promise.all(
    entriesElements.map(async (entryElement) => {
      return {
        title: await getTitle(entryElement, config.titleSelector),
        contents: await getContents(entryElement, config.contentSelector),
        link: config.linkSelector
          ? await getLink(entryElement, config.linkSelector, baseUrl)
          : url,
        retrieved: await getDate(
          entryElement,
          config.dateSelector,
          config.dateFormat
        ),
        image: await getImage(entryElement, config.imageSelector, baseUrl),
      };
    })
  );

  return entries;
}

function combineFeedData(feedsData: FeedData[]): FeedData {
  const elements = feedsData.reduce(
    (soFar, feedData) =>
      soFar.concat(
        feedData.elements.map((element) => ({
          ...element,
          title: element.title + ` (${feedData.title})`,
        }))
      ),
    [] as FeedData["elements"]
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
    updated: new Date(Date.now()),
  });
  feedData.elements.forEach((element, i) => {
    feed.addItem({
      title: element.title ?? i.toString(),
      link: element.link ?? feedData.url,
      content: element.contents,
      date: new Date(element.retrieved),
      image: element.image,
    });
  });

  if (feedData.elements.some((element) => typeof element.image === "string")) {
    // Atom feeds don't support entry images:
    return feed.rss2();
  }

  return feed.atom1();
}

async function reconcileDates(
  feedId: string,
  feedData: FeedData
): Promise<FeedData> {
  const existingFeedData: FeedData | null = await fetchExistingFeedData(feedId);
  if (existingFeedData === null) {
    return feedData;
  }

  debug(
    `Found previously generated feed for ${feedId}; preserving publication dates of previously-published entries.`,
    "info"
  );
  const newElements = feedData.elements.map((element) => {
    const existingElement = existingFeedData.elements.find(
      (el) => typeof el.link === "string" && el.link === element.link
    );
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

const existingFeedData: Record<string, FeedData> = {};
async function fetchExistingFeedData(feedId: string): Promise<FeedData | null> {
  if (typeof existingFeedData[feedId] !== "undefined") {
    return existingFeedData[feedId];
  }

  const rootUrl = getRootUrl();
  if (typeof rootUrl !== "string") {
    return null;
  }
  try {
    const response = await fetch(`${rootUrl}${feedId}.json`);
    if (!response.ok) {
      return null;
    }

    const existingData: FeedData = await response.json();
    existingFeedData[feedId] = existingData;
    return existingData;
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? `Encountered error fetching existing feed for ${feedId}:` + e.message
        : `Encountered error fetching existing feed for ${feedId}.`;
    debug(message, "warning");
    return null;
  }
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

function isNotNull<X>(value: X | null): value is X {
  return value !== null;
}

function getGithubPagesUrl(): string | undefined {
  const repositorySlug = process.env.GITHUB_REPOSITORY;
  if (typeof repositorySlug !== "string" || !repositorySlug.includes("/")) {
    return;
  }

  const [owner, repository] = repositorySlug.split("/");
  return `https://${owner}.github.io/${repository}/`;
}

function debug(
  message: string,
  logLevel: "info" | "warning" | "error" = "info"
) {
  const messageWithTimestamp = `[${new Date().toISOString()}] ${message}`;
  const showLogsOfLevel: typeof logLevel =
    (process.env.DEBUG as typeof logLevel | undefined) ?? "error";
  if (showLogsOfLevel === "error" && logLevel === "error") {
    console.log(messageWithTimestamp);
  }
  if (
    showLogsOfLevel === "warning" &&
    ["warning", "error"].includes(logLevel)
  ) {
    console.log(messageWithTimestamp);
  }
  if (showLogsOfLevel === "info") {
    console.log(messageWithTimestamp);
  }
}
