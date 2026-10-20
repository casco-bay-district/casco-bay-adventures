# Casco Bay Adventures

A searchable map of places Scouting units can camp, hike, boat, fish, or visit: local sites around
Cumberland County, Maine, plus New England lock-ins and High Adventure bases.

It is a plain static website (HTML, CSS, JavaScript; **no build step**) hosted on GitHub Pages and shown
inside the district's Google Site. The location data lives in a Google Sheet, reached through a small
Google Apps Script. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the picture and
[docs/HANDOFF.md](docs/HANDOFF.md) for who owns what and the recurring chores.

## What volunteers do

**Add or fix a location:** open `https://<org>.github.io/casco-bay-adventures/admin/`, sign in with your
name and the district passphrase, and use *Add new* or *Browse & edit*. Changes reach the public site within
about 5 minutes. "Remove" only hides a location; the site maintainer can restore it.

**Suggest a location without the passphrase:** open an issue using the *Suggest a location* template.

## What maintainers do

| I want to... | Edit this |
|---|---|
| Add a program level, adventure type, or amenity to the checklists; change a map icon or color | `js/taxonomy.js` |
| Change the distance bands, the "home" point, the default state, or the page size | `js/config.js` |
| Change colors or fonts | `css/tokens.css` |
| Change how the page looks or behaves | `css/public.css`, `js/public/*.js` |
| Change validation, columns, or login rules | `apps-script/Code.gs` (then redeploy; see HANDOFF) |

Edit files right on github.com (pencil icon), or on your computer. Changes to the `main` branch go live in
about a minute.

## Folder map

```
index.html            public page             admin/index.html     volunteer admin page
js/config.js          settings                js/taxonomy.js       categories and icons
js/util.js            shared helpers          js/public/           the public site's code
js/admin/             the admin page's code   css/                 styles (tokens, base, public, admin)
data/                 saved copy of the data and sample data
apps-script/Code.gs   the backend (lives inside the Google Sheet; kept here for safekeeping)
scripts/, .github/    the automatic saved-copy refresh
vendor/               Leaflet map libraries, included so there is no CDN dependency
```

## Preview on your computer

Browsers block JavaScript modules opened straight from a file, so use a tiny local server:

```
python3 -m http.server 8000
```

Then open <http://localhost:8000/?demo=1>. `?demo=1` loads sample data, so you don't need the backend.

## When something looks wrong

| Symptom | Likely cause and fix |
|---|---|
| Orange "Saved copy" label | The live Sheet couldn't be reached; the site is showing the last copy. Check the Apps Script deployment (HANDOFF). |
| Error: no locations | Both the Sheet and the saved copy failed. Run the *Refresh location snapshot* workflow, then check the Apps Script. |
| A location is missing from the map | Its latitude/longitude is blank or invalid. It still shows in the admin Browse list, marked "needs a map pin". |
| Admin says "session expired" | Sign in again; sessions last 8 hours. |
| Admin says "Too many incorrect attempts" | Wait 15 minutes. |
| Changed code but the site looks the same | Hard-refresh the browser; Google Sites can take a few minutes to show new content. |
