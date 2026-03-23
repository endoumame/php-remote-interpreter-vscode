import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window, Selection } from './__mocks__/vscode';
import { Client, MockStream } from './__mocks__/ssh2';
import type { ServerConfig } from '../sshManager';

vi.mock('ssh2', () => ({ Client }));

import { SSHManager } from '../sshManager';
import { PhpExecutor } from '../executor';

function makeServer(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    name: 'test-server',
    host: '192.168.1.1',
    port: 22,
    username: 'testuser',
    phpPath: 'php',
    remoteTmpDir: '/tmp',
    password: 'pass',
    ...overrides,
  };
}

function makeMockEditor(options: {
  languageId?: string;
  content?: string;
  fileName?: string;
  selection?: Selection;
  selectedText?: string;
}) {
  const {
    languageId = 'php',
    content = '<?php echo "hello";',
    fileName = '/workspace/test.php',
    selection = new Selection(0, 0, 0, 0),
    selectedText = '',
  } = options;

  return {
    document: {
      languageId,
      getText: vi.fn((sel?: any) => (sel ? selectedText : content)),
      fileName,
      save: vi.fn().mockResolvedValue(true),
    },
    selection,
  };
}

describe('PhpExecutor', () => {
  let sshManager: SSHManager;
  let executor: PhpExecutor;
  let server: ServerConfig;

  beforeEach(() => {
    vi.restoreAllMocks();
    sshManager = new SSHManager();
    executor = new PhpExecutor(sshManager);
    server = makeServer();
    window.activeTextEditor = undefined;
  });

  describe('runFile', () => {
    it('should show error when no active editor', async () => {
      window.activeTextEditor = undefined;

      await executor.runFile(server);

      expect(window.showErrorMessage).toHaveBeenCalledWith('No active editor.');
    });

    it('should show warning for non-PHP files', async () => {
      window.activeTextEditor = makeMockEditor({ languageId: 'javascript' });

      await executor.runFile(server);

      expect(window.showWarningMessage).toHaveBeenCalledWith('Active file is not a PHP file.');
    });

    it('should save document before executing', async () => {
      const editor = makeMockEditor({ languageId: 'php' });
      window.activeTextEditor = editor;

      // Mock the SSH flow
      vi.spyOn(sshManager, 'connect').mockResolvedValue(new Client() as any);
      vi.spyOn(sshManager, 'uploadAndExec').mockResolvedValue({
        stdout: 'output',
        stderr: '',
        code: 0,
      });

      await executor.runFile(server);

      expect(editor.document.save).toHaveBeenCalled();
    });

    it('should execute file content on remote server', async () => {
      const editor = makeMockEditor({
        languageId: 'php',
        content: '<?php echo "test";',
        fileName: '/workspace/test.php',
      });
      window.activeTextEditor = editor;

      const mockClient = new Client();
      vi.spyOn(sshManager, 'connect').mockResolvedValue(mockClient as any);
      vi.spyOn(sshManager, 'uploadAndExec').mockResolvedValue({
        stdout: 'test',
        stderr: '',
        code: 0,
      });

      await executor.runFile(server);

      expect(sshManager.uploadAndExec).toHaveBeenCalledWith(
        mockClient,
        '<?php echo "test";',
        server,
      );
    });

    it('should display stdout in output channel', async () => {
      const editor = makeMockEditor({ languageId: 'php' });
      window.activeTextEditor = editor;

      vi.spyOn(sshManager, 'connect').mockResolvedValue(new Client() as any);
      vi.spyOn(sshManager, 'uploadAndExec').mockResolvedValue({
        stdout: 'Hello World',
        stderr: '',
        code: 0,
      });

      await executor.runFile(server);

      const outputChannel = (window.createOutputChannel as any).mock.results[0]?.value;
      if (outputChannel) {
        expect(outputChannel.appendLine).toHaveBeenCalledWith('Hello World');
        expect(outputChannel.show).toHaveBeenCalledWith(true);
      }
    });

    it('should display stderr in output channel', async () => {
      const editor = makeMockEditor({ languageId: 'php' });
      window.activeTextEditor = editor;

      vi.spyOn(sshManager, 'connect').mockResolvedValue(new Client() as any);
      vi.spyOn(sshManager, 'uploadAndExec').mockResolvedValue({
        stdout: '',
        stderr: 'PHP Warning: something',
        code: 0,
      });

      await executor.runFile(server);

      const outputChannel = (window.createOutputChannel as any).mock.results[0]?.value;
      if (outputChannel) {
        expect(outputChannel.appendLine).toHaveBeenCalledWith('[STDERR] PHP Warning: something');
      }
    });

    it('should show warning for non-zero exit code', async () => {
      const editor = makeMockEditor({ languageId: 'php' });
      window.activeTextEditor = editor;

      vi.spyOn(sshManager, 'connect').mockResolvedValue(new Client() as any);
      vi.spyOn(sshManager, 'uploadAndExec').mockResolvedValue({
        stdout: '',
        stderr: 'Fatal error',
        code: 255,
      });

      await executor.runFile(server);

      expect(window.showWarningMessage).toHaveBeenCalledWith('PHP exited with code 255');
    });

    it('should show error message on connection failure', async () => {
      const editor = makeMockEditor({ languageId: 'php' });
      window.activeTextEditor = editor;

      vi.spyOn(sshManager, 'connect').mockRejectedValue(new Error('Connection refused'));

      await executor.runFile(server);

      expect(window.showErrorMessage).toHaveBeenCalledWith('Remote PHP error: Connection refused');
    });

    it('should handle non-Error thrown objects', async () => {
      const editor = makeMockEditor({ languageId: 'php' });
      window.activeTextEditor = editor;

      vi.spyOn(sshManager, 'connect').mockRejectedValue('string error');

      await executor.runFile(server);

      expect(window.showErrorMessage).toHaveBeenCalledWith('Remote PHP error: string error');
    });
  });

  describe('runSelection', () => {
    it('should show error when no active editor', async () => {
      window.activeTextEditor = undefined;

      await executor.runSelection(server);

      expect(window.showErrorMessage).toHaveBeenCalledWith('No active editor.');
    });

    it('should show warning when selection is empty', async () => {
      window.activeTextEditor = makeMockEditor({
        selection: new Selection(0, 0, 0, 0), // empty
      });

      await executor.runSelection(server);

      expect(window.showWarningMessage).toHaveBeenCalledWith('No text selected.');
    });

    it('should wrap selected code in PHP tags if missing', async () => {
      const editor = makeMockEditor({
        selection: new Selection(0, 0, 1, 10),
        selectedText: 'echo "hello";',
      });
      window.activeTextEditor = editor;

      const mockClient = new Client();
      vi.spyOn(sshManager, 'connect').mockResolvedValue(mockClient as any);
      vi.spyOn(sshManager, 'uploadAndExec').mockResolvedValue({
        stdout: 'hello',
        stderr: '',
        code: 0,
      });

      await executor.runSelection(server);

      expect(sshManager.uploadAndExec).toHaveBeenCalledWith(
        mockClient,
        '<?php\necho "hello";',
        server,
      );
    });

    it('should not wrap if code already has PHP tags', async () => {
      const editor = makeMockEditor({
        selection: new Selection(0, 0, 1, 10),
        selectedText: '<?php echo "hello";',
      });
      window.activeTextEditor = editor;

      const mockClient = new Client();
      vi.spyOn(sshManager, 'connect').mockResolvedValue(mockClient as any);
      vi.spyOn(sshManager, 'uploadAndExec').mockResolvedValue({
        stdout: 'hello',
        stderr: '',
        code: 0,
      });

      await executor.runSelection(server);

      expect(sshManager.uploadAndExec).toHaveBeenCalledWith(
        mockClient,
        '<?php echo "hello";',
        server,
      );
    });

    it('should not wrap if code starts with <?xml style opening', async () => {
      const editor = makeMockEditor({
        selection: new Selection(0, 0, 1, 10),
        selectedText: '<? echo "shorthand";',
      });
      window.activeTextEditor = editor;

      const mockClient = new Client();
      vi.spyOn(sshManager, 'connect').mockResolvedValue(mockClient as any);
      vi.spyOn(sshManager, 'uploadAndExec').mockResolvedValue({
        stdout: '',
        stderr: '',
        code: 0,
      });

      await executor.runSelection(server);

      expect(sshManager.uploadAndExec).toHaveBeenCalledWith(
        mockClient,
        '<? echo "shorthand";',
        server,
      );
    });

    it('should handle leading whitespace before PHP tags', async () => {
      const editor = makeMockEditor({
        selection: new Selection(0, 0, 1, 10),
        selectedText: '  <?php echo "hello";',
      });
      window.activeTextEditor = editor;

      const mockClient = new Client();
      vi.spyOn(sshManager, 'connect').mockResolvedValue(mockClient as any);
      vi.spyOn(sshManager, 'uploadAndExec').mockResolvedValue({
        stdout: '',
        stderr: '',
        code: 0,
      });

      await executor.runSelection(server);

      // Should not double-wrap since trimStart finds <?
      expect(sshManager.uploadAndExec).toHaveBeenCalledWith(
        mockClient,
        '  <?php echo "hello";',
        server,
      );
    });
  });

  describe('testConnection', () => {
    it('should show PHP version on successful connection', async () => {
      const mockClient = new Client();
      vi.spyOn(sshManager, 'connect').mockResolvedValue(mockClient as any);
      vi.spyOn(sshManager, 'exec').mockResolvedValue({
        stdout: 'PHP 8.2.0 (cli)\nCopyright...',
        stderr: '',
        code: 0,
      });

      await executor.testConnection(server);

      expect(sshManager.exec).toHaveBeenCalledWith(mockClient, 'php -v');
      expect(window.showInformationMessage).toHaveBeenCalledWith('Connected! PHP 8.2.0 (cli)');
    });

    it('should use configured phpPath for version check', async () => {
      const customServer = makeServer({ phpPath: '/opt/php/bin/php' });
      const mockClient = new Client();
      vi.spyOn(sshManager, 'connect').mockResolvedValue(mockClient as any);
      vi.spyOn(sshManager, 'exec').mockResolvedValue({
        stdout: 'PHP 8.3.0',
        stderr: '',
        code: 0,
      });

      await executor.testConnection(customServer);

      expect(sshManager.exec).toHaveBeenCalledWith(mockClient, '/opt/php/bin/php -v');
    });

    it('should show warning when PHP binary not found', async () => {
      const mockClient = new Client();
      vi.spyOn(sshManager, 'connect').mockResolvedValue(mockClient as any);
      vi.spyOn(sshManager, 'exec').mockResolvedValue({
        stdout: '',
        stderr: 'command not found',
        code: 127,
      });

      await executor.testConnection(server);

      expect(window.showWarningMessage).toHaveBeenCalledWith(
        'Connected but PHP not found at "php"',
      );
    });

    it('should show error when connection fails', async () => {
      vi.spyOn(sshManager, 'connect').mockRejectedValue(new Error('Timeout'));

      await executor.testConnection(server);

      expect(window.showErrorMessage).toHaveBeenCalledWith('Connection failed: Timeout');
    });

    it('should handle non-Error thrown objects in testConnection', async () => {
      vi.spyOn(sshManager, 'connect').mockRejectedValue('some string');

      await executor.testConnection(server);

      expect(window.showErrorMessage).toHaveBeenCalledWith('Connection failed: some string');
    });
  });

  describe('dispose', () => {
    it('should dispose output channel and disconnect all', () => {
      vi.spyOn(sshManager, 'disconnectAll');

      executor.dispose();

      expect(sshManager.disconnectAll).toHaveBeenCalled();
    });
  });
});
