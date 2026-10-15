# Inviting someone to Starkeep

Sign-up is invite-only: an address can create an account only if it is on the
server's invite list. Two steps, then a message.

## 1. Add their address

On the machine that has `.env.admin.local` (the hosted project's secret key):

```bash
npm run invite -- add friend@example.com
npm run invite -- list          # to see who is invited
npm run invite -- remove friend@example.com
```

Use the address they will actually sign up with (case doesn't matter). Removing
an address stops *new* sign-ups only; an existing account keeps working.

## 2. Send them this

Replace the two addresses first (the web address is your Vercel project's; the
installer link is the same forever, `<owner>` being the GitHub account that owns
the repository).

> Hi! I'd love you to try Starkeep, a focus timer where every session you finish
> becomes a star in your own night sky. I've added your email (friend@example.com) so
> you can make an account.
>
> **On the web (any computer, including a Mac):** https://starkeep.vercel.app
> Make an account with the email above; it sends you a 6-digit code to type in.
> On a Mac you can keep it handy with Safari → File → Add to Dock.
>
> **On Windows, as an app:**
> https://github.com/<owner>/work-timer/releases/latest/download/Starkeep-setup.exe
> Windows may say "Windows protected your PC" the first time. That's because the app
> isn't from a big publisher, not because anything is wrong: click "More info", then
> "Run anyway". After that it updates itself, and tells you when a new version is
> ready (never in the middle of a session).
>
> Your sessions are saved to your account, so the web and the app stay in sync. If
> anything is confusing or broken, tell me which version you're on (it's at the
> bottom of the Account screen).

## If they can't sign up

| They see | Meaning |
|---|---|
| "This email hasn't been invited yet" | The address isn't on the list, or has a typo. `npm run invite -- list`. |
| No code arrives | Check spam first. Then the server's email settings (Gmail SMTP, about 500 emails a day). |
| "That code didn't work" | Codes expire; use "Send a new code". |
| The app says "This build isn't connected to a server" | A build made without the hosted server's address. Shouldn't happen from a release; tell Lucas. |
