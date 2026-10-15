# Room Hunt final verification checklist

1. Test on phone widths 320, 330, 390, 430 px; heights around 620–670 px where available.
2. Test tablet widths 600, 625, 650 px and laptop widths 1300, 1366, 1400 px.
3. Switch light/dark mode; verify sidebar hover, search input focus, header text and icon badges.
4. Like/unlike several rooms; verify the header heart count follows saved favourites.
5. Rapidly click Publish multiple times; confirm only one in-flight save is started and button returns after success/failure.
6. Upload a small video and a large video; verify spinner, percentage when available, completion and playback.
7. Open a user chat and owner chat; verify the opposite participant photo/name, room title and owner-side user phone.
8. Verify Call, Message, WhatsApp, Favourite, Share, Request Visit and Get Directions.
9. Confirm logout modal styling and both cancel/confirm actions.
10. Check Supabase RLS/storage policies, and test create/edit/delete listings, photos, chat and visit requests using real accounts.
