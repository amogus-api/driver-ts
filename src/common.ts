// Common AMOGUS definitions

export type PeerType = "client" | "server";

export type range = [number, number];
export function rangeCheck(rng: range, val: number) {
    const [low, hi] = rng;
    return val >= low && val <= hi;
}

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

export type StreamEvent = { type: "closed" };
export abstract class Readable extends EventHost<StreamEvent> {
    abstract read(cnt: number): Promise<Uint8Array>;
    abstract close(): Promise<void>;
}
export abstract class Writable extends EventHost<StreamEvent> {
    abstract write(data: Uint8Array): Promise<void | any>;
    abstract close(): Promise<void>;
}
export abstract class Duplex extends EventHost<StreamEvent> {
    abstract read(cnt: number): Promise<Uint8Array>;
    abstract write(data: Uint8Array): Promise<void | any>;
    abstract close(): Promise<void>;
}

export type NotNull<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
