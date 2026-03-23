import * as vscode from 'vscode';
import type { ServerConfig } from './sshManager';

export function getServers(): ServerConfig[] {
  const config = vscode.workspace.getConfiguration('remotePhp');
  const servers = config.get<ServerConfig[]>('servers', []);
  return servers.map((s) => ({
    ...s,
    port: s.port || 22,
    phpPath: s.phpPath || 'php',
    remoteTmpDir: s.remoteTmpDir || '/tmp',
  }));
}

export function getDefaultServerName(): string {
  return vscode.workspace.getConfiguration('remotePhp').get<string>('defaultServer', '');
}

export async function configureServer(): Promise<void> {
  const name = await vscode.window.showInputBox({ prompt: 'Server name', placeHolder: 'my-server' });
  if (!name) {return;}

  const host = await vscode.window.showInputBox({ prompt: 'SSH host', placeHolder: '192.168.1.100' });
  if (!host) {return;}

  const portStr = await vscode.window.showInputBox({ prompt: 'SSH port', value: '22' });
  const port = parseInt(portStr || '22', 10);

  const username = await vscode.window.showInputBox({ prompt: 'SSH username', placeHolder: 'root' });
  if (!username) {return;}

  const authMethod = await vscode.window.showQuickPick(['Private Key', 'Password'], {
    placeHolder: 'Authentication method',
  });
  if (!authMethod) {return;}

  let privateKeyPath: string | undefined;
  let password: string | undefined;

  if (authMethod === 'Private Key') {
    privateKeyPath = await vscode.window.showInputBox({
      prompt: 'Path to private key',
      value: '~/.ssh/id_rsa',
    });
  } else {
    password = await vscode.window.showInputBox({ prompt: 'SSH password', password: true });
  }

  const phpPath = await vscode.window.showInputBox({ prompt: 'PHP binary path on remote', value: 'php' });
  const remoteTmpDir = await vscode.window.showInputBox({ prompt: 'Remote temp directory', value: '/tmp' });

  const newServer: ServerConfig = {
    name,
    host,
    port,
    username,
    privateKeyPath,
    password,
    phpPath: phpPath || 'php',
    remoteTmpDir: remoteTmpDir || '/tmp',
  };

  const config = vscode.workspace.getConfiguration('remotePhp');
  const servers = config.get<ServerConfig[]>('servers', []);

  const existingIndex = servers.findIndex((s) => s.name === name);
  if (existingIndex >= 0) {
    servers[existingIndex] = newServer;
  } else {
    servers.push(newServer);
  }

  await config.update('servers', servers, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`Server "${name}" configured successfully.`);
}

export async function selectServer(): Promise<ServerConfig | undefined> {
  const servers = getServers();
  if (servers.length === 0) {
    const action = await vscode.window.showWarningMessage(
      'No servers configured.',
      'Configure Server',
    );
    if (action === 'Configure Server') {
      await configureServer();
    }
    return undefined;
  }

  if (servers.length === 1) {
    return servers[0];
  }

  const defaultName = getDefaultServerName();
  const items = servers.map((s) => ({
    label: s.name,
    description: `${s.username}@${s.host}:${s.port}`,
    detail: s.name === defaultName ? '(default)' : undefined,
    server: s,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a remote server',
  });

  return picked?.server;
}
