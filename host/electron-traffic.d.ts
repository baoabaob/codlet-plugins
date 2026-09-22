/** Install via the Native verified main-process bootstrap BEFORE app readiness. */
export declare function installElectronTraffic(electron: { app: unknown; session: unknown }, configuration: {
  proxyUrl: string;
  caPem: string;
  originalProxy?: { mode: string; proxyRules?: string; proxyBypassRules?: string; pacScript?: string };
}): Readonly<{
  ready(): Promise<{ installed: boolean; configuredSessions: number; available: false; reason: string }>;
  inspect(): { installed: boolean; configuredSessions: number; available: false; reason: string };
  close(): Promise<void>;
}>;
