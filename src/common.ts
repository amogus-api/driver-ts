// This file contains common AMOGUS definitions

import { Session } from "./session";

export type PeerType = "client" | "server";

export type range = [number, number];
export function rangeCheck(range: range, val: number) {
    const [low, hi] = range;
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

export abstract class Cloneable<T> {
    clone(): T {
        // @ts-expect-error
        const obj = new this.constructor;
        for(const key in this)
            obj[key] = this[key];
        return obj as T;
    }
}

export abstract class DataRepr<T> {
    abstract write(stream: Writable, value: T): void;
    abstract read(stream: Readable): Promise<T>;
    abstract validate(value: T): boolean;
}

// TsType<repr.Str> = string
export type TsType<Repr> = Repr extends DataRepr<infer DataType> ? DataType : never;
// ValueUnion<[100, 200, 300]> = 100 | 200 | 300
export type ValueUnion<Arr extends any[]> = { [K in keyof Arr as K extends number ? K : never]: Arr[K] }[number];

export interface FieldSpec {
    required: { [name: string]: DataRepr<any> };
    optional: { [name: string]: [number, DataRepr<any>] };
}
export interface MethodSpec {
    params: FieldSpec;
    returns: FieldSpec;
    confirmations: Confirmation<any>[];
}
export interface EntitySpec {
    fields: FieldSpec;
    methods: { [numericId: number]: Method<MethodSpec> };
}
export interface ConfSpec {
    request: FieldSpec;
    response: FieldSpec;
}

export interface SpecSpace {
    specVersion: number,
    entities: { [id: number]: Entity<EntitySpec> };
    globalMethods: { [id: number]: Method<MethodSpec> };
    confirmations: { [id: number]: Confirmation<ConfSpec> };
}

export type FieldValue<Spec extends FieldSpec> =
          { [K in keyof Spec["required"]]: TsType<Spec["required"][K]> }
        & { [K in keyof Spec["optional"]]?: TsType<Spec["optional"][K][1]> };

export abstract class Entity<Spec extends EntitySpec> extends Cloneable<Entity<Spec>> {
    readonly spec: Spec;
    readonly numericId: number;
    readonly session?: Session;

    value?: FieldValue<Spec["fields"]>;

    constructor(spec: Spec, numericId: number, session?: Session) {
        super();
        this.spec = spec;
        this.numericId = numericId;
        this.session = session;
    }
}

export abstract class Method<Spec extends MethodSpec> extends Cloneable<Method<Spec>> {
    readonly spec: Spec;
    readonly numericId: number;
    readonly entityNumericId?: number;

    params?: FieldValue<Spec["params"]>;
    returnVal?: FieldValue<Spec["returns"]>;
    entityId?: number;

    constructor(spec: Spec, numericId: number, entityNumericId?: number) {
        super();
        this.spec = spec;
        this.numericId = numericId;
        this.entityNumericId = entityNumericId;
    }
}

export abstract class Confirmation<Spec extends ConfSpec> extends Cloneable<Confirmation<Spec>> {
    readonly spec: Spec;
    readonly numericId: number;

    request?: FieldValue<Spec["request"]>;
    response?: FieldValue<Spec["response"]>;

    constructor(spec: Spec, numericId: number) {
        super();
        this.spec = spec;
        this.numericId = numericId;
    }
}

export class EventHost<Event> {
    private subs: ((ev: Event) => any)[] = [];

    constructor() { }

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

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
