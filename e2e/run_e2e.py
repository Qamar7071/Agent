"""End-to-end checks in a real browser (Playwright + Chromium).

Runs against a running Raahi server (website + API), e.g. `cd backend && python app.py`
after `npm run build`. Uses guided mode unless an AI key is configured on that server.

    python e2e/run_e2e.py [BASE_URL]        # default http://localhost:5000
    RAAHI_ADMIN_KEY=... enables the admin check (it must match the server's ADMIN_TOKEN)

Each check prints PASS or FAIL; the exit code is the number of failures.
"""
import os
import re
import sys
import time
import traceback

from playwright.sync_api import Page, expect, sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("RAAHI_URL", "http://localhost:5000")).rstrip("/")
ADMIN_KEY = os.environ.get("RAAHI_ADMIN_KEY", "")
results: list[tuple[str, bool, str]] = []


def check(name):
    def wrap(fn):
        def run(page: Page):
            started = time.time()
            try:
                fn(page)
                results.append((name, True, f"{time.time() - started:.1f}s"))
                print(f"PASS  {name}")
            except Exception as exc:  # report and continue with the next check
                results.append((name, False, str(exc).splitlines()[0][:200]))
                print(f"FAIL  {name}: {str(exc).splitlines()[0][:200]}")
                if os.environ.get("E2E_DEBUG"):
                    traceback.print_exc()
        return run
    return wrap


def fresh(page: Page, path="/"):
    page.goto(BASE + path, wait_until="domcontentloaded")
    page.evaluate("localStorage.clear(); sessionStorage.clear()")
    page.goto(BASE + path, wait_until="networkidle")


@check("home page loads with real photo and no console errors")
def home(page):
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    fresh(page, "/")
    expect(page).to_have_title(re.compile("Raahi"))
    expect(page.get_by_role("heading", level=1)).to_contain_text("planned around the real road")
    loaded = page.evaluate("[...document.images].filter(i => i.loading !== 'lazy').every(i => i.complete && i.naturalWidth > 0)")
    assert loaded, "hero image did not load"
    expect(page.get_by_role("button", name="Plan My Trip with AI")).to_be_visible()
    assert not errors, errors


@check("navigation links and destination pages work")
def navigation(page):
    fresh(page, "/")
    page.get_by_role("navigation", name="Main").get_by_role("link", name="My trips").click()
    expect(page).to_have_url(BASE + "/trips")
    expect(page.get_by_role("heading", level=1)).to_have_text("My trips")
    page.get_by_role("link", name="Raahi home").click()
    expect(page).to_have_url(BASE + "/")
    page.get_by_role("contentinfo").get_by_role("link", name="Fairy Meadows").click()
    expect(page).to_have_url(BASE + "/destinations/fairy-meadows")
    expect(page.get_by_role("heading", level=1)).to_have_text("Fairy Meadows")
    page.get_by_role("link", name="Plan this trip").click()
    expect(page.get_by_role("dialog", name="Trip details")).to_be_visible()
    expect(page.get_by_role("checkbox", name="Fairy Meadows")).to_have_attribute("aria-checked", "true")
    page.goto(BASE + "/nowhere", wait_until="networkidle")
    expect(page.get_by_role("heading", level=1)).to_have_text("This page isn’t on the map")


@check("month filter shows what is usually in season")
def month_filter(page):
    fresh(page, "/")
    page.get_by_role("button", name="January").click()
    expect(page.locator("#destinations li").filter(has_text="Deosai National Park")).to_contain_text("Access usually closed by snow in January")
    last = page.locator("#destinations li").last.inner_text()
    assert "closed" in last, "closed destinations should be listed last"


@check("destination page shows sources and a live or honestly failed forecast")
def destination_page(page):
    fresh(page, "/destinations/deosai")
    expect(page.get_by_role("heading", name="Sources")).to_be_visible()
    forecast = page.locator("aside").filter(has_text="Forecast")
    expect(forecast).to_contain_text(re.compile("Open-Meteo forecast model, checked|Couldn’t load the forecast|No forecast"), timeout=25000)


@check("crawlable pages, sitemap and robots.txt")
def seo(page):
    html = page.request.get(BASE + "/destinations/hunza").text()
    assert "<h1>Hunza Valley</h1>" in html and "application/ld+json" in html and "og-hunza.jpg" in html
    sitemap = page.request.get(BASE + "/sitemap.xml").text()
    assert sitemap.count("<url>") == 10 and "/destinations/k2" in sitemap
    robots = page.request.get(BASE + "/robots.txt").text()
    assert "Disallow: /admin" in robots and "Sitemap:" in robots


@check("trip form validates input")
def form_validation(page):
    fresh(page, "/plan")
    page.get_by_role("button", name="Trip details").first.click()
    page.get_by_role("button", name="Build my plan").click()
    expect(page.get_by_text("Choose at least one place.")).to_be_visible()
    page.get_by_role("checkbox", name="Hunza Valley").click()
    page.get_by_label("Total days, including travel").fill("0")
    page.get_by_role("button", name="Build my plan").click()
    expect(page.get_by_text("Enter 1 to 30 days.")).to_be_visible()


@check("trip form builds a plan")
def form_plan(page):
    fresh(page, "/plan")
    page.get_by_role("button", name="Trip details").first.click()
    page.get_by_role("checkbox", name="Hunza Valley").click()
    page.get_by_role("checkbox", name="Attabad Lake").click()
    page.get_by_label("Total days, including travel").fill("7")
    page.get_by_role("button", name="Build my plan").click()
    expect(page.get_by_role("heading", name="Hunza Valley and Attabad Lake")).to_be_visible(timeout=20000)
    expect(page.get_by_role("tab", name="Day by day")).to_have_attribute("aria-selected", "true")
    assert page.locator("ol > li").count() == 7


def chat_send(page, text):
    page.locator("#chat-input").fill(text)
    page.keyboard.press("Enter")


@check("chat plans a trip, then removes a day")
def chat_flow(page):
    fresh(page, "/plan")
    chat_send(page, "Plan 6 days in Skardu from Islamabad for 2 people, budget 150000")
    expect(page.get_by_role("heading", name="Skardu & Upper Kachura")).to_be_visible(timeout=60000)
    expect(page.locator("section[aria-label='Chat with Raahi']")).to_contain_text("What Raahi checked")
    chat_send(page, "one day less")
    expect(page.locator("section[aria-label='Chat with Raahi']")).to_contain_text("days: 6 → 5", timeout=60000)
    expect(page.get_by_text(re.compile(r"^5 days from Islamabad"))).to_be_visible()


@check("a day can be edited and reset")
def edit_day(page):
    page.get_by_role("button", name="Edit day").first.click()
    page.get_by_label("Day title").fill("Our own day by the lake")
    page.get_by_role("button", name="Save day").click()
    expect(page.get_by_role("heading", name="Our own day by the lake")).to_be_visible(timeout=20000)
    expect(page.get_by_text("Edited by you").first).to_be_visible()
    page.get_by_role("button", name="Undo my changes").first.click()
    expect(page.get_by_role("heading", name="Our own day by the lake")).to_have_count(0, timeout=20000)


@check("budget, weather-and-roads, stays and food tabs")
def tabs(page):
    page.get_by_role("tab", name="Budget").click()
    expect(page.get_by_text("How the estimate is worked out")).to_be_visible()
    expect(page.get_by_role("tabpanel")).to_contain_text("Total (estimate)")
    page.get_by_role("tab", name="Weather and roads").click()
    expect(page.get_by_role("tabpanel")).to_contain_text("Current road status could not be verified.", timeout=40000)
    page.get_by_role("tab", name="Stays").click()
    expect(page.get_by_role("tabpanel")).to_contain_text("not quotes")
    page.get_by_role("button", name="Mid-range: PKR 7,000–18,000").click()
    expect(page.get_by_text("Fits your range").first).to_be_visible()
    page.get_by_role("tab", name="Food").click()
    expect(page.get_by_role("tabpanel")).to_contain_text("Local food", timeout=40000)
    page.get_by_role("tab", name="Day by day").click()


@check("save, reopen and delete a trip")
def saved_trip(page):
    page.get_by_role("button", name="Save trip").click()
    expect(page.get_by_role("button", name="Saved")).to_be_visible(timeout=15000)
    page.goto(BASE + "/trips", wait_until="networkidle")
    row = page.locator("section[aria-labelledby='saved-h'] li").filter(has_text="Skardu & Upper Kachura")
    expect(row).to_be_visible()
    row.get_by_role("button", name="Open").click()
    expect(page.get_by_role("heading", name="Skardu & Upper Kachura")).to_be_visible(timeout=20000)
    page.goto(BASE + "/trips", wait_until="networkidle")
    page.once("dialog", lambda d: d.accept())
    page.locator("section[aria-labelledby='saved-h'] li").filter(has_text="Skardu & Upper Kachura").get_by_role("button", name="Delete").click()
    expect(page.get_by_text("No saved trips in this browser yet.")).to_be_visible(timeout=15000)


@check("booking enquiry needs consent, then gives a reference that can be withdrawn")
def enquiry(page):
    page.goto(BASE + "/plan", wait_until="networkidle")
    if page.get_by_role("button", name="Send enquiry").count() == 0:
        chat_send(page, "Plan 5 days in Hunza from Gilgit for 2 people")
        expect(page.get_by_role("button", name="Send enquiry")).to_be_visible(timeout=60000)
    page.get_by_role("button", name="Send enquiry").first.click()
    dialog = page.get_by_role("dialog", name="Send a booking enquiry")
    expect(dialog).to_contain_text("This is an enquiry, not a booking.")
    dialog.get_by_label("Your name").fill("E2E Traveller")
    dialog.get_by_label("Email address").fill("e2e@example.com")
    dialog.get_by_role("button", name="Send enquiry").click()
    expect(dialog).to_contain_text("Please tick the box to agree")
    dialog.get_by_role("checkbox", name=re.compile("I agree that Raahi stores this enquiry")).check()
    dialog.get_by_role("button", name="Send enquiry").click()
    done = page.get_by_role("dialog", name="Enquiry sent")
    expect(done).to_contain_text(re.compile(r"RAH-[A-Z2-9]{4}-[A-Z2-9]{4}"), timeout=15000)
    expect(done).to_contain_text("This is not a booking")
    done.get_by_role("button", name="Close").first.click()
    page.goto(BASE + "/trips", wait_until="networkidle")
    row = page.locator("section[aria-labelledby='enq-h'] li").filter(has_text="RAH-")
    row.get_by_role("button", name="Check status").click()
    expect(row).to_contain_text("Received, waiting for review")
    page.once("dialog", lambda d: d.accept())
    row.get_by_role("button", name="Withdraw").click()
    expect(page.get_by_text("No enquiries sent from this browser.")).to_be_visible(timeout=15000)


@check("admin page rejects a wrong key and lists enquiries with the right one")
def admin(page):
    fresh(page, "/admin")
    page.get_by_label("Admin key").fill("wrong-key-for-sure")
    page.get_by_role("button", name="Open enquiries").click()
    expect(page.get_by_text(re.compile("Admin key missing or wrong|not configured"))).to_be_visible(timeout=15000)
    if not ADMIN_KEY:
        return
    page.get_by_label("Admin key").fill(ADMIN_KEY)
    page.get_by_role("button", name="Open enquiries").click()
    expect(page.get_by_role("heading", level=1, name="Enquiries")).to_be_visible()
    expect(page.get_by_role("button", name="Refresh")).to_be_visible()


@check("network failure shows an error with a working retry")
def network_error(page):
    fresh(page, "/plan")
    page.route("**/api/chat", lambda route: route.abort())
    chat_send(page, "Weather in Hunza")
    expect(page.get_by_text("Can’t reach Raahi’s server")).to_be_visible(timeout=15000)
    page.unroute("**/api/chat")
    page.get_by_role("button", name="Send again").click()
    expect(page.locator("section[aria-label='Chat with Raahi']")).to_contain_text(
        re.compile("Open-Meteo|couldn't get a forecast"), timeout=40000)


@check("no horizontal overflow from phone to desktop, and the phone menu works")
def responsive(page):
    for width, height in ((360, 740), (390, 844), (768, 1024), (1024, 768), (1440, 900)):
        page.set_viewport_size({"width": width, "height": height})
        for path in ("/", "/plan", "/destinations/hunza", "/trips"):
            page.goto(BASE + path, wait_until="networkidle")
            over = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            assert over <= 1, f"{path} overflows by {over}px at {width}px"
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(BASE + "/", wait_until="networkidle")
    page.get_by_role("button", name="Open menu").click()
    expect(page.get_by_role("navigation", name="Mobile").get_by_role("link", name="Plan a trip")).to_be_visible()
    page.goto(BASE + "/plan", wait_until="networkidle")
    expect(page.get_by_role("tab", name="Chat")).to_be_visible()
    page.set_viewport_size({"width": 1440, "height": 900})


@check("keyboard: skip link and resizable chat panel")
def keyboard(page):
    page.goto(BASE + "/plan", wait_until="networkidle")
    page.keyboard.press("Tab")
    assert page.evaluate("document.activeElement.textContent.trim()") == "Skip to content"
    handle = page.get_by_role("separator", name="Resize the chat panel")
    before = int(handle.get_attribute("aria-valuenow"))
    handle.focus()
    page.keyboard.press("ArrowRight")
    assert int(handle.get_attribute("aria-valuenow")) == min(680, before + 32)


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
        page.set_default_timeout(15000)
        for fn in (home, navigation, month_filter, destination_page, seo, form_validation, form_plan, chat_flow,
                   edit_day, tabs, saved_trip, enquiry, admin, network_error, responsive, keyboard):
            fn(page)
        browser.close()
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
    return len(failed)


if __name__ == "__main__":
    sys.exit(main())
