// Transport layer implementations for Node.JS

import { BufferedLink } from "./universal";
import { SpecSpaceGen } from "../index";
import { Session } from "../index";
import * as tls from "tls";

class TlsStream extends BufferedLink {
    socket: tls.TLSSocket;

    constructor(socket: tls.TLSSocket) {
        super();
        this.socket = socket;
        socket.on("data", (data: Buffer) => {
            this.dataArrived(data);
        });
        socket.on("close", () => {
            this.trigger({ type: "closed" });
        });
    }

    protected async dataWrite(data: Uint8Array): Promise<void> {
        return await new Promise((resolve, reject) => {
            this.socket.write(data, (err) => {
                if(err)
                    reject(err);
                else
                    resolve();
            });
        });
    }

    override async close(): Promise<void> {
        this.socket.destroy();
        this.trigger({ type: "closed" });
    }
}

export class TlsClient<Gen extends SpecSpaceGen> extends Session<Gen> {
    private readonly socket;

    constructor(specSpace: Gen, tlsOptions: tls.ConnectionOptions) {
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

export class TlsServer<Gen extends SpecSpaceGen> extends Session<Gen> {
    private readonly socket;

    constructor(specSpace: Gen, socket: tls.TLSSocket) {
        super(specSpace, new TlsStream(socket), "server");
        this.socket = socket;
    }

    override async stop() {
        await super.stop();
        this.socket.destroy();
    }
}

export class TlsListener<Gen extends SpecSpaceGen> {
    private readonly server;

    constructor(specSpace: Gen, options: tls.TlsOptions & { port: number, host?: string }, cb: (socket: TlsServer<Gen>) => void) {
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
