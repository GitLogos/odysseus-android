export interface MicrophoneStatus {
  state: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';
  granted: boolean;
}

export interface OdysseusShellPlugin {
  getMicrophoneStatus(): Promise<MicrophoneStatus>;
  requestMicrophone(): Promise<MicrophoneStatus & { restartRequired: boolean }>;
  clearWebData(): Promise<void>;
  setKeepAwake(options: { enabled: boolean }): Promise<void>;
  restartApp(): Promise<void>;
}

export declare const OdysseusShell: OdysseusShellPlugin;
