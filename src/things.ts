// Handles Entities, Methods, Confirmations and their specs

import { Cloneable, NotNull } from "./common";
import { FieldValue, FieldSpec } from "./repr";
import { Session, InvocationEvent } from "./session";

export interface EntitySpec {
    fields: FieldSpec;
    methods: { [numericId: number]: Method<MethodSpec> };
}
export type ValuedEntity = NotNull<Entity<EntitySpec>, "value">;
export type ConcreteValuedEntity<E extends Entity<EntitySpec>> = NotNull<E, "value">;
export type GetEntitySpec<E> = E extends Entity<infer S> ? S : never;
export abstract class Entity<Spec extends EntitySpec> extends Cloneable {
    readonly spec: Spec;
    readonly numericId: number;
    value?: FieldValue<Spec["fields"]>;

    protected static session?: Session<SpecSpace>;
    protected dynSession?: Session<SpecSpace>;

    constructor(spec: Spec, numericId: number, value?: FieldValue<Spec["fields"]>) {
        super();
        this.spec = spec;
        this.numericId = numericId;
        this.value = value;
    }

    protected update(_params: { entity: ValuedEntity }): Promise<Record<string, never>> {
        throw new Error("Not implemented");
    }
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
    confirmations: Confirmation<any>[];
}
export type GetMethodSpec<M> = M extends Method<infer S> ? S : never;
export abstract class Method<Spec extends MethodSpec> extends Cloneable {
    readonly spec: Spec;
    readonly numericId: number;
    readonly entityNumericId?: number;

    params?: FieldValue<Spec["params"]>;
    returnVal?: FieldValue<Spec["returns"]>;
    entityId?: number;

    sessionEvent?: InvocationEvent<Method<Spec>>;

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
export abstract class Confirmation<Spec extends ConfSpec> extends Cloneable {
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
    entities: { [id: number]: Entity<EntitySpec> };
    globalMethods: { [id: number]: Method<MethodSpec> };
    confirmations: { [id: number]: Confirmation<ConfSpec> };
}

type ObjValues<O> = O extends any ? O[keyof O] : never;
export type AllMethods<Spec extends SpecSpace> =
    ObjValues<Spec["globalMethods"]> |
    ObjValues<GetEntitySpec<ObjValues<Spec["entities"]>>["methods"]>;

export type SpecSpaceGen<Spec extends SpecSpace> = (session: Session<Spec>) => Spec;
export type SpaceOfGen<Gen> = Gen extends SpecSpaceGen<infer S> ? S : never;
