# Conversation permissions: agreed consumer contract draft

The consumer and Adapter have agreed on the boundary below. This document specifies the interface for parallel work; it does not advertise an implemented capability. Readiness must remain unsupported until authoritative Native option discovery, conversion and submission behavior are verified. No actual user permission is changed by this document or the current read-only investigation.

## Data and authority

`PermissionSelection` is a structured choice, never a raw sandbox/approval policy:

```ts
type PermissionSelection =
  | { kind: 'agent-mode'; mode: string }
  | { kind: 'profile'; profileId: string }
  | { kind: 'server-default' };

interface PermissionSnapshot {
  threadId: string;
  hostId: 'local';
  revision: number;
  phase: 'loading' | 'ready' | 'unsupported' | 'error';
  selection: PermissionSelection | null;
  source: 'thread' | 'host-default' | 'unknown';
  options: readonly {
    selection: PermissionSelection;
    label: string;
    enabled: boolean;
    reason: string | null;
  }[];
  diagnostic: { code: string; message: string } | null;
}
```

Only choices actually produced by Native for the selected conversation may be submitted. The Adapter resolves labels, requirements, model restrictions, custom-profile availability and conversion using Native semantics. Unknown mappings are unsupported, not guessed from a translated label. The source distinguishes an explicit thread choice from a Native host default. No raw config, scopes, manager, callback or runtime workspace paths are exposed.

The Desktop Adapter extends its authenticated read/events/write capabilities with `permissions.get`, a `permissions.changed` event, and `permissions.update`. Reads require `codex.backend.read`; subscriptions use `codex.backend.events`; updates require a separately authenticated `codex.backend.write` API ticket. A UI workspace ticket alone does not authorize settings writes. The first implementation supports the strictly confirmed current local conversation and rejects an unconfirmed/mismatching identity. It must not navigate, resume background threads or open a new connection to satisfy a permissions request.

`permissions.get({threadId,hostId?:'local'})` returns `PermissionSnapshot`. Native changes push a new revision through the existing event mechanism; consumer rerendering does not require a polling loop. The producer removes its listeners when the authenticated owner retires.

`permissions.update({threadId,hostId?:'local',selection,expectedRevision},{signal?})` validates the current selection, authoritative ready options and the supplied revision immediately before dispatch. It converts the selection through Native and uses the existing manager's per-thread settings update path. It changes no host-default preference. A stale revision/selection, unsupported conversion or required-policy mismatch rejects before a write.

```ts
interface PermissionReceipt {
  threadId: string;
  hostId: 'local';
  selection: PermissionSelection;
  status: 'confirmed' | 'staged';
  revision: number;
}
```

`confirmed` requires a verified acknowledgement and Native read-back of the requested thread setting. `staged` means Native accepted the setting for its existing next-turn path without a confirmed server setting update; it must not be presented as durable remote persistence. Cancellation before dispatch makes no write; cancellation after possible dispatch reports `outcome_unknown` rather than success. Native submission must consume the updated per-thread setting without overwriting it with the old host default. That submission path is part of implementation acceptance, not merely a display check.

## Temporary UI replacement

`session.acquireComposerControl({control:'permissions',threadId})` returns an owner-scoped `{container,ready,updateBinding,dispose}` lease. The container is the consumer's Core UI mount point near the strictly bound current Native permission trigger. The lease reversibly masks/disables that trigger; it does not detach/rebuild the editor, copy its draft or modify permission values. Native unrelated model, attachment and send controls remain usable.

`updateBinding({threadId:null})` masks unconfirmed permission contents during navigation; the consumer disables its own control. A confirmed local ID rebinds only after Native input ownership agrees. Native DOM replacement moves/reconciles the owned container through the normal event lifecycle. `dispose()` and owner retirement remove the container/listeners and restore still-owned Native styles/attributes using a journal. The consumer separately unmounts its Core UI root. No window-caption or panel-layout policy belongs to this lease.

The consumer owns the control's placement inside its layout, selected/pending state, menu interaction and the necessary staged/unknown feedback. The Adapter owns Native discovery, normalized options/conversion, authenticated per-thread dispatch, lifecycle and its own performance checks. Neither party initializes all cached thread policies or maintains a per-panel permission cache in the Adapter. Other suitable Core capabilities may still be used directly.

## Implementation gates

The live legacy picker has been proved to bind the correct current conversation. It has no normal thread-only setter injection callback and also writes host defaults, so the consumer will replace the small control instead of forcing experimental flags or undoing global writes. Native's option reducer and mode converter have pure-function candidates. Their inputs must come from current authoritative Native config/model/requirements state; cached Native hook evidence is being checked read-only. Until that evidence and the send-path semantics are established, the APIs and lease above remain a draft and their readiness is not published.
