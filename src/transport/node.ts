// Transport layer implementations for Node.JS

import { BufferedLink } from "./universal";
import { SpecSpace, SpecSpaceGen } from "../index";
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
