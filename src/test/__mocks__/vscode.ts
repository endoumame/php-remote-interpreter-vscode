import { vi } from 'vitest';

// --- Configuration mock ---

const configStore: Record<string, any> = {};

const updateFn = vi.fn(async (key: string, value: any, _target?: any) => {
  // Store under the section prefix from getConfiguration call
});

function getConfiguration(section?: string) {
  return {
    get: vi.fn((key: string, defaultValue?: any) => {
      const fullKey = section ? `${section}.${key}` : key;
      return fullKey in configStore ? configStore[fullKey] : defaultValue;
    }),
    update: vi.fn(async (key: string, value: any, _target?: any) => {
      const fullKey = section ? `${section}.${key}` : key;
      configStore[fullKey] = value;
    }),
  };
}

// Helper to set config values in tests
export function __setConfigValue(key: string, value: any) {
  configStore[key] = value;
}

export function __clearConfig() {
  for (const key of Object.keys(configStore)) {
    delete configStore[key];
  }
}

// --- Output channel mock ---

export function createMockOutputChannel() {
  return {
    appendLine: vi.fn(),
    append: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
    replace: vi.fn(),
    name: 'Remote PHP',
  };
}

const mockOutputChannel = createMockOutputChannel();

// --- Window mock ---

const window = {
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showInputBox: vi.fn(),
  showQuickPick: vi.fn(),
  createOutputChannel: vi.fn(() => mockOutputChannel),
  withProgress: vi.fn((_options: any, task: any) => task()),
  activeTextEditor: undefined as any,
};

// --- Workspace mock ---

const workspace = {
  getConfiguration: vi.fn(getConfiguration),
};

// --- Commands mock ---

const registeredCommands: Record<string, (...args: any[]) => any> = {};

const commands = {
  registerCommand: vi.fn((command: string, callback: (...args: any[]) => any) => {
    registeredCommands[command] = callback;
    return { dispose: vi.fn() };
  }),
  executeCommand: vi.fn(async (command: string, ...args: any[]) => {
    const handler = registeredCommands[command];
    if (handler) {
      return handler(...args);
    }
  }),
};

export function __getRegisteredCommand(command: string) {
  return registeredCommands[command];
}

export function __clearCommands() {
  for (const key of Object.keys(registeredCommands)) {
    delete registeredCommands[key];
  }
}

// --- Enums ---

const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

const ProgressLocation = {
  SourceControl: 1,
  Window: 10,
  Notification: 15,
};

// --- ExtensionContext mock ---

export function createMockExtensionContext() {
  return {
    subscriptions: [] as { dispose: () => void }[],
    extensionPath: '/mock/extension/path',
    globalState: {
      get: vi.fn(),
      update: vi.fn(),
    },
    workspaceState: {
      get: vi.fn(),
      update: vi.fn(),
    },
  };
}

// --- Selection / Position ---

class Selection {
  readonly start: Position;
  readonly end: Position;
  readonly isEmpty: boolean;

  constructor(
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number,
  ) {
    this.start = new Position(startLine, startChar);
    this.end = new Position(endLine, endChar);
    this.isEmpty = startLine === endLine && startChar === endChar;
  }
}

class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

// --- Exports matching vscode module shape ---

export {
  window,
  workspace,
  commands,
  ConfigurationTarget,
  ProgressLocation,
  Selection,
  Position,
};

export default {
  window,
  workspace,
  commands,
  ConfigurationTarget,
  ProgressLocation,
  Selection,
  Position,
};
