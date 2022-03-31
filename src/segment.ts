// Handles segment encoding and decoding

import * as common from "./common";
import * as things from "./things";
import { Entity as EntityRepr, FieldArray, Int, Str } from "./repr";
import { Session } from "./session";

export abstract class Segment {
    transactionId: number;
    abstract readonly boundTo: common.PeerType;

    constructor(tran: number) {
        this.transactionId = tran;
    }

    static async decode(_session: Session<things.SpecSpace>, _stream: common.Readable, _prefix: number, _tran: number): Promise<Segment> {
        throw new Error("Not implemented");
    }

    static decodePrefix(prefix: number): [boolean, boolean] {
        return [(prefix & 16) > 0, (prefix & 32) > 0];
    }

    async encode(_stream: common.Writable): Promise<void> {
        throw new Error("Not implemented");
    }

    async write(stream: common.Writable) {
        await stream.write(Buffer.from([this.transactionId]));
        await this.encode(stream);
    }

    static async read(session: Session<things.SpecSpace>, stream: common.Readable, boundTo: common.PeerType): Promise<Segment> {
        const [tran, prefix] = [...await stream.read(2)];
        const concreteClass = {
            "server": [
                InvokeMethodSegment,
                undefined,
                ConfResponseSegment,
                undefined,
            ],
            "client": [
                MethodReturnSegment,
                EntityUpdateSegment,
                ConfRequestSegment,
                MethodErrorSegment,
            ],
        }[boundTo][prefix >> 6];

        if(!concreteClass)
            throw new Error("Invalid segment number");
        return await concreteClass.decode(session, stream, prefix, tran);
    }
}

export class InvokeMethodSegment extends Segment {
    readonly boundTo = "server";
    payload: things.Method<things.MethodSpec>;

    constructor(tran: number, payload: things.Method<things.MethodSpec>) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session<things.SpecSpace>, stream: common.Readable, prefix: number, tran: number): Promise<InvokeMethodSegment> {
        // read IDs
        let numericId = (await stream.read(1))[0];
        let numericEntityId: number|undefined = undefined; // the signature of an entity type
        let entityId: number|undefined = undefined; // the ID used to reference an entity

        if(numericId & 0x80) { // highest bit set
            numericEntityId = (await stream.read(1))[0];
            if(numericEntityId & 0x80) {
                entityId = await new Int(8).read(stream);
                numericEntityId &= ~0x80;
                numericId &= ~0x80; // clear highest bit to indicate a dynamic method
            }
        }

        // get method template
        const methodSet = numericEntityId === undefined
            ? session.specSpace.globalMethods
            : session.specSpace.entities[numericEntityId].spec.methods;
        const method = methodSet[numericId].clone();

        // read fields
        const array = new FieldArray(method.spec.params);
        array.setMode(Segment.decodePrefix(prefix));
        array.specSpace = session.specSpace;
        const value = await array.read(stream);

        method.params = value;
        method.entityId = entityId;
        return new InvokeMethodSegment(tran, method);
    }

    override async encode(stream: common.Writable): Promise<void> {
        if(!this.payload.params)
            throw new Error("Null payload");

        // write prefix
        const array = new FieldArray(this.payload.spec.params);
        const [o, h] = array.chooseMode(this.payload.params);
        const modeMask = (h ? 32 : 0) | (o ? 16 : 0);
        const prefix = (0 << 6) | modeMask;
        await stream.write(Buffer.from([prefix]));

        // write IDs
        let numId = this.payload.numericId;
        let entNumId = this.payload.entityNumericId;
        const entId = this.payload.entityId;

        if(entNumId !== undefined) {
            numId |= 0x80;
            if(entId !== undefined)
                entNumId |= 0x80;
        }

        await stream.write(Buffer.from([numId]));
        if(entNumId !== undefined)
            await stream.write(Buffer.from([entNumId]));
        if(entId !== undefined)
            await new Int(8).write(stream, entId);

        // write fields
        await array.write(stream, this.payload.params);
    }
}

export class ConfResponseSegment extends Segment {
    readonly boundTo = "server";
    payload: things.Confirmation<things.ConfSpec>;

    constructor(tran: number, payload: things.Confirmation<things.ConfSpec>) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session<things.SpecSpace>, stream: common.Readable, prefix: number, tran: number): Promise<ConfResponseSegment> {
        // find spec
        const transaction = session.transactions.find(x => x.id == tran);
        if(!transaction)
            throw new Error("Unexpected CRSP segment");
        const conf = ([...transaction.segments].reverse()[0] as ConfRequestSegment).payload;

        // read fields
        const array = new FieldArray(conf.spec.response);
        array.setMode(Segment.decodePrefix(prefix));
        array.specSpace = session.specSpace;
        const value = await array.read(stream);

        conf.response = value;
        return new ConfResponseSegment(tran, conf);
    }

    override async encode(stream: common.Writable): Promise<void> {
        if(!this.payload.response)
            throw new Error("Null payload");

        // write prefix
        const array = new FieldArray(this.payload.spec.response);
        const [o, h] = array.chooseMode(this.payload.response);
        const modeMask = (h ? 32 : 0) | (o ? 16 : 0);
        const prefix = (2 << 6) | modeMask;
        await stream.write(Buffer.from([prefix]));

        // write fields
        await array.write(stream, this.payload.response);
    }
}

export class MethodReturnSegment extends Segment {
    readonly boundTo = "client";
    payload: things.Method<things.MethodSpec>;

    constructor(tran: number, payload: things.Method<things.MethodSpec>) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session<things.SpecSpace>, stream: common.Readable, prefix: number, tran: number): Promise<MethodReturnSegment> {
        // find spec
        const transaction = session.transactions.find(x => x.id == tran);
        if(!transaction)
            throw new Error("Unexpected MRET segment");
        const method = (transaction.segments[0] as InvokeMethodSegment).payload.clone();
        method.params = undefined;

        // read fields
        const array = new FieldArray(method.spec.returns);
        array.specSpace = session.specSpace;
        array.setMode(Segment.decodePrefix(prefix));
        const value = await array.read(stream);

        method.returnVal = value;
        return new MethodReturnSegment(tran, method);
    }

    override async encode(stream: common.Writable): Promise<void> {
        if(!this.payload.returnVal)
            throw new Error("Null payload");

        // write prefix
        const array = new FieldArray(this.payload.spec.returns);
        const [o, h] = array.chooseMode(this.payload.returnVal);
        const modeMask = (h ? 32 : 0) | (o ? 16 : 0);
        const prefix = (0 << 6) | modeMask;
        await stream.write(Buffer.from([prefix]));

        // write fields
        await array.write(stream, this.payload.returnVal);
    }
}

export class EntityUpdateSegment extends Segment {
    readonly boundTo = "client";
    payload: things.ValuedEntity;

    constructor(tran: number, payload: things.ValuedEntity) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session<things.SpecSpace>, stream: common.Readable, _prefix: number, tran: number): Promise<EntityUpdateSegment> {
        const repr = new EntityRepr();
        repr.specSpace = session.specSpace;
        const value = await repr.read(stream);
        return new EntityUpdateSegment(tran, value);
    }

    override async encode(stream: common.Writable): Promise<void> {
        await stream.write(Buffer.from([1 << 6]));
        const repr = new EntityRepr();
        repr.specSpace = {
            entities: { [this.payload.numericId]: this.payload as things.Entity<things.EntitySpec> },
            specVersion: "2",
            project: "$tmp!",
            globalMethods: {},
            confirmations: {},
        };
        await repr.write(stream, this.payload);
    }
}

export class ConfRequestSegment extends Segment {
    readonly boundTo = "client";
    payload: things.Confirmation<things.ConfSpec>;

    constructor(tran: number, payload: things.Confirmation<things.ConfSpec>) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session<things.SpecSpace>, stream: common.Readable, prefix: number, tran: number): Promise<ConfRequestSegment> {
        // the ID is in the prefix
        const numericId = prefix & 0x0F;
        const conf = session.specSpace.confirmations[numericId].clone();

        // read fields
        const array = new FieldArray(conf.spec.request);
        array.setMode(Segment.decodePrefix(prefix));
        const value = await array.read(stream);

        conf.request = value;
        return new ConfRequestSegment(tran, conf);
    }

    override async encode(stream: common.Writable): Promise<void> {
        if(!this.payload.request)
            throw new Error("Null payload");

        // write prefix
        const array = new FieldArray(this.payload.spec.request);
        const [o, h] = array.chooseMode(this.payload.request);
        const modeMask = (h ? 32 : 0) | (o ? 16 : 0);
        const prefix = (2 << 6) | modeMask | this.payload.numericId;
        await stream.write(Buffer.from([prefix]));

        // write fields
        await array.write(stream, this.payload.request);
    }
}

export class MethodErrorSegment extends Segment {
    readonly boundTo = "client";
    payload: { code: number, msg: string };

    constructor(tran: number, payload: { code: number, msg: string }) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(_session: Session<things.SpecSpace>, stream: common.Readable, _prefix: number, tran: number): Promise<MethodErrorSegment> {
        const payload = await new FieldArray({
            required: { code: new Int(2), msg: new Str() },
            optional: { },
        }).read(stream);
        return new MethodErrorSegment(tran, payload);
    }

    override async encode(stream: common.Writable): Promise<void> {
        await stream.write(Buffer.from([3 << 6]));
        await new Int(2).write(stream, this.payload.code);
        await new Str().write(stream, this.payload.msg);
    }
}
