# Room Hunt — Professional Free-Launch + Video Gallery Package

## Files
- `index.html` — existing static HTML and video gallery controls.
- `style.css` — existing styling, video controls, and responsive finishing layer.
- `script.js` — application interactions, Supabase listing loading, free-launch access, and video gallery controls.
- `supabase.js` — existing Supabase client setup.

## Included changes
- Room video appears as a thumbnail after property photo thumbnails. Selecting it switches the main gallery display to the video; selecting a photo switches back to the photo. No additional video popup is used.
- Video controls include play/pause, playback speed, download link, Picture-in-Picture (where supported), and fullscreen. Browser support and Storage URL behavior can affect download/PiP.
- Room Hunt contact access, visit requests, and map directions are free during launch; subscription/payment UI does not collect or simulate payments.
- Light Mode is the default unless a saved user theme preference explicitly selects dark mode.
- Responsive layout rules are included for desktop/laptop, tablet, and mobile.
- JavaScript does not generate HTML markup for the gallery; elements are static in `index.html`.

## Run locally
Keep `index.html`, `style.css`, `script.js`, `supabase.js`, and the original `images/` folder together. Open the folder in VS Code and use Live Server. Do not remove the original `images/` folder: the source bundle does not include those assets.

## Important verification notes
- The code expects the `Room Hunt`, `profiles`, and `messages` tables and the `room-images` Storage bucket; verify actual column names, RLS policies, file limits, and chat/visit behavior in Supabase.
- The browser-side Supabase key is a publishable key; security must be enforced with correct Row Level Security policies.
- Login currently uses locally generated demo OTP, not real SMS verification. Do not treat it as production authentication.
- No live browser/device or production Supabase end-to-end test was possible here. Before launch, test login, create/edit/delete listings, photos/video, favourites, chat, visit requests, location, contacts, and video download/PiP on real devices.


## Requested polish update (2026-10-14)
- Prevents rapid repeated Publish clicks by locking the form while a save/upload is in progress and restoring the button afterward.
- Adds a visible video-upload spinner and progress display; large resumable uploads report a percentage where supported. Small standard uploads show an indeterminate spinner because the storage SDK does not expose byte progress for that request.
- Chat header now resolves the other participant's profile image/name from `profiles`; owners see the user's phone under the name and the room title, while users see the owner and room title.
- Header favourites badge shows the number of saved rooms for the current browser profile. This is a personal favourites count, not a global count of all users' likes.
- Refines search focus borders, sidebar hover/active states, header icons, room-detail action button colors, logout confirmation styling, and compact phone/tablet/laptop responsive layouts.
- JavaScript continues to use pre-existing HTML elements; it does not create HTML markup.

## Remaining deployment checks
- The publish lock protects against repeated clicks in one active page session. Cross-device/global idempotency requires a database-level unique idempotency key/constraint and cannot be guaranteed by browser code alone.
- Chat profile names/photos and phone visibility depend on matching `profiles.phone`, `profiles.name`, `profiles.avatar_url`, and the existing `messages` fields (`user_phone`, `user_name`, `owner_phone`, `owner_id`, `room_id`). Confirm RLS allows only the correct participants to read the relevant profile/message records.
- No live Supabase project/device browser test was run from this environment. Test the listed flows in the actual deployment before publishing.
