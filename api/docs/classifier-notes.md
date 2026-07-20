# Classifier design notes — grounded in the real inbox

These come from inspecting a real job-seeker inbox (July 2026), not guesses.
They drive the classifier design.

## Finding 1 — the sender domain is the strongest signal

Real application emails almost all arrive from an ATS (Applicant Tracking
System), not from the company directly. Observed in the inbox:

| ATS domain             | Example subject                                   |
| ---------------------- | ------------------------------------------------- |
| `ashbyhq.com`          | "n8n \| We've received your application"          |
| `hire.lever.co`        | "Thank you for applying to Theodo!"               |
| `hire.eu.lever.co`     | "VW Group \| Rahma, it's not the end of the road" |
| `smartrecruiters.com`  | "Merci pour votre candidature !"                  |
| `join.com`             | "Your application at Local Brand X GmbH"          |
| `emply.com`            | "Your application to LINK Mobility"               |
| `meteojob.com`         | job-board *alerts* — NOT applications (noise)     |

Design consequence: step 1 of the classifier is "is the sender a known ATS?".
A curated allow-list of ATS domains beats keyword matching for deciding whether
an email is job-related at all.

Careful: `meteojob.com` and LinkedIn `jobalerts-noreply@` are job-*adjacent* but
are listings/alerts, not the user's own applications. They must be excluded.

## Finding 2 — bilingual content (FR + EN)

The same inbox mixes French and English:
"Merci de votre candidature" / "Thank you for applying".
Every keyword list must carry both languages.

## Finding 3 — three clear inbound classes (+ derived GHOSTED)

- ACKNOWLEDGED (auto-ack): "we've received your application", "thank you for
  applying", "merci pour votre candidature", "application received".
- REJECTED: often softened — "it's not the end of the road", "we decided to move
  forward with other candidates", "malheureusement". Keyword "unfortunately"
  alone is not enough.
- INTERVIEW: "schedule", "interview", "entretien", "disponibilités", "call".
- A human `Re:` reply from a real person (e.g. `marion@vigie.co`,
  "Re: Votre candidature chez Vigie") is a strong INTERVIEW/real-contact signal.

## Finding 4 — company name is in the subject

"Thank you for applying to **TomTom**" -> company = TomTom -> companyKey =
`tomtom`. Patterns: "applying to X", "application to X", "candidature chez X",
"X | ...". The ATS domain confirms it's an application; the subject yields the
company.

## Finding 5 — confidence, not certainty

Softened rejections and unknown formats mean the classifier will sometimes be
unsure. Store a confidence score (schema already has `confidence`) so low-
confidence calls can be reviewed instead of silently trusted.
