import { resolve } from "path";
import { beforeAll, jest, it, expect } from "@jest/globals";
import handler from "serve-handler";
import http from "http";
import { readFile, rm } from "fs/promises";
import { run } from "./run";

jest.setTimeout(60000);
Date.now = jest.fn(() => 0);

let server: http.Server;

beforeAll(async () => {
  await rm(resolve(__dirname, "../public/"), { recursive: true, force: true });

  server = http.createServer((request, response) => {
    // You pass two more arguments for config and middleware
    // More details here: https://github.com/vercel/serve-handler#options
    return handler(request, response, { public: "./src/fixtures" });
  });

  server.listen(5000, () => {
    console.log("Fixture server running at http://localhost:5000");
  });

  await run(resolve(__dirname, "./fixtures/feeds.toml"));

  server.close();
});

it("can generate a feed with the minimal configuration", async () => {
  const minimalFeed = await readFile(
    resolve(__dirname, "../public/minimal.xml"),
    "utf-8"
  );
  expect(minimalFeed).toMatchSnapshot();
});

it("can generate a feed with all possible fields configured", async () => {
  const maximalFeed = await readFile(
    resolve(__dirname, "../public/maximal.xml"),
    "utf-8"
  );
  expect(maximalFeed).toMatchSnapshot();
});

it("can find images even when they are defined as background images", async () => {
  const backgroundImageFeed = await readFile(
    resolve(__dirname, "../public/background-image.xml"),
    "utf-8"
  );
  expect(backgroundImageFeed).toMatch("https://picsum.photos/200/300");
  expect(backgroundImageFeed).toMatch("https://picsum.photos/id/237/200/300");
});

it("can generate a feed where every element is also the link", async () => {
  const linkEntryFeed = await readFile(
    resolve(__dirname, "../public/link-entry.xml"),
    "utf-8"
  );
  expect(linkEntryFeed).toMatchSnapshot();
});

// Skipped, because the dates are localised and are thus not deterministic
// across timezones (i.e. my local PC and CI).
it.skip("can generate a feed with dates extracted from the content", async () => {
  const dateFeed = await readFile(
    resolve(__dirname, "../public/date.xml"),
    "utf-8"
  );
  expect(dateFeed).toMatchSnapshot();
});

it("can generate a feed where every the title and contents are spread out over multiple elements", async () => {
  const multipleElementsFeed = await readFile(
    resolve(__dirname, "../public/join-elements.xml"),
    "utf-8"
  );
  expect(multipleElementsFeed).toMatchSnapshot();
});

it("correctly resolves relative links", async () => {
  const relativeLinksFeed = await readFile(
    resolve(__dirname, "../public/relative-link.xml"),
    "utf-8"
  );
  expect(relativeLinksFeed).toMatchSnapshot();
});

it("correctly filters out entries matching filters and not matching matchers", async () => {
  const matchesFeed = await readFile(
    resolve(__dirname, "../public/matches.xml"),
    "utf-8"
  );
  expect(matchesFeed).toMatchSnapshot();
});

it("can generate a combined feed", async () => {
  const combinedFeed = await readFile(
    resolve(__dirname, "../public/all.xml"),
    "utf-8"
  );
  expect(combinedFeed).toMatchSnapshot();
});
