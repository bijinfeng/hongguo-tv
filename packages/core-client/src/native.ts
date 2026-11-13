import { CoreError, responseData, type CoreTransport } from './index';

/** A ready result stays owned by Rust until accepted, including across cancellation races. */
export interface NativeCall {
  result(): Promise<string>;
  accept(): void;
  cancel(): void;
  dispose(): void;
}

/** Structural contract implemented by the generated native session class. */
export interface NativeSession {
  origin(): string;
  start(path: string, body: string | null): NativeCall;
  close(): void;
  dispose(): void;
}

const cancelled = () => new CoreError('请求已取消', 'CORE_CANCELLED', 499);

/** Adapt an already opened native session; its caller closes it with the application. */
export function createNativeTransport(session: NativeSession): CoreTransport & { close(): void } {
  let closed = false;
  const calls = new Set<NativeCall>();
  return {
    mediaOrigin: session.origin(),
    async request(path, abort, body) {
      if (closed) throw new CoreError('核心已关闭，请重新打开应用', 'CORE_CLOSED', 410);
      if (abort?.aborted) throw cancelled();
      const call = session.start(path, body === undefined ? null : JSON.stringify(body));
      calls.add(call);
      const cancel = () => call.cancel();
      abort?.addEventListener('abort', cancel, { once: true });
      try {
        const reply = JSON.parse(await call.result()) as { status?: number; body?: unknown } | null;
        if (closed || abort?.aborted) throw cancelled();
        const value = responseData(reply?.status ?? NaN, reply?.body);
        call.accept();
        return value;
      } finally {
        abort?.removeEventListener('abort', cancel);
        calls.delete(call);
        call.cancel();
        call.dispose();
      }
    },
    close() {
      if (closed) return;
      closed = true;
      for (const call of calls) call.cancel();
      session.close();
      session.dispose();
    },
  };
}
