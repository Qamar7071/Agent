"""End-to-end checks in a real browser (Playwright + Chromium).

Runs against a running Raahi server (website + API), e.g. `cd backend && python app.py`
after `npm run build`. Uses guided mode unless an AI key is configured on that server.

    python e2e/run_e2e.py [BASE_URL]        # default http://localhost:5000
    RAAHI_ADMIN_KEY=... enables the admin check (it must match the server's ADMIN_TOKEN)

Each check prints PASS or FAIL; the exit code is the number of failures.
"""
import json
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
    page.get_by_role("button", name="Mid-range: Rs 7,000–18,000").click()
    expect(page.get_by_text("Fits your range").first).to_be_visible()
    page.get_by_role("tab", name="Food").click()
    expect(page.get_by_role("tabpanel")).to_contain_text("Local food", timeout=40000)
    page.get_by_role("tab", name="Day by day").click()


@check("packing tab is built by the packing agent and remembers ticks")
def packing(page):
    page.get_by_role("tab", name="Packing").click()
    panel = page.get_by_role("tabpanel")
    expect(panel).to_contain_text("Built by the packing agent", timeout=40000)
    first = panel.get_by_role("checkbox").first
    first.check()
    page.reload(wait_until="networkidle")
    page.get_by_role("tab", name="Packing").click()
    expect(page.get_by_role("tabpanel").get_by_role("checkbox").first).to_be_checked(timeout=40000)
    page.get_by_role("tab", name="Day by day").click()


@check("travel twin: agents run with real events, the what-if keeps the original until accepted")
def travel_twin(page):
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    fresh(page, "/twin")
    page.get_by_role("button", name="Run the demo trip").click()
    twin = page.locator("#twin-h")
    expect(twin).to_have_text("Hunza Valley and Khunjerab Pass", timeout=60000)
    flow = page.get_by_role("group", name="Agent workflow")
    for agent in ("Master Orchestrator", "Itinerary Planner", "Predictive Safety", "Validation"):
        expect(flow.get_by_role("button", name=re.compile(agent)).first).to_be_visible()
    expect(page.get_by_text(re.compile(r"\d+/\d+ tasks finished")).first).to_be_visible()
    page.get_by_role("button", name="Khunjerab route unavailable on day 4").click()
    expect(page.locator("#sim-h")).to_have_text("Khunjerab Pass road (Sost–border) unavailable from day 4", timeout=60000)
    expect(page.get_by_text("Original plan unchanged until you accept")).to_be_visible()
    expect(page.get_by_role("region", name="Original and simulated days")).to_contain_text("Up to Khunjerab")
    expect(twin).to_have_text("Hunza Valley and Khunjerab Pass")
    page.get_by_role("button", name="Accept this plan").click()
    expect(twin).not_to_contain_text("Khunjerab", timeout=60000)
    expect(page.locator("#sim-h")).to_have_count(0)
    assert not errors, errors


@check("agent control center shows the stored run, a task's tool calls and the event log")
def agent_control(page):
    page.goto(BASE + "/agents", wait_until="networkidle")
    expect(page.get_by_role("heading", name="Runs in this browser")).to_be_visible()
    flow = page.get_by_role("group", name="Agent workflow")
    flow.get_by_role("button", name=re.compile("Weather Intelligence")).first.click()
    expect(page.get_by_text(re.compile(r"Tool calls \(\d+\)"))).to_be_visible()
    expect(page.get_by_text(re.compile("open-meteo|pmd.alerts")).first).to_be_visible()
    expect(page.get_by_role("heading", name="Event log")).to_be_visible()


@check("guardian scores the trip day by day and explains every point")
def guardian(page):
    page.goto(BASE + "/guardian", wait_until="networkidle")
    expect(page.get_by_role("heading", name="Day by day")).to_be_visible(timeout=60000)
    expect(page.get_by_text("not an official safety assessment").first).to_be_visible()
    expect(page.get_by_role("heading", name="How the score works")).to_be_visible()
    page.get_by_role("button", name="Check now").click()
    expect(page.get_by_role("heading", name="Since your last check")).to_be_visible(timeout=60000)


@check("theme button switches between device, light and dark")
def theme(page):
    page.goto(BASE + "/", wait_until="networkidle")
    button = page.get_by_role("button", name=re.compile("Change theme")).first
    expect(button).to_have_attribute("aria-label", re.compile("same as your device"))
    button.click()
    assert page.evaluate("document.documentElement.dataset.theme") == "light"
    button.click()
    assert page.evaluate("document.documentElement.dataset.theme") == "dark"
    page.reload(wait_until="networkidle")
    assert page.evaluate("document.documentElement.dataset.theme") == "dark"
    page.get_by_role("button", name=re.compile("Change theme")).first.click()
    assert page.evaluate("document.documentElement.dataset.theme") in (None, "", "system")


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


def saathi_trip(page, start_offset=-1):
    """Plan, save and start a 6-day Hunza trip that began yesterday (so today is day 2)."""
    from datetime import date, timedelta
    fresh(page, "/plan")
    page.get_by_role("button", name="Fill in trip details").first.click()
    dialog = page.get_by_role("dialog", name="Trip details")
    dialog.get_by_role("checkbox", name="Hunza Valley").click()
    dialog.get_by_label("Total days, including travel").fill("6")
    page.get_by_role("button", name="Build my plan").click()
    expect(page.get_by_role("button", name="Save trip")).to_be_visible(timeout=30000)
    page.get_by_role("button", name="Save trip").click()
    expect(page.get_by_role("button", name="Saved")).to_be_visible(timeout=15000)
    page.get_by_role("link", name="Start trip").click()
    expect(page.get_by_role("heading", name="Start your trip")).to_be_visible()
    page.get_by_label("Your name").fill("Qamar")
    page.get_by_label("Name of person 2").fill("Sara")
    page.locator("#budget-amount").fill("120000")
    page.locator("#trip-start").fill((date.today() + timedelta(days=start_offset)).isoformat())
    page.get_by_role("button", name="Start trip").click()
    expect(page.get_by_role("tab", name="Today")).to_be_visible()


def add_expense(page, amount, category, payer=None, *, keypad=False):
    page.get_by_role("button", name="Add expense").click()                     # tap 1
    if keypad:
        for k in amount:
            page.get_by_role("button", name=k, exact=True).click()
    else:
        page.locator("#amount").fill(amount)
    page.get_by_role("radio", name=category).click()                            # tap 2
    if payer:
        page.get_by_role("radiogroup", name="Who paid?").get_by_role("radio", name=payer).click()
    page.get_by_role("button", name="Save", exact=True).click()                 # tap 3


@check("Safar Saathi: start a saved trip, add an expense in 3 taps, pace and split update")
def saathi(page):
    saathi_trip(page)
    expect(page.get_by_text("Day 2 of 6")).to_be_visible()
    expect(page.get_by_text("All synced")).to_be_visible(timeout=15000)
    started = time.time()
    add_expense(page, "2400", "Food", keypad=True)
    expect(page.get_by_role("status")).to_contain_text("Rs 2,400 · Food · paid by Qamar")
    assert time.time() - started < 5, "adding an expense took more than 5 seconds"
    expect(page.locator("#pace-h").locator("..")).to_contain_text("Rs 2,400")
    add_expense(page, "1000", "Transport", "Sara")
    page.get_by_role("tab", name="Spending").click()
    settle = page.locator("section[aria-labelledby='settle-h']")
    expect(settle).to_contain_text("Sara pays Qamar")
    expect(settle).to_contain_text("Rs 700")            # Qamar paid 2,400, Sara 1,000; each owes 1,700
    page.get_by_role("tab", name="Today").click()


@check("Safar Saathi: a big expense is checked first, then the pace nudge offers choices")
def saathi_nudges(page):
    add_expense(page, "90000", "Stay")
    expect(page.get_by_role("article", name="Quick check")).to_be_visible()
    expect(page.get_by_role("article")).to_have_count(1)
    page.get_by_role("button", name="Yes, it’s right").click()
    nudge = page.get_by_role("article").filter(has_text="of the budget (plan:")
    expect(nudge).to_have_attribute("aria-label", re.compile("Over plan|Go carefully"))
    expect(nudge.get_by_role("button", name="Keep the plan")).to_be_visible()
    savers = nudge.get_by_role("button", name=re.compile("saves about Rs"))
    if savers.count():
        expect(savers.first).to_contain_text("estimate, Raahi cost model")
    nudge.get_by_role("button", name="Keep the plan").click()
    expect(page.get_by_role("article")).to_have_count(0)


@check("Safar Saathi: expenses added offline survive a reload and sync once")
def saathi_offline(page):
    import requests
    trip = json.loads(page.evaluate("localStorage.getItem('raahi:trips')"))[0]
    page.wait_for_timeout(1000)                     # let the service worker take control
    page.context.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    add_expense(page, "650", "Food")
    expect(page.get_by_text("1 waiting to sync")).to_be_visible()
    page.reload(wait_until="domcontentloaded")
    expect(page.get_by_text("1 waiting to sync")).to_be_visible(timeout=15000)
    page.context.set_offline(False)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    expect(page.get_by_text("All synced")).to_be_visible(timeout=20000)
    comp = requests.get(f"{BASE}/api/trips/{trip['id']}/companion", headers={"X-Trip-Token": trip["token"]}, timeout=15).json()
    amounts = sorted(e["amountPkr"] for e in comp["expenses"] if not e["deleted"])
    assert amounts == [650, 1000, 2400, 90000], amounts
    page.goto(BASE + "/trips", wait_until="networkidle")
    page.once("dialog", lambda d: d.accept())
    page.locator("section[aria-labelledby='saved-h'] li").first.get_by_role("button", name="Delete").click()
    expect(page.get_by_text("No saved trips in this browser yet.")).to_be_visible(timeout=15000)


@check("no horizontal overflow from phone to desktop, and the phone menu works")
def responsive(page):
    try:
        overflow = []
        for width, height in ((360, 740), (390, 844), (768, 1024), (1024, 768), (1440, 900)):
            page.set_viewport_size({"width": width, "height": height})
            for path in ("/", "/plan", "/destinations/hunza", "/trips", "/twin", "/agents", "/guardian", "/trip/new?from=plan"):
                page.goto(BASE + path, wait_until="networkidle")
                over = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                if over > 1:
                    overflow.append(f"{path} by {over}px at {width}px")
        assert not overflow, "overflow: " + "; ".join(overflow)
    finally:
        page.set_viewport_size({"width": 1440, "height": 900})
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


def plan_hunza(page, days="6"):
    fresh(page, "/plan")
    page.get_by_role("button", name="Fill in trip details").first.click()
    dialog = page.get_by_role("dialog", name="Trip details")
    dialog.get_by_role("checkbox", name="Hunza Valley").click()
    dialog.get_by_role("checkbox", name="Khunjerab Pass").click()
    dialog.get_by_label("Total days, including travel").fill(days)
    page.get_by_role("button", name="Build my plan").click()
    expect(page.get_by_role("link", name="Plan with your group")).to_be_visible(timeout=30000)


@check("Group Room: join with a name, private need stays anonymous and changes the plan, vote, confirm")
def group_room(page):
    plan_hunza(page)
    page.get_by_role("link", name="Plan with your group").click()
    page.get_by_role("radio", name=re.compile("^Friends")).click()
    page.get_by_label("Your name").fill("Qamar")
    page.get_by_role("button", name="Create the group").click()
    expect(page.get_by_text("Invite your group")).to_be_visible(timeout=15000)
    code = page.locator("p.num.text-3xl").inner_text().replace("-", "")
    page.get_by_role("button", name="Open the room").click()
    expect(page.get_by_role("heading", name="Options")).to_be_visible()          # the organizer is in, not asked to join
    member = page.context.browser.new_context(viewport={"width": 390, "height": 844}).new_page()
    member.set_default_timeout(15000)
    started = time.time()
    member.goto(BASE + f"/g/{code}", wait_until="networkidle")
    member.get_by_label("Your name").fill("Sara")
    member.get_by_role("button", name="Join").click()
    expect(member.get_by_role("heading", name="Your answers (1 minute)")).to_be_visible()
    assert time.time() - started < 30, "joining took longer than 30 seconds"
    member.get_by_role("button", name="Lakes").click()
    member.get_by_role("button", name=re.compile("Comfort and health")).click()
    member.get_by_label("Altitude makes me unwell").check()
    member.get_by_role("button", name="Save my answers").click()
    expect(member.get_by_text("What the group needs")).to_be_visible()
    page.reload(wait_until="networkidle")
    need = page.locator("section[aria-labelledby=needs-h]").inner_text()
    assert "1 member" in need and "Sara" not in need, need                         # no name next to a health need
    assert "Not medical advice" in need
    page.get_by_role("button", name="Ask the agents for options").click()
    expect(page.locator("article").first).to_be_visible(timeout=40000)
    options = page.locator("article").all_inner_texts()
    assert 2 <= len(options) <= 3, len(options)
    assert any("full day at altitude" in o or "Skips Khunjerab" in o for o in options), "the need did not change the plan"
    assert all("Group match" in o for o in options)
    member.reload(wait_until="networkidle")
    member.get_by_role("button", name="Vote for this").first.click()
    expect(member.get_by_role("button", name="Your vote")).to_be_visible()
    page.reload(wait_until="networkidle")
    page.once("dialog", lambda d: d.accept())
    page.get_by_role("button", name="Confirm this plan").first.click()
    expect(page.get_by_text(re.compile("Final plan: option A"))).to_be_visible()
    expect(page.get_by_role("button", name="Start trip together")).to_be_visible()
    member.context.close()


@check("How the agents decided: recorded run is labelled and every message links to its step")
def decided_recorded(page):
    fresh(page, "/decided?run=recorded")
    expect(page.get_by_text("Recorded run · not live")).to_be_visible()
    expect(page.get_by_text(re.compile("it is not live"))).to_be_visible()
    page.get_by_role("button", name="Show all").click()
    expect(page.get_by_role("heading", name="Where they landed")).to_be_visible()
    items = page.locator("[role=log] ol > li")
    steps = page.get_by_role("link", name="See this step")
    assert items.count() >= 8 and steps.count() == items.count(), (items.count(), steps.count())
    expect(page.get_by_text(re.compile("^Answers Budget Intelligence")).first).to_be_visible()
    steps.nth(3).click()
    expect(page).to_have_url(re.compile(r"/agents\?run=recorded&task="))
    expect(page.get_by_text("What it said in the conversation")).to_be_visible()


@check("How the agents decided: a live run streams messages and ends in a decision")
def decided_live(page):
    fresh(page, "/decided")
    page.get_by_role("button", name="Run the agents live").click()
    expect(page.get_by_text("Live run", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name="Where they landed")).to_be_visible(timeout=30000)
    href = page.get_by_role("link", name="See this step").first.get_attribute("href")
    assert re.match(r"/agents\?run=[0-9a-f]{12}&task=", href), href
    page.get_by_role("link", name="See this step").first.click()
    expect(page.get_by_text("What it said in the conversation")).to_be_visible()


@check("How the agents decided: a failed live run plays the recorded run, clearly labelled")
def decided_fallback(page):
    fresh(page, "/decided")
    page.route("**/api/agents/run**", lambda route: route.abort())
    try:
        page.get_by_role("button", name="Run the agents live").click()
        expect(page.get_by_text(re.compile("The live run didn’t finish"))).to_be_visible()
        expect(page.get_by_text("Recorded run · not live")).to_be_visible()
    finally:
        page.unroute("**/api/agents/run**")


@check("When to go: the plan shows the months that suit every place")
def when_to_go(page):
    plan_hunza(page)
    page.get_by_role("tab", name="Weather and roads").click()
    box = page.locator("section[aria-labelledby=bm-h]")
    expect(box).to_contain_text("suit every place in this plan")
    expect(box).to_contain_text("not a forecast")


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
        page.set_default_timeout(15000)
        for fn in (home, navigation, month_filter, destination_page, seo, form_validation, form_plan, chat_flow,
                   edit_day, tabs, packing, saved_trip, enquiry, admin, network_error, travel_twin, agent_control, saathi, saathi_nudges, saathi_offline,
                   guardian, group_room, decided_recorded, decided_live, decided_fallback, when_to_go,
                   theme, responsive, keyboard):
            fn(page)
        browser.close()
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
    return len(failed)


if __name__ == "__main__":
    sys.exit(main())
