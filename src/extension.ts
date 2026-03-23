import * as vscode from 'vscode';
import { SSHManager } from './sshManager';
import { PhpExecutor } from './executor';
import { configureServer, selectServer, getServers, getDefaultServerName } from './serverConfig';

let executor: PhpExecutor;

export function activate(context: vscode.ExtensionContext): void {
  const sshManager = new SSHManager();
  executor = new PhpExecutor(sshManager);

  context.subscriptions.push(
    vscode.commands.registerCommand('remotePhp.configureServer', () => configureServer()),

    vscode.commands.registerCommand('remotePhp.selectServer', async () => {
      const server = await selectServer();
      if (server) {
        await vscode.workspace
          .getConfiguration('remotePhp')
          .update('defaultServer', server.name, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Default server set to "${server.name}".`);
      }
    }),

    vscode.commands.registerCommand('remotePhp.runFile', async () => {
      const server = await resolveServer();
      if (server) {
        await executor.runFile(server);
      }
    }),

    vscode.commands.registerCommand('remotePhp.runSelection', async () => {
      const server = await resolveServer();
      if (server) {
        await executor.runSelection(server);
      }
    }),

    vscode.commands.registerCommand('remotePhp.testConnection', async () => {
      const server = await resolveServer();
      if (server) {
        await executor.testConnection(server);
      }
    }),
  );
}

async function resolveServer() {
  const servers = getServers();
  if (servers.length === 0) {
    return selectServer(); // Will prompt to configure
  }

  const defaultName = getDefaultServerName();
  if (defaultName) {
    const server = servers.find((s) => s.name === defaultName);
    if (server) {return server;}
  }

  return selectServer();
}

export function deactivate(): void {
  executor?.dispose();
}
