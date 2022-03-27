// This file is responsible for handling sessions, transactions and related stateful things

import * as common from "./common";
import * as segment from "./segment";

export type ConfCallback<T extends common.Method<any>> =
    (data: common.ValueUnion<T["spec"]["confirmations"]>) =>
   Promise<common.ValueUnion<T["spec"]["confirmations"]>["response"]>;

export type IncompleteTransactionEvent =
    { type: "created" } |
    { type: "inbound", segment: segment.Segment } |
    { type: "outbound", segment: segment.Segment } |
    { type: "finished" };
export type TransactionEvent = IncompleteTransactionEvent & { tran: Transaction };
export class Transaction extends common.EventHost<TransactionEvent> {
    session: Session;
    id: number;
    segments: segment.Segment[] = [];

    constructor(session: Session, id: number) {
        super();
        this.session = session;
        this.id = id;
    }

    finalized() {
        const first = this.segments[0];
        const last = [...this.segments].reverse()[0];

        if(first instanceof segment.InvokeMethodSegment)
            return (last instanceof segment.MethodReturnSegment) || (last instanceof segment.MethodErrorSegment);

        if(first instanceof segment.UpdateEntitySegment || first instanceof segment.EntityUpdateSegment)
            return true;

        return false;
    }

    notify(data: IncompleteTransactionEvent) {
        this.trigger({ ...data, tran: this });
    }
}

export class InvocationSessionEvent<M extends common.Method<any>> {
    readonly type = "method_invocation";
    method: M;

    private event: TranSessionEvent;
    private session: Session;

    constructor(event: TranSessionEvent, session: Session) {
        const methInvoke = event.transaction.segments[0] as segment.InvokeMethodSegment;

        this.event = event;
        this.session = session;
        // @ts-expect-error it's okay
        this.method = methInvoke.payload;
        this.method.sessionEvent = this;
    }

    async confirm<C extends common.Confirmation<common.ConfSpec>>(conf: C, data: C["request"]) {
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

    async error(code: number, message: string): Promise<any> {
        await this.session.writeSegment(new segment.MethodErrorSegment(this.event.transaction.id,
            { code, msg: message }));
    }

    async return(ret: M["returnVal"]): Promise<any> {
        this.method.returnVal = ret;
        await this.session.writeSegment(new segment.MethodReturnSegment(this.event.transaction.id, this.method));
    }
}

export const TARGET_SPEC_VERSION = 1;
export type TranSessionEvent = { type: "new_transaction", transaction: Transaction };
export type SessionEvent = TranSessionEvent | InvocationSessionEvent<any>;
export abstract class Session extends common.EventHost<SessionEvent> {
    specSpace: common.SpecSpace;
    stream: common.ReadableWritable;
    self: common.PeerType;
    transactions: Transaction[] = [];
    active = false;

    constructor(specSpace: common.SpecSpace, stream: common.ReadableWritable, self: common.PeerType) {
        super();
        if(specSpace.specVersion !== TARGET_SPEC_VERSION)
            throw new Error(`Unsupported spec version ${specSpace.specVersion}; this version of 'amogus-driver' only supports v${TARGET_SPEC_VERSION}. Upgrade or downgrade 'susc' or 'amogus-driver'.`);

        this.subscribe(this.processMethodTran.bind(this));
        this.specSpace = specSpace;
        this.stream = stream;
        this.self = self;
        this.run();
    }

    private async processMethodTran(event: SessionEvent) {
        if(event.type !== "new_transaction")
            return;
        if(!(event.transaction.segments[0] instanceof segment.InvokeMethodSegment))
            return;
        this.trigger(new InvocationSessionEvent(event, this));
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

    invokeMethod<T extends common.Method<any>>(
        method: T,
        confirmationCallback?: ConfCallback<T>
    ): Promise<common.FieldValue<T["spec"]["returns"]>> {
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
                        resolve(event.segment.payload.returnVal as unknown as common.FieldValue<T["spec"]["returns"]>);
                    } else if(event.segment instanceof segment.MethodErrorSegment) {
                        reject({ code: event.segment.payload.code, message: event.segment.payload.msg });
                    }
                }
            }));
        });
    }
}

export interface BoundSession {
    session: Session;
}
