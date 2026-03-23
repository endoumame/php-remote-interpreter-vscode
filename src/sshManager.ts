import { Client, ConnectConfig, ClientChannel } from 'ssh2';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ServerConfig {
  name: string;
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
  phpPath: string;
  remoteTmpDir: string;
}

export class SSHManager {
  private connections: Map<string, Client> = new Map();

  async connect(server: ServerConfig): Promise<Client> {
    const existing = this.connections.get(server.name);
    if (existing) {
      return existing;
    }

    const client = new Client();
    const config: ConnectConfig = {
      host: server.host,
      port: server.port || 22,
      username: server.username,
    };

    if (server.privateKeyPath) {
      const keyPath = server.privateKeyPath.replace(/^~/, os.homedir());
      try {
        config.privateKey = fs.readFileSync(keyPath);
      } catch {
        throw new Error(`Failed to read private key: ${keyPath}`);
      }
    } else if (server.password) {
      config.password = server.password;
    } else {
      // Try default SSH key locations
      const defaultKeys = [
        path.join(os.homedir(), '.ssh', 'id_rsa'),
        path.join(os.homedir(), '.ssh', 'id_ed25519'),
      ];
      for (const keyFile of defaultKeys) {
        if (fs.existsSync(keyFile)) {
          config.privateKey = fs.readFileSync(keyFile);
          break;
        }
      }
    }

    return new Promise((resolve, reject) => {
      client
        .on('ready', () => {
          this.connections.set(server.name, client);
          resolve(client);
        })
        .on('error', (err) => {
          reject(new Error(`SSH connection failed: ${err.message}`));
        })
        .on('close', () => {
          this.connections.delete(server.name);
        })
        .connect(config);
    });
  }

  async exec(client: Client, command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream
          .on('close', (code: number) => {
            resolve({ stdout, stderr, code: code ?? 0 });
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
      });
    });
  }

  async uploadAndExec(
    client: Client,
    localContent: string,
    server: ServerConfig,
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const remotePath = `${server.remoteTmpDir}/vscode_php_${Date.now()}.php`;

    await this.uploadContent(client, localContent, remotePath);

    try {
      const result = await this.exec(client, `${server.phpPath} ${remotePath}`);
      // Clean up remote temp file
      await this.exec(client, `rm -f ${remotePath}`).catch(() => {});
      return result;
    } catch (err) {
      await this.exec(client, `rm -f ${remotePath}`).catch(() => {});
      throw err;
    }
  }

  private async uploadContent(client: Client, content: string, remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) {
          reject(new Error(`SFTP session failed: ${err.message}`));
          return;
        }

        const writeStream = sftp.createWriteStream(remotePath);
        writeStream.on('close', () => resolve());
        writeStream.on('error', (e: Error) => reject(new Error(`File upload failed: ${e.message}`)));
        writeStream.end(content);
      });
    });
  }

  disconnect(serverName: string): void {
    const client = this.connections.get(serverName);
    if (client) {
      client.end();
      this.connections.delete(serverName);
    }
  }

  disconnectAll(): void {
    for (const [name, client] of this.connections) {
      client.end();
    }
    this.connections.clear();
  }
}
