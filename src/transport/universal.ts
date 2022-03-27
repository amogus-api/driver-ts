// Platform-agnostic transport layer implementations

import * as common from "../common";
import { Session } from "../session";

class DummyLink implements common.ReadableWritable {
    other!: DummyLink;
    private readBuf = Buffer.alloc(0);
    private listeners: ((data: Buffer) => any)[] = [];

    constructor() {
        this.listeners.push((data) => {
            this.readBuf = Buffer.concat([this.readBuf, data]);
        });
    }

    read(cnt: number): Promise<Buffer> {
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
                        this.listeners = this.listeners.filter(x => x !== listener);
                };
                this.listeners.push(listener);
            }
        });
    }

    async write(data: Buffer): Promise<void> {
        for(const cb of this.other.listeners)
            cb(data);
    }

    async close(): Promise<void> {
        return;
    }
}

class DummyClient extends Session {
    constructor(specSpace: common.SpecSpace, link: DummyLink) {
        super(specSpace, link, "client");
    }
}
class DummyServer extends Session {
    constructor(specSpace: common.SpecSpace, link: DummyLink) {
        super(specSpace, link, "server");
    }
}

export function createDummyLinks() {
    const [a, b] = [new DummyLink(), new DummyLink()];
    a.other = b;
    b.other = a;
    return [a, b];
}

export function createDummyPair(specSpace: common.SpecSpace) {
    const [a, b] = createDummyLinks();
    return {
        server: new DummyServer(specSpace, a),
        client: new DummyClient(specSpace, b),
    };
}
