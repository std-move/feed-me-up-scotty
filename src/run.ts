import { firefox, Page } from "playwright-firefox";
import { Feed } from "feed";
import { writeFile, mkdir, readFile } from "fs/promises";
import fetch from "node-fetch";
import { URL } from "url";
import { parse as parseToml } from "@ltd/j-toml";
import { getContents, getDate, getImage, getLink, getTitle } from "./parse.js";
import { createHash } from "crypto";
import { performance } from 'perf_hooks';

const DEFAULT_TIMEOUT_SEC = 15;

export async function run(configFilePath = "./feeds.toml"): Promise<void> {
  const feedConfigs = await loadFeedConfigs(configFilePath);

  console.log("Starting with config:", JSON.stringify(feedConfigs, null, '\t'));

  let savedError: Error | undefined;

  const feedsData: FeedData[] = await feedConfigs.reduce(
    async (feedsDataPromise, feedConfig) => {
      const feedsData = await feedsDataPromise;
      const start = performance.now();
      
      const fetchWithRetry = async (retries = 2): Promise<FeedData | null> => {
        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            const nextFeedData = await fetchFeedData(feedConfig);
            return nextFeedData;
          } catch (error) {
            if (attempt === retries) {
              // Final attempt failed, throw to outer catch
              throw error;
            }
            console.log(
              `[FEED_GEN_ERR] Retry ${attempt + 1}/${retries} for feed ${feedConfig.id} after error: ${error}`
            );
          }
        }
        return null; // This line should never be reached, but satisfies TypeScript
      };
      
      try {
        const nextFeedData = await fetchWithRetry();
        if (isNotNull(nextFeedData)) {
          feedsData.push(nextFeedData);
        } else {
          console.log("[FEED_GEN_ERR] Feed data is NULL!: ", feedConfig.id, feedConfig.url);
          const firstUrl = Array.isArray(feedConfig.url) ? feedConfig.url[0] : feedConfig.url;
          feedsData.push({
            title: feedConfig.title ?? feedConfig.id,
            url: firstUrl,
            elements: [],
          });
        }
      } catch (error) {
        console.log(
          `[FEED_GEN_ERR] Failed to fetch feed data after retries (${error}): `,
          feedConfig.id,
          feedConfig.url
        );

        let firstFailureOfFeed = false;
        let scheduled = process.env.IS_SCHEDULED;
        if (scheduled) {
          const prevData = await fetchExistingFeedData(feedConfig.id);
          if (prevData && prevData.elements.length > 0) firstFailureOfFeed = true;
        }

        if (firstFailureOfFeed) {
          // some sites might be down once in a while.
          // if fetching such sites fails at least twice in a row, we want to know about it.
          // otherwise let's just log it to avoid job failure notification 'spam'.
          console.log(
            `[FEED_GEN_ERR] Feed [${feedConfig.id}] was successfully fetched in the last run, ` +
            `let's suppress the error this time and raise it next time`
          );
        } else {
          if (!savedError) {
            savedError =
              error instanceof Error ? error : new Error(String(error));
          }
        }

        const firstUrl = Array.isArray(feedConfig.url) ? feedConfig.url[0] : feedConfig.url;
        feedsData.push({
          title: feedConfig.title ?? feedConfig.id,
          url: firstUrl,
          elements: [],
        });
      }
      const end = performance.now();
      debug(`Fetching feed ${feedConfig.id} took ${(end - start).toFixed(2)} ms`);
      return feedsData;
    },
    Promise.resolve([] as FeedData[])
  );
  const individualFeedPromises = feedsData.map((feedData, i) =>
    generateFeed(feedConfigs[i].id, feedData)
  );

  await Promise.all(individualFeedPromises);

  // const combinedFeedData = combineFeedData(feedsData);
  // await generateFeed("all", combinedFeedData);

  console.log("Feeds generated in `public/`.");
  if (typeof getRootUrl() === "string") {
    console.log("\nThey will be published at:");
    feedConfigs.forEach((feedConfig) => {
      console.log(`- ${getRootUrl()}${feedConfig.id}.xml`);
    });
    // console.log(`\nA combined feed is available at:\n\t${getRootUrl()}all.xml`);
  }

  if (savedError) {
    console.log("[FEED_GEN_ERR] Throwing error saved during processing");
    throw savedError;
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
    JSON.stringify(feedDataWithDates, null, '\t'),
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
    id: string;
    title?: string;
    contents: string;
    link?: string;
    retrieved: number;
    image?: string;
  }>;
};

async function tolerantGoto(
  page: Page,
  url: string,
  config: FeedConfig
): Promise<void> {
  debug(`Fetching ${url} for ${config.id}...`, "info");
  
  const maxRetries = 3;
  let currentWaitUntil = config.waitUntil ?? "domcontentloaded";
  let hasTriedFallback = false;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await page.goto(url, {
        timeout: (config.timeout ?? DEFAULT_TIMEOUT_SEC) * 1000,
        waitUntil: currentWaitUntil,
      });
      // ugly but possibly will help sometimes and not slow us down that much
      await page.waitForTimeout(80);
      return; // Success - just return
    } catch (error) {
      if (error instanceof Error) {
        // Handle timeout errors with 'load' or 'networkidle' waitUntil
        const isTimeout = /timeout|timed out/i.test(error.message) || 
                         error.name === 'TimeoutError';
        if (isTimeout && 
            (currentWaitUntil === 'load' || currentWaitUntil === 'networkidle') && 
            !hasTriedFallback) {
          console.warn(
            `[FEED_GEN_ERR] Timeout with waitUntil='${currentWaitUntil}' on attempt ${i + 1}/${maxRetries}. ` +
            `Falling back to 'domcontentloaded'...`
          );
          currentWaitUntil = 'domcontentloaded';
          hasTriedFallback = true;
          await page.waitForTimeout(200);
          continue;
        }
        
        // Handle NS_BINDING_ABORTED errors
        if (error.message.includes('NS_BINDING_ABORTED')) {
          if (i < maxRetries - 1) {
            // Retry on intermediate failures
            console.warn(
              `NS_BINDING_ABORTED on attempt ${i + 1}/${maxRetries}, retrying...`
            );
            await page.waitForTimeout(200 * Math.pow(2, i)); // 200ms, 400ms, 800ms
            continue;
          } else {
            // Final attempt failed - log error but suppress it
            console.error(
              `[FEED_GEN_ERR] NS_BINDING_ABORTED persists after ${maxRetries} attempts. ` +
              `Suppressing error and continuing. URL: ${url}`
            );
            return; // Suppress the error on final attempt
          }
        }
      }
      
      // Immediately throw any other errors
      throw error;
    }
  }
}

async function fetchFeedData(config: FeedConfig): Promise<FeedData | null> {
  const browser = await firefox.launch();
  try {
    const firstUrl = Array.isArray(config.url) ? config.url[0] : config.url;
    const context = await browser.newContext();
    context.setDefaultTimeout(config.timeout ?? DEFAULT_TIMEOUT_SEC);
    context.setDefaultNavigationTimeout(config.timeout ?? DEFAULT_TIMEOUT_SEC);
    const page = await context.newPage();

    try {
      await tolerantGoto(page, firstUrl, config);
      if (typeof config.waitForSelector === "string") {
        await page.waitForSelector(config.waitForSelector, {
          timeout: (config.timeout ?? DEFAULT_TIMEOUT_SEC) * 1000,
        });
      }
    } finally {
      const html = await page.content();
      console.log("[BEGIN_PAGE_CONTENTS_DUMP]");
      console.log(html);
      console.log("[END_PAGE_CONTENTS_DUMP]");
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

    if (entries.length < 1) {
      throw new Error(`No entries fetched for feed: ${config.id}`);
    }

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
        `[FEED_GEN_ERR] Could not fetch ${config.id}; preserving existing feed.`,
        "warning"
      );
      return existingFeedData;
    }

    if (config.onFail === "exclude") {
      debug(
        `[FEED_GEN_ERR] Could not fetch ${config.id}; not generating its feed.`,
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
  firstUrl: string,
  config: FeedConfig
): Promise<FeedData["elements"]> {
  // firstUrl is already fetched!
  if (url !== firstUrl) {
    try {
      await tolerantGoto(page, url, config);
      if (typeof config.waitForSelector === "string") {
        await page.waitForSelector(config.waitForSelector, {
            timeout: (config.timeout ?? DEFAULT_TIMEOUT_SEC) * 1000,
        });
      }
    } finally {
      const html = await page.content();
      console.log("[BEGIN_PAGE_CONTENTS_DUMP]");
      console.log(html);
      console.log("[END_PAGE_CONTENTS_DUMP]");
    }
  }

  const entriesElements = await page.$$(config.entrySelector);
  const entries: FeedData["elements"] = await Promise.all(
    entriesElements.map(async (entryElement) => {
      const title = await getTitle(entryElement, config.titleSelector);
      const link = config.linkSelector
          ? await getLink(entryElement, config.linkSelector, url)
          : undefined;

      if (!link && !title) {
        throw new Error(`neither link or title can be extracted: ${config.id}`);
      }

      return {
        id: generateId(link, title),
        title: title,
        link: link,
        contents: await getContents(entryElement, config.contentSelector),
        retrieved: await getDate(
          entryElement,
          config.dateSelector,
          config.dateFormat
        ),
        image: await getImage(entryElement, config.imageSelector, url),
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

function addLinkExtractionFailed(uri: string): string {
  const hasQuery = uri.includes("?");
  const separator = hasQuery ? "&" : "?";
  return `${uri}${separator}link_extraction_failed=true`;
}

function generateId(link?: string, title?: string): string {
  const source = link ?? title;

  if (!source) {
    throw new Error('At least one value must be non-null');
  }

  return (
    (link ? "link-" : "title-")
    + createHash("sha256").update(source).digest("hex").substring(0, 32)
  );
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
      link: element.link ?? addLinkExtractionFailed(feedData.url),
      id: element.id,
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
      (el) => el.id === element.id
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

function maybeAddTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : (path + "/");
}

const existingFeedData: Record<string, FeedData> = {};
async function fetchExistingFeedData(feedId: string): Promise<FeedData | null> {
  if (typeof existingFeedData[feedId] !== "undefined") {
    return existingFeedData[feedId];
  }

  console.log(`Trying to fetch existing feed data for ${feedId}`);
  let existingData: FeedData;
  try {
    let localFeedPath = process.env.FEED_DATA_PATH;
    if (localFeedPath) {
      localFeedPath = maybeAddTrailingSlash(localFeedPath);
      console.log(`Found local feed path ${localFeedPath}, will fetch from it`);
      const filePath = `${localFeedPath}${feedId}.json`;
      const fileContent = await readFile(filePath, 'utf-8');
      existingData = JSON.parse(fileContent);
    } else {
      const rootUrl = getRootUrl();
      if (typeof rootUrl !== "string") {
        console.log("Failed to get root URI");
        return null;
      }

      const uri = `${rootUrl}${feedId}.json`;
      console.log(`Will try to fetch existing data from ${uri}`);
      const response = await fetch(uri);
      if (!response.ok) {
        console.log("Fetching failed!");
        return null;
      }

      existingData = await response.json();
    }
    existingFeedData[feedId] = existingData;
    return existingData;
  } catch (error) {
    console.log("Encountered error fetching existing feed:", error);
  }
  return null;
}

function getRootUrl(): string | undefined {
  const rootUrl = process.env.CI_PAGES_URL ?? getGithubPagesUrl();
  if (typeof rootUrl !== "string") {
    return rootUrl;
  }
  
  return maybeAddTrailingSlash(rootUrl);
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
