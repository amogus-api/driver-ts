// Transport layer implementations for Node.JS

import { Duplex } from "../index";
import { SpecSpace, SpecSpaceGen } from "../index";
import { Session } from "../index";
import * as tls from "tls";

class TlsStream extends Duplex {
    socket: tls.TLSSocket;
    private readBuf = Buffer.alloc(0);

    constructor(socket: tls.TLSSocket) {
        super();
        this.socket = socket;
        socket.on("data", (data) => {
            this.readBuf = Buffer.concat([this.readBuf, data]);
        });
        socket.on("close", () => {
            this.trigger({ type: "closed" });
        });
    }

    async read(cnt: number): Promise<Buffer> {
        return new Promise((resolve, _reject) => {
            const check = () => {
                if(this.readBuf.length >= cnt) {
                    const data = this.readBuf.slice(0, cnt);
                    this.readBuf = this.readBuf.slice(cnt);
                    resolve(data);
                    return true;
                }
                return false;
            };
            // check if data is in the buffer already
            if(!check()) {
                const listener = (_: Buffer) => {
                    if(check())
                        this.socket.removeListener("data", listener);
                };
                this.socket.addListener("data", listener);
            }
        });
    }

    async write(data: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket.write(data, (err) => {
                if(err)
                    reject(err);
                else
                    resolve();
            });
        });
    }

    async close(): Promise<void> {
        this.socket.destroy();
        this.trigger({ type: "closed" });
    }
}

export class TlsClient<Spec extends SpecSpace> extends Session<Spec> {
    private readonly socket;

    constructor(specSpace: SpecSpaceGen<Spec>, tlsOptions: tls.ConnectionOptions) {
        const socket = tls.connect(tlsOptions);
        const stream = new TlsStream(socket);

        super(specSpace, stream, "client");
        this.stream = stream;
        this.socket = socket;
    }

    override async stop() {
        await super.stop();
        this.socket.destroy();
    }
}

export class TlsServer<Spec extends SpecSpace> extends Session<Spec> {
    private readonly socket;

    constructor(specSpace: SpecSpaceGen<Spec>, socket: tls.TLSSocket) {
        super(specSpace, new TlsStream(socket), "server");
        this.socket = socket;
    }

    override async stop() {
        await super.stop();
        this.socket.destroy();
    }
}

export class TlsListener<Spec extends SpecSpace> {
    private readonly server;

    constructor(specSpace: SpecSpaceGen<Spec>, options: tls.TlsOptions & { port: number, host?: string }, cb: (socket: TlsServer<Spec>) => void) {
        this.server = tls.createServer(options, (socket) => {
            const session = new TlsServer(specSpace, socket);
            cb(session);
        });
        this.server.listen(options.port, options.host);
    }

    async close() {
        this.server.close();
    }
}
