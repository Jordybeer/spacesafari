# Mobile map UX

## Telegram group behavior

The `/map` command may be used directly inside a Telegram group or supergroup. The bot sends a direct Main Mini App link with an opaque `room_...` start parameter. Telegram direct-link Mini Apps retain the current chat context (`chat_type` / `chat_instance`), while the server also has the opaque room token as a deterministic fallback.

The Mini App header is still rendered by Telegram as the bot/app name. That does **not** mean the room is a private bot chat. The UI intentionally labels the active mode as `Groepskaart` instead of exposing the opaque room token.

## iOS layout

The app no longer requests fullscreen automatically. It expands inside Telegram and consumes Telegram's content-safe-area insets, avoiding overlap with Telegram chrome / Dynamic Island on iOS.

## Mobile hierarchy

The live map is now the first screen. The previous extra landing card and second `Open festivalkaart` tap are removed. Technical room IDs and the large calibration warning are removed from the primary view. Location sharing is one primary action plus an optional live-update switch. Admin calibration is collapsed behind a details panel.
