// Handles Entities, Methods, Confirmations and their specs

import { Cloneable, NotNull } from "./common";
import { FieldValue, FieldSpec } from "./repr";
import { Session, InvocationEvent } from "./session";

export interface EntitySpec {
    fields: FieldSpec;
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

    async $update(toUpdate: Partial<FieldValue<Spec["fields"]>>): Promise<void> {
        this.value = { ...this.value, ...toUpdate };

        if(!this.value)
            throw new Error("This entity doesn't have a value");

        const entity = this.clone();
        const required = Object.fromEntries(
            Object.entries(this.value).filter(([k, _]) => k in this.spec.fields.required));
        entity.value = { ...required, ...toUpdate };

        await this.update({ entity: entity as ValuedEntity });
    }

    static async $get(_id: number): Promise<ValuedEntity> {
        throw new Error("Not implemented");
    }
}



export interface MethodSpec {
    name: string;
    params: FieldSpec;
    returns: FieldSpec;
    confirmations: Confirmation[];
}
export type GetMethodSpec<M> = M extends Method<infer S> ? S : never;

export abstract class Method<Spec extends MethodSpec = MethodSpec> extends Cloneable {
    readonly spec: Spec;
    readonly numericId: number;
    readonly entityNumericId?: number;

    params?: FieldValue<Spec["params"]>;
    returnVal?: FieldValue<Spec["returns"]>;
    entityId?: number;

    sessionEvent?: InvocationEvent<NotNull<Method<Spec>, "params">>;

    constructor(spec: Spec, numericId: number, entityNumericId?: number) {
        super();
        this.spec = spec;
        this.numericId = numericId;
        this.entityNumericId = entityNumericId;
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
