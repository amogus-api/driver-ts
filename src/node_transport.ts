// Transport layer implementations for Node.JS

import * as common from "./common";
import { Session } from "./session";
import * as tls from "node:tls";

class TlsStream implements common.ReadableWritable {
    socket: tls.TLSSocket;
    private readBuf = Buffer.alloc(0);

    constructor(socket: tls.TLSSocket) {
        this.socket = socket;
        socket.on("data", (data) => {
            this.readBuf = Buffer.concat([this.readBuf, data]);
        });
    }

    read(cnt: number): Promise<Buffer> {
        return new Promise((resolve, _reject) => {
            const check = () => {
                if(this.readBuf.length <= cnt) {
                    const data = this.readBuf.slice(0, cnt);
                    this.readBuf = this.readBuf.slice(cnt);
                    resolve(data);
                    return true;
                }
                return false;
            }
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

    write(data: Buffer): Promise<void> {
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
    }
}

export class TlsClient extends Session {
    stream: TlsStream;

    constructor(specSpace: common.SpecSpace, tlsOptions: tls.ConnectionOptions) {
        const socket = tls.connect(tlsOptions);
        const stream = new TlsStream(socket);

        super(specSpace, stream, "client");
        this.stream = stream;
    }
}