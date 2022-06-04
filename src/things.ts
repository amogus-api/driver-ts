// Handles Entities, Methods, Confirmations and their specs

import { Cloneable, NotNull } from "./common";
import { FieldValue, FieldSpec, DataRepr, FieldKeys, getTypeOfKey, List, ListUpdate } from "./repr";
import { Session, InvocationEvent } from "./session";

export interface EntitySpec {
    fields: FieldSpec & {
        required: { id: DataRepr<any> },
        optional: Record<string, unknown>
    };
    methods: { [numericId: number]: Method };
}

export type ValuedEntity<E extends Entity<EntitySpec> = Entity<EntitySpec>> =
    Omit<E, "value"> &
    Required<Pick<E, "value">>;

export type GetEntitySpec<E> = E extends Entity<infer S> ? S : never;

export abstract class Entity<Spec extends EntitySpec = EntitySpec> extends Cloneable {
    readonly spec: Spec;
    readonly numericId: number;
    value?: FieldValue<Spec["fields"]>;

    protected static readonly session?: Session;
    readonly dynSession?: Session;

    constructor(spec: Spec, numericId: number, value?: FieldValue<Spec["fields"]>) {
        super();
        this.spec = spec;
        this.numericId = numericId;
        this.value = value;
    }

    abstract update(_params: { entity: ValuedEntity }): Promise<Record<string, never>>;

    async $update(toUpdate: Omit<FieldValue<Spec["fields"]>, "id">): Promise<void> {
        if(!this.value)
            throw new Error("This entity doesn't have a value");

        this.value = Entity.mergeValues(this.spec.fields, this.value, { ...toUpdate, id: this.value.id }) as
            FieldValue<Spec["fields"]>;

        const entity = this.clone();
        entity.value = { ...toUpdate, id: this.value.id } as FieldValue<Spec["fields"]>;

        await this.update({ entity: entity as ValuedEntity });
    }

    private static extractObject<S extends { [K: string]: any }>(source: S, ...keys: string[]) {
        const result = {} as { [K: string]: any };
        for(const key of keys)
            result[key] = source[key];
        return result;
    }

    static mergeValues<S extends FieldSpec, T extends FieldValue<S>>(s: S, a: T, b: T, expand = false): T {
        if(typeof a !== "object" && b !== undefined)
            return b;
        if(typeof a !== "object")
            return a;
        if(!expand)
            return Object.assign({ ...a }, b);

        const result = { ...a };

        for(const [k, v] of Object.entries(b)) {
            const key = k as FieldKeys<S>;
            const value = v as T[FieldKeys<S>];
            const type = getTypeOfKey(s, k);

            if(type instanceof List && "partial" in value) {
                const arr = v as ListUpdate<any>;
                const res = result as { [K in any]: ListUpdate<any> };
                const partial = arr.partial;

                if(partial === "append") res[key].push(...arr);
                if(partial === "prepend") res[key].unshift(...arr);
                if(partial === "insert") res[key].splice(arr.index, 0, ...arr);
                if(partial === "remove") res[key].splice(arr.index, arr.count);

                Object.assign(res[key], Entity.extractObject(arr, "partial", "count", "index"));
            } else {
                result[key] = Entity.mergeValues(s, a[key], b[key]);
            }
        }

        return result;
    }

    static async $get(_id: any): Promise<ValuedEntity> {
        throw new Error("Not implemented");
    }
}



export interface MethodSpec {
    name: string;
    params: FieldSpec;
    returns: FieldSpec;
    confirmations: Confirmation[];
    rateLimit?: readonly [number, number];
    entityIdRepr?: DataRepr<any>;
}
export type GetMethodSpec<M> = M extends Method<infer S> ? S : never;

export abstract class Method<Spec extends MethodSpec = MethodSpec> extends Cloneable {
    readonly spec: Spec;
    readonly numericId: number;
    readonly entityTypeId?: number;

    params?: FieldValue<Spec["params"]>;
    returnVal?: FieldValue<Spec["returns"]>;
    entityId?: Spec["entityIdRepr"] extends DataRepr<infer T> ? T : any;

    sessionEvent?: InvocationEvent<NotNull<Method<Spec>, "params">>;

    constructor(spec: Spec, numericId: number, entityTypeId?: number) {
        super();
        this.spec = spec;
        this.numericId = numericId;
        this.entityTypeId = entityTypeId;
    }

    async return(ret: FieldValue<Spec["returns"]>): Promise<void> {
        if(!this.sessionEvent)
            throw new Error("No event to respond to");
        return this.sessionEvent.return(ret);
    }

    async error(code: number, message: string): Promise<void> {
        if(!this.sessionEvent)
            throw new Error("No event to respond to");
        return await this.sessionEvent.error(code, message);
    }

    async confirm<C extends Spec["confirmations"][number]>(conf: C, data: C["request"]): Promise<NonNullable<C["response"]>> {
        if(!this.sessionEvent)
            throw new Error("No event to respond to");
        return await this.sessionEvent.confirm(conf, data);
    }
}



export interface ConfSpec {
    request: FieldSpec;
    response: FieldSpec;
}

export abstract class Confirmation<Spec extends ConfSpec = ConfSpec> extends Cloneable {
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



export interface SpecSpace {
    specVersion: "2",
    project: string,
    entities: { [id: number]: Entity };
    globalMethods: { [id: number]: Method };
    confirmations: { [id: number]: Confirmation };
}

type ObjValues<O> = O extends any ? O[keyof O] : never;
export type AllMethods<Spec extends SpecSpace> =
    ObjValues<Spec["globalMethods"]> |
    ObjValues<GetEntitySpec<ObjValues<Spec["entities"]>>["methods"]>;

export type SpecSpaceGen<Spec extends SpecSpace = SpecSpace> = (session: Session<Spec>) => Spec;
export type SpaceOfGen<Gen> = Gen extends SpecSpaceGen<infer S> ? S : never;
