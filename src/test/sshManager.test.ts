import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client, MockStream, MockSFTP, MockWriteStream } from './__mocks__/ssh2';
import type { ServerConfig } from '../sshManager';

vi.mock('ssh2', () => ({ Client }));

// Mock fs and os at module level
const mockReadFileSync = vi.fn();
const mockExistsSync = vi.fn();
const mockHomedir = vi.fn(() => '/home/testuser');

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: (...args: any[]) => mockReadFileSync(...args),
    existsSync: (...args: any[]) => mockExistsSync(...args),
  };
});

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: () => mockHomedir(),
  };
});

import { SSHManager } from '../sshManager';

function makeServer(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    name: 'test-server',
    host: '192.168.1.1',
    port: 22,
    username: 'testuser',
    phpPath: 'php',
    remoteTmpDir: '/tmp',
    ...overrides,
  };
}

describe('SSHManager', () => {
  let manager: SSHManager;

  beforeEach(() => {
    manager = new SSHManager();
    vi.restoreAllMocks();
    mockReadFileSync.mockReset();
    mockExistsSync.mockReset();
    mockHomedir.mockReturnValue('/home/testuser');
  });

  afterEach(() => {
    manager.disconnectAll();
  });

  describe('connect', () => {
    it('should connect with password authentication', async () => {
      const server = makeServer({ password: 'secret' });
      const client = await manager.connect(server);
      expect(client).toBeInstanceOf(Client);
      expect(client.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: '192.168.1.1',
          port: 22,
          username: 'testuser',
          password: 'secret',
        }),
      );
    });

    it('should use default port 22 when port is 0', async () => {
      const server = makeServer({ port: 0 });
      await manager.connect(server);
      expect((manager as any).connections.size).toBe(1);
    });

    it('should return existing connection for same server name', async () => {
      const server = makeServer();
      const client1 = await manager.connect(server);
      const client2 = await manager.connect(server);
      expect(client1).toBe(client2);
    });

    it('should reject on SSH connection error', async () => {
      const server = makeServer();

      Client.connectBehavior = 'error';
      Client.connectError = 'Connection refused';

      manager = new SSHManager();
      await expect(manager.connect(server)).rejects.toThrow('SSH connection failed: Connection refused');

      Client.connectBehavior = 'ready';
    });

    it('should remove connection from map on close event', async () => {
      const server = makeServer();
      const client = await manager.connect(server);

      client.emit('close');

      const client2 = await manager.connect(server);
      expect(client2).not.toBe(client);
    });

    it('should read private key from file when privateKeyPath is set', async () => {
      mockReadFileSync.mockReturnValue(Buffer.from('fake-key'));

      const server = makeServer({ privateKeyPath: '/home/user/.ssh/id_rsa' });
      await manager.connect(server);

      expect(mockReadFileSync).toHaveBeenCalledWith('/home/user/.ssh/id_rsa');
    });

    it('should expand ~ in privateKeyPath', async () => {
      mockReadFileSync.mockReturnValue(Buffer.from('fake-key'));
      mockHomedir.mockReturnValue('/home/testuser');

      const server = makeServer({ privateKeyPath: '~/.ssh/id_rsa' });
      await manager.connect(server);

      expect(mockReadFileSync).toHaveBeenCalledWith('/home/testuser/.ssh/id_rsa');
    });

    it('should throw when private key file cannot be read', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const server = makeServer({ privateKeyPath: '/nonexistent/key' });
      await expect(manager.connect(server)).rejects.toThrow('Failed to read private key: /nonexistent/key');
    });

    it('should try default SSH keys when no auth is specified', async () => {
      mockHomedir.mockReturnValue('/home/testuser');
      mockExistsSync.mockImplementation((p: any) => {
        return p === '/home/testuser/.ssh/id_ed25519';
      });
      mockReadFileSync.mockReturnValue(Buffer.from('ed25519-key'));

      const server = makeServer({ password: undefined, privateKeyPath: undefined });
      await manager.connect(server);

      expect(mockReadFileSync).toHaveBeenCalledWith('/home/testuser/.ssh/id_ed25519');
    });

    it('should not set privateKey when no default keys exist', async () => {
      mockHomedir.mockReturnValue('/home/testuser');
      mockExistsSync.mockReturnValue(false);

      const server = makeServer({ password: undefined, privateKeyPath: undefined });
      const client = await manager.connect(server);

      expect(client.connect).toHaveBeenCalledWith(
        expect.not.objectContaining({ privateKey: expect.anything() }),
      );
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });
  });

  describe('exec', () => {
    it('should execute a command and capture stdout', async () => {
      const server = makeServer({ password: 'pass' });
      const client = await manager.connect(server);

      client.exec = vi.fn((cmd: string, cb: any) => {
        const stream = new MockStream();
        cb(null, stream);
        process.nextTick(() => {
          stream.emitData('Hello World');
          stream.emitClose(0);
        });
      });

      const result = await manager.exec(client, 'echo Hello');
      expect(result.stdout).toBe('Hello World');
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
    });

    it('should capture stderr', async () => {
      const server = makeServer({ password: 'pass' });
      const client = await manager.connect(server);

      client.exec = vi.fn((cmd: string, cb: any) => {
        const stream = new MockStream();
        cb(null, stream);
        process.nextTick(() => {
          stream.emitStderr('Error occurred');
          stream.emitClose(1);
        });
      });

      const result = await manager.exec(client, 'bad-command');
      expect(result.stderr).toBe('Error occurred');
      expect(result.code).toBe(1);
    });

    it('should reject when exec returns an error', async () => {
      const server = makeServer({ password: 'pass' });
      const client = await manager.connect(server);

      client.exec = vi.fn((cmd: string, cb: any) => {
        cb(new Error('exec failed'), null);
      });

      await expect(manager.exec(client, 'test')).rejects.toThrow('exec failed');
    });

    it('should handle multiple data chunks', async () => {
      const server = makeServer({ password: 'pass' });
      const client = await manager.connect(server);

      client.exec = vi.fn((cmd: string, cb: any) => {
        const stream = new MockStream();
        cb(null, stream);
        process.nextTick(() => {
          stream.emitData('chunk1');
          stream.emitData('chunk2');
          stream.emitData('chunk3');
          stream.emitClose(0);
        });
      });

      const result = await manager.exec(client, 'test');
      expect(result.stdout).toBe('chunk1chunk2chunk3');
    });

    it('should default exit code to 0 when undefined', async () => {
      const server = makeServer({ password: 'pass' });
      const client = await manager.connect(server);

      client.exec = vi.fn((cmd: string, cb: any) => {
        const stream = new MockStream();
        cb(null, stream);
        process.nextTick(() => {
          stream.emit('close', undefined);
        });
      });

      const result = await manager.exec(client, 'test');
      expect(result.code).toBe(0);
    });
  });

  describe('uploadAndExec', () => {
    it('should upload content, execute PHP, and clean up', async () => {
      const server = makeServer({ password: 'pass' });
      const client = await manager.connect(server);

      const execCalls: string[] = [];
      client.exec = vi.fn((cmd: string, cb: any) => {
        execCalls.push(cmd);
        const stream = new MockStream();
        cb(null, stream);
        process.nextTick(() => {
          if (cmd.startsWith('php')) {
            stream.emitData('PHP output');
          }
          stream.emitClose(0);
        });
      });

      const mockWs = new MockWriteStream();
      const mockSftp = new MockSFTP();
      mockSftp.createWriteStream = vi.fn(() => mockWs);
      client.sftp = vi.fn((cb: any) => cb(null, mockSftp));

      const result = await manager.uploadAndExec(client, '<?php echo "hi";', server);

      expect(result.stdout).toBe('PHP output');
      expect(mockWs.end).toHaveBeenCalledWith('<?php echo "hi";');
      expect(execCalls.length).toBe(2);
      expect(execCalls[0]).toMatch(/^php \/tmp\/vscode_php_\d+\.php$/);
      expect(execCalls[1]).toMatch(/^rm -f \/tmp\/vscode_php_\d+\.php$/);
    });

    it('should clean up remote file even when execution fails', async () => {
      const server = makeServer({ password: 'pass' });
      const client = await manager.connect(server);

      const execCalls: string[] = [];
      client.exec = vi.fn((cmd: string, cb: any) => {
        execCalls.push(cmd);
        if (cmd.startsWith('php')) {
          cb(new Error('PHP crashed'), null);
        } else {
          const stream = new MockStream();
          cb(null, stream);
          process.nextTick(() => stream.emitClose(0));
        }
      });

      const mockWs = new MockWriteStream();
      const mockSftp = new MockSFTP();
      mockSftp.createWriteStream = vi.fn(() => mockWs);
      client.sftp = vi.fn((cb: any) => cb(null, mockSftp));

      await expect(manager.uploadAndExec(client, '<?php bad;', server)).rejects.toThrow('PHP crashed');
      expect(execCalls.some((c) => c.startsWith('rm -f'))).toBe(true);
    });

    it('should reject when SFTP session fails', async () => {
      const server = makeServer({ password: 'pass' });
      const client = await manager.connect(server);

      client.sftp = vi.fn((cb: any) => cb(new Error('SFTP error'), null));

      await expect(manager.uploadAndExec(client, '<?php echo 1;', server)).rejects.toThrow(
        'SFTP session failed: SFTP error',
      );
    });

    it('should reject when file upload fails', async () => {
      const server = makeServer({ password: 'pass' });
      const client = await manager.connect(server);

      const mockWs = new MockWriteStream();
      mockWs.end = vi.fn(() => {
        process.nextTick(() => mockWs.emit('error', new Error('Disk full')));
      });
      const mockSftp = new MockSFTP();
      mockSftp.createWriteStream = vi.fn(() => mockWs);
      client.sftp = vi.fn((cb: any) => cb(null, mockSftp));

      await expect(manager.uploadAndExec(client, '<?php echo 1;', server)).rejects.toThrow(
        'File upload failed: Disk full',
      );
    });

    it('should use configured phpPath and remoteTmpDir', async () => {
      const server = makeServer({
        password: 'pass',
        phpPath: '/usr/local/bin/php8.2',
        remoteTmpDir: '/var/tmp',
      });
      const client = await manager.connect(server);

      const execCalls: string[] = [];
      client.exec = vi.fn((cmd: string, cb: any) => {
        execCalls.push(cmd);
        const stream = new MockStream();
        cb(null, stream);
        process.nextTick(() => stream.emitClose(0));
      });

      const mockWs = new MockWriteStream();
      const mockSftp = new MockSFTP();
      mockSftp.createWriteStream = vi.fn(() => mockWs);
      client.sftp = vi.fn((cb: any) => cb(null, mockSftp));

      await manager.uploadAndExec(client, '<?php echo 1;', server);

      expect(execCalls[0]).toMatch(/^\/usr\/local\/bin\/php8\.2 \/var\/tmp\/vscode_php_\d+\.php$/);
    });
  });

  describe('disconnect', () => {
    it('should end the client and remove from connections', async () => {
      const server = makeServer({ password: 'pass' });
      const client = await manager.connect(server);

      manager.disconnect('test-server');
      expect(client.end).toHaveBeenCalled();
    });

    it('should do nothing for unknown server name', () => {
      expect(() => manager.disconnect('unknown')).not.toThrow();
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all connections', async () => {
      const server1 = makeServer({ name: 'server1', password: 'p1' });
      const server2 = makeServer({ name: 'server2', host: '10.0.0.1', password: 'p2' });

      const client1 = await manager.connect(server1);
      const client2 = await manager.connect(server2);

      manager.disconnectAll();

      expect(client1.end).toHaveBeenCalled();
      expect(client2.end).toHaveBeenCalled();
    });
  });
});
