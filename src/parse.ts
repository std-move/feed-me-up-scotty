import { parse as parseDate, parseISO as parseIsoDate } from "date-fns";
import { ElementHandleForTag } from "playwright-core/types/structs";
import { URL } from "url";
import type { FeedConfig, FeedData } from "./run";

export async function getTitle(
  entryElement: ElementHandleForTag<string>,
  titleSelector: FeedConfig["titleSelector"]
): Promise<FeedData["elements"][0]["title"]> {
  if (Array.isArray(titleSelector)) {
    return (
      await Promise.all(
        titleSelector.map((singleSelector) =>
          getTitle(entryElement, singleSelector)
        )
      )
    ).join(" ");
  }
  const titleElement =
    titleSelector === "*" ? entryElement : await entryElement.$(titleSelector);
  return (await titleElement?.textContent())?.trim() ?? undefined;
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
    ? new URL(linkValue, baseUrl).href
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
          getTitle(entryElement, singleSelector)
        )
      )
    ).join(" ");
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
  const dateElement =
    typeof dateSelector === "string"
      ? await entryElement.$(dateSelector)
      : undefined;
  const datetimeAttribute = await dateElement?.getAttribute("datetime");
  const dateElementContent = await dateElement?.textContent();
  let dateValue: number | undefined = undefined;
  if (typeof datetimeAttribute === "string") {
    dateValue = parseDatetime(datetimeAttribute)?.getTime();
  } else if (
    typeof dateElementContent === "string" &&
    typeof dateFormat === "string"
  ) {
    dateValue = parseDate(
      dateElementContent.trim(),
      dateFormat,
      new Date(Date.now())
    ).getTime();
  }
  if (Number.isNaN(dateValue)) {
    dateValue = undefined;
  }

  return dateValue ?? Date.now();
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
