"""Accessibility (axe-core) and page-weight audit in a real browser (Playwright + Chromium).

Run it against a running Raahi server, e.g. after `npm run build` and `cd backend && python app.py`:

    python e2e/audit.py [BASE_URL]          # default http://localhost:5000
    RAAHI_ADMIN_KEY=... also audits the admin enquiry list (must match the server's ADMIN_TOKEN)

1. Accessibility: runs axe-core (node_modules/axe-core, installed by `npm install`) on the main pages
   and planner states at phone (390x844) and desktop (1440x900) sizes, against the WCAG 2.0/2.1/2.2
   A and AA rules plus axe's best-practice rules. Automated checks find only part of the problems;
   keyboard and screen-reader testing by a person is still needed.
2. Page weight: what a first visit to the home page downloads, before and after scrolling to the bottom.
   If the server does not compress responses (Flask's development server doesn't; Vercel's CDN does),
   the "gzip" column estimates the compressed size of text files.

Saves a trip and deletes it again, so the server needs storage. The exit code is the number of
accessibility violations found (one per rule, page state and screen size).
"""
import gzip
import os
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Page, expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
AXE = ROOT / "node_modules" / "axe-core" / "axe.min.js"
BASE = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("RAAHI_URL", "http://localhost:5000")).rstrip("/")
ADMIN_KEY = os.environ.get("RAAHI_ADMIN_KEY", "")
TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]
VIEWPORTS = {
    "desktop": dict(viewport={"width": 1440, "height": 900}),
    "phone": dict(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True),
}
TEXT_TYPES = ("text/", "javascript", "json", "xml", "svg")

found: list[tuple[str, str, dict]] = []   # (screen, state, violation)
audited: list[tuple[str, str]] = []


# ---------------------------------------------------------------- accessibility

def scroll_through(page: Page):
    """Scroll the window and any scrollable panel to the end and back, so lazy images load."""
    page.evaluate("""async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const boxes = [document.scrollingElement, ...document.querySelectorAll('.overflow-y-auto')];
        for (const box of boxes) {
            for (let y = 0; y < box.scrollHeight; y += 500) { box.scrollTop = y; await wait(60); }
            box.scrollTop = 0;
        }
    }""")
    page.wait_for_timeout(400)


def audit(page: Page, screen: str, state: str, scroll=True):
    if scroll:
        scroll_through(page)
    if not page.evaluate("typeof window.axe !== 'undefined'"):
        page.add_script_tag(path=str(AXE))
    violations = page.evaluate(
        """(tags) => axe.run(document, {runOnly: {type: 'tag', values: tags}, resultTypes: ['violations']})
            .then((r) => r.violations.map((v) => ({id: v.id, impact: v.impact, help: v.help,
                nodes: v.nodes.map((n) => n.target.join(' ')), detail: v.nodes[0] && v.nodes[0].failureSummary})))""",
        TAGS,
    )
    audited.append((screen, state))
    if not violations:
        print(f"  ok    {state}")
    for v in violations:
        found.append((screen, state, v))
        nodes = ", ".join(v["nodes"][:3]) + (" …" if len(v["nodes"]) > 3 else "")
        print(f"  FAIL  {state}: [{v['impact']}] {v['id']}: {v['help']} ({len(v['nodes'])}x: {nodes})")
        if os.environ.get("AUDIT_DEBUG") and v.get("detail"):
            print("        " + v["detail"].replace("\n", "\n        "))


def show_plan_view(page: Page, screen: str):
    if screen == "phone":
        page.get_by_role("tablist", name="Planner view").get_by_role("tab").nth(1).click()


def show_chat_view(page: Page, screen: str):
    if screen == "phone":
        page.get_by_role("tablist", name="Planner view").get_by_role("tab", name="Chat").click()


def run_states(page: Page, screen: str):
    page.goto(BASE + "/", wait_until="domcontentloaded")
    page.evaluate("localStorage.clear(); sessionStorage.clear()")

    page.goto(BASE + "/", wait_until="networkidle")
    audit(page, screen, "home")
    if screen == "phone":
        page.get_by_role("button", name="Open menu").click()
        expect(page.get_by_role("navigation", name="Mobile")).to_be_visible()
        audit(page, screen, "home, phone menu open", scroll=False)
        page.keyboard.press("Escape")

    page.goto(BASE + "/destinations/hunza", wait_until="networkidle")
    expect(page.locator("aside").filter(has_text="Forecast")).to_contain_text("Forecast", timeout=25000)
    audit(page, screen, "destination page (Hunza)")

    page.goto(BASE + "/nowhere", wait_until="networkidle")
    audit(page, screen, "page not found")

    page.goto(BASE + "/plan", wait_until="networkidle")
    audit(page, screen, "planner, empty")
    if screen == "phone":
        show_plan_view(page, screen)
        audit(page, screen, "planner, empty plan view")
        show_chat_view(page, screen)

    page.get_by_role("button", name="Trip details").first.click()
    dialog = page.get_by_role("dialog", name="Trip details")
    expect(dialog).to_be_visible()
    audit(page, screen, "trip form dialog", scroll=False)
    page.get_by_role("button", name="Build my plan").click()
    expect(page.get_by_text("Choose at least one place.")).to_be_visible()
    audit(page, screen, "trip form dialog with an error", scroll=False)
    dialog.get_by_role("checkbox", name="Hunza Valley").click()
    dialog.get_by_role("checkbox", name="Attabad Lake").click()
    dialog.get_by_label("Total days, including travel").fill("7")
    page.get_by_role("button", name="Build my plan").click()
    expect(page.get_by_role("heading", name="Hunza Valley and Attabad Lake")).to_be_visible(timeout=30000)
    audit(page, screen, "plan: day by day")

    for tab, wait_for in (("Budget", "Total (estimate)"),
                          ("Weather and roads", "Current road status could not be verified."),
                          ("Stays", "not quotes")):
        page.get_by_role("tab", name=tab).click()
        expect(page.get_by_role("tabpanel")).to_contain_text(wait_for, timeout=40000)
        audit(page, screen, f"plan: {tab.lower()} tab")
    page.get_by_role("tab", name="Day by day").click()

    page.get_by_role("button", name="Edit day").first.click()
    expect(page.get_by_label("Day title")).to_be_visible()
    audit(page, screen, "plan: editing a day", scroll=False)
    page.get_by_role("button", name="Cancel").first.click()

    page.get_by_role("button", name="Send enquiry").first.click()
    enquiry = page.get_by_role("dialog", name="Send a booking enquiry")
    expect(enquiry).to_be_visible()
    audit(page, screen, "booking enquiry dialog", scroll=False)
    enquiry.get_by_role("button", name="Send enquiry").click()
    expect(enquiry).to_contain_text("Please tick the box to agree")
    audit(page, screen, "booking enquiry dialog with errors", scroll=False)
    page.keyboard.press("Escape")
    expect(enquiry).to_be_hidden()

    show_chat_view(page, screen)
    page.locator("#chat-input").fill("What's the weather in Hunza?")
    page.keyboard.press("Enter")
    expect(page.locator("section[aria-label='Chat with Raahi']")).to_contain_text(
        "Open-Meteo", timeout=60000)
    audit(page, screen, "chat with a reply")

    show_plan_view(page, screen)
    page.get_by_role("button", name="Save trip").click()
    expect(page.get_by_role("button", name="Saved")).to_be_visible(timeout=15000)
    page.goto(BASE + "/trips", wait_until="networkidle")
    row = page.locator("section[aria-labelledby='saved-h'] li").filter(has_text="Hunza Valley and Attabad Lake")
    expect(row).to_be_visible()
    audit(page, screen, "my trips, one saved trip")
    page.once("dialog", lambda d: d.accept())
    row.get_by_role("button", name="Delete").click()
    expect(page.get_by_text("No saved trips in this browser yet.")).to_be_visible(timeout=15000)
    audit(page, screen, "my trips, empty")

    page.goto(BASE + "/admin", wait_until="networkidle")
    audit(page, screen, "admin sign-in")
    if ADMIN_KEY:
        page.get_by_label("Admin key").fill(ADMIN_KEY)
        page.get_by_role("button", name="Open enquiries").click()
        expect(page.get_by_role("heading", level=1, name="Enquiries")).to_be_visible()
        audit(page, screen, "admin enquiry list")


# ---------------------------------------------------------------- page weight

def kb(n: float) -> str:
    return f"{n / 1024:,.0f} KB" if n < 1024 * 1024 else f"{n / 1024 / 1024:,.2f} MB"


def weigh(requests, origin: str):
    rows = defaultdict(lambda: [0, 0, 0])   # group -> [count, bytes as sent, gzip estimate]
    compressed_by_server = False
    for req in requests:
        resp = req.response()
        if resp is None:
            continue
        sent = req.sizes().get("responseBodySize", 0)
        headers = resp.all_headers()
        encoding = headers.get("content-encoding", "")
        ctype = headers.get("content-type", "")
        estimate = sent
        if encoding:
            compressed_by_server = compressed_by_server or urlparse(req.url).netloc == origin
        elif any(t in ctype for t in TEXT_TYPES):
            try:
                estimate = len(gzip.compress(resp.body(), 6))
            except Exception:  # body no longer available
                pass
        host = urlparse(req.url).netloc
        group = req.resource_type if host == origin else f"{req.resource_type} ({host})"
        for key in (group, "TOTAL"):
            rows[key][0] += 1
            rows[key][1] += sent
            rows[key][2] += estimate
    return rows, compressed_by_server


def page_weight(browser, screen: str):
    context = browser.new_context(**VIEWPORTS[screen])
    page = context.new_page()
    seen = []
    page.on("requestfinished", lambda request: seen.append(request))
    page.goto(BASE + "/", wait_until="load")
    page.wait_for_load_state("networkidle")
    lcp = page.evaluate("""() => new Promise((resolve) => {
        new PerformanceObserver((list) => {
            const e = list.getEntries().at(-1);
            const el = e && e.element;
            resolve(el ? (el.currentSrc ? `${el.tagName.toLowerCase()} ${new URL(el.currentSrc).pathname}` : el.tagName.toLowerCase()) : 'unknown');
        }).observe({type: 'largest-contentful-paint', buffered: true});
        setTimeout(() => resolve('unknown'), 3000);
    })""")
    first = list(seen)
    scroll_through(page)
    page.wait_for_load_state("networkidle")
    after = list(seen)
    origin = urlparse(BASE).netloc
    print(f"\n{screen} ({VIEWPORTS[screen]['viewport']['width']}px wide, "
          f"{VIEWPORTS[screen].get('device_scale_factor', 1)}x pixels), first visit to / with an empty cache")
    print(f"  largest element painted first (LCP element): {lcp}")
    for label, reqs in (("on load", first), ("after scrolling to the bottom", after)):
        rows, compressed = weigh(reqs, origin)
        note = "server compresses text" if compressed else "server sent text uncompressed; gzip column is an estimate"
        print(f"  {label} ({note}):")
        print(f"    {'':38}{'requests':>9}{'as sent':>12}{'gzip':>12}")
        for key in sorted(rows, key=lambda k: (k == "TOTAL", -rows[k][1])):
            count, sent, estimate = rows[key]
            print(f"    {key[:38]:38}{count:>9}{kb(sent):>12}{kb(estimate):>12}")
    context.close()


def main() -> int:
    if not AXE.exists():
        print("axe-core is missing: run `npm install` first.")
        return 2
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for screen, options in VIEWPORTS.items():
            print(f"\nAccessibility, {screen}:")
            context = browser.new_context(**options)
            page = context.new_page()
            page.set_default_timeout(15000)
            try:
                run_states(page, screen)
            except Exception as exc:  # report what was reached; a broken flow is itself a finding
                print(f"  STOPPED: {str(exc).splitlines()[0][:200]}")
                found.append((screen, "flow", {"id": "flow-stopped", "impact": "n/a", "help": str(exc)[:200], "nodes": []}))
            context.close()
        print("\nPage weight:")
        for screen in VIEWPORTS:
            page_weight(browser, screen)
        browser.close()

    print(f"\n{len(audited)} page states audited, {len(found)} violation(s).")
    by_rule = defaultdict(list)
    for screen, state, v in found:
        by_rule[v["id"]].append(f"{screen}: {state}")
    for rule, where in sorted(by_rule.items()):
        print(f"  {rule}: {len(where)}x ({'; '.join(where[:4])}{' …' if len(where) > 4 else ''})")
    return min(len(found), 100)


if __name__ == "__main__":
    sys.exit(main())
