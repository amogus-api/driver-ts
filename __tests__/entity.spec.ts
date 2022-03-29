import * as amogus from "../src/index";
import * as api from "./entity_output/ts/index";

describe("Entity method invocation", () => {
    const { client, server } = amogus.transport.universal.createDummyPair(api.$specSpace);
    const clientSession = api.$bind(client);

    // server transaction listener
    server.subscribe(async (event) => {
        if(event instanceof amogus.InvocationSessionEvent) {
            const method = event.method;
    
            if(method instanceof api.Test_StaticEcho)
                await method.return({ str: `${method.params!.str} return` });
            
            else if(method instanceof api.Test_DynamicEcho)
                await method.return({ str: `${method.params!.str} return (eid ${method.entityId})` });

            else if(method instanceof api.MassiveFields_Get)
                await method.return({ entity: new api.Test({ id: method.params!.id }) as Required<api.Test> });
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
        const { entity } = await clientSession.MassiveFields.get({ id: 123 });
        expect(entity.value!.id).toEqual(123);
    });


    test("push entity update", async () => {
        const { entity } = await clientSession.MassiveFields.get({ id: 123 }) as { entity: api.MassiveFields };
        entity.$update({ a: 100, i: 200 });
    });
});
