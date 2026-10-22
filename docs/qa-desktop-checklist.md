# Desktop checks a person does by eye

The automated desktop tests (`npm run e2e:desktop`, `npm run e2e:update`) prove
the app *asks* Windows for the right thing at the right moment: the tray
tooltip text, the completion notification, hiding to the tray, the startup
entry, the update notice. They can't see what Windows actually draws. Before a
release that touches any of these, take five minutes with the real installed
app (or `npm run tauri:dev`):

## Tray

- [ ] The Starkeep icon is in the notification area, crisp, not a blank square.
- [ ] Hovering it during a session shows "Starkeep — N min left", and the
      number goes down by the minute.
- [ ] Left click brings the window back; right click shows "Open Starkeep" and
      "Quit", and both work.

## Notification

- [ ] At the end of a session (try the 1-minute dev preset in `tauri:dev`) a
      Windows toast appears: "Starkeep", "Session complete — 1 minute of focus."
- [ ] It appears with the window closed to the tray, and with it minimised.
- [ ] With Focus Assist / Do Not Disturb on, Windows holds it: expected, not a bug.

## Window

- [ ] Closing the window with its X hides it to the tray; a running session
      keeps counting, and reopening shows the result if it finished meanwhile.
- [ ] "Pop out" opens the mini timer, always on top, and it closes cleanly.

## Startup

- [ ] "Launch at startup" on, then sign out of Windows and back in: Starkeep
      starts in the tray. Turn it off again if you don't want it.

## Update

- [ ] After a real release: the installed app shows "Starkeep X.Y.Z is ready"
      between sessions (never during one), and "Restart to update" installs it
      without a SmartScreen warning.
