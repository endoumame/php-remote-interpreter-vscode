import * as vscode from 'vscode';
import { SSHManager, ServerConfig } from './sshManager';

export class PhpExecutor {
  private outputChannel: vscode.OutputChannel;
  private sshManager: SSHManager;

  constructor(sshManager: SSHManager) {
    this.sshManager = sshManager;
    this.outputChannel = vscode.window.createOutputChannel('Remote PHP');
  }

  async runFile(server: ServerConfig): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor.');
      return;
    }

    const document = editor.document;
    if (document.languageId !== 'php') {
      vscode.window.showWarningMessage('Active file is not a PHP file.');
      return;
    }

    await document.save();
    const content = document.getText();
    await this.execute(server, content, document.fileName);
  }

  async runSelection(server: ServerConfig): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor.');
      return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
      vscode.window.showWarningMessage('No text selected.');
      return;
    }

    let code = editor.document.getText(selection);

    // Wrap in PHP tags if not present
    if (!code.trimStart().startsWith('<?')) {
      code = `<?php\n${code}`;
    }

    await this.execute(server, code, `selection from ${editor.document.fileName}`);
  }

  private async execute(server: ServerConfig, code: string, source: string): Promise<void> {
    this.outputChannel.show(true);
    this.outputChannel.appendLine(`--- Running: ${source} on ${server.name} ---`);

    try {
      const client = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Connecting to ${server.name}...` },
        () => this.sshManager.connect(server),
      );

      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Executing PHP...' },
        () => this.sshManager.uploadAndExec(client, code, server),
      );

      if (result.stdout) {
        this.outputChannel.appendLine(result.stdout);
      }
      if (result.stderr) {
        this.outputChannel.appendLine(`[STDERR] ${result.stderr}`);
      }
      this.outputChannel.appendLine(`--- Exit code: ${result.code} ---\n`);

      if (result.code !== 0) {
        vscode.window.showWarningMessage(`PHP exited with code ${result.code}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`[ERROR] ${message}\n`);
      vscode.window.showErrorMessage(`Remote PHP error: ${message}`);
    }
  }

  async testConnection(server: ServerConfig): Promise<void> {
    try {
      const client = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Testing connection to ${server.name}...` },
        () => this.sshManager.connect(server),
      );

      const result = await this.sshManager.exec(client, `${server.phpPath} -v`);
      if (result.code === 0) {
        vscode.window.showInformationMessage(`Connected! ${result.stdout.split('\n')[0]}`);
      } else {
        vscode.window.showWarningMessage(`Connected but PHP not found at "${server.phpPath}"`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Connection failed: ${message}`);
    }
  }

  dispose(): void {
    this.outputChannel.dispose();
    this.sshManager.disconnectAll();
  }
}
