# Casework design QA

Reference: [Selected option 1](docs/design/casework-reference.png). Implementation: [local desktop screenshot](docs/design/casework-local-desktop.png). Both initial screens were compared together at 1487 × 1058 in a side-by-side browser comparison, rather than relying on separate visual recall.

## Scope and findings

- Layout: matched the white two-column introduction/report layout, central divider, scenario tabs, flat surfaces, blue action and footer. Review and completion use the same typography and tokens.
- Typography: self-hosted Inter for controls and Libre Caslon Display for the headline. Corrected the headline wrap, tracking, summary scale, progress spacing and footer legibility after comparison. The chosen display face differs slightly from the raster reference's unidentified font (P3; no readability impact).
- Colors: replaced all dark/maroon surfaces with white, ink, gray and cobalt. Missing-delivery status retains a separate red semantic cue. Selected, focused, disabled and expanded controls have distinct states.
- Assets: generated transparent wordmark and matching favicon were inspected. No fabricated SVG or CSS logo. Lucide icons remain coherent through actions, evidence and technical details.
- Controls: verified the order combobox expands, shows readable labeled options, supports ArrowDown/Enter, and returns to a collapsed selected state. The two scenario buttons remain native buttons with pressed states and accessible descriptions.
- Responsiveness: inspected the initial screen at 390 and 320 pixels, and the review and About screens at 320 pixels. Read-only DOM checks found no horizontal overflow. Forms stack, navigation stays available, and disclosures keep secondary detail off the initial screen.
- Accessibility: semantic headings, input labels, 44-pixel minimum controls, visible keyboard focus, native dialog semantics and reduced-motion rules retained. Removed the programmatically focused headline's distracting default outline without changing control focus indicators.
- Copy: Casework name is consistent across visible navigation, page title and About copy. Fictional data, template drafting, no customer sending and disabled live AI remain explicit.

Local visual fixtures are read-only and are not evidence of backend mutation correctness. The published application uses the existing PostgreSQL API. The real prepare/edit/save/approve/refresh path and missing-contact blocker passed; see the Casework section of [verification notes](docs/verification.md). Public 320- and 768-pixel layouts and keyboard menu selection were also checked. The live screenshot in the README is separate from the 1487-pixel local comparison.

No open P0, P1 or P2 design findings.

final result: passed
