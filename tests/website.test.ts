import { describe, it, expect, vi } from "vitest";
import {
  publicAddress,
  safeUrl,
  extractPage,
  researchWebsite,
  type WebsiteResponse,
} from "../server/website";
const html = (body: string): WebsiteResponse => ({
  status: 200,
  type: "text/html",
  body,
});
const noRobots: WebsiteResponse = { status: 404, type: "text/plain", body: "" };
describe("safe public website access", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "224.0.0.1",
    "198.18.0.1",
  ])("blocks non-public address %s", (address) =>
    expect(publicAddress(address)).toBe(false),
  );
  it("accepts ordinary public addresses", () =>
    expect(publicAddress("93.184.216.34")).toBe(true));
  it.each([
    "http://fictional.example/",
    "https://127.0.0.1/",
    "https://fictional.example.evil.com/",
    "https://user:secret@fictional.example/",
    "https://fictional.example:8443/",
    "file:///etc/passwd",
  ])("blocks unsafe destination %s", (url) =>
    expect(() => safeUrl(url, "fictional.example")).toThrow(),
  );
  it("strips query/fragment and accepts only the www alias", () =>
    expect(
      safeUrl(
        "https://www.fictional.example/pricing?tracking=x#plans",
        "fictional.example",
      ).href,
    ).toBe("https://www.fictional.example/pricing"));
  it("extracts pricing links but excludes scripts, nav, testimonials and hidden content as evidence", () => {
    const p = extractPage(
      '<nav><a href="/pricing">Pricing</a>Cloud-based SaaS</nav><script>paid subscription</script><blockquote>We are a nonprofit</blockquote><div hidden>Agency</div><p>Software for businesses.</p>',
      new URL("https://fictional.example"),
      "fictional.example",
    );
    expect(p.links).toContain("https://fictional.example/pricing");
    expect(p.text).toContain("Software for businesses");
    expect(p.text).not.toContain("nonprofit");
    expect(p.text).not.toContain("SaaS");
  });
  it("honors robots disallow without fetching homepage", async () => {
    const transport = vi.fn().mockResolvedValue({
      status: 200,
      type: "text/plain",
      body: "User-agent: *\nDisallow: /",
    });
    const pages = await researchWebsite("fictional.example", transport);
    expect(pages[0].status).not.toBe("ok");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("refuses cross-site redirects including metadata destinations", async () => {
    const transport = vi.fn(async (url: URL) =>
      url.pathname === "/robots.txt"
        ? noRobots
        : {
            status: 302,
            type: "text/html",
            body: "",
            location: "https://169.254.169.254/",
          },
    );
    const pages = await researchWebsite("fictional.example", transport);
    expect(pages[0].status).toBe("unavailable");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("researches bounded homepage and linked pricing with no scripts or arbitrary crawling", async () => {
    vi.useFakeTimers();
    try {
      const transport = vi.fn(async (url: URL) =>
        url.pathname === "/robots.txt"
          ? noRobots
          : url.pathname === "/pricing"
            ? html("<p>Monthly subscription plans billed annually.</p>")
            : html(
                '<p>Cloud-based software for businesses.</p><a href="/pricing">Pricing</a>',
              ),
      );
      const job = researchWebsite("fictional.example", transport);
      await vi.runAllTimersAsync();
      const pages = await job;
      expect(pages).toHaveLength(2);
      expect(pages.every((p) => p.status === "ok")).toBe(true);
      expect(transport).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

it("retains footer no-solicitation instructions as blocking evidence", () => {
  const page = extractPage(
    "<p>Cloud-based software for businesses.</p><footer>No unsolicited commercial emails. Do not email us for sales.</footer>",
    new URL("https://fictional.example/"),
    "fictional.example",
  );
  expect(page.text).toContain("Do not email us for sales");
});
