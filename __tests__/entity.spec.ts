import * as amogus from "../src/index";
import { ValuedEntity } from "../src/things";
import { createDummyPair } from "../src/transport/universal";
import * as api from "./entity_output/ts/index";

describe("Entity method invocation", () => {
    const { client, server } = createDummyPair(api.$specSpace);
    const clientSession = api.$bind(client);
    const serverSession = api.$bind(server);

    let objectStore: { id: bigint, val: ValuedEntity }[] = [{
        id: BigInt(123),
        val: new serverSession.MassiveFields({ id: BigInt(123), a: 300 }) as ValuedEntity<api.MassiveFields>,
    }];

    function storeGet(id: bigint) {
        return objectStore.find(o => o.id === id)?.val;
    }
    function storeSet(id: bigint, val: ValuedEntity) {
        objectStore = objectStore.filter(o => o.id !== id);
        objectStore.push({ id, val });
    }
    function storeHas(id: bigint) {
        return objectStore.findIndex(o => o.id === id) !== -1;
    }

    // server transaction listener
    server.subscribe(async (event) => {
        if(event instanceof amogus.InvocationEvent) {
            const method = event.method;

            if(method instanceof api.Test_StaticEcho)
                await method.return({ str: `${method.params.str} return` });

            else if(method instanceof api.Test_DynamicEcho)
                await method.return({ str: `${method.params.str} return (eid ${method.entityId!.toString()})` });

            else if(method instanceof api.MassiveFields_Get) {
                const id = method.params.id;
                if(!storeHas(id)) {
                    await method.error(api.ErrorCode.invalid_id, `no such entity ${id}`);
                    return;
                }
                const entity = storeGet(id)! as ValuedEntity<api.MassiveFields>;
                await method.return({ entity });

            } else if(method instanceof api.MassiveFields_Update) {
                const entity = method.params.entity;
                if(!(entity instanceof api.MassiveFields))
                    return;
                if(!storeHas(entity.id!))
                    return;

                storeSet(entity.id!, new serverSession.MassiveFields({
                    ...storeGet(entity.id!)?.value,
                    ...entity.value,
                }) as ValuedEntity<api.MassiveFields>);
                await method.return({});

            } else if(method instanceof api.StringId_Get) {
                const id = method.params.id;
                await method.return({ entity: new serverSession.StringId({
                    id, a: `a for id ${id}`,
                }) });

            } else if(method instanceof api.StringId_GetB) {
                const id = method.entityId;
                await method.return({
                    b: `b for id ${id}`,
                });
            }
        }
    });

    test("static entity method", async () => {
        const { str } = await clientSession.Test.staticEcho({ str: "hi" });
        expect(str).toEqual("hi return");
    });

    test("dynamic entity method", async () => {
        const test = new clientSession.Test({ id: BigInt(123) });
        const { str } = await test.dynamicEcho({ str: "hi" });
        expect(str).toEqual("hi return (eid 123)");
    });

    test("get entity", async () => {
        const entity = await clientSession.MassiveFields.$get(BigInt(123));
        expect(entity.value.id).toEqual(BigInt(123));
    });

    test("push entity update", async () => {
        let entity = await clientSession.MassiveFields.$get(BigInt(123));
        await entity.$update({ a: 400, b: 300 });
        entity = (await clientSession.MassiveFields.$get(BigInt(123)));
        expect(entity.value).toEqual({ id: BigInt(123), a: 400, b: 300 });
    });

    test("get field via top-level getter", async () => {
        const entity = await clientSession.MassiveFields.$get(BigInt(123));
        await entity.$update({ a: 300, f: 500 });
        expect(entity.id).toEqual(BigInt(123));
        expect(entity.a).toEqual(300);
        expect(entity.f).toEqual(500);
    });

    test("entity update from server", () => {
        return new Promise<void>((resolve) => {
            client.subscribe((ev) => {
                if(ev.type !== "entity_update")
                    return;

                const entity = ev.entity;
                expect(entity).toBeInstanceOf(clientSession.MassiveFields);
                expect(entity.value.id).toEqual(BigInt(123));
                expect(entity.value.g).toEqual(420);
                resolve();
            });

            void serverSession.$session.pushEntity(new serverSession.MassiveFields({ id: BigInt(123), g: 420 }) as ValuedEntity);
        });
    });

    test("get string-id entity", async () => {
        const entity = await clientSession.StringId.$get("test");
        expect(entity.value.id).toEqual("test");
        expect(entity.value.a).toEqual("a for id test");
    });

    test("call dynamic method on string-id entity", async () => {
        const entity = new clientSession.StringId({ id: "test", a: "aaaaa" });
        const { b } = await entity.getB({ });
        expect(b).toEqual("b for id test");
    });
});
