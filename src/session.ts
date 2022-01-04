// This file is responsible for handling sessions, transactions and related stateful things

import * as common from "./common";
import { Entity as EntityRepr, FieldArray, Int, Str } from "./repr";

export type TransactionCallbackData = (
    { type: "created" } |
    { type: "inbound", segment: Segment } |
    { type: "outbound", segment: Segment } |
    { type: "finished" } |
    { type: "cancelled" });
export type TransactionCallback = (event: TransactionCallbackData & { tranId: number }) => any;

export type ConfCallback<T extends common.Method<any>> =
    (data: common.ValueUnion<T["spec"]["confirmations"]>["request"]) =>
   Promise<common.ValueUnion<T["spec"]["confirmations"]>["response"]>;

export class Transaction {
    session: Session;
    id: number;
    segments: Segment[] = [];
    callback?: TransactionCallback;

    constructor(session: Session, id: number, callback?: (data: any) => any) {
        this.session = session;
        this.id = id;
        this.callback = callback;
    }

    finalized(): boolean {
        const first = this.segments[0];
        const last = this.segments.reverse()[0];
        
        if(first instanceof InvokeMethodSegment)
            return (last instanceof MethodReturnSegment) || (last instanceof MethodErrorSegment);

        if(first instanceof UpdateEntitySegment || first instanceof EntityUpdateSegment)
            return true;

        return false;
    }

    notify(data: TransactionCallbackData): any {
        if(this.callback)
            return this.callback({ ...data, tranId: this.id });
    }
}

export abstract class Session {
    specSpace: common.SpecSpace;
    stream: common.ReadableWritable;
    self: common.PeerType;
    transactions: Transaction[] = [];
    active: boolean = false;

    constructor(specSpace: common.SpecSpace, stream: common.ReadableWritable, self: common.PeerType) {
        this.specSpace = specSpace;
        this.stream = stream;
        this.self = self;
        this.run();
    }

    private run() {
        const cycle: () => void = () => {
            if(!this.active)
                return;
            this.readSegment().then((_) => cycle());
        };
        this.active = true;
        cycle();
    }

    stop() {
        this.active = false;
        this.stream.close();
    }

    async readSegment(): Promise<Segment> {
        const segment = await Segment.read(this, this.stream, this.self);

        // if the segment is a TranSyn, forget all transactions and read the next segment
        if(segment instanceof TranSynSegment) {
            this.transactions = [];
            return await this.readSegment();
        }

        // add the segment to its transaction
        var transaction = this.transactions.find(x => x.id === segment.transactionId);
        if(!transaction) {
            transaction = new Transaction(this, segment.transactionId);
            this.transactions.push(transaction);
        }
        transaction?.notify({ type: "inbound", segment: segment });

        // remove the transaction if it's finished
        if(transaction.finalized()) {
            this.transactions = this.transactions.filter(x => x.id !== transaction!.id);
            transaction.notify({ type: "finished" });
        }

        return segment;
    }

    async writeSegment(segment: Segment): Promise<void> {
        const transaction = this.transactions[segment.transactionId];
        transaction?.notify({ type: "outbound", segment: segment });
        await segment.write(this.stream);
    }

    async tranSync(): Promise<void> {
        for(const transaction of this.transactions)
            transaction.notify({ type: "cancelled" });
        this.transactions = [];
        await this.writeSegment(new TranSynSegment(0));
    }

    async createTransaction(initSegment: Segment, callback?: TransactionCallback): Promise<Transaction> {
        // get the first free id
        const allIds = this.transactions.map(x => x.id);
        const freeIds = Array.from({ length: 256 }, (_, i) => i).filter(id => !(id in allIds));
        if(!freeIds.length)
            throw new Error("All transaction slots are taken. Consider doing a TranSync");
        const id = freeIds[0];
        
        // create the transaction and remember it
        const transaction = new Transaction(this, id);
        initSegment.transactionId = id;
        transaction.callback = callback;
        this.transactions.push(transaction);
        transaction.notify({ type: "created" });
        await this.writeSegment(initSegment);
        return transaction;
    }

    invokeMethod<T extends common.Method<any>>(
        method: T,
        confirmationCallback?: ConfCallback<T>
    ): Promise<common.FieldValue<T["spec"]["returns"]>> {
        return new Promise((resolve, reject) => {
            this.createTransaction(new InvokeMethodSegment(0, method), (event) => {
                if(event.type === "cancelled")
                    reject("cancelled by a TranSyn segment");

                else if(event.type === "inbound") {
                    if(event.segment instanceof ConfRequestSegment) {
                        if(!confirmationCallback) {
                            reject("no confirmationCallback supplied but a ConfRequest segment was received");
                            return;
                        }
                        // we can be sure it's okay because the decoder checked it
                        confirmationCallback(event.segment.payload.request).then((response) =>
                            this.writeSegment(new ConfResponseSegment(event.tranId, response)));
                    } else if(event.segment instanceof MethodReturnSegment) {
                        // we can be just as sure here
                        resolve(event.segment.payload as unknown as common.FieldValue<T["spec"]["returns"]>);
                    } else if(event.segment instanceof MethodErrorSegment) {
                        reject({ code: event.segment.payload.code, message: event.segment.payload.msg });
                    }
                }
            })
        });
    }
}

export abstract class Segment {
    transactionId: number;
    abstract readonly boundTo: common.PeerType;

    constructor(tran: number) {
        this.transactionId = tran;
    }

    static async decode(_session: Session, _stream: common.Readable, _prefix: number, _tran: number): Promise<Segment> {
        throw new Error("Not implemented");
    }

    static decodePrefix(prefix: number): [boolean, boolean] {
        return [(prefix & 16) > 0, (prefix & 32) > 0]
    }
    
    async encode(_stream: common.Writable): Promise<void> {
        throw new Error("Not implemented");
    }

    async write(stream: common.Writable) {
        await stream.write(Buffer.from([this.transactionId]));
    }

    static async read(session: Session, stream: common.Readable, boundTo: common.PeerType): Promise<Segment> {
        const tran: number = (await stream.read(1))[0];
        const prefix: number = (await stream.read(1))[0];
        const concreteClass = {
            "server": [
                InvokeMethodSegment,
                UpdateEntitySegment,
                ConfResponseSegment,
                TranSynSegment
            ],
            "client": [
                MethodReturnSegment,
                EntityUpdateSegment,
                ConfRequestSegment,
                MethodErrorSegment
            ]
        }[boundTo][prefix >> 6];
        return await concreteClass.decode(session, stream, prefix, tran);
    }
}

export class InvokeMethodSegment extends Segment {
    readonly boundTo = "server";
    payload: common.Method<common.MethodSpec>;

    constructor(tran: number, payload: common.Method<common.MethodSpec>) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session, stream: common.Readable, prefix: number, tran: number): Promise<InvokeMethodSegment> {
        // read IDs
        var numericId = (await stream.read(1))[0];
        var numericEntityId: number | undefined = undefined;
        var entityId: number | undefined = undefined; // the ID used to reference an entity
        if(numericId & 0x80) { // highest bit set
            numericEntityId = (await stream.read(1))[0];
            numericId &= ~0x80;
            if(numericEntityId & 0x80) {
                entityId = await new Int(8).read(stream);
                numericId &= ~0x80;
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
        const value = await array.read(stream);

        method.params = value;
        method.entityId = entityId;
        return new InvokeMethodSegment(tran, method);
    }

    override async encode(stream: common.Writable): Promise<void> {
        // write prefix
        const array = new FieldArray(this.payload.spec.params);
        const [h, o] = array.chooseMode(this.payload.params!);
        const modeMask = (h ? 32 : 0) | (o ? 16 : 0);
        const prefix = (0 << 6) | modeMask;
        await stream.write(Buffer.from([prefix]));

        // write IDs
        await stream.write(Buffer.from([this.payload.numericId]));
        if(this.payload.entityNumericId !== undefined)
            await stream.write(Buffer.from([this.payload.entityNumericId]));
        if(this.payload.entityId !== undefined)
            await stream.write(Buffer.from([this.payload.entityId]));

        // write fields
        await array.write(stream, this.payload.params!);
    }
}

export class UpdateEntitySegment extends Segment {
    readonly boundTo = "server";
    payload: common.Entity<common.EntitySpec>;

    constructor(tran: number, payload: common.Entity<common.EntitySpec>) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session, stream: common.Readable, _prefix: number, tran: number): Promise<UpdateEntitySegment> {
        const value = await new EntityRepr(session.specSpace.entities).read(stream);
        return new UpdateEntitySegment(tran, value);
    }

    override async encode(stream: common.Writable): Promise<void> {
        await stream.write(Buffer.from([1 << 6]));
        await new EntityRepr({ [this.payload.numericId]: this.payload }).write(stream, this.payload);
    }
}

export class ConfResponseSegment extends Segment {
    readonly boundTo = "server";
    payload: common.Confirmation<common.ConfSpec>;

    constructor(tran: number, payload: common.Confirmation<common.ConfSpec>) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session, stream: common.Readable, prefix: number, tran: number): Promise<ConfResponseSegment> {
        // find spec
        const transaction = session.transactions.find(x => x.id == tran);
        const conf = (transaction!.segments.reverse()[0] as ConfRequestSegment).payload.clone();
        conf.request = undefined;

        // read fields
        const array = new FieldArray(conf.spec.response);
        array.setMode(Segment.decodePrefix(prefix));
        const value = await array.read(stream);

        conf.response = value;
        return new ConfResponseSegment(tran, conf);
    }

    override async encode(stream: common.Writable): Promise<void> {
        // write prefix
        const array = new FieldArray(this.payload.spec.response);
        const [h, o] = array.chooseMode(this.payload.response!);
        const modeMask = (h ? 32 : 0) | (o ? 16 : 0);
        const prefix = (2 << 6) | modeMask;
        await stream.write(Buffer.from([prefix]));

        // write fields
        await array.write(stream, this.payload.response!);
    }
}

export class TranSynSegment extends Segment {
    readonly boundTo = "server";

    constructor(tran: number) {
        super(tran);
    }

    static override async decode(_session: Session, _stream: common.Readable, _prefix: number, tran: number): Promise<TranSynSegment> {
        return new TranSynSegment(tran);
    }

    override async encode(stream: common.Writable): Promise<void> {
        await stream.write(Buffer.from([3 << 6]));
    }
}

export class MethodReturnSegment extends Segment {
    readonly boundTo = "client";
    payload: common.Method<common.MethodSpec>;

    constructor(tran: number, payload: common.Method<common.MethodSpec>) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session, stream: common.Readable, prefix: number, tran: number): Promise<MethodReturnSegment> {
        // find spec
        const transaction = session.transactions.find(x => x.id == tran);
        const method = (transaction!.segments[0] as InvokeMethodSegment).payload.clone();
        method.params = undefined;

        // read fields
        const array = new FieldArray(method.spec.returns);
        array.setMode(Segment.decodePrefix(prefix));
        const value = await array.read(stream);

        method.returnVal = value;
        return new MethodReturnSegment(tran, method);
    }

    override async encode(stream: common.Writable): Promise<void> {
        // write prefix
        const array = new FieldArray(this.payload.spec.returns);
        const [h, o] = array.chooseMode(this.payload.returnVal!);
        const modeMask = (h ? 32 : 0) | (o ? 16 : 0);
        const prefix = (0 << 6) | modeMask;
        await stream.write(Buffer.from([prefix]));

        // write fields
        await array.write(stream, this.payload.returnVal!);
    }
}

export class EntityUpdateSegment extends Segment { // !== UpdateEntitySegment
    readonly boundTo = "client";
    payload: common.Entity<common.EntitySpec>;

    constructor(tran: number, payload: common.Entity<common.EntitySpec>) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session, stream: common.Readable, _prefix: number, tran: number): Promise<EntityUpdateSegment> {
        const value = await new EntityRepr(session.specSpace.entities).read(stream);
        return new EntityUpdateSegment(tran, value);
    }

    override async encode(stream: common.Writable): Promise<void> {
        await stream.write(Buffer.from([1 << 6]));
        await new EntityRepr({ [this.payload.numericId]: this.payload }).write(stream, this.payload);
    }
}

export class ConfRequestSegment extends Segment {
    readonly boundTo = "client";
    payload: common.Confirmation<common.ConfSpec>;

    constructor(tran: number, payload: common.Confirmation<common.ConfSpec>) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session, stream: common.Readable, prefix: number, tran: number): Promise<ConfRequestSegment> {
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
        // write prefix
        const array = new FieldArray(this.payload.spec.request);
        const [h, o] = array.chooseMode(this.payload.request!);
        const modeMask = (h ? 32 : 0) | (o ? 16 : 0);
        const prefix = (2 << 6) | modeMask | this.payload.numericId;
        await stream.write(Buffer.from([prefix]));

        // write fields
        await array.write(stream, this.payload.request!);
    }
}

export class MethodErrorSegment extends Segment {
    readonly boundTo = "client";
    payload: { code: number, msg: string };

    constructor(tran: number, payload: { code: number, msg: string }) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(_session: Session, stream: common.Readable, _prefix: number, tran: number): Promise<MethodErrorSegment> {
        const payload = await new FieldArray({
            required: { code: new Int(2), msg: new Str() },
            optional: { }
        }).read(stream);
        return new MethodErrorSegment(tran, payload);
    }

    override async encode(stream: common.Writable): Promise<void> {
        await stream.write(Buffer.from([3 << 6]));
    }
}