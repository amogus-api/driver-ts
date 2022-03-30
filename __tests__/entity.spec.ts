import * as amogus from "../src/index";
import { ConcreteValuedEntity, ValuedEntity } from "../src/things";
import * as api from "./entity_output/ts/index";

describe("Entity method invocation", () => {
    const { client, server } = amogus.transport.universal.createDummyPair(api.$specSpace);
    const clientSession = api.$bind(client);
    const serverSession = api.$bind(server);

    let objectStore: { [id: number]: ValuedEntity } = {
        123: new serverSession.MassiveFields({ id: 123, a: 300 }) as ValuedEntity,
    };

    // server transaction listener
    server.subscribe(async (event) => {
        if(event instanceof amogus.InvocationEvent) {
            const method = event.method;
    
            if(method instanceof api.Test_StaticEcho)
                await event.return({ str: `${method.params!.str} return` });
            
            else if(method instanceof api.Test_DynamicEcho)
                await event.return({ str: `${method.params!.str} return (eid ${method.entityId})` });

            else if(method instanceof api.MassiveFields_Get) {
                const id = method.params!.id;
                if(!(id in objectStore)) {
                    await event.error(api.ErrorCode.invalid_id, `no such entity ${id}`);
                    return;
                }
                const entity = objectStore[id] as ConcreteValuedEntity<api.MassiveFields>;
                await event.return({ entity });
            }

            else if(method instanceof api.MassiveFields_Update) {
                const entity = method.params!.entity;
                if(!(entity instanceof api.MassiveFields))
                    return;
                if(!(entity.value!.id in objectStore))
                    return;
    
                objectStore[entity.value!.id].value = { ...objectStore[entity.value!.id].value, ...entity.value };
                await event.return({});
            }
        }
    });

    test("static entity method", async () => {
        const { str } = await clientSession.Test.staticEcho({ str: "hi" });
        expect(str).toEqual("hi return");
    });

    test("dynamic entity method", async () => {
        const test = new clientSession.Test({ id: 123 });
        const { str } = await test.dynamicEcho({ str: "hi" });
        expect(str).toEqual("hi return (eid 123)");
    });

    test("get entity", async () => {
        const entity = await clientSession.MassiveFields.$get(123);
        expect(entity.value!.id).toEqual(123);
    });

    test("push entity update", async () => {
        let entity = await clientSession.MassiveFields.$get(123);
        await entity.$update({ a: 400, b: 300 });
        entity = (await clientSession.MassiveFields.$get(123));
        expect(entity.value).toEqual({ id: 123, a: 400, b: 300 });
    });

    test("get field via top-level getter", async () => {
        let entity = await clientSession.MassiveFields.$get(123);
        await entity.$update({ a: 300, j: 500 });
        expect(entity.id).toEqual(123);
        expect(entity.a).toEqual(300);
        expect(entity.j).toEqual(500);
    });

    test("entity update from server", () => {
        return new Promise<void>((resolve) => {
            client.subscribe((ev) => {
                if(ev.type !== "entity_update")
                    return;

                const entity = ev.entity;
                expect(entity).toBeInstanceOf(api.MassiveFields);
                expect(entity.value!.id).toEqual(123);
                expect(entity.value!.k).toEqual(420);
                resolve();
            });
            
            serverSession.$session.pushEntity(new serverSession.MassiveFields({ id: 123, k: 420 }) as ValuedEntity);
        });
    });
});
