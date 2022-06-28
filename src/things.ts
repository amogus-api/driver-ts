// Handles Entities, Methods, Confirmations and their specs

import { Cloneable, NotNull } from "./common";
import { FieldValue, FieldSpec, DataRepr, FieldKeys, getTypeOfKey, List, mergePlu } from "./repr";
import { Session, InvocationEvent } from "./session";

// Entity specification
export interface EntitySpec {
    fields: FieldSpec & {
        required: { id: DataRepr<any> },
        optional: Record<string, unknown>
    };
    methods: { [numericId: number]: Method };
}

// Entity that must have a non-null value
export type ValuedEntity<E extends Entity<EntitySpec> = Entity<EntitySpec>> =
    Omit<E, "value"> &
    Required<Pick<E, "value">>;

// Infers the entity specification
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

    // Defined by the spec, this definition just enforces its existence
    // (SUSC should output this method automatically)
    abstract update(_params: { entity: ValuedEntity }): Promise<Record<string, never>>;

    // User-facing update method
    async $update(toUpdate: Omit<FieldValue<Spec["fields"]>, "id">): Promise<void> {
        if(!this.value)
            throw new Error("This entity doesn't have a value");

        this.value = Entity.mergeValues(this.spec.fields, this.value, { ...toUpdate, id: this.value.id }) as
            FieldValue<Spec["fields"]>;

        const entity = this.clone();
        entity.value = { ...toUpdate, id: this.value.id } as FieldValue<Spec["fields"]>;

        await this.update({ entity: entity as ValuedEntity });
    }

    // Merges two entity values
    static mergeValues<S extends FieldSpec, T extends FieldValue<S>>(spec: S, first: T, second: T, expand = false): T {
        if(typeof first !== "object" && second !== undefined)
            return second;
        if(typeof first !== "object")
            return first;
        if(!expand)
            return Object.assign({ ...first }, second);

        const result = { ...first };

        for(const [k, v] of Object.entries(second)) {
            const key = k as FieldKeys<S>;
            const type = getTypeOfKey(spec, k);

            if(type instanceof List)
                result[key] = mergePlu(first[key], v) as T[keyof S["required"]] & T[keyof S["optional"]];
            else
                result[key] = Entity.mergeValues(spec, first[key], second[key]);
        }

        return result;
    }

    // User-facing get method
    static async $get(_id: any): Promise<ValuedEntity> {
        throw new Error("Not implemented");
    }
}



// Method specification
export interface MethodSpec {
    name: string;
    params: FieldSpec;
    returns: FieldSpec;
    confirmations: Confirmation[];
    rateLimit?: readonly [number, number];
    entityIdRepr?: DataRepr<any>;
}

// Infers the entity specification
export type GetMethodSpec<M> = M extends Method<infer S> ? S : never;

// Represents a method operation
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



// Confirmation specification
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



// Specification space (combines all definitions in one object)
export interface SpecSpace {
    specVersion: "2",
    project: string,
    entities: { [id: number]: Entity };
    globalMethods: { [id: number]: Method };
    confirmations: { [id: number]: Confirmation };
}

// Returns a union of all object values
type ObjValues<O> = O extends any ? O[keyof O] : never;

// Returns a union of all method names in a spec space
export type AllMethods<Spec extends SpecSpace> =
    ObjValues<Spec["globalMethods"]> |
    ObjValues<GetEntitySpec<ObjValues<Spec["entities"]>>["methods"]>;

// Function output by SUSC that returns a spec space with all its members bound to the
// provided session
export type SpecSpaceGen<Spec extends SpecSpace = SpecSpace> = (session: Session) => Spec;

// Infers the spec space type from a generator
export type SpaceOfGen<Gen extends SpecSpaceGen> = Gen extends SpecSpaceGen<infer S> ? S : never;
