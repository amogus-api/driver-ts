// Platform-agnostic transport layer implementations

import { Duplex } from "../index";
import { SpecSpaceGen } from "../index";
import { Session } from "../index";

// Helps transform event-driven interfaces to async read() and write() calls used by SpeedAPI
export abstract class BufferedLink extends Duplex {
    private readBuf = new Uint8Array(0);
    private writeBuf = new Uint8Array(0);
    private dataListener?: () => void;

    // successor calls this when new data arrives
    protected dataArrived(data: Uint8Array) {
        const arr = new Uint8Array(this.readBuf.length + data.length);
        arr.set(this.readBuf);
        arr.set(data, this.readBuf.length);
        this.readBuf = arr;

        if(this.dataListener)
            this.dataListener();
    }

    // BufferedLink calls this when it wants to write data
    protected abstract dataWrite(data: Uint8Array): Promise<void>;

    abstract override close(): Promise<void>;

    async write(data: Uint8Array): Promise<void> {
        const arr = new Uint8Array(this.writeBuf.length + data.length);
        arr.set(this.writeBuf);
        arr.set(data, this.writeBuf.length);
        this.writeBuf = arr;
    }

    async flush() {
        await this.dataWrite(this.writeBuf);
        this.writeBuf = new Uint8Array(0);
    }

    read(cnt: number): Promise<Uint8Array> {
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
                this.dataListener = () => {
                    if(check())
                        this.dataListener = undefined;
                };
            }
        });
    }
}

class DummyLink extends BufferedLink {
    other!: DummyLink;

    protected async dataWrite(data: Uint8Array): Promise<void> {
        this.other.dataArrived(data);
    }

    override async close(): Promise<void> {
        throw new Error("Can't close a dummy link");
    }
}

class DummyClient<Gen extends SpecSpaceGen> extends Session<Gen> {
    constructor(specSpace: Gen, link: DummyLink) {
        super(specSpace, link, "client");
    }
}
class DummyServer<Gen extends SpecSpaceGen> extends Session<Gen> {
    constructor(specSpace: Gen, link: DummyLink) {
        super(specSpace, link, "server");
    }
}

export function createDummyLinks() {
    const [a, b] = [new DummyLink(), new DummyLink()];
    a.other = b;
    b.other = a;
    return [a, b];
}

export function createDummyPair<Gen extends SpecSpaceGen>(specSpace: Gen) {
    const [a, b] = createDummyLinks();
    return {
        server: new DummyServer(specSpace, a),
        client: new DummyClient(specSpace, b),
    };
}
