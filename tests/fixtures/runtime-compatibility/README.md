# Isolated runtime compatibility acceptance

Use this synthetic consumer with Core's `scripts/desktop-acceptance.mjs` and a
fresh isolated profile. Configure `extraPlugins` to the absolute `consumer`
directory and `probeScript` to the absolute `probe.js` path. The Core runner
requires its opt-in `codlet-desktop-acceptance` binary, verified official client
binaries and an existing registered package context. Use `localApiKeyFixture:
true`; this fixture does not need a real account or submit a model turn.

Complete synthetic onboarding in `fixtureState` when the selected client would
otherwise wait at its fresh-profile welcome screen. For Windows 12246 this used
the observed `electron-persisted-atom-state` settings:

```json
{
  "electron:onboarding-welcome-v2-role-state": {
    "completedConversationalOnboarding": true,
    "conversationalOnboardingSkipped": true,
    "roles": ["engineering"],
    "workMode": "coding"
  },
  "electron:onboarding-projectless-completed": true,
  "home-composer-mode-v1": "work"
}
```

The consumer uses ordinary Core-authenticated RPC to check Desktop readiness,
read tasks, register and click a composer action, open a native page with a
toolbar, request an unsubmitted task draft, and retire its UI leases. The probe
opens the GUI only after completion. Require `phase: complete`, no `error` or
`draftError`, successful individual checks, a visible GUI, ready runtime skill,
zero plugin errors, and normal shutdown in the Core runner's output. Merely
launching successfully is not acceptance. This does not test real sign-in,
MSIX installation, model traffic or user credentials.
