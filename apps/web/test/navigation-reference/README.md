# Frozen approved native-navigation reference data

These 29 inert HTML views and two stylesheets were authored independently before the consumer implementation, then provisionally approved in `74f2c4b45b21efeac5931060db97b232d815dd90` (`docs/design/design.md#owned-conversation-navigation-and-history`). They reuse r73/r74/r85 primitives. Their historical Draft page titles do not grant or retract approval; the tracked approval record owns that decision.

The original ignored r1 HTML/CSS bundle was verified at SHA-256 `490d4ca78ebb0db5e46d3c5cf314c5ece0c69f88f8adbc59a424631ffe5b5e7f` before these files were frozen. This folder preserves the copied file bytes. Runtime verification loads only these tracked candidates and the existing tracked design references, never ignored previews, screenshots or production markup/styles.

`navigation-reference.ts` records two reference compositions required by the binding guide: reuse existing approved Auth Session notice colours/action spacing, and constrain desktop long-title grid tracks so the required sidebar ellipsis actually applies. The frozen exploratory files remain unchanged. Both corrections, original failures and independent reference hashes are explicit in the evidence; there are no masks, tolerance, retries or baseline-acceptance mode.

These are presentation-only fixtures with fictional content, not native persistence, Auth or provider evidence. Production Vite does not load this folder or the test-only reference-serving plugin. See `docs/native-conversation-navigation.md` for runtime qualification and remaining delivery gates.
