import { parse as parseDate, parseISO as parseIsoDate } from "date-fns";
import { ElementHandleForTag } from "playwright-core/types/structs";
import { URL } from "url";
import type { FeedConfig, FeedData } from "./run";

const DATE_NOW = Date.now();

export async function getTitle(
  entryElement: ElementHandleForTag<string>,
  titleSelector: FeedConfig["titleSelector"]
): Promise<FeedData["elements"][0]["title"]> {
  if (Array.isArray(titleSelector)) {
    const titles = (
      await Promise.all(
        titleSelector.map((singleSelector) =>
          getTitle(entryElement, singleSelector)
        )
      )
    ).filter(title => title);
    return titles.length === 0 ? undefined : titles.join(" — ");
  }
  const titleElement =
    titleSelector === "*" ? entryElement : await entryElement.$(titleSelector);
  
  const trimmed = (await titleElement?.textContent())?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseUrl(linkValue: string, baseUrl: string | URL): URL | null {
  try {
    return new URL(linkValue, baseUrl);
  } catch (error) {
    // If URL construction fails, try splitting by space and use longest string
    const parts = linkValue.split(/\s+/);
    const longestPart = parts.reduce(
      (longest, current) =>
        current.length > longest.length ? current : longest,
      ""
    );
    console.log(
      `Parsing link "${linkValue}" failed (${error}) - longest part selected:`,
      longestPart
    );
    try {
      return new URL(longestPart, baseUrl);
    } catch (fallbackError) {
      console.log("Longest part parsing failed as well");
      
      // Check if the string looks like it might be missing a scheme
      // (e.g., starts with domain-like pattern: www., example.com, subdomain.example.com)
      const looksLikeDomain = longestPart && 
        !longestPart.includes(':') && // no scheme present
        (/^www\./i.test(longestPart) || // starts with www.
         /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+/i.test(longestPart)); // domain pattern
      
      if (looksLikeDomain) {
        console.log("String looks like a domain without scheme, attempting to add http://");
        try {
          return new URL(`http://${longestPart}`);
        } catch (httpError) {
          console.log("Adding http:// scheme failed");
        }
      }
      
      return null; // Return null if all attempts fail
    }
  }
}

export async function getLink(
  entryElement: ElementHandleForTag<string>,
  linkSelector: Required<FeedConfig>["linkSelector"],
  baseUrl: string
): Promise<FeedData["elements"][0]["link"]> {
  const linkElement =
    linkSelector === "*" ? entryElement : await entryElement.$(linkSelector);
  const linkValue = await linkElement?.getAttribute("href");
  const normalisedLink = linkValue
    ? parseUrl(linkValue, baseUrl)?.href
    : undefined;
  return normalisedLink;
}

export async function getContents(
  entryElement: ElementHandleForTag<string>,
  contentSelector: FeedConfig["contentSelector"]
): Promise<FeedData["elements"][0]["contents"]> {
  if (Array.isArray(contentSelector)) {
    return (
      await Promise.all(
        contentSelector.map((singleSelector) =>
          getContents(entryElement, singleSelector)
        )
      )
    ).join(" — ");
  }
  const contentElement =
    typeof contentSelector === "string"
      ? (await entryElement.$(contentSelector)) ?? entryElement
      : entryElement;
  return (await contentElement.innerHTML()).trim();
}

export async function getDate(
  entryElement: ElementHandleForTag<string>,
  dateSelector: FeedConfig["dateSelector"],
  dateFormat: FeedConfig["dateFormat"]
): Promise<FeedData["elements"][0]["retrieved"]> {
  // Check if using XPath string extraction
  if (typeof dateSelector === "string" && dateSelector.startsWith("xpathstr=")) {
    const xpathExpression = dateSelector.slice("xpathstr=".length);

    const dateString = await entryElement.evaluate((el, xpath) => {
      const doc = (el as any).ownerDocument;
      const result = doc.evaluate(
        xpath,
        el,
        null,
        (doc.defaultView as any).XPathResult.STRING_TYPE,
        null
      );
      return result.stringValue;
    }, xpathExpression);

    let dateValue: number | undefined = undefined;

    if (dateString && typeof dateFormat === "string") {
      let parsedDate = parseDate(
        dateString.trim(),
        dateFormat,
        new Date(DATE_NOW)
      );

      // Check if date is in the future and adjust
      while (parsedDate.getTime() > DATE_NOW) {
        console.warn(
          `Date ${parsedDate.toISOString()} is in the future (${dateString.trim()}). Subtracting 1 year.`
        );
        parsedDate = new Date(parsedDate.setFullYear(parsedDate.getFullYear() - 1));
      }

      dateValue = parsedDate.getTime();
    }

    if (Number.isNaN(dateValue)) {
      dateValue = undefined;
    }

    return dateValue ?? DATE_NOW;
  }

  // Original path: element-based extraction
  const dateElement =
    typeof dateSelector === "string"
      ? await entryElement.$(dateSelector)
      : undefined;
  const datetimeAttribute = await dateElement?.getAttribute("datetime");
  const dateElementContent = await dateElement?.textContent();
  let dateValue: number | undefined = undefined;

  if (typeof datetimeAttribute === "string") {
    const parsedDatetime = parseDatetime(datetimeAttribute);
    if (parsedDatetime) {
      let adjustedDate = parsedDatetime;

      // Check if date is in the future and adjust
      while (adjustedDate.getTime() > DATE_NOW) {
        console.warn(
          `Date ${adjustedDate.toISOString()} is in the future (datetime="${datetimeAttribute}"). Subtracting 1 year.`
        );
        adjustedDate = new Date(adjustedDate.setFullYear(adjustedDate.getFullYear() - 1));
      }

      dateValue = adjustedDate.getTime();
    }
  } else if (
    typeof dateElementContent === "string" &&
    typeof dateFormat === "string"
  ) {
    let parsedDate = parseDate(
      dateElementContent.trim(),
      dateFormat,
      new Date(DATE_NOW)
    );

    // Check if date is in the future and adjust
    while (parsedDate.getTime() > DATE_NOW) {
      console.warn(
        `Date ${parsedDate.toISOString()} is in the future (content="${dateElementContent.trim()}"). Subtracting 1 year.`
      );
      parsedDate = new Date(parsedDate.setFullYear(parsedDate.getFullYear() - 1));
    }

    dateValue = parsedDate.getTime();
  }

  if (Number.isNaN(dateValue)) {
    dateValue = undefined;
  }

  return dateValue ?? DATE_NOW;
}

export async function getImage(
  entryElement: ElementHandleForTag<string>,
  imageSelector: FeedConfig["imageSelector"],
  baseUrl: string
): Promise<FeedData["elements"][0]["title"]> {
  const imageElement =
    typeof imageSelector === "string"
      ? await entryElement.$(imageSelector)
      : undefined;
  let imageUrl = await imageElement?.getAttribute("src");
  try {
    if (imageSelector && typeof imageUrl !== "string") {
      const backgroundImageValue = await entryElement.$eval(
        imageSelector,
        (el) => el.style["background-image"]
      );
      if (
        typeof backgroundImageValue === "string" &&
        backgroundImageValue.substring(0, "url(".length) === "url(" &&
        backgroundImageValue.charAt(backgroundImageValue.length - 1) === ")"
      ) {
        const urlValue = backgroundImageValue.substring(
          "url(".length,
          backgroundImageValue.length - 1
        );
        const urlValueWithoutQuotes =
          urlValue.charAt(0) === '"' || urlValue.charAt(0) === "'"
            ? urlValue.substring(1, urlValue.length - 1)
            : urlValue;
        const url = new URL(urlValueWithoutQuotes);
        imageUrl = url.href;
      }
    }
  } catch (e) {
    // No image element found, or not in a URL format we understand.
    // Skip the image.
  }
  const normalisedImgSrc = imageUrl
    ? new URL(imageUrl, baseUrl).href
    : undefined;
  return normalisedImgSrc;
}

/**
 * Parses the datetime attribute of <time>, as long as it's a date
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/time#valid_datetime_values
 */
function parseDatetime(datetime: string): Date | null {
  const parts = datetime.split("-");
  if (parts.length < 3) {
    return null;
  }
  if (parts[2].length > 2) {
    // It's not just `DD-MM-YYYY`:
    return parseIsoDate(datetime);
  }
  return new Date(
    Date.UTC(
      Number.parseInt(parts[0]),
      Number.parseInt(parts[1]) - 1,
      Number.parseInt(parts[2])
    )
  );
}
