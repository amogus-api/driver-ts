// Proxies entity get requests and remembers updates by the server

import { Entity, ValuedEntity } from "./things";
import { Session } from "./session";
import { FieldValue, TsType } from "./repr";

type IdType<E extends Entity> = TsType<E["spec"]["fields"]["required"]["id"]>;

// Wraps a client with an entity cache, updates itself on server notices and
// auto-magically deconstructs partial list updates
export class Cache {
    private cache: { [id: string]: Entity } = {};
    private listeners: { [id: string]: ((entity: Entity) => void)[]|undefined } = {};

    constructor(session: Session) {
        session.subscribe((event) => {
            if(event.type === "entity_update")
                this.got_update(event.entity, true);
        });
    }

    // Gets an entity from the server or cache if it's available there
    async get<T extends Entity>(reference: new () => T, id: IdType<T>): Promise<ValuedEntity<T>> {
        const cached = this.cache[String(id)];
        if(cached)
            return cached as ValuedEntity<T>;

        // @ts-expect-error we know that $get exists
        const entity = await reference.$get(id);
        this.cache[String(id)] = entity;
        return entity as ValuedEntity<T>;
    }

    // Updates an entity
    async update<T extends Entity>(reference: new (data: FieldValue<T["spec"]["fields"]>) => T, data: FieldValue<T["spec"]["fields"]>) {
        const entity = this.cache[String(data.id)] ?? new reference(data);
        await entity.$update(data);
        this.cache[String(data.id)] = entity;
    }

    // Subscribes to future entity updates
    subscribe<T extends Entity>(_reference: new () => T, id: IdType<T>, cb: (entity: T) => any) {
        type U = (entity: Entity) => void;
        if(!this.listeners[String(id)])
            this.listeners[String(id)] = [];
        if(this.listeners[String(id)]!.includes(cb as U))
            return [id, cb] as const;

        this.listeners[String(id)]!.push(cb as U);

        return [id, cb] as const;
    }

    // Unsubscribes a function from updates
    unsubscribe<T extends Entity>(data: readonly [bigint, (entity: T) => void]) {
        const [id, cb] = data;

        let listeners = this.listeners[String(id)]!;
        listeners = listeners.filter(x => x !== cb);
        this.listeners[String(id)] = listeners.length === 0 ? undefined : listeners;
    }

    private got_update(entity: Entity, expand = false) {
        const id = String(entity.value!.id);

        // merge fields
        this.cache[id].value = Entity.mergeValues(entity.spec.fields,
            (this.cache[id] ?? entity).value!, entity.value!, expand);

        // notify subscribers
        for(const cb of this.listeners[id] ?? [])
            cb(this.cache[id]);
    }
}