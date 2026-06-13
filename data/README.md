# Projects data

Edit `projects.json` to add, remove, or reorder cards on the homepage.
The homepage reads this file at runtime, so `index.html` does not need to change.

Each project can have any combination of links.
Known link types `page`, `source`, and `youtube` get matching icons automatically:

```json
{
  "title": "Project name",
  "description": "Short card description",
  "preview": "previews/project.gif",
  "fallbackPreview": "previews/project.svg",
  "tags": ["SNN", "simulation"],
  "links": [
    {
      "type": "page",
      "label": "Page",
      "url": "project/index.html",
      "primary": true
    },
    {
      "type": "source",
      "label": "Source",
      "url": "https://github.com/BelkinAndrey/project"
    },
    {
      "type": "youtube",
      "label": "YouTube",
      "url": "https://youtube.com/watch?v=..."
    }
  ]
}
```

`primary: true` controls which link is used by the preview image and project title.
If no link is marked primary, the first `page` link is used, then the first available link.
