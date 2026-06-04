# Star Wars Watchlist Maker

A html app to create a watch order for all star wars content

## Access

- open `https://erodri08.github.io/StarWars-Watch-Order/` in your browser

## Features

### Main List
- Browse all Star Wars content (movies, TV, games) in chronological or release order, or drag-and-drop into a **custom order**
- Filter by vital/skippabl, type, quality, and era (George Lucas vs. post-George)
- Add new entries or edit existing ones via the Edit button when new star wars projects come out 

### Clone Wars Episodes
- Full chronological episode list with vitality and quality ratings
- Add **custom tags** to episodes (e.g. `anakin`, `maul`) via the Edit button — tags appear inline and become filterable in the filter bar
- Edit vitality, quality, and notes per episode

### Watchthroughs
- Create named watchthroughs to track progress independently (e.g. "First Watch", "Rewatch 2025")
- Check off items as you watch and the progress bar updates automatically
- Main list and Clone Wars list have separate watchthroughs
- Delete a watchthrough to reset its progress

## Updating Content

The content data is inlined into `data.js` for compatibility with local file browsing. If you edit the JSON files in `data/`:

```
python3 generate_data.py
```

Then refresh the browser. Requires Python 3 (no dependencies).

## File Structure

```
starwars/
├── index.html              # Open this in your browser
├── style.css
├── app.js
├── data.js                 # Auto-generated — don't edit directly
├── generate_data.py        # Run to regenerate data.js after JSON edits
└── data/
    ├── starwars_content.json       # Main content list
    ├── clone_wars_episodes.json    # CW episode list
    ├── project_info.json           # Title, subtitle, labels
    ├── watchthroughs.json          # Template (actual data in localStorage)
    └── user_data.json              # Template (actual data in localStorage)
```
