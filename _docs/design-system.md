# Initial design baseline

## Account/discovery extension

Keep the existing visual palette and accessible responsive conventions. #32 uses real Register/Sign in forms, focused actionable feedback, disabled pending submission, cleared passwords and a private once-only recovery save/copy/Continue view. Explicit Legacy group access stays separate. The account page displays actual identity and honest group availability without fake controls. [The enhancement scope](account-discovery-enhancement.md) defines remaining recovery reset, account group switcher, creator controls and All/Added by me tabs. Current account identity is not an arbitrary member selector. Future creator removal needs confirmation and visible retained-history explanation; preview images need safe real sources and stable fallback. Do not claim later screens exist. Owning issues #32–#40 require keyboard and 375px/1280px checks.

Established for [issue #6](https://github.com/xiaodlb/watchnext/issues/6) on October 15, 2026 under the user's delegated design authority recorded in [plan.md](plan.md). These are reasoned implementation choices, **not individually user-approved visuals**. Keep this guide and `app/styles.css` consistent when extending the app.

## Intent

A calm, light interface for shared movie nights: pale neutral background, white content surfaces, dark navy text, and one restrained blue accent. Use real content and clear availability states. Never invent group members, titles, counts, or working actions to fill a screen. User-facing copy describes the product rather than issues, implementation, or frameworks.

## Colors

| CSS token | Value | Use |
| --- | --- | --- |
| `--color-background` | `#f4f6fa` | Page background, quiet labels |
| `--color-surface` | `#ffffff` | Header, content cards, controls |
| `--color-text` | `#17233b` | Headings and primary text |
| `--color-muted` | `#526078` | Supporting text and inactive navigation |
| `--color-border` | `#d8deea` | Decorative separators/card borders, not sole control outlines |
| `--color-accent` | `#1d4ed8` | Links, active navigation, primary controls |
| `--color-accent-soft` | `#eaf0ff` | Active navigation and decorative icon backgrounds |
| `--color-focus` | `#b45309` | Visible three-pixel focus outline |

Use dark text on white/pale surfaces and white text on blue primary controls. Muted text stays readable; do not use pale border gray for text. Active navigation uses background, border, weight, and `aria-current="page"`, not color alone. Focus uses a 3px outline with 4px offset and must remain visible.

## Fixed avatar palette for D14

Later profile work uses this small fixed palette with **white initials**; names remain visible beside avatars so color is never the only identity cue. The entries are tokens already defined in shared CSS, not invented member records.

| Label | Token | Background |
| --- | --- | --- |
| Blue | `--avatar-blue` | `#1d4ed8` |
| Purple | `--avatar-purple` | `#6d28d9` |
| Teal | `--avatar-teal` | `#0f766e` |
| Rose | `--avatar-rose` | `#be123c` |
| Amber | `--avatar-amber` | `#92400e` |
| Slate | `--avatar-slate` | `#475569` |

Each background supports at least 4.5:1 white-text contrast. Color choice UI in #9 must label each choice, retain visible keyboard focus, and expose selection without relying on hue alone. No profile picker is implemented by this baseline.

## Typography and spacing

- System sans-serif stack; no remote fonts or font downloads. Body 1rem, line height 1.6; supporting introductions 1.125rem; labels remain at least 0.75rem.
- One descriptive `h1` per page, fluid from 2.25rem to 3.5rem. Section `h2` runs 1.4rem to 1.8rem. Use logical heading order, with the application name kept in the header as text rather than another heading.
- Use the shared spacing scale: 4, 8, 12, 16, 24, 32, and 48px (`--space-1/2/3/4/6/8/12` at the normal root size). Use rem-based spacing and allow text to wrap.
- Shared shell is at most 70rem, with 24px side gutters on wider screens and 16px on small screens. Main content is bounded to 52rem; introductory prose to 44rem. Cards use the shared 16px radius and responsive padding from 24px to 48px.

## Shell, navigation, and responsive behavior

`app/layout.tsx` owns the header, skip link, main landmark and footer. `Navigation` uses Next links/pathname for `/`, `/watchlist`, `/pick`, `/archive`; subroutes retain their owning non-root destination. Shared page/card/field styles keep real feature screens consistent.

The header places brand and navigation side by side on wide screens. At 46rem and below it stacks them, and navigation wraps into as many rows as needed. No hamburger/menu dependency or hidden navigation exists. Do not hide overflow to mask layout problems. The baseline is checked at 375px and 1280px on all four routes. Keep controls and text unclipped with no horizontal page overflow.

The skip link is first in keyboard order, visible when focused, and targets `#main-content`. The main landmark has `tabIndex=-1` so activating the link moves focus there. Every interactive element keeps a visible focus outline. Navigation touch targets have at least 44px height.

## Reusable controls and states

Shared `.button` and `.field` styles establish 44px minimum height, system typography, 8px corner radius, and visible focus. A field uses a darker outline than decorative cards. Use an actual label with each field; do not make placeholders serve as labels. Use links for navigation and buttons for actions. Disabled buttons are visibly muted with the native disabled attribute; never show an enabled action before its behavior exists.

Delivered pages expose real group/profile/watchlist/detail/picker/archive operations with honest empty/loading/error/success states. The #6 scaffold's historical Not available yet placeholders have been replaced; never reintroduce fake counts or enabled actions without behavior. Describe the user's situation and provide actions that actually work.

No animation is needed for this baseline. Honor reduced-motion preferences when motion is added. Do not remove focus, force fixed heights around text, or introduce per-page palettes and spacing without updating this document.
