# Workspace API 1

Status: stable consumer contract for `codex.ui.workspace@1` (target scope), provided by Codex UI Adapter. Consumers declare this capability, `ui.dom`, and `ui.mainWorld`, run in the main world, and use Core UI API 2 for their own controls. Layout, selection policy, dragging, caching, tooltips, persistence and navigation belong to the consumer. Desktop metadata, navigation and events remain in the Desktop Adapter.

Provider versions: UI Adapter 0.1.11 and Desktop Adapter 0.2.16. The [current acceptance record](spec/workspace-review.md) separates Windows evidence, inferred platform behavior, test fixtures, candidate packages and the unchanged official registrations.

```js
const capability = { name: 'codex.ui.workspace', api: 1, scope: 'target' };
const { api, symbol, ticket } = await context.rpc.request(capability, 'getApi', {});
if (api !== 1) throw new Error('Unsupported workspace API');
const workspace = globalThis[Symbol.for(symbol)].connect(context, ticket);
const unsubscribe = workspace.subscribe(snapshot => { /* snapshot changed */ });
const slot = workspace.createSlot('activity.before');
// slot.container is an owned HTMLElement. Render Core UI into it.
```

The descriptor contains only `{api:1,symbol,ticket}`. The symbol is `codlet.codex.ui.workspace.v1`. Tickets expire after 15 seconds, are single use, and bind the authenticated RPC caller's plugin ID and renderer generation. `connect` synchronously returns a frozen owner-scoped session. Sessions, subscriptions and handles retire on consumer deactivation, provider deactivation or replacement. `dispose()` is idempotent. A retired method throws `workspace_retired`; invalid or expired tickets throw `api_ticket_retired`. No client modules, export names, React fibers, providers or manager objects are public.

## Snapshot and surface

`getSnapshot()` synchronously returns a frozen value:

```ts
interface WorkspaceSnapshot {
  api: 1;
  revision: number;
  route: { pathname: string; search: string; hash: string } | null;
  threadId: string | null;
  hostId: 'local' | null;
  auxiliary: boolean;
  available: boolean;
  features: { surface: boolean; activitySlot: boolean; transcript: boolean; shortcuts: boolean };
  diagnostic: { code: string; message: string } | null;
}
```

`subscribe(listener)` invokes `listener(snapshot)` immediately, then after route, availability or semantic surface changes, including resize. It returns an unsubscribe function. Listener failures are diagnosed and do not break other owners. `available` describes the main workspace; individual feature availability is separate. Auxiliary windows report `auxiliary:true`, `available:false`, and do not initialize main-workspace modules.

`getSurface()` synchronously returns `{available, main, content, scroller, composer, footer, header, rightPanel}`. Every role is either `null` or `{element:HTMLElement,rect:{x,y,width,height,top,right,bottom,left}}`. `main` is the main AppShell surface; `content` contains the native thread body and footer; `scroller` is the primary thread scroll container; `composer` is its composer root; `footer` contains that composer; `header` is the main titlebar; `rightPanel` is the native right resource panel. There is no fiber or provider data. Nodes and geometry are ephemeral: read them again after a snapshot change. An unopened optional panel is `null`. Ambiguous or unknown host structure reports a diagnostic and returns an unavailable surface, rather than selecting another pane.

`resolveThreadReference(element)` synchronously returns `{threadId,hostId:'local'}` or `null`. It accepts an Element from this document, resolves a native sidebar thread row through bounded mounted ancestry, and rejects main content, plugin nodes, remote/cloud entries and ambiguous identities. It performs no navigation or history loading. The consumer owns pointer handling and dragging.

The Desktop Read API adds `threads.loaded({limit?:number,cursor?:string,threadId?:string})`, returning `{threads,cursor}`. Each summary is `{id,title,cwd,hostId:'local',runtimeStatus:'running'|'attention'|'idle'|'loading'}` without turns, items or manager objects. Limit defaults to 20 and is at most 100. A specific `threadId` returns only that cached summary or an empty array; it does not load it. Cursors are opaque and tied to a bounded snapshot. The existing Desktop Events API emits `thread.summary.changed` with `{threadId,thread:summary|null}` only when that thread's projection changes; consumers update that entry. Unchanged streaming tokens do not emit summary changes.

## Owned activity slot

`createSlot('activity.before')` synchronously returns `{container,dispose}`. The container is an owned span placed immediately before the native activity control, outside its interactive node. It is created even when the outlet is pending and reattaches when that outlet remounts. The consumer may render its own Core UI into this container and must dispose its rendering root. Other names throw `invalid_argument`. At most 8 slots per session are allowed.

## Temporary native surface control

`acquireSurface(options)` synchronously returns `{update,dispose}`. Options are:

```ts
interface SurfaceOptions {
  hideBody?: boolean;          // default false; preserves the composer footer
  hideHeader?: boolean;        // default false
  hideComposer?: boolean;      // default false; hides the footer
  composerEnabled?: boolean;  // default true
  rightPanelEnabled?: boolean;// default true
}
```

`update(partialOptions)` merges the specified fields. Suppression uses visibility, inert and aria-hidden without removing native nodes or changing layout. Multiple leases compose: any hide request hides; any disabled request disables. Only properties changed by this adapter are restored, including exact inline values/priorities and original attribute presence. If another owner changed a property meanwhile, disposal preserves that newer value. Navigation restores the previous nodes and applies the lease to the new surface. Non-conversation pages receive no conversation patches. The consumer decides when to release or change the lease. At most 8 leases per session are allowed.

## Native transcripts

```js
const transcript = workspace.mountTranscript(container, {
  threadId, hostId: 'local', readOnly: true, trackReadState: false,
  onState(state) { /* loading / ready / error / disposed */ }
});
await transcript.ready;
transcript.update({readOnly:false,trackReadState:true});
transcript.dispose();
```

`mountTranscript(container, options)` synchronously returns `{ready:Promise<void>,update,dispose,getScrollPosition,setScrollPosition}`. After `ready`, `getScrollPosition()` returns `{top,left}` and `setScrollPosition({top,left})` restores finite CSS offsets (including negative offsets used by reverse scrolling and RTL) in this handle's independent native scroller. The consumer never needs a private selector. The container must be a connected, empty HTMLElement in this document, owned by the consumer; native surface nodes and shared mount containers are rejected. `threadId` is required (8–256 letters, digits, underscores or hyphens), `hostId` defaults to and only accepts `'local'`, `readOnly` defaults to `true`, and `trackReadState` defaults to `false`. `onState` is optional. State is `{phase,threadId,hostId:'local',diagnostic:null|{code,message}}`. `ready` resolves after native rendering is committed; failure rejects it and emits `phase:'error'`. Consumers should catch the promise. `update(partialOptions)` changes flags/callback or rebinds a new thread; it is synchronous and reports asynchronous failures through `onState`. Native component errors are contained and diagnosed.

The adapter owns provider reconstruction, native history loading, active-interest and stream lifecycle through the existing local Desktop manager, and an independent scroll container. It does not open a second backend connection or implement a composer in the transcript. Scroll position within a handle is preserved on flag updates; caching scroll positions across disposed handles is the consumer's responsibility. Read-only disables transcript interaction; it does not choose or navigate the main thread. At most 16 transcripts per session are allowed.

History reads are deduplicated by thread and at most two queued reads start concurrently, with interactive/visible mounts first. Retirement cancels queued work and prevents late native roots, callbacks or commits. An already dispatched shared Native history read can finish under Native's ownership; the current manager does not expose an independent abort for that shared read.

Flag-only updates retain `phase:'ready'`, providers, native thread subscription, scope value, root and scroll identity. Updates across owners are combined in one microtask and use Native React's scheduled commits. Only initial mounting or thread/provider rebinding requires a synchronous initial commit. Readiness requires a loaded native thread and a committed conversation body, with rendered content when that thread has history; an empty scroll element alone does not qualify. Current Windows Native requires a separate native thread-subscription component beside Content; the adapter discovers and mounts it privately.

The Target also limits total transcripts to 32 and shortcuts to 64. Semantic changes are batched by frame in visible web documents and by microtask in hidden documents: current Native UIKit can display a foreground window backed by a Chromium document whose visibility remains hidden. No periodic polling or synthetic clock advancement is used.

## Native shortcut settings

```js
const shortcut = workspace.registerShortcut({
  id: 'toggle', label: 'Toggle workspace', description: 'Open or close the workspace',
  accelerator: 'CmdOrCtrl+Shift+S',
  onInvoke() { /* consumer action */ },
  onChange(accelerator) { /* persist string or null */ }
});
await shortcut.ready;
```

`registerShortcut(options)` synchronously returns `{ready:Promise<void>,getSnapshot,update,dispose}`. IDs are 1–64 letters, digits, underscores, dots or hyphens and unique within a session. Native command IDs are namespaced by authenticated owner. Labels are nonempty, at most 128 characters; descriptions are at most 512 characters. `accelerator` is a single native accelerator string (at most 128 characters) or `null`; it is also the restore default unless `defaultAccelerator` is supplied. Sequences and bare modifiers are unsupported. `onInvoke` is required; `onChange` is optional. `getSnapshot()` returns `{id,accelerator,defaultAccelerator,conflict:null|string}`. `update(partialOptions)` accepts the registration fields except `id`; it merges fields, rerenders the native row and changes the effective binding. Binding conflicts throw `shortcut_conflict` for programmatic changes and appear in the native capture control for user edits.

Rows appear in the official keyboard-shortcut settings and follow its search, capture, conflict validation, clear and restore interactions. Clearing emits `onChange(null)`, restoring emits the default binding, and editing emits the accepted accelerator. Callback promises are handled and failures diagnosed. Shortcuts are ignored during capture and modal text entry according to the native command policy. Platform comes from the actual client navigator identity used by Native's detector; Windows is the current acceptance platform. macOS mappings may be derived from native contracts but are not claimed as tested. The adapter stores no consumer shortcut preferences and supplies no tooltip. At most 16 shortcuts per session are allowed.

## Errors and compatibility

`invalid_argument`, `invalid_owner`, `resource_limit`, `workspace_retired`, `api_ticket_retired`, `workspace_host_pending`, `workspace_host_drift`, `workspace_transcript_unavailable`, `workspace_shortcuts_unavailable`, and `shortcut_conflict` are stable error categories. More specific structural discovery diagnostics may accompany snapshots and transcript state. A pending route can recover. Unknown structures fail closed and do not silently use a fixed resource hash, a guessed export, or a hard-coded shortcut platform.

All handles and callbacks are owned by their session. Consumers should release handles explicitly when their feature closes and call `workspace.dispose()` on teardown; Core deactivation is the final cleanup boundary. Main-world plugins already have privileged client access; the ticket scheme enforces Core declaration and lifecycle ownership, and is not an OS security sandbox.
