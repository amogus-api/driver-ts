// Common AMOGUS definitions

export type PeerType = "client" | "server";

export type range = [number, number];
export function rangeCheck(rng: range, val: number) {
    const [low, hi] = rng;
    return val >= low && val <= hi;
}

export interface Readable {
    read(cnt: number): Promise<Buffer>;
    close(): Promise<void>;
}
export interface Writable {
    write(data: Buffer): Promise<void | any>;
    close(): Promise<void>;
}
export type ReadableWritable = Readable & Writable;

export abstract class Cloneable {
    clone(): this {
        // @ts-expect-error it's unaware that it's a constructor
        const obj: this = new this.constructor as this;
        for(const key in this)
            obj[key] = this[key];
        return obj;
    }
}

export class EventHost<Event> {
    private subs: ((ev: Event) => any)[] = [];

    subscribe(cb: (ev: Event) => any) {
        this.subs.push(cb);
    }

    unsubscribe(cb: (ev: Event) => any) {
        this.subs = this.subs.filter(x => x !== cb);
    }

    protected trigger(ev: Event) {
        for(const cb of this.subs)
            cb(ev);
    }
}

export type NotNull<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
