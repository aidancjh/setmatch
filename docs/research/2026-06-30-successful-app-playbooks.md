# What the biggest social/activity apps did — and what Coterie should copy

Research date: 2026-06-30. Reference for future feature work (features themselves
are deferred; this doc captures the "how and what they did" so we can adapt the
applicable parts later). Sources listed at the bottom.

The four most relevant giants for a social, location-based, recurring-activity
app like Coterie: **Strava** (social fitness), **Meetup** (organized real-world
events), **Duolingo** (habit/retention via gamification), and the sports-org
incumbents (**TeamSnap/Spond**). Below: what each did, *why* it worked, and the
concrete, replicable tactic for Coterie.

---

## 1. Strava — "come for the tool, stay for the network"

**What they did**
- Built standalone *individual* value first (GPS tracking, performance metrics,
  route planning, goals). It was useful even if you were the only user.
- *Then* layered social on top: **Kudos** (positive-only reactions — no
  downvotes, which kept the network encouraging and troll-free; 7.1B+ kudos/yr),
  **Segments** (leaderboards for stretches of road/trail — "King/Queen of the
  Mountain" — persistent competition), **Clubs** (let existing real-world groups
  have an online home; club members are 2x+ as likely to log weekly activity),
  and **Challenges**.
- Seeded community by hand: founders literally drove vans to races to help
  athletes upload data, recruited local ambassadors, and leaned on communities
  that *already existed* (cycling clubs) rather than building from scratch.
- Inclusive repositioning: "If you sweat, you're an athlete."

**Why it worked**
"Come for the tool, stay for the network." Utility removes the cold-start
problem; the social layer creates the retention + viral flywheel. Positive-only
social reactions removed the main reason social feeds turn toxic.

**Copy into Coterie**
- Coterie already has the "tool" (find/host games) and reviews. The missing
  flywheel pieces: **Kudos-style positive-only reactions** on highlights/games,
  **Clubs** (a real volleyball crew gets a persistent home + recurring games),
  and **leaderboards/segments analog** (most games played at a venue, most
  reliable players, a weekly "court leaderboard").
- Lean on existing crews: make it trivial for an organizer to bring their whole
  WhatsApp group over (invite links, "claim your regulars").

---

## 2. Meetup — organizer tools + RSVP/waitlist + recommendations

**What they did**
- Powerful *organizer* tooling: guided event creation with best-practice tips,
  attendee limits that auto-activate a **waitlist**, **custom RSVP questions**,
  paid/ticketed RSVPs, and **real-time check-in** (attendance taken in-app,
  opening 1h before start; mark present/absent, keep records).
- **Event chat** for RSVP'd attendees (reply, edit/delete, emoji reactions,
  photo/file sharing).
- **Reviews/ratings on groups** — members are "significantly more likely to RSVP
  when they can see a group's ratings and reviews."
- **Personalized recommendations** ranked by location, timing, popularity, and
  topic alignment → higher RSVP rates.
- Growth insight: fastest-growing groups host **regularly (weekly)** and mix
  in-person + online — frequency builds the habit.

**Why it worked**
The organizer is the high-leverage user. Make hosting easy and hosts create the
supply that everyone else consumes. Social proof (reviews) + recommendations
convert browsers into RSVPs.

**Copy into Coterie**
- Coterie has join + waitlist + host reviews already; Phase 4 adds host roster
  management + recurring series + reminders — this *is* the Meetup organizer
  playbook. Next: **real-time check-in / attendance**, **recommended games**
  (rank by location + skill + timing), and **custom RSVP questions** (e.g.
  "bringing a ball?").
- Nudge hosts toward **weekly recurring games** (Phase 4 series) — frequency is
  the retention driver.

---

## 3. Duolingo — retention as an engineering discipline

**What they did**
- Picked one core behavior (one lesson/day) and made *everything* push toward it.
- Built a **growth model** that bucketed users (new / current / reactivated /
  resurrected / at-risk / dormant) and tracked movement between buckets.
  Sensitivity analysis found **Current User Retention Rate (CURR)** had ~5x the
  DAU impact of any other metric → made it the North Star, dedicated a team to
  it, reduced daily churn 40%+, drove 4.5x DAU.
- **Streaks** + forgiveness (streak freezes/repairs) so one bad day doesn't nuke
  months. Reaching a **10-day streak** sharply reduced drop-off.
- **Streak-saver notification** (late-night "you're about to lose your streak")
  was their first big win. Rule: **"protect the channel"** — don't spam; optimize
  timing/copy/localization with bandit algorithms instead of raising frequency.
- **Leagues/leaderboards** (weekly, matched by engagement level, auto-enrolled)
  → +17% learning time; tripled the most-engaged cohort.
- Everything A/B tested; "big breakthroughs + fast optimizations."

**Why it worked**
Retention compounds. Each return makes the next return more likely. Gamification
works only when it reinforces the core behavior (copying a mechanic blindly fails
— "why does this work there, will it translate?").

**Copy into Coterie**
- Core behavior for Coterie = **play a game** (and secondarily, host one).
- **Streaks**: "weeks in a row you played." Forgiveness: a freeze if you had no
  game available near you.
- **Notifications done right**: Phase 4 reminders are the foundation; add a
  streak-saver ("you haven't played this week — 3 games near you this weekend"),
  but protect the channel (few, well-timed, opt-out-able).
- **Leaderboards**: weekly games-played / reliability, matched within a city or
  skill tier.
- **Retention buckets**: even a lightweight version (who played this week vs
  lapsed) tells us where to focus.

---

## 4. TeamSnap / Spond — the sports-org incumbents

**What they did**
Roster management, availability tracking ("who's coming"), scheduling, group +
push + SMS messaging, lineups, photo sharing, stats, and payment/invoicing — all
in one place. 24M+ users.

**Copy into Coterie**
Coterie + Phase 4 already cover roster, scheduling, messaging, reminders. The
incumbent gaps to consider later: **availability tracking** (a recurring crew
marks who's in for the next session before a game is even created) and the
deliberately-deferred **payments** (court fees split among players).

---

## The general app-development loop these teams run

1. **Solve one real problem well** (the "tool") before adding the network/social.
2. **Instrument everything** — define a North Star (Duolingo's CURR) and a user
   lifecycle model; let data pick the lever.
3. **Ship in small experiments**, A/B test, keep the wins, kill the rest.
4. **Protect trust channels** — notifications and social tone are finite
   resources; optimize quality, not volume.
5. **Make the high-leverage user (the organizer/host) successful** — they create
   the supply.
6. **Close the loop with the community** (Strava's Ideas board → quarterly
   "Mixtape") so users tell you what to build.

---

## Recommended sequencing for Coterie (when features resume)

Cheapest-to-build, highest-retention first:
1. **Gamification/retention layer** — streaks, games-played stats, badges,
   weekly leaderboard. Self-contained, no external deps. (Duolingo + Strava)
2. **Smarter notifications** — streak-saver + recommended games on top of Phase 4
   reminders, with strict frequency caps. (Duolingo)
3. **Attendance / check-in + reliability score.** (Meetup)
4. **Clubs / regular crews** — persistent home + availability for recurring
   groups. (Strava clubs + TeamSnap availability)
5. **Map discovery + recommendations.** (needs maps API key/cost)
6. **Payments** — only if there's real demand; heaviest lift. (deferred)

## Sources
- Strava: https://community.inc/deep-dives/community-growth-strava ,
  https://www.strivecloud.io/blog/app-engagement-strava
- Meetup: https://www.meetup.com/blog/16-recent-meetup-improvements-you-might-have-missed/ ,
  https://help.meetup.com/hc/en-us/articles/9389668230541-Manage-attendees-and-track-attendance-for-your-Meetup-event-on-the-web
- Duolingo: https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth ,
  https://trophy.so/blog/duolingo-gamification-case-study
- TeamSnap: https://www.teamsnap.com/teams/features
