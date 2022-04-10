// Handles field array (i.e. compounds) (de-)serialization into Buffers

import { ReadableWritable } from "./common";
import { FieldArray, FieldSpec, FieldValue } from "./repr";

class Collector implements ReadableWritable {
    data: Buffer;

    constructor(initial?: Buffer) {
        this.data = initial ?? Buffer.alloc(0);
    }

    async write(val: Buffer): Promise<void> {
        this.data = Buffer.concat([this.data, val]);
    }

    async read(num: number): Promise<Buffer> {
        const ret = this.data.slice(0, num);
        this.data = this.data.slice(num);
        return ret;
    }

    async close(): Promise<void> {
        // nothing to do
    }
}

export class Serializer<Spec extends FieldSpec> {
    private readonly repr;
    private readonly hasOptional;

    constructor(spec: Spec) {
        this.repr = new FieldArray(spec);
        this.hasOptional = Object.keys(this.repr.spec.optional).length > 0;
    }

    async serialize(obj: FieldValue<Spec>): Promise<Buffer> {
        const collector = new Collector();
        const mode = this.repr.chooseMode(obj);
        const modeByte = (mode[0] ? 1 : 0) | (mode[1] ? 2 : 0);
        // only write the mode if there can be optional fields
        if(this.hasOptional) await collector.write(Buffer.from([modeByte]));

        await this.repr.write(collector, obj);
        return collector.data;
    }

    async deserialize(data: Buffer): Promise<FieldValue<Spec>> {
        const collector = new Collector(data);

        // only read the mode if there can be optional fields
        const modeByte = this.hasOptional ? (await collector.read(1))[0] : 0;
        const mode: [boolean, boolean] = [(modeByte & 1) > 0, (modeByte & 2) > 0];
        this.repr.setMode(mode);

        return await this.repr.read(collector);
    }
}
