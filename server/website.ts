import https from "node:https";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";
import { load } from "cheerio";
import { normalizeDomain } from "./companies.js";
import type { ResearchPage } from "../shared/qualification.js";
const agentName = "ChurnAutopsyResearch";
export function publicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export function safeUrl(input: string, domain: string) {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.href.length > 2048 ||
    ![domain, `www.${domain}`].includes(url.hostname)
  )
    throw new Error("Website destination blocked");
  normalizeDomain(url.hostname);
  url.hash = "";
  url.search = "";
  return url;
}
export interface WebsiteResponse {
  status: number;
  body: string;
  location?: string;
  type: string;
}
export type WebsiteTransport = (url: URL) => Promise<WebsiteResponse>;
export async function fetchPublicPage(url: URL): Promise<WebsiteResponse> {
  // Resolve once, reject every non-public answer, then pin the connection to that IP.
  // Do not use credential-bearing environment proxies for untrusted websites.
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("DNS unavailable")),
        3000,
      );
      timer.unref();
    }),
  ]);
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("Website destination blocked");
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        agent: false,
        family: selected.family,
        servername: url.hostname,
        lookup: (_host, _options, callback) =>
          callback(null, selected.address, selected.family),
        headers: {
          "User-Agent": `${agentName}/1.0 (public business-model research)`,
          Accept: "text/html,text/plain;q=0.8",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const type = String(res.headers["content-type"] ?? "");
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.destroy();
          resolve({ status, body: "", location: res.headers.location, type });
          return;
        }
        if (
          status !== 200 ||
          !/^(text\/html|text\/plain|application\/xhtml\+xml)(;|$)/i.test(
            type,
          ) ||
          (res.headers["content-encoding"] &&
            res.headers["content-encoding"] !== "identity")
        ) {
          res.destroy();
          resolve({ status, body: "", type });
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 350_000) {
            res.destroy();
            reject(new Error("Website response too large"));
          } else chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status,
            body: Buffer.concat(chunks).toString("utf8"),
            type,
          }),
        );
        res.on("error", () => reject(new Error("Website unavailable")));
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("Website timed out")),
      6000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", () => reject(new Error("Website unavailable")));
    req.end();
  });
}
export function extractPage(html: string, base: URL, domain: string) {
  const $ = load(html);
  const links = $("a[href]")
    .toArray()
    .flatMap((el) => {
      try {
        const url = safeUrl(new URL($(el).attr("href")!, base).href, domain);
        return /\/(pricing|plans|product|features|about)(\/|$)/i.test(
          url.pathname,
        )
          ? [url.href]
          : [];
      } catch {
        return [];
      }
    });
  $(
    'script,style,noscript,nav,footer,header,blockquote,aside,[hidden],[aria-hidden="true"]',
  ).remove();
  $("p,h1,h2,h3,li,section,div,br").each((_i, el) => {
    $(el).append("\n");
  });
  const text = $("body")
    .text()
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 24000);
  return {
    text,
    links: [...new Set(links)]
      .sort(
        (a, b) =>
          Number(!/pricing|plans/.test(a)) - Number(!/pricing|plans/.test(b)),
      )
      .slice(0, 2),
  };
}
export async function researchWebsite(
  domain: string,
  transport: WebsiteTransport = fetchPublicPage,
): Promise<ResearchPage[]> {
  domain = normalizeDomain(domain);
  const origin = `https://${domain}`;
  const policies = new Map<string, ReturnType<typeof robotsParser>>();
  const pages: ResearchPage[] = [];
  async function allowed(url: URL) {
    if (!policies.has(url.hostname)) {
      let policy = safeUrl(`${url.origin}/robots.txt`, domain);
      let response: WebsiteResponse | undefined;
      for (let i = 0; i < 3; i++) {
        response = await transport(policy);
        if (
          response.status >= 300 &&
          response.status < 400 &&
          response.location
        ) {
          policy = safeUrl(new URL(response.location, policy).href, domain);
          if (policy.pathname !== "/robots.txt")
            throw new Error("Robots redirect blocked");
          continue;
        }
        break;
      }
      if (
        !response ||
        (response.status !== 404 &&
          (response.status !== 200 ||
            !/^text\/plain/i.test(response.type) ||
            response.body.length > 64000))
      )
        throw new Error("Robots unavailable");
      const parser = robotsParser(
        `${url.origin}/robots.txt`,
        response.status === 404 ? "" : response.body,
      );
      const delay = parser.getCrawlDelay(agentName);
      if (delay && delay > 2)
        throw new Error("Crawl delay exceeds research budget");
      policies.set(url.hostname, parser);
    }
    return policies.get(url.hostname)!.isAllowed(url.href, agentName) !== false;
  }
  let requests = 0;
  const visited = new Set<string>();
  async function read(input: string): Promise<{ url: URL; body: string }> {
    let url = safeUrl(input, domain);
    for (let redirects = 0; redirects <= 2; redirects++) {
      if (requests >= 5 || visited.has(url.href))
        throw new Error("Request budget reached");
      if (!(await allowed(url))) throw new Error("Robots disallowed");
      if (requests > 0)
        await new Promise((resolve) => setTimeout(resolve, 2000));
      visited.add(url.href);
      requests++;
      const response = await transport(url);
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.location
      ) {
        url = safeUrl(new URL(response.location, url).href, domain);
        continue;
      }
      if (
        response.status !== 200 ||
        !/^text\/html|^application\/xhtml\+xml/i.test(response.type) ||
        !response.body ||
        response.body.length > 350000
      )
        throw new Error("Website unavailable");
      return { url, body: response.body };
    }
    throw new Error("Redirect budget reached");
  }
  try {
    const home = await read(origin);
    const extracted = extractPage(home.body, home.url, domain);
    pages.push({ url: home.url.href, status: "ok", text: extracted.text });
    const links = [...extracted.links];
    if (!links.some((l) => /pricing|plans/.test(l)))
      links.unshift(new URL("/pricing", home.url).href);
    for (const link of [...new Set(links)].slice(0, 2)) {
      try {
        const page = await read(link);
        pages.push({
          url: page.url.href,
          status: "ok",
          text: extractPage(page.body, page.url, domain).text,
        });
      } catch {
        pages.push({ url: link, status: "unavailable", text: "" });
      }
    }
  } catch {
    pages.push({ url: origin, status: "unavailable", text: "" });
  }
  return pages;
}
