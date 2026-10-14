# VIA V4 — Clickable screen index

Links use node IDs recorded in figma-state.json. Figma destinations were not reverified in this run because the Starter MCP quota is exhausted. This index has not yet been placed on the Figma canvas.

[Design file](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4) | [Flow map](https://www.figma.com/board/dkCXhGLsIC06vcHUgcz2wB)

| Screen | Application route |
| --- | --- |
| [01 — Login](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=7-2) | `/` |
| [02 — Register](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=8-2) | `/register` |
| [03 — Forgot Password](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=10-2) | `/forgot-password` |
| [04 — Reset Password](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=11-2) | `/reset-password` |
| [05 — Home](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=12-2) | `/home` |
| [06 — Form Submit](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=13-2) | `/form-submit` |
| [07 — Profile](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=15-2) | `/profile` |
| [08 — Dashboard](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=18-2) | `/dashboard` |
| [09 — My Forms](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=16-2) | `/my-forms` |
| [10 — Individual Preview](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=17-2) | `/preview/235` |
| [11 — Video Cases](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=20-2) | `/video-cases` |
| [12 — Case Detail](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=21-2) | `/video-cases/00000000-0000-4000-8000-000000000010` |
| [13 — Aggregate Summary](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=23-2) | `/video-cases/00000000-0000-4000-8000-000000000010/summaries/00000000-0000-4000-8000-000000000020` |
| [14 — Aggregate Preview](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=22-2) | `/video-cases/00000000-0000-4000-8000-000000000010/summaries/00000000-0000-4000-8000-000000000020/preview` |
| [15 — Admin](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=24-2) | `/admin` |
| [16 — Role Requests](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=25-2) | `/role-requests?role=user` |

## Role views

- [Case Detail / Member](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=29-2)
- [Role Requests / Admin](https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=30-2)

## Main flows

- Individual: 05 Home → 06 Form Submit → 09 My Forms → 10 Individual Preview → PDF/DOCX when ready.
- Aggregate: 11 Video Cases → 12 Case Detail → 13 Aggregate Summary → 14 Aggregate Preview → PDF/DOCX when ready.
- Access requests: 16 Role Requests (user) → Role Requests / Admin.

Preview captures currently show pending states; ready-state captures and canvas navigation links remain outstanding.

Update: the index is now on the Figma canvas: https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4?node-id=43-2 . Node destinations were reverified through the Plugin API (66 links, no missing targets). Earlier quota notes above describe the previous checkpoint.
