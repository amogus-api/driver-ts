// Handles Entities, Methods, Confirmations and their specs

import { Cloneable } from "./common";
import { FieldValue, FieldSpec } from "./repr";
import { Session, InvocationSessionEvent } from "./session";
import { EntityUpdateSegment } from "./segment";

export interface EntitySpec {
    fields: FieldSpec;
    methods: { [numericId: number]: Method<MethodSpec> };
}
export abstract class Entity<Spec extends EntitySpec> extends Cloneable {
    readonly spec: Spec;
    readonly numericId: number;
    value?: FieldValue<Spec["fields"]>;

    protected static readonly session?: Session;
    protected readonly dynSession?: Session;

    constructor(spec: Spec, numericId: number, value?: FieldValue<Spec["fields"]>) {
        super();
        this.spec = spec;
        this.numericId = numericId;
        this.value = value;
    }

    async $update(toUpdate: Partial<FieldValue<Spec["fields"]>>) {
        this.value = { ...this.value, ...toUpdate };

        if(!this.value)
            throw new Error("This entity doesn't have a value");

        const entity = this.clone();
        const required = Object.fromEntries(
            Object.entries(this.value).filter(([k, _]) => k in this.spec.fields.required));
        entity.value = { ...required, ...toUpdate };

        await this.dynSession?.createTransaction(new EntityUpdateSegment(0, entity as Required<Entity<Spec>>));
    }
}

export interface MethodSpec {
    params: FieldSpec;
    returns: FieldSpec;
    confirmations: Confirmation<any>[];
}
export abstract class Method<Spec extends MethodSpec> extends Cloneable {
    readonly spec: Spec;
    readonly numericId: number;
    readonly entityNumericId?: number;

    params?: FieldValue<Spec["params"]>;
    returnVal?: FieldValue<Spec["returns"]>;
    entityId?: number;

    sessionEvent?: InvocationSessionEvent<Method<Spec>>;

    constructor(spec: Spec, numericId: number, entityNumericId?: number) {
        super();
        this.spec = spec;
        this.numericId = numericId;
        this.entityNumericId = entityNumericId;
    }

    async return(ret: FieldValue<Spec["returns"]>) {
        return this.sessionEvent?.return(ret);
    }
    async error(code: number, message: string) {
        return this.sessionEvent?.error(code, message);
    }
    async confirm<C extends Spec["confirmations"][number]>(conf: C, data: C["request"]) {
        return this.sessionEvent?.confirm(conf, data);
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
    specVersion: number,
    entities: { [id: number]: Entity<EntitySpec> };
    globalMethods: { [id: number]: Method<MethodSpec> };
    confirmations: { [id: number]: Confirmation<ConfSpec> };
}
