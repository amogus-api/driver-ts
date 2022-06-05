// stub \(-_-)/

import { Session } from "../session";

const message = "This class is deprecated and will be totally removed in SpeedAPI 2, use `@speedapi/node`";

export class TlsClient extends Session {
    constructor(_specSpace: any, _tlsOptions: any) {
        throw new Error(message);
        // @ts-expect-error unreached code
        super(undefined, undefined, undefined);
    }
    override async stop() {
        throw new Error(message);
    }
}

export class TlsServer extends Session {
    constructor(_specSpace: any, _socket: any) {
        throw new Error(message);
        // @ts-expect-error unreached code
        super(undefined, undefined, undefined);
    }
    override async stop() {
        throw new Error(message);
    }
}

export class TlsListener {
    constructor(_specSpace: any, _options: any, _cb: any) {
        throw new Error(message);
    }
    async close() {
        throw new Error(message);
    }
}
