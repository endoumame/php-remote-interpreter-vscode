# Remote PHP Interpreter

VS Code extension for executing PHP scripts on remote servers via SSH.

## Features

- Run PHP files on a remote server with a single keybinding
- Execute selected code snippets remotely
- Configure multiple remote servers
- Switch between servers easily
- Test SSH connections and verify PHP availability

## Getting Started

### 1. Configure a Server

Run **Remote PHP: Configure Server** from the Command Palette (`Ctrl+Shift+P`) and enter:

- Server name
- SSH host and port
- Username
- Authentication method (private key or password)
- PHP binary path on the remote (default: `php`)
- Remote temp directory (default: `/tmp`)

Server configurations are stored in VS Code's global settings under `remotePhp.servers`.

### 2. Test the Connection

Run **Remote PHP: Test Connection** to verify SSH connectivity and confirm the PHP binary is accessible on the remote server.

### 3. Run PHP Code

- **Run file**: Open a `.php` file and press `Ctrl+Shift+R` (or `Cmd+Shift+R` on macOS), or use **Remote PHP: Run Current File** from the Command Palette.
- **Run selection**: Select code in the editor, right-click, and choose **Remote PHP: Run Selection**. PHP tags (`<?php`) are added automatically if missing.

Output appears in the **Remote PHP** output channel.

## Commands

| Command | Description |
|---|---|
| `Remote PHP: Configure Server` | Add or update a remote server |
| `Remote PHP: Select Server` | Choose the active server |
| `Remote PHP: Run Current File` | Upload and execute the current PHP file |
| `Remote PHP: Run Selection` | Execute the selected code snippet |
| `Remote PHP: Test Connection` | Verify SSH and PHP availability |

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `remotePhp.servers` | array | `[]` | List of remote server configurations |
| `remotePhp.defaultServer` | string | `""` | Name of the default server |

### Server Configuration Properties

| Property | Required | Default | Description |
|---|---|---|---|
| `name` | Yes | — | Display name |
| `host` | Yes | — | SSH hostname or IP |
| `port` | No | `22` | SSH port |
| `username` | Yes | — | SSH username |
| `privateKeyPath` | No | — | Path to SSH private key |
| `password` | No | — | SSH password (key auth recommended) |
| `phpPath` | No | `php` | PHP binary path on remote |
| `remoteTmpDir` | No | `/tmp` | Temp directory for uploaded scripts |

## Keybindings

| Key | Command | When |
|---|---|---|
| `Ctrl+Shift+R` / `Cmd+Shift+R` | Run Current File | PHP file is active |

## Development

```sh
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.
