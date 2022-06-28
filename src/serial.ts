// Handles field array (i.e. compounds) (de-)serialization into Uint8Arrays

import { Duplex } from "./common";
import { FieldArray, FieldSpec, FieldValue } from "./repr";

// Remembers (collects) and/or pushes out data from a buffer
class Collector extends Duplex {
    data: Uint8Array;

    constructor(initial?: Uint8Array) {
        super();
        this.data = initial ?? new Uint8Array(0);
    }

    // appends a buffer
    async write(val: Uint8Array): Promise<void> {
        const arr = new Uint8Array(this.data.length + val.length);
        arr.set(this.data);
        arr.set(val, this.data.length);
        this.data = arr;
    }

    // dequeues a buffer
    async read(num: number): Promise<Uint8Array> {
        const ret = this.data.slice(0, num);
        this.data = this.data.slice(num);
        return ret;
    }

    async close(): Promise<void> {
        this.trigger({ type: "closed" });
    }

    async flush() { }
}

// Uses the Collector to serialize/deserialize a FieldArray to memory
export class Serializer<Spec extends FieldSpec> {
    private readonly repr;
    private readonly hasOptional;

    constructor(spec: Spec) {
        this.repr = new FieldArray(spec);
        this.hasOptional = Object.keys(this.repr.spec.optional).length > 0;
    }

    async serialize(obj: FieldValue<Spec>): Promise<Uint8Array> {
        const collector = new Collector();
        const mode = this.repr.chooseMode(obj);
        const modeByte = (mode[0] ? 1 : 0) | (mode[1] ? 2 : 0);
        // only write the mode if there can be optional fields
        if(this.hasOptional) await collector.write(Uint8Array.from([modeByte]));

        await this.repr.write(collector, obj);
        return collector.data;
    }

    async deserialize(data: Uint8Array): Promise<FieldValue<Spec>> {
        const collector = new Collector(data);

        // only read the mode if there can be optional fields
        const modeByte = this.hasOptional ? (await collector.read(1))[0] : 0;
        const mode: [boolean, boolean] = [(modeByte & 1) > 0, (modeByte & 2) > 0];
        this.repr.setMode(mode);

        const result = await this.repr.read(collector);
        if(collector.data.length != 0)
            throw new Error("extra data in buffer after deserialization");
        return result;
    }
}
