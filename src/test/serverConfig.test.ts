import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window, workspace, __setConfigValue, __clearConfig, ConfigurationTarget } from './__mocks__/vscode';

vi.mock('ssh2', () => ({ Client: vi.fn() }));

import { getServers, getDefaultServerName, configureServer, selectServer } from '../serverConfig';

describe('serverConfig', () => {
  beforeEach(() => {
    __clearConfig();
    vi.restoreAllMocks();
    window.showInputBox.mockReset();
    window.showQuickPick.mockReset();
    window.showInformationMessage.mockReset();
    window.showWarningMessage.mockReset();
    window.showErrorMessage.mockReset();
  });

  describe('getServers', () => {
    it('should return empty array when no servers configured', () => {
      const servers = getServers();
      expect(servers).toEqual([]);
    });

    it('should return servers with default values filled in', () => {
      __setConfigValue('remotePhp.servers', [
        { name: 'dev', host: '10.0.0.1', username: 'user' },
      ]);

      const servers = getServers();
      expect(servers).toHaveLength(1);
      expect(servers[0]).toEqual({
        name: 'dev',
        host: '10.0.0.1',
        username: 'user',
        port: 22,
        phpPath: 'php',
        remoteTmpDir: '/tmp',
      });
    });

    it('should preserve custom values', () => {
      __setConfigValue('remotePhp.servers', [
        {
          name: 'prod',
          host: '10.0.0.2',
          port: 2222,
          username: 'admin',
          phpPath: '/usr/bin/php8.1',
          remoteTmpDir: '/var/tmp',
        },
      ]);

      const servers = getServers();
      expect(servers[0].port).toBe(2222);
      expect(servers[0].phpPath).toBe('/usr/bin/php8.1');
      expect(servers[0].remoteTmpDir).toBe('/var/tmp');
    });

    it('should return multiple servers', () => {
      __setConfigValue('remotePhp.servers', [
        { name: 'a', host: '1.1.1.1', username: 'u1' },
        { name: 'b', host: '2.2.2.2', username: 'u2' },
        { name: 'c', host: '3.3.3.3', username: 'u3' },
      ]);

      const servers = getServers();
      expect(servers).toHaveLength(3);
    });
  });

  describe('getDefaultServerName', () => {
    it('should return empty string when no default is set', () => {
      expect(getDefaultServerName()).toBe('');
    });

    it('should return configured default server name', () => {
      __setConfigValue('remotePhp.defaultServer', 'my-server');
      expect(getDefaultServerName()).toBe('my-server');
    });
  });

  describe('configureServer', () => {
    it('should add a new server with private key auth', async () => {
      const inputResponses = ['my-server', '10.0.0.1', '22', 'root', '~/.ssh/id_rsa', 'php', '/tmp'];
      let inputCallCount = 0;
      window.showInputBox.mockImplementation(() => {
        return Promise.resolve(inputResponses[inputCallCount++]);
      });
      window.showQuickPick.mockResolvedValue('Private Key');

      await configureServer();

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'Server "my-server" configured successfully.',
      );

      // Verify the server was saved to config store
      const servers = getServers();
      expect(servers).toHaveLength(1);
      expect(servers[0]).toMatchObject({
        name: 'my-server',
        host: '10.0.0.1',
        username: 'root',
      });
    });

    it('should add a new server with password auth', async () => {
      const inputResponses = ['pwd-server', '10.0.0.2', '2222', 'deploy', 'mypassword', 'php8.1', '/var/tmp'];
      let inputCallCount = 0;
      window.showInputBox.mockImplementation(() => {
        return Promise.resolve(inputResponses[inputCallCount++]);
      });
      window.showQuickPick.mockResolvedValue('Password');

      await configureServer();

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'Server "pwd-server" configured successfully.',
      );
    });

    it('should cancel when name is not provided', async () => {
      window.showInputBox.mockResolvedValue(undefined);

      await configureServer();

      expect(window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('should cancel when host is not provided', async () => {
      let callCount = 0;
      window.showInputBox.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {return Promise.resolve('name');}
        return Promise.resolve(undefined);
      });

      await configureServer();

      expect(window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('should cancel when username is not provided', async () => {
      let callCount = 0;
      window.showInputBox.mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {return Promise.resolve(['name', 'host', '22'][callCount - 1]);}
        return Promise.resolve(undefined);
      });

      await configureServer();

      expect(window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('should cancel when auth method is not selected', async () => {
      let callCount = 0;
      window.showInputBox.mockImplementation(() => {
        callCount++;
        return Promise.resolve(['name', 'host', '22', 'user'][callCount - 1]);
      });
      window.showQuickPick.mockResolvedValue(undefined);

      await configureServer();

      expect(window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('should update existing server with same name', async () => {
      __setConfigValue('remotePhp.servers', [
        { name: 'existing', host: 'old-host', username: 'old-user', port: 22, phpPath: 'php', remoteTmpDir: '/tmp' },
      ]);

      const inputResponses = ['existing', 'new-host', '22', 'new-user', '~/.ssh/id_rsa', 'php', '/tmp'];
      let inputCallCount = 0;
      window.showInputBox.mockImplementation(() => {
        return Promise.resolve(inputResponses[inputCallCount++]);
      });
      window.showQuickPick.mockResolvedValue('Private Key');

      await configureServer();

      // Verify through the config store
      const servers = getServers();
      expect(servers).toHaveLength(1);
      expect(servers[0].host).toBe('new-host');
      expect(servers[0].username).toBe('new-user');
    });

    it('should use default php path when not provided', async () => {
      const inputResponses = ['srv', 'host', '22', 'user', '~/.ssh/id_rsa', undefined, undefined];
      let inputCallCount = 0;
      window.showInputBox.mockImplementation(() => {
        return Promise.resolve(inputResponses[inputCallCount++]);
      });
      window.showQuickPick.mockResolvedValue('Private Key');

      await configureServer();

      const servers = getServers();
      expect(servers[0].phpPath).toBe('php');
      expect(servers[0].remoteTmpDir).toBe('/tmp');
    });
  });

  describe('selectServer', () => {
    it('should show warning and offer to configure when no servers exist', async () => {
      window.showWarningMessage.mockResolvedValue(undefined);

      const result = await selectServer();
      expect(result).toBeUndefined();
      expect(window.showWarningMessage).toHaveBeenCalledWith('No servers configured.', 'Configure Server');
    });

    it('should call configureServer when user clicks Configure Server', async () => {
      window.showWarningMessage.mockResolvedValue('Configure Server');
      window.showInputBox.mockResolvedValue(undefined);

      const result = await selectServer();
      expect(result).toBeUndefined();
      expect(window.showInputBox).toHaveBeenCalled();
    });

    it('should auto-select when only one server exists', async () => {
      __setConfigValue('remotePhp.servers', [
        { name: 'only-one', host: '10.0.0.1', username: 'user', port: 22, phpPath: 'php', remoteTmpDir: '/tmp' },
      ]);

      const result = await selectServer();
      expect(result).toBeDefined();
      expect(result!.name).toBe('only-one');
      expect(window.showQuickPick).not.toHaveBeenCalled();
    });

    it('should show quick pick when multiple servers exist', async () => {
      __setConfigValue('remotePhp.servers', [
        { name: 'server1', host: '10.0.0.1', username: 'user1' },
        { name: 'server2', host: '10.0.0.2', username: 'user2' },
      ]);

      window.showQuickPick.mockResolvedValue({
        label: 'server2',
        description: 'user2@10.0.0.2:22',
        server: { name: 'server2', host: '10.0.0.2', port: 22, username: 'user2', phpPath: 'php', remoteTmpDir: '/tmp' },
      });

      const result = await selectServer();
      expect(result).toBeDefined();
      expect(result!.name).toBe('server2');
    });

    it('should return undefined when quick pick is cancelled', async () => {
      __setConfigValue('remotePhp.servers', [
        { name: 's1', host: '1.1.1.1', username: 'u1' },
        { name: 's2', host: '2.2.2.2', username: 'u2' },
      ]);

      window.showQuickPick.mockResolvedValue(undefined);

      const result = await selectServer();
      expect(result).toBeUndefined();
    });

    it('should mark default server in quick pick items', async () => {
      __setConfigValue('remotePhp.servers', [
        { name: 'server1', host: '10.0.0.1', username: 'user1' },
        { name: 'server2', host: '10.0.0.2', username: 'user2' },
      ]);
      __setConfigValue('remotePhp.defaultServer', 'server2');

      window.showQuickPick.mockResolvedValue(undefined);

      await selectServer();

      const items = window.showQuickPick.mock.calls[0][0];
      const defaultItem = items.find((i: any) => i.label === 'server2');
      expect(defaultItem.detail).toBe('(default)');

      const otherItem = items.find((i: any) => i.label === 'server1');
      expect(otherItem.detail).toBeUndefined();
    });
  });
});
