import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "Feed me up, Scotty!",
  tagline: "RSS feeds for arbitrary websites, using CSS selectors",
  url: "https://feed-me-up-scotty.vincenttunru.com",
  baseUrl: "/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  favicon: "img/favicon.ico",
  // organizationName: "facebook", // Usually your GitHub org/user name.
  // projectName: "docusaurus", // Usually your repo name.
  themeConfig: {
    image: "img/card.png",
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Feed me up, Scotty!",
      logo: {
        alt: "",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "doc",
          docId: "setup",
          position: "left",
          label: "Set up",
        },
        {
          type: "doc",
          docId: "automate",
          position: "left",
          label: "Automate",
        },
        {
          href: "https://gitlab.com/vincenttunru/feed-me-up-scotty/",
          label: "Source code",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Configuration file",
              to: "/docs/setup",
            },
            {
              label: "Automation",
              to: "/docs/automate",
            },
          ],
        },
        {
          title: "By Vincent Tunru",
          items: [
            {
              label: "Website",
              href: "https://VincentTunru.com",
            },
            {
              label: "On Twitter",
              href: "https://twitter.com/VincentTunru",
            },
            {
              label: "On Mastodon",
              href: "https://fosstodon.org/@VincentTunru",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Vincent Tunru.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["toml"],
    },
  } satisfies Preset.ThemeConfig,
  presets: [
    [
      "@docusaurus/preset-classic",
      {
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          // Please change this to your repo.
          editUrl:
            "https://gitlab.com/vincenttunru/feed-me-up-scotty/-/edit/main/website/",
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      } satisfies Preset.Options,
    ],
  ],
};

export default config;
