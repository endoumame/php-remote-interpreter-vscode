import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  window,
  commands,
  __setConfigValue,
  __clearConfig,
  __getRegisteredCommand,
  __clearCommands,
  createMockExtensionContext,
} from './__mocks__/vscode';
import { Client } from './__mocks__/ssh2';

vi.mock('ssh2', () => ({ Client }));

import { activate, deactivate } from '../extension';

describe('extension', () => {
  beforeEach(() => {
    __clearConfig();
    __clearCommands();
    vi.restoreAllMocks();
    window.showInputBox.mockReset();
    window.showQuickPick.mockReset();
    window.showInformationMessage.mockReset();
    window.showWarningMessage.mockReset();
    window.showErrorMessage.mockReset();
    window.activeTextEditor = undefined;
  });

  describe('activate', () => {
    it('should register all 5 commands', () => {
      const context = createMockExtensionContext();
      activate(context as any);

      expect(commands.registerCommand).toHaveBeenCalledTimes(5);
      expect(commands.registerCommand).toHaveBeenCalledWith('remotePhp.configureServer', expect.any(Function));
      expect(commands.registerCommand).toHaveBeenCalledWith('remotePhp.selectServer', expect.any(Function));
      expect(commands.registerCommand).toHaveBeenCalledWith('remotePhp.runFile', expect.any(Function));
      expect(commands.registerCommand).toHaveBeenCalledWith('remotePhp.runSelection', expect.any(Function));
      expect(commands.registerCommand).toHaveBeenCalledWith('remotePhp.testConnection', expect.any(Function));
    });

    it('should push disposables to context subscriptions', () => {
      const context = createMockExtensionContext();
      activate(context as any);

      expect(context.subscriptions).toHaveLength(5);
      context.subscriptions.forEach((sub) => {
        expect(sub).toHaveProperty('dispose');
      });
    });
  });

  describe('remotePhp.configureServer command', () => {
    it('should call configureServer when triggered', async () => {
      const context = createMockExtensionContext();
      activate(context as any);

      window.showInputBox.mockResolvedValue(undefined);

      const handler = __getRegisteredCommand('remotePhp.configureServer');
      await handler();

      expect(window.showInputBox).toHaveBeenCalled();
    });
  });

  describe('remotePhp.selectServer command', () => {
    it('should set default server after selection', async () => {
      const context = createMockExtensionContext();
      activate(context as any);

      __setConfigValue('remotePhp.servers', [
        { name: 'srv1', host: '10.0.0.1', username: 'user1' },
        { name: 'srv2', host: '10.0.0.2', username: 'user2' },
      ]);

      window.showQuickPick.mockResolvedValue({
        label: 'srv1',
        server: { name: 'srv1', host: '10.0.0.1', port: 22, username: 'user1', phpPath: 'php', remoteTmpDir: '/tmp' },
      });

      const handler = __getRegisteredCommand('remotePhp.selectServer');
      await handler();

      expect(window.showInformationMessage).toHaveBeenCalledWith('Default server set to "srv1".');
    });

    it('should do nothing when selection is cancelled', async () => {
      const context = createMockExtensionContext();
      activate(context as any);

      __setConfigValue('remotePhp.servers', [
        { name: 'srv1', host: '10.0.0.1', username: 'user1' },
        { name: 'srv2', host: '10.0.0.2', username: 'user2' },
      ]);
      window.showQuickPick.mockResolvedValue(undefined);

      const handler = __getRegisteredCommand('remotePhp.selectServer');
      await handler();

      expect(window.showInformationMessage).not.toHaveBeenCalled();
    });
  });

  describe('remotePhp.runFile command', () => {
    it('should use default server when configured', async () => {
      const context = createMockExtensionContext();
      activate(context as any);

      __setConfigValue('remotePhp.servers', [
        { name: 'default-srv', host: '10.0.0.1', username: 'user', port: 22, phpPath: 'php', remoteTmpDir: '/tmp' },
      ]);
      __setConfigValue('remotePhp.defaultServer', 'default-srv');

      window.activeTextEditor = undefined;

      const handler = __getRegisteredCommand('remotePhp.runFile');
      await handler();

      expect(window.showErrorMessage).toHaveBeenCalledWith('No active editor.');
      expect(window.showQuickPick).not.toHaveBeenCalled();
    });

    it('should prompt for server selection when no default is set and multiple servers', async () => {
      const context = createMockExtensionContext();
      activate(context as any);

      __setConfigValue('remotePhp.servers', [
        { name: 'srv1', host: '10.0.0.1', username: 'u1' },
        { name: 'srv2', host: '10.0.0.2', username: 'u2' },
      ]);

      window.showQuickPick.mockResolvedValue(undefined);

      const handler = __getRegisteredCommand('remotePhp.runFile');
      await handler();

      expect(window.showQuickPick).toHaveBeenCalled();
    });

    it('should prompt to configure when no servers exist', async () => {
      const context = createMockExtensionContext();
      activate(context as any);

      window.showWarningMessage.mockResolvedValue(undefined);

      const handler = __getRegisteredCommand('remotePhp.runFile');
      await handler();

      expect(window.showWarningMessage).toHaveBeenCalledWith('No servers configured.', 'Configure Server');
    });

    it('should auto-select when only one server exists and no default', async () => {
      const context = createMockExtensionContext();
      activate(context as any);

      __setConfigValue('remotePhp.servers', [
        { name: 'solo', host: '10.0.0.1', username: 'u', port: 22, phpPath: 'php', remoteTmpDir: '/tmp' },
      ]);

      window.activeTextEditor = undefined;

      const handler = __getRegisteredCommand('remotePhp.runFile');
      await handler();

      // Should auto-select, not show quickpick, and then show error (no editor)
      expect(window.showQuickPick).not.toHaveBeenCalled();
      expect(window.showErrorMessage).toHaveBeenCalledWith('No active editor.');
    });
  });

  describe('remotePhp.runSelection command', () => {
    it('should show error when no editor', async () => {
      const context = createMockExtensionContext();
      activate(context as any);

      window.activeTextEditor = undefined;

      __setConfigValue('remotePhp.servers', [
        { name: 'srv', host: '10.0.0.1', username: 'u', port: 22, phpPath: 'php', remoteTmpDir: '/tmp' },
      ]);
      __setConfigValue('remotePhp.defaultServer', 'srv');

      const handler = __getRegisteredCommand('remotePhp.runSelection');
      await handler();

      expect(window.showErrorMessage).toHaveBeenCalledWith('No active editor.');
    });
  });

  describe('remotePhp.testConnection command', () => {
    it('should test connection when server is available', async () => {
      const context = createMockExtensionContext();
      activate(context as any);

      __setConfigValue('remotePhp.servers', [
        { name: 'srv', host: '10.0.0.1', username: 'u', password: 'p', port: 22, phpPath: 'php', remoteTmpDir: '/tmp' },
      ]);
      __setConfigValue('remotePhp.defaultServer', 'srv');

      const handler = __getRegisteredCommand('remotePhp.testConnection');
      await handler();

      // Should show some result
      expect(
        window.showInformationMessage.mock.calls.length +
        window.showWarningMessage.mock.calls.length,
      ).toBeGreaterThan(0);
    });
  });

  describe('deactivate', () => {
    it('should dispose executor without error', () => {
      const context = createMockExtensionContext();
      activate(context as any);

      expect(() => deactivate()).not.toThrow();
    });
  });
});
