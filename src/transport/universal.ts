// Platform-agnostic transport layer implementations

import { Duplex } from "../index";
import { SpecSpace, SpecSpaceGen } from "../index";
import { Session } from "../index";

class DummyLink extends Duplex {
    other!: DummyLink;
    private readBuf = new Uint8Array(0);
    private listeners: ((data: Uint8Array) => any)[] = [];

    constructor() {
        super();
        this.listeners.push((data) => {
            const arr = new Uint8Array(this.readBuf.length + data.length);
            arr.set(this.readBuf);
            arr.set(data, this.readBuf.length);
            this.readBuf = arr;
        });
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
                const listener = (_: Uint8Array) => {
                    if(check())
                        this.listeners = this.listeners.filter(x => x !== listener);
                };
                this.listeners.push(listener);
            }
        });
    }

    async write(data: Uint8Array): Promise<void> {
        for(const cb of this.other.listeners)
            cb(data);
    }

    async close(): Promise<void> {
        throw new Error("Can't close a dummy link");
    }
}

class DummyClient<Spec extends SpecSpace> extends Session<Spec> {
    constructor(specSpace: SpecSpaceGen<Spec>, link: DummyLink) {
        super(specSpace, link, "client");
    }
}
class DummyServer<Spec extends SpecSpace> extends Session<Spec> {
    constructor(specSpace: SpecSpaceGen<Spec>, link: DummyLink) {
        super(specSpace, link, "server");
    }
}

export function createDummyLinks() {
    const [a, b] = [new DummyLink(), new DummyLink()];
    a.other = b;
    b.other = a;
    return [a, b];
}

export function createDummyPair<Spec extends SpecSpace>(specSpace: SpecSpaceGen<Spec>) {
    const [a, b] = createDummyLinks();
    return {
        server: new DummyServer(specSpace, a),
        client: new DummyClient(specSpace, b),
    };
}
