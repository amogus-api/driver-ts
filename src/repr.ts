// This file is responsible for sending and receiving
// (representing) data types over streams

import { range, rangeCheck, FieldSpec, Entity as EntityObj, DataRepr, FieldValue, Readable, Writable, EntitySpec } from "./common";

interface IntValidators {
    val?: range
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

export class FieldArray<Spec extends FieldSpec, Value extends FieldValue<Spec>> extends DataRepr<Value> {
    // The line above just makes sure that we only pass fields with valid names and values to the functions

    spec: FieldSpec;
    private _hpSelLen: number; // high-packing mode selection bitfield length
    hasOptional = false;
    highPacking = false;

    constructor(spec: Spec) {
        super();
        this.spec = spec;

        // calculate overhead
        const maxOptional = Object.values(this.spec.optional)
            .map(x => x[0])
            .reduce((acc, x) => Math.max(acc, x), 0);
        this._hpSelLen = Math.ceil(maxOptional / 8);
    }

    // chooses the optimal encoding mode for a value
    // returns `[at_least_one_optional, high_packing]`
    chooseMode(value: object): [boolean, boolean] {
        const optional = Object.keys(value).filter(k => k in this.spec.optional);
        if(optional.length == 0) {
            this.hasOptional = false;
            this._hpSelLen = 0;
        } else {
            this.hasOptional = true;
            const normalOverhead = 1 + optional.length;
            this._hpSelLen = (normalOverhead > this._hpSelLen) ? 0 : this._hpSelLen;
        }
        return [this.hasOptional, this.highPacking];
    }

    setMode(mode: [boolean, boolean]) {
        [this.hasOptional, this.highPacking] = mode;
    }

    override async write(stream: Writable, value: Value) {
        // write required fields
        for(const k in this.spec.required)
            this.spec.required[k].write(stream, value[k]);

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
            this.spec.optional[k][1].write(stream, value[k]);
        }
    }

    override async read(stream: Readable): Promise<Value> {
        const value: Record<string, unknown> = {};

        // read required fields
        for(const k in this.spec.required)
            value[k] = await this.spec.required[k].read(stream);

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
                        value[entry[0]] = entry[1][1].read(stream);
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
                    value[entry[0]] = entry[1][1].read(stream);
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

type DefiniteEntity = Required<EntityObj<EntitySpec>>;
export class Entity extends DataRepr<DefiniteEntity> {
    private _definitions: { [id: number]: EntityObj<EntitySpec> };

    constructor(definitions: { [id: number]: EntityObj<EntitySpec> }) {
        super();
        this._definitions = definitions;
    }

    override async write(stream: Writable, value: DefiniteEntity) {
        const array = new FieldArray(value.spec.fields);
        const [h, o] = array.chooseMode(value);
        const modeMask = (h ? 128 : 0) | (o ? 64 : 0);
        await new Int(1).write(stream, value.numericId | modeMask);
        await array.write(stream, value.value);
    }

    override async read(stream: Readable): Promise<DefiniteEntity> {
        // read id
        let numericId = await new Int(1).read(stream);
        const mode: [boolean, boolean] = [(numericId & 64) > 0, (numericId & 128) > 0];
        numericId &= ~(128 | 64);

        const entity = this._definitions[numericId].clone();
        const array = new FieldArray(entity.spec.fields);
        array.setMode(mode);
        const value = await array.read(stream);
        entity.value = value;
        // @ts-expect-error TS is not smart enough to figure out that `value` is not undefined
        return entity;
    }

    override validate(value: DefiniteEntity) {
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