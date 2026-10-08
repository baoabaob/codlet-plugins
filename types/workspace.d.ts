export type WorkspaceDiagnostic = Readonly<{ code: string; message: string }>;
export interface WorkspaceSnapshot {
  api: 1; revision: number;
  route: Readonly<{ pathname: string; search: string; hash: string }> | null;
  threadId: string | null; hostId: 'local' | null; auxiliary: boolean; available: boolean;
  features: Readonly<{ surface: boolean; activitySlot: boolean; transcript: boolean; shortcuts: boolean }>;
  diagnostic: WorkspaceDiagnostic | null;
}
export interface WorkspaceNode { element: HTMLElement; rect: Readonly<{ x: number; y: number; width: number; height: number; top: number; right: number; bottom: number; left: number }> }
export interface WorkspaceSurface {
  available: boolean; main: WorkspaceNode | null; content: WorkspaceNode | null; scroller: WorkspaceNode | null;
  composer: WorkspaceNode | null; footer: WorkspaceNode | null; header: WorkspaceNode | null; rightPanel: WorkspaceNode | null;
}
export interface SurfaceOptions { hideBody?: boolean; hideHeader?: boolean; hideComposer?: boolean; composerEnabled?: boolean; rightPanelEnabled?: boolean }
export interface TranscriptState { phase: 'loading' | 'ready' | 'error' | 'disposed'; threadId: string; hostId: 'local'; diagnostic: WorkspaceDiagnostic | null }
export interface TranscriptOptions { threadId: string; hostId?: 'local'; readOnly?: boolean; trackReadState?: boolean; onState?: (state: TranscriptState) => unknown }
export interface ScrollPosition { top: number; left: number }
export interface TranscriptHandle {
  ready: Promise<void>; update(options: Partial<TranscriptOptions>): void; dispose(): void;
  getScrollPosition(): ScrollPosition; setScrollPosition(position: ScrollPosition): void;
}
export interface ShortcutOptions {
  id: string; label: string; description?: string; accelerator?: string | null; defaultAccelerator?: string | null;
  onInvoke(): unknown; onChange?: (accelerator: string | null) => unknown;
}
export interface ShortcutSnapshot { id: string; accelerator: string | null; defaultAccelerator: string | null; conflict: string | null }
export interface ShortcutHandle { ready: Promise<void>; getSnapshot(): Readonly<ShortcutSnapshot>; update(options: Partial<Omit<ShortcutOptions, 'id'>>): void; dispose(): void }
export interface WorkspaceSession {
  api: 1; getSnapshot(): Readonly<WorkspaceSnapshot>; subscribe(listener: (snapshot: Readonly<WorkspaceSnapshot>) => unknown): () => void;
  getSurface(): Readonly<WorkspaceSurface>; resolveThreadReference(element: Element): { threadId: string; hostId: 'local' } | null;
  createSlot(name: 'activity.before'): { container: HTMLElement; dispose(): void };
  acquireSurface(options: SurfaceOptions): { update(options: SurfaceOptions): void; dispose(): void };
  mountTranscript(container: HTMLElement, options: TranscriptOptions): TranscriptHandle;
  registerShortcut(options: ShortcutOptions): ShortcutHandle; dispose(): void;
}
export interface WorkspaceOwner { world: 'main'; pluginId: string; generation: number; onDeactivate(dispose: () => void): () => void }
export interface WorkspaceApi { api: 1; connect(context: WorkspaceOwner, ticket: string): WorkspaceSession }
export interface WorkspaceApiDescriptor { api: 1; symbol: 'codlet.codex.ui.workspace.v1'; ticket: string }
export interface LoadedThreadSummary { id: string; title: string | null; cwd: string | null; hostId: 'local'; runtimeStatus: 'running' | 'attention' | 'idle' | 'loading' }
export interface LoadedThreadQuery { limit?: number; cursor?: string; threadId?: string }
export interface LoadedThreadPage { threads: LoadedThreadSummary[]; cursor: string | null }
