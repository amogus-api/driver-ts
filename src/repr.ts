// This file is responsible for sending and receiving
// ([repr]esenting) data types over streams

import { Session } from "./session";
import { range, rangeCheck, Readable, Writable } from "./common";
import { ValuedEntity, SpecSpace } from "./things";

export abstract class DataRepr<T> {
    specSpace?: SpecSpace;
    session?: Session;

    abstract write(stream: Writable, value: T): Promise<void>;
    abstract read(stream: Readable): Promise<T>;
    abstract validate(value: T): boolean;
}
// The type that a DataRepr encloses
export type TsType<T> = T extends DataRepr<infer R> ? R : never;

interface IntValidators {
    val?: range;
}
export class Int extends DataRepr<number> {
    size: number;
    validators?: IntValidators;

    constructor(size: number, validators?: IntValidators) {
        super();
        this.size = size;
        this.validators = validators;
    }

    override async write(stream: Writable, value: number) {
        const data = Buffer.alloc(this.size);
        for(let i = 0; i < this.size; i++) {
            data[i] = value & 0xFF;
            value >>= 8;
        }
        await stream.write(data.reverse());
    }

    override async read(stream: Readable): Promise<number> {
        let value = 0;
        const data = await stream.read(this.size);
        for(let i = 0; i < this.size; i++)
            value |= data[i] << ((this.size - i - 1) * 8);
        return value;
    }

    override validate(value: number): boolean {
        if(this.validators?.val) {
            const [low, high] = this.validators.val;
            if(value < low || value > high)
                return false;
        }
        return true;
    }
}

export class Bool extends DataRepr<boolean> {
    constructor(_validators?: any) {
        super();
    }

    override async write(stream: Writable, value: boolean) {
        await new Int(1).write(stream, value ? 1 : 0);
    }

    override async read(stream: Readable): Promise<boolean> {
        const val = await new Int(1).read(stream);
        return val !== 0;
    }

    override validate(_value: boolean): boolean {
        return true;
    }
}

interface StrValidators {
    len?: range;
    match?: RegExp;
}
export class Str extends DataRepr<string> {
    validators?: StrValidators;
    private lenRepr: Int;

    constructor(validators?: StrValidators) {
        super();
        this.validators = validators;
        this.lenRepr = new Int(2);
    }

    override async write(stream: Writable, value: string) {
        const data = Buffer.from(value);
        await this.lenRepr.write(stream, value.length);
        await stream.write(data);
    }

    override async read(stream: Readable): Promise<string> {
        const len = await this.lenRepr.read(stream);
        const utf8: Buffer = await stream.read(len);
        return utf8.toString("utf8");
    }

    override validate(value: string): boolean {
        if(this.validators?.len) {
            if(!rangeCheck(this.validators.len, value.length))
                return false;
        }
        if(this.validators?.match) {
            const match = value.match(this.validators.match);
            return (match && value === match[0]) ?? false;
        }
        return true;
    }
}

export interface FieldSpec {
    required: { [name: string]: DataRepr<any> };
    optional: { [name: string]: [number, DataRepr<any>] };
}
export type FieldValue<Spec extends FieldSpec> =
          { [K in keyof Spec["required"]]: TsType<Spec["required"][K]> }
        & { [K in keyof Spec["optional"]]?: TsType<Spec["optional"][K][1]> };
export class FieldArray<Spec extends FieldSpec, Value extends FieldValue<Spec>> extends DataRepr<Value> {
    // The line above just makes sure that we only pass fields with valid names and values to the functions

    spec: FieldSpec;
    private readonly _hpSelLen: number; // high-packing mode selection bitfield length
    hasOptional = false;
    highPacking = false;

    constructor(spec: Spec) {
        super();
        this.spec = spec;

        // calculate overhead
        const maxOptional = Object.values(this.spec.optional)
            .map(x => x[0])
            .reduce((acc, x) => Math.max(acc, x), 0);
        this._hpSelLen = Math.ceil((maxOptional + 3) / 8);
    }

    // chooses the optimal encoding mode for a value
    // returns `[at_least_one_optional, high_packing]`
    chooseMode(value: object): [boolean, boolean] {
        const optional = Object.keys(value).filter(k => k in this.spec.optional).length;

        if(optional === 0) {
            this.hasOptional = false;
        } else {
            this.hasOptional = true;
            const normalOverhead = 1 + optional;
            this.highPacking = normalOverhead > this._hpSelLen;
        }

        return [this.hasOptional, this.highPacking];
    }

    setMode(mode: [boolean, boolean]) {
        [this.hasOptional, this.highPacking] = mode;
    }

    override async write(stream: Writable, value: Value) {
        // write required fields
        for(const k in this.spec.required)
            await this.spec.required[k].write(stream, value[k]);

        // write prefix for optional fields
        const optional = Object.keys(value).filter(k => k in this.spec.optional);
        if(optional.length == 0)
            return;
        if(this.highPacking) {
            // high-packing mode
            const sel = Buffer.alloc(this._hpSelLen);
            for(const k of optional) {
                const id = this.spec.optional[k][0];
                const [byte, bit] = [Math.floor(id / 8), 7 - (id % 8)];
                sel[byte] |= 1 << bit;
            }
            await stream.write(sel);
        } else {
            await new Int(1).write(stream, optional.length);
        }

        // write optional fields
        for(const k of optional) {
            if(!(k in value))
                continue;
            if(!this.highPacking)
                await new Int(1).write(stream, this.spec.optional[k][0]);
            await this.spec.optional[k][1].write(stream, value[k]);
        }
    }

    override async read(stream: Readable): Promise<Value> {
        const value: Record<string, unknown> = {};

        // read required fields
        for(const k in this.spec.required) {
            const repr = this.spec.required[k];
            repr.specSpace = this.specSpace;
            value[k] = await repr.read(stream);
        }

        // read optional fields
        if(this.hasOptional) {
            if(this.highPacking) {
                const select: Buffer = await stream.read(this._hpSelLen);
                for(let i = 0; i < this._hpSelLen * 8; i++) {
                    const [byte, bit] = [Math.floor(i / 8), 7 - (i % 8)];
                    if(select[byte] & (1 << bit)) {
                        const entry = Object.entries(this.spec.optional).find(x => x[1][0] == i);
                        if(!entry)
                            throw new Error(`Met field with unknown id "${i}" in high-packing mode`);

                        const repr = entry[1][1];
                        repr.specSpace = this.specSpace;
                        value[entry[0]] = await repr.read(stream);
                    }
                }
            } else {
                const int1 = new Int(1);
                const cnt = await int1.read(stream);
                for(let i = 0; i < cnt; i++) {
                    const id = await int1.read(stream);
                    const entry = Object.entries(this.spec.optional).find(x => x[1][0] == id);
                    if(!entry)
                        throw new Error(`Met field with unknown id "${id}" in normal mode`);

                    const repr = entry[1][1];
                    repr.specSpace = this.specSpace;
                    value[entry[0]] = await repr.read(stream);
                }
            }
        }

        return value as unknown as Value;
    }

    override validate(value: Value): boolean {
        for(const k in value) {
            let repr: DataRepr<any>;

            if(k in this.spec.required)
                repr = this.spec.required[k];
            else
                repr = this.spec.optional[k][1];

            if(!repr.validate(value[k]))
                return false;
        }

        return true;
    }
}

export class Entity extends DataRepr<ValuedEntity> {
    override async write(stream: Writable, value: ValuedEntity) {
        const array = new FieldArray(value.spec.fields);
        const [o, h] = array.chooseMode(value.value);
        const modeMask = (h ? 128 : 0) | (o ? 64 : 0);
        await new Int(1).write(stream, value.numericId | modeMask);
        await array.write(stream, value.value);
    }

    override async read(stream: Readable): Promise<ValuedEntity> {
        // read id
        let numericId = await new Int(1).read(stream);
        const mode: [boolean, boolean] = [(numericId & 64) > 0, (numericId & 128) > 0];
        numericId &= ~(128 | 64);

        if(!this.specSpace?.entities)
            throw new Error("No entity definitions provided");

        const entity = this.specSpace.entities[numericId].clone();
        const array = new FieldArray(entity.spec.fields);
        array.setMode(mode);
        array.specSpace = this.specSpace;
        const value = await array.read(stream);
        entity.value = value;
        // @ts-expect-error TS is not smart enough to figure out that `value` is not undefined
        return entity;
    }

    override validate(value: ValuedEntity) {
        return new FieldArray(value.spec.fields).validate(value.value);
    }
}

export class EnumOrBf<T extends number> extends DataRepr<T> {
    private readonly int: Int;

    constructor(size: number) {
        super();
        this.int = new Int(size);
    }

    override async write(stream: Writable, value: T): Promise<void> {
        await this.int.write(stream, value);
    }

    override async read(stream: Readable): Promise<T> {
        return await this.int.read(stream) as T;
    }

    override validate(value: T) {
        return (value >= 0) && (value < (1 << (8 * this.int.size)));
    }
}