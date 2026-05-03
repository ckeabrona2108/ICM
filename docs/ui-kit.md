# ICM UI Kit

## Visual direction

- Dark premium base (`#060814`-like spectrum)
- Electric accents: blue / cyan / violet
- Glass cards with blur + thin borders
- Rounded corners (`xl`/`2xl`)
- Expressive heading typography via `Space Grotesk`

## Tokens

- Background: `--background`
- Foreground: `--foreground`
- Primary: `--primary`
- Accent: `--accent`
- Border/Input/Ring variables in `globals.css`

## Core components

- `Button`
- `Card` (+ header/content/footer)
- `Input`, `Textarea`, `Select`, `Checkbox`, `Label`
- `Badge`
- `Table`
- `Avatar`
- `Progress`
- `Tabs`

## Motion guidelines

- Subtle page/card entrance with fade+rise
- Sidebar active item motion using shared layout animation
- Avoid over-animating KPI-critical screens

## Responsive principles

- Sidebar fixed from `lg`, compact topbar on mobile
- Dashboard cards stack into single column on small devices
- Tables wrapped in overflow containers
