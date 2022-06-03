// Proxies entity get requests and remembers updates by the server

import { Entity, ValuedEntity } from "./things";
import { Session } from "./session";
import { FieldValue } from "./repr";

export class Cache {
    private cache: { [id: string]: Entity } = {};
    private listeners: { [id: string]: ((entity: Entity) => void)[]|undefined } = {};

    constructor(session: Session) {
        session.subscribe((event) => {
            if(event.type === "entity_update")
                this.got_update(event.entity, true);
        });
    }

    async get<T extends Entity>(reference: new () => T, id: bigint): Promise<ValuedEntity<T>> {
        const cached = this.cache[id.toString()];
        if(cached)
            return cached as ValuedEntity<T>;

        // @ts-expect-error we know that $get exists
        const entity = await reference.$get(id);
        this.cache[id.toString()] = entity;
        return entity as ValuedEntity<T>;
    }

    async update<T extends Entity>(reference: new (data: FieldValue<T["spec"]["fields"]>) => T, data: FieldValue<T["spec"]["fields"]>) {
        const entity = this.cache[data.id.toString()] ?? new reference(data);
        await entity.$update(data);
        this.cache[data.id.toString()] = entity;
    }

    // subscribes to future entity updates
    subscribe<T extends Entity>(_reference: new () => T, id: bigint, cb: (entity: T) => any) {
        type U = (entity: Entity) => void;
        if(!this.listeners[id.toString()])
            this.listeners[id.toString()] = [];
        if(this.listeners[id.toString()]!.includes(cb as U))
            return [id, cb] as const;

        this.listeners[id.toString()]!.push(cb as U);

        return [id, cb] as const;
    }

    unsubscribe<T extends Entity>(data: readonly [bigint, (entity: T) => void]) {
        const [id, cb] = data;

        let listeners = this.listeners[id.toString()]!;
        listeners = listeners.filter(x => x !== cb);
        this.listeners[id.toString()] = listeners.length === 0 ? undefined : listeners;
    }

    private got_update(entity: Entity, expand = false) {
        const id = entity.value!.id.toString();

        // merge fields
        this.cache[id].value = Entity.mergeValues(entity.spec.fields,
            (this.cache[id] ?? entity).value!, entity.value!, expand);

        // notify subscribers
        for(const cb of this.listeners[id] ?? [])
            cb(this.cache[id]);
    }
}