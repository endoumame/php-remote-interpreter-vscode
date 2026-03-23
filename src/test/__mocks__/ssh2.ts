import { vi } from 'vitest';
import { EventEmitter } from 'events';

export class MockStream extends EventEmitter {
  stderr = new EventEmitter();

  emitData(data: string) {
    this.emit('data', Buffer.from(data));
  }

  emitStderr(data: string) {
    this.stderr.emit('data', Buffer.from(data));
  }

  emitClose(code: number) {
    this.emit('close', code);
  }
}

export class MockWriteStream extends EventEmitter {
  end = vi.fn((content?: string) => {
    process.nextTick(() => this.emit('close'));
  });
  write = vi.fn();
}

export class MockSFTP {
  createWriteStream = vi.fn(() => {
    const ws = new MockWriteStream();
    return ws;
  });
}

export class Client extends EventEmitter {
  static connectBehavior: 'ready' | 'error' = 'ready';
  static connectError = 'Connection refused';

  connect = vi.fn((_config: any) => {
    if (Client.connectBehavior === 'error') {
      process.nextTick(() => this.emit('error', new Error(Client.connectError)));
    } else {
      process.nextTick(() => this.emit('ready'));
    }
    return this;
  });

  exec = vi.fn((command: string, callback: (err: Error | null, stream: MockStream) => void) => {
    const stream = new MockStream();
    callback(null, stream);
    // Default: emit close with code 0 on next tick
    process.nextTick(() => stream.emitClose(0));
  });

  sftp = vi.fn((callback: (err: Error | null, sftp: MockSFTP) => void) => {
    callback(null, new MockSFTP());
  });

  end = vi.fn();
}
