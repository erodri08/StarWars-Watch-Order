# Star Wars Watchlist Maker

A site for building and tracking a custom Star Wars watch order.
To access, open [Star Wars Watch Order](https://erodri08.github.io/StarWars-Watch-Order/) in your browser


## Pages

| Page | File |
|---|---|
| Main List (All Star Wars Content) | `index.html` |
| The Clone Wars | `cw.html` |
| Star Wars Rebels | `rebels.html` |
| Star Wars Resistance | `resistance.html` |
| The Mandalorian & Book of Boba Fett | `mando.html` |
| The Bad Batch | `bad_batch.html` |

## Features

- Browse chronologically, by release date, or in a **custom drag-and-drop order**
- Filter by vitality, quality, type, era, and **tags** — every entry on every page can be tagged
- Add, edit, or delete entries with the **Edit** button. 
- Hide entries from a watchthrough without deleting them
- Create named watchthroughs per page and track watched progress

## Data

When you edit content through the site (Edit button, tags, add/delete), those changes are saved to your browser's `localStorage` immediately, so they're there next time you open the page. `data.js` itself is untouched until you explicitly update it:

1. On the **Main List** page, click **↓ Download data.js**. This generates a complete, ready-to-use `data.js` — the main list plus every show's episodes, with every edit you've made anywhere on the site (including tags) already merged in.
2. Replace the site's `data.js` with the downloaded file.

Your watchthrough progress, watched status, and custom order are personal
browser data, not in `data.js`

## File structure

```
index.html / cw.html / rebels.html / resistance.html / mando.html / bad_batch.html
style.css
data.js              — stores all content data
js/
├── utils.js          — stateless helpers (escaping, ids, sorting, downloads)
├── storage.js         — localStorage wrapper + save indicator
├── models.js           — Watchthrough / EntryCollection data models
├── components.js        — shared UI: nav, modals, filters, tag editor
├── base-app.js           — shared behavior for both apps below
├── main-app.js             — controls index.html
└── show-app.js               — controls every episode-list page
```

`MainListApp` and `ShowPageApp` both extend `BaseWatchlistApp` and share the same components, so every page behaves the same way. All five show pages load the same `ShowPageApp`; each page just sets a `<title>` and a `--show-color`, and the app figures out which show's data to load from the page's filename.

## Adding a new show page

1. Add a new object to `data.js` shaped like `CW_DATA`, under a new `var` name (e.g. `NEW_SHOW_DATA`).
2. Copy `cw.html` to a new filename; update its `<title>` and `--show-color`.
3. Register the page in `Nav.PAGES` (`js/components.js`) and `ShowPageApp.PAGE_DATA_MAP` (`js/show-app.js`).
