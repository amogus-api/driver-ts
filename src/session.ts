// Handles sessions, transactions and related stateful things

import * as common from "./common";
import * as things from "./things";
import * as segment from "./segment";
import { FieldValue } from "./repr";
import { NotNull } from "./common";

export type ConfCallback<T extends things.Method<any>> =
    (data: T["spec"]["confirmations"][number]) =>
   Promise<T["spec"]["confirmations"][number]["response"]>;

export type IncompleteTransactionEvent =
    { type: "created" } |
    { type: "inbound", segment: segment.Segment } |
    { type: "outbound", segment: segment.Segment } |
    { type: "finished" };
export type TransactionEvent = IncompleteTransactionEvent & { tran: Transaction };
export class Transaction extends common.EventHost<TransactionEvent> {
    session: Session<things.SpecSpace>;
    id: number;
    segments: segment.Segment[] = [];

    constructor(session: Session<things.SpecSpace>, id: number) {
        super();
        this.session = session;
        this.id = id;
    }

    finalized() {
        const first = this.segments[0];
        const last = [...this.segments].reverse()[0];

        if(first instanceof segment.InvokeMethodSegment)
            return (last instanceof segment.MethodReturnSegment) || (last instanceof segment.MethodErrorSegment);

        return false;
    }

    notify(data: IncompleteTransactionEvent) {
        this.trigger({ ...data, tran: this });
    }
}

export class InvocationEvent<M extends NotNull<things.Method<things.MethodSpec>, "params">> {
    readonly type = "method_invocation";
    method: M;

    private event: TranSessionEvent;
    private session: Session<things.SpecSpace>;

    constructor(event: TranSessionEvent, session: Session<things.SpecSpace>) {
        const methInvoke = event.transaction.segments[0] as segment.InvokeMethodSegment;

        this.event = event;
        this.session = session;
        // @ts-expect-error it's okay
        this.method = methInvoke.payload;
        this.method.sessionEvent = this;
    }

    async confirm<C extends things.Confirmation<things.ConfSpec>>(conf: C, data: C["request"]) {
        await this.session.writeSegment(new segment.ConfRequestSegment(this.event.transaction.id,
            { ...conf, request: data }));

        // wait for response
        const response = await new Promise<C["response"]>((resolve) => {
            const cb = (event: TransactionEvent) => {
                if(event.type !== "inbound")
                    return;
                if(!(event.segment instanceof segment.ConfResponseSegment))
                    return;

                this.event.transaction.unsubscribe(cb);
                resolve(event.segment.payload.response);
            };
            this.event.transaction.subscribe(cb);
        }) as NonNullable<C["response"]>;

        return response;
    }

    async error(code: number, message: string): Promise<void> {
        await this.session.writeSegment(new segment.MethodErrorSegment(this.event.transaction.id,
            { code, msg: message }));
    }

    async return(ret: M["returnVal"]): Promise<void> {
        this.method.returnVal = ret;
        await this.session.writeSegment(new segment.MethodReturnSegment(this.event.transaction.id, this.method));
    }
}

export type TranSessionEvent = { type: "new_transaction", transaction: Transaction };
export type EntityEvent = { type: "entity_update", entity: things.ValuedEntity };
export type SessionEvent = TranSessionEvent | InvocationEvent<any> | EntityEvent;

export abstract class Session<Spec extends things.SpecSpace> extends common.EventHost<SessionEvent> {
    specSpace: Spec;
    transactions: Transaction[] = [];

    protected stream: common.ReadableWritable;
    private self: common.PeerType;
    private active = false;

    constructor(specSpace: (session: Session<Spec>) => Spec, stream: common.ReadableWritable, self: common.PeerType) {
        super();
        const space = specSpace(this);

        this.subscribe((e) => this.processTran(e));
        this.specSpace = space;
        this.stream = stream;
        this.self = self;
        this.run();
    }

    private async processTran(event: SessionEvent) {
        if(event.type !== "new_transaction")
            return;
        const segm = event.transaction.segments[0];

        if(segm instanceof segment.InvokeMethodSegment) {
            this.trigger(new InvocationEvent(event, this));
        } else if(segm instanceof segment.EntityUpdateSegment) {
            this.trigger({ type: "entity_update", entity: segm.payload });
        }
    }

    private run() {
        const cycle: () => void = () => {
            if(!this.active)
                return;
            void this.readSegment().then((_) => cycle());
        };
        this.active = true;
        cycle();
    }

    async stop() {
        this.active = false;
        await this.stream.close();
    }

    async readSegment(): Promise<segment.Segment> {
        const segm = await segment.Segment.read(this, this.stream, this.self);

        // add the segment to its transaction
        let transaction = this.transactions.find(x => x.id === segm.transactionId);
        // create the object for new transactions
        let created = false;
        if(!transaction) {
            transaction = new Transaction(this, segm.transactionId);
            this.transactions.push(transaction);
            created = true;
        }
        transaction.segments.push(segm);
        if(created)
            this.trigger({ type: "new_transaction", transaction });
        transaction.notify({ type: "inbound", segment: segm });

        // remove the transaction if it's finished
        if(transaction.finalized()) {
            const id = transaction.id;
            this.transactions = this.transactions.filter(x => x.id !== id);
            transaction.notify({ type: "finished" });
        }

        return segm;
    }

    async writeSegment(segm: segment.Segment): Promise<void> {
        const transaction = this.transactions[segm.transactionId];
        transaction.segments.push(segm);
        transaction?.notify({ type: "outbound", segment: segm });

        await segm.write(this.stream);

        // remove the transaction if it's finished
        if(transaction.finalized()) {
            this.transactions = this.transactions.filter(x => x.id !== transaction.id);
            transaction.notify({ type: "finished" });
        }
    }

    async createTransaction(initSegment: segment.Segment): Promise<Transaction> {
        // get the first free id
        const allIds = this.transactions.map(x => x.id);
        const freeIds = Array.from({ length: 256 }, (_, i) => i).filter(id => !(id in allIds));
        if(!freeIds.length)
            throw new Error("All transaction slots are taken");
        const id = freeIds[0];

        // create the transaction and remember it
        const transaction = new Transaction(this, id);
        initSegment.transactionId = id;
        this.transactions.push(transaction);
        transaction.notify({ type: "created" });
        await this.writeSegment(initSegment);
        return transaction;
    }

    async invokeMethod<T extends things.Method<any>>(
        method: T,
        confirmationCallback?: ConfCallback<T>
    ): Promise<FieldValue<T["spec"]["returns"]>> {
        return new Promise((resolve, reject) => {
            void this.createTransaction(new segment.InvokeMethodSegment(0, method)).then((t) => t.subscribe((event) => {
                if(event.type === "inbound") {
                    if(event.segment instanceof segment.ConfRequestSegment) {
                        if(!confirmationCallback) {
                            reject(new Error("no confirmationCallback supplied but a ConfRequest segment was received"));
                            return;
                        }
                        // we can be sure it's okay because the decoder checked it
                        const payload = event.segment.payload;
                        void confirmationCallback(payload)
                            .then((response) => {
                                payload.response = response;
                                void this.writeSegment(new segment.ConfResponseSegment(event.tran.id, payload));
                            });
                    } else if(event.segment instanceof segment.MethodReturnSegment) {
                        // we can be just as sure here
                        resolve(event.segment.payload.returnVal as unknown as FieldValue<T["spec"]["returns"]>);
                    } else if(event.segment instanceof segment.MethodErrorSegment) {
                        reject({ code: event.segment.payload.code, message: event.segment.payload.msg });
                    }
                }
            }));
        });
    }

    async pushEntity(entity: things.ValuedEntity): Promise<void> {
        if(this.self !== "server")
            throw new Error("pushEntity can only be called on the server");

        await this.createTransaction(new segment.EntityUpdateSegment(0, entity));
    }
}

export interface BoundSession {
    session: Session<things.SpecSpace>;
}
